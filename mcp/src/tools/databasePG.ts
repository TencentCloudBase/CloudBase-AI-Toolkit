import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { ExtendedMcpServer, PgRuntimeContext } from "../server.js";
import { buildJsonToolResult, ToolNextStep } from "../utils/tool-result.js";

const execFileAsync = promisify(execFile);

const CATEGORY = "PostgreSQL database";
const QUERY_PG_DATABASE = "queryPgDatabase";
const MANAGE_PG_DATABASE = "managePgDatabase";
const GET_PG_SCHEMA = "getPgSchema";

const QUERY_ACTIONS = ["context", "objects", "metadata", "sql"] as const;
const MANAGE_ACTIONS = ["init", "execute"] as const;
const BOOTSTRAP_MODES = ["podman", "local", "manual"] as const;

type QueryPgAction = (typeof QUERY_ACTIONS)[number];
type ManagePgAction = (typeof MANAGE_ACTIONS)[number];
type BootstrapMode = (typeof BOOTSTRAP_MODES)[number];

type PgToolPayload = {
  success: boolean;
  data?: Record<string, unknown>;
  message: string;
  errorCode?: string;
  nextActions?: ToolNextStep[];
};

type QueryPgDatabaseArgs = {
  action: QueryPgAction;
  sql?: string;
  schema?: string;
  limit?: number;
};

type ManagePgDatabaseArgs = {
  action: ManagePgAction;
  sql?: string;
  confirm?: boolean;
  envId?: string;
  instanceId?: string;
  defaultSchema?: string;
  connectionUri?: string;
  bootstrapMode?: BootstrapMode;
  projectDir?: string;
};

type GetPgSchemaArgs = {
  objectName: string;
};

type PgBootstrapRequest = {
  envId?: string;
  instanceId?: string;
  defaultSchema?: string;
  connectionUri?: string;
  bootstrapMode?: BootstrapMode;
  projectDir?: string;
};

type PgBootstrapResult = {
  instanceId: string;
  connectionUri: string;
  defaultSchema: string;
  status: "ready";
  bootstrapMode: BootstrapMode;
  bootstrapProjectDir?: string;
};

type PgBootstrapProvider = {
  bootstrap(request: PgBootstrapRequest): Promise<PgBootstrapResult>;
};

type PgToolDependencies = {
  bootstrapProvider: PgBootstrapProvider;
};

function buildPgToolResult(payload: PgToolPayload) {
  return buildJsonToolResult(payload);
}

function buildNextAction(
  tool: string,
  action: string,
  reason: string,
  suggestedArgs?: Record<string, unknown>,
): ToolNextStep {
  return {
    tool,
    action,
    suggested_args: suggestedArgs,
    required_params: undefined,
    reason,
  } as ToolNextStep & { reason: string };
}

function getPgContextStorePath() {
  return process.env.CLOUDBASE_PG_CONTEXT_PATH ??
    path.join(os.homedir(), ".cloudbase-mcp", "pg-context.json");
}

async function loadStoredPgContext() {
  try {
    const raw = await fs.readFile(getPgContextStorePath(), "utf8");
    return JSON.parse(raw) as PgRuntimeContext;
  } catch {
    return undefined;
  }
}

async function savePgContext(server: ExtendedMcpServer, context: PgRuntimeContext) {
  const storePath = getPgContextStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(context, null, 2), "utf8");
  server.pgRuntimeContext = context;
}

async function getPgContext(server: ExtendedMcpServer) {
  if (server.pgRuntimeContext) {
    return server.pgRuntimeContext;
  }

  const stored = await loadStoredPgContext();
  if (stored) {
    server.pgRuntimeContext = stored;
  }
  return stored;
}

function buildMissingContextResult() {
  return buildPgToolResult({
    success: false,
    errorCode: "PG_CONTEXT_NOT_INITIALIZED",
    message:
      "PostgreSQL local context is not initialized yet. Call managePgDatabase with action=init first.",
    nextActions: [
      buildNextAction(
        MANAGE_PG_DATABASE,
        "init",
        "Initialize or bind a local PostgreSQL context before querying schema or data.",
        { action: "init" },
      ),
    ],
  });
}

function sanitizeConnectionUri(connectionUri: string) {
  try {
    const url = new URL(connectionUri);
    return {
      host: url.hostname,
      port: url.port || "5432",
      database: url.pathname.replace(/^\//, "") || "postgres",
      username: decodeURIComponent(url.username || ""),
      sslmode: url.searchParams.get("sslmode") ?? undefined,
    };
  } catch {
    return {
      connectionUri: "[invalid-connection-uri]",
    };
  }
}

async function discoverCloudbasePgsqlProjectDir(explicitProjectDir?: string) {
  const candidates: string[] = [];

  if (explicitProjectDir) {
    candidates.push(explicitProjectDir);
  }
  if (process.env.CLOUDBASE_PG_BOOTSTRAP_DIR) {
    candidates.push(process.env.CLOUDBASE_PG_BOOTSTRAP_DIR);
  }

  let currentDir = process.cwd();
  for (;;) {
    candidates.push(path.join(currentDir, "external", "cloudbase-pgsql"));
    const parent = path.dirname(currentDir);
    if (parent === currentDir) {
      break;
    }
    currentDir = parent;
  }

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(path.join(candidate, "Makefile"));
      if (stat.isFile()) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return undefined;
}

async function resolveProjectPassword(projectDir: string) {
  const envCandidates = [
    path.join(projectDir, ".env"),
    path.join(projectDir, ".env.example"),
  ];

  for (const filePath of envCandidates) {
    try {
      const content = await fs.readFile(filePath, "utf8");
      const match = content.match(/^POSTGRES_PASSWORD\s*[:?]?=\s*(.+)$/m);
      if (match?.[1]) {
        return match[1].trim().replace(/^['"]|['"]$/g, "");
      }
    } catch {
      continue;
    }
  }

  return "cloudbase_secret_2024";
}

class LocalPgBootstrapProvider implements PgBootstrapProvider {
  async bootstrap(request: PgBootstrapRequest): Promise<PgBootstrapResult> {
    const bootstrapMode = request.bootstrapMode ?? "podman";

    if (request.connectionUri) {
      return {
        instanceId: request.instanceId ?? "cloudbase-pg-local",
        connectionUri: request.connectionUri,
        defaultSchema: request.defaultSchema ?? "public",
        status: "ready",
        bootstrapMode: "manual",
      };
    }

    const projectDir = await discoverCloudbasePgsqlProjectDir(request.projectDir);
    if (!projectDir) {
      throw new Error(
        "Unable to locate cloudbase-pgsql project. Provide projectDir or set CLOUDBASE_PG_BOOTSTRAP_DIR.",
      );
    }

    const makeTarget = bootstrapMode === "local" ? "init-local" : "up";
    await execFileAsync("make", [makeTarget], {
      cwd: projectDir,
      env: process.env,
      maxBuffer: 1024 * 1024 * 4,
    });

    const password = await resolveProjectPassword(projectDir);
    return {
      instanceId: request.instanceId ?? "cloudbase-pg-local",
      connectionUri:
        request.connectionUri ??
        `postgresql://cloudbase_admin:${encodeURIComponent(password)}@localhost:5432/postgres`,
      defaultSchema: request.defaultSchema ?? "public",
      status: "ready",
      bootstrapMode,
      bootstrapProjectDir: projectDir,
    };
  }
}

function createDefaultDependencies(): PgToolDependencies {
  return {
    bootstrapProvider: new LocalPgBootstrapProvider(),
  };
}

async function handleInit(
  args: ManagePgDatabaseArgs,
  server: ExtendedMcpServer,
  deps: PgToolDependencies,
) {
  const bootstrapResult = await deps.bootstrapProvider.bootstrap({
    envId: args.envId ?? server.cloudBaseOptions?.envId,
    instanceId: args.instanceId,
    defaultSchema: args.defaultSchema,
    connectionUri: args.connectionUri,
    bootstrapMode: args.bootstrapMode,
    projectDir: args.projectDir,
  });

  const now = new Date().toISOString();
  const context: PgRuntimeContext = {
    envId: args.envId ?? server.cloudBaseOptions?.envId ?? "local",
    instanceId: bootstrapResult.instanceId,
    connectionUri: bootstrapResult.connectionUri,
    defaultSchema: bootstrapResult.defaultSchema,
    runtimeMode: "local",
    bootstrapMode: bootstrapResult.bootstrapMode,
    bootstrapProjectDir: bootstrapResult.bootstrapProjectDir,
    createdAt: now,
    updatedAt: now,
  };

  await savePgContext(server, context);

  return buildPgToolResult({
    success: true,
    data: {
      context: {
        ...context,
        connection: sanitizeConnectionUri(context.connectionUri),
      },
      status: bootstrapResult.status,
    },
    message:
      "Local PostgreSQL context is ready. Query objects first, then inspect schema before writing SQL.",
    nextActions: [
      buildNextAction(
        QUERY_PG_DATABASE,
        "objects",
        "List schema-qualified database objects before drilling into a specific table.",
        { action: "objects", limit: 20 },
      ),
      buildNextAction(
        GET_PG_SCHEMA,
        "inspect",
        "Inspect a concrete schema-qualified table after you know which object matters.",
        { objectName: `${context.defaultSchema}.your_table` },
      ),
    ],
  });
}

async function handleQueryContext(server: ExtendedMcpServer) {
  const context = await getPgContext(server);
  if (!context) {
    return buildMissingContextResult();
  }

  return buildPgToolResult({
    success: true,
    data: {
      context: {
        envId: context.envId,
        instanceId: context.instanceId,
        defaultSchema: context.defaultSchema,
        runtimeMode: context.runtimeMode,
        bootstrapMode: context.bootstrapMode,
        bootstrapProjectDir: context.bootstrapProjectDir,
        connection: sanitizeConnectionUri(context.connectionUri),
      },
    },
    message: "Resolved current local PostgreSQL context.",
    nextActions: [
      buildNextAction(
        QUERY_PG_DATABASE,
        "objects",
        "List schema-qualified objects before inspecting an individual table.",
        { action: "objects", limit: 20 },
      ),
    ],
  });
}

function buildNotImplementedResult(message: string) {
  return buildPgToolResult({
    success: false,
    errorCode: "PG_MVP_NOT_IMPLEMENTED",
    message,
  });
}

export function registerPGDatabaseTools(
  server: ExtendedMcpServer,
  providedDeps?: Partial<PgToolDependencies>,
) {
  const deps = {
    ...createDefaultDependencies(),
    ...providedDeps,
  } satisfies PgToolDependencies;

  server.registerTool?.(
    QUERY_PG_DATABASE,
    {
      title: "Query PostgreSQL context, objects, metadata, or run read-only SQL",
      description:
        "Query PostgreSQL local context. Supports context discovery, schema-qualified object listing, lightweight metadata summaries, and read-only SQL execution.",
      inputSchema: {
        action: z
          .enum(QUERY_ACTIONS)
          .describe(
            "context=get current PostgreSQL context; objects=list schema-qualified objects; metadata=get lightweight table metadata; sql=execute read-only SQL",
          ),
        sql: z.string().optional().describe("Read-only SQL used by action=sql"),
        schema: z
          .string()
          .optional()
          .describe("Optional schema filter used by action=objects or action=metadata"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Optional summary limit for objects, metadata, or SQL rows. Defaults to 20."),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async (args: QueryPgDatabaseArgs) => {
      if (args.action === "context") {
        return handleQueryContext(server);
      }

      const context = await getPgContext(server);
      if (!context) {
        return buildMissingContextResult();
      }

      switch (args.action) {
        case "objects":
          return buildNotImplementedResult(
            "queryPgDatabase(action=objects) is reserved for schema-first exploration and will be implemented in the next commit.",
          );
        case "metadata":
          return buildNotImplementedResult(
            "queryPgDatabase(action=metadata) is reserved for lightweight table summaries and will be implemented in the next commit.",
          );
        case "sql":
          return buildNotImplementedResult(
            "queryPgDatabase(action=sql) is reserved for read-only SQL execution and will be implemented in the next commit.",
          );
        default:
          return buildPgToolResult({
            success: false,
            errorCode: "UNSUPPORTED_ACTION",
            message: `Unsupported PostgreSQL query action: ${args.action}`,
          });
      }
    },
  );

  server.registerTool?.(
    MANAGE_PG_DATABASE,
    {
      title: "Manage PostgreSQL local bootstrap or execute write SQL",
      description:
        "Manage local PostgreSQL runtime for CloudBase PG MCP. Supports local bootstrap initialization and write SQL execution with explicit confirmation for destructive operations.",
      inputSchema: {
        action: z
          .enum(MANAGE_ACTIONS)
          .describe("init=bootstrap or bind local PostgreSQL context; execute=run write SQL or DDL"),
        sql: z
          .string()
          .optional()
          .describe("SQL statement used by action=execute"),
        confirm: z
          .boolean()
          .optional()
          .describe("Explicit confirmation required for destructive SQL."),
        envId: z.string().optional().describe("Optional environment identifier for the local PG context"),
        instanceId: z.string().optional().describe("Optional logical instance identifier for the local PG context"),
        defaultSchema: z.string().optional().describe("Default schema persisted into PG context. Defaults to public."),
        connectionUri: z
          .string()
          .optional()
          .describe("Optional direct PostgreSQL connection URI. When provided, bootstrapMode becomes manual."),
        bootstrapMode: z
          .enum(BOOTSTRAP_MODES)
          .optional()
          .describe("Bootstrap mode for action=init. podman is the default local MVP path."),
        projectDir: z
          .string()
          .optional()
          .describe("Optional cloudbase-pgsql project directory used by action=init."),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async (args: ManagePgDatabaseArgs) => {
      switch (args.action) {
        case "init":
          return handleInit(args, server, deps);
        case "execute": {
          const context = await getPgContext(server);
          if (!context) {
            return buildMissingContextResult();
          }

          return buildNotImplementedResult(
            "managePgDatabase(action=execute) is reserved for write SQL execution and will be implemented in the next commit.",
          );
        }
        default:
          return buildPgToolResult({
            success: false,
            errorCode: "UNSUPPORTED_ACTION",
            message: `Unsupported PostgreSQL manage action: ${args.action}`,
          });
      }
    },
  );

  server.registerTool?.(
    GET_PG_SCHEMA,
    {
      title: "Inspect PostgreSQL table schema and security summary",
      description:
        "Inspect a specific schema-qualified PostgreSQL object. Returns column definitions, key relationships, index summaries, row-level security status, and policy summaries.",
      inputSchema: {
        objectName: z
          .string()
          .describe("Schema-qualified PostgreSQL object name, for example public.users"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async (args: GetPgSchemaArgs) => {
      const context = await getPgContext(server);
      if (!context) {
        return buildMissingContextResult();
      }

      return buildNotImplementedResult(
        "getPgSchema is reserved for schema-first inspection and will be implemented in the next commit.",
      );
    },
  );
}
