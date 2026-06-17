import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { getCloudBaseManager } from "../cloudbase-manager.js";
import type { ExtendedMcpServer, PgRuntimeContext } from "../server.js";
import { buildJsonToolResult, ToolNextStep } from "../utils/tool-result.js";

const execFileAsync = promisify(execFile);

const CATEGORY = "PostgreSQL database";
const QUERY_PG_DATABASE = "queryPgDatabase";
const MANAGE_PG_DATABASE = "managePgDatabase";

const QUERY_ACTIONS = [
  "context",
  "objects",
  "metadata",
  "schema",
  "sql",
] as const;
const MANAGE_ACTIONS = [
  "init",
  "execute",
  "dryRun",
  "planMigration",
  "applyMigration",
  "listMigrations",
  "migrationDetail",
  "rollbackMigration",
] as const;
const BOOTSTRAP_MODES = ["podman", "local", "manual", "cloud"] as const;

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
  objectName?: string;
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
  role?: string;
  objectName?: string;
};

type PgBootstrapRequest = {
  envId?: string;
  instanceId?: string;
  defaultSchema?: string;
  connectionUri?: string;
  bootstrapMode?: BootstrapMode;
  projectDir?: string;
  role?: string;
};

type PgBootstrapResult = {
  instanceId: string;
  connectionUri?: string;
  defaultSchema: string;
  status: "ready";
  bootstrapMode: BootstrapMode;
  runtimeMode?: PgRuntimeContext["runtimeMode"];
  role?: string;
  bootstrapProjectDir?: string;
};

type PgBootstrapProvider = {
  bootstrap(request: PgBootstrapRequest): Promise<PgBootstrapResult>;
};

type PgQueryField = {
  name: string;
};

type PgQueryResult = {
  rows: Record<string, unknown>[];
  rowCount?: number | null;
  command?: string;
  fields?: PgQueryField[];
};

type PgClientLike = {
  connect(): Promise<unknown>;
  query(sql: string, values?: unknown[]): Promise<PgQueryResult>;
  end(): Promise<void>;
};

type PgReadyCheckOptions = {
  maxAttempts?: number;
  retryDelayMs?: number;
};

type PgToolDependencies = {
  bootstrapProvider: PgBootstrapProvider;
  createClient: (
    context: PgRuntimeContext,
  ) => Promise<PgClientLike> | PgClientLike;
  readyCheckOptions?: PgReadyCheckOptions;
};

type PgObjectSummary = {
  schema: string;
  name: string;
  schemaTable: string;
  kind: string;
  estimatedRows?: number | null;
  rowCount?: number | null;
  rowCountSource?: "actual" | "estimated" | "not_applicable";
  columnCount?: number;
  rlsEnabled?: boolean;
};

type PgColumnInfo = {
  name: string;
  dataType: string;
  isNullable: boolean;
  defaultValue: string | null;
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
  return (
    process.env.CLOUDBASE_PG_CONTEXT_PATH ??
    path.join(os.homedir(), ".cloudbase-mcp", "pg-context.json")
  );
}

async function loadStoredPgContext() {
  if (!process.env.CLOUDBASE_PG_CONTEXT_PATH) {
    return undefined;
  }

  try {
    const raw = await fs.readFile(getPgContextStorePath(), "utf8");
    return JSON.parse(raw) as PgRuntimeContext;
  } catch {
    return undefined;
  }
}

async function savePgContext(
  server: ExtendedMcpServer,
  context: PgRuntimeContext,
) {
  server.pgRuntimeContext = context;

  if (!process.env.CLOUDBASE_PG_CONTEXT_PATH) {
    return;
  }

  const storePath = getPgContextStorePath();
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  await fs.writeFile(storePath, JSON.stringify(context, null, 2), "utf8");
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
      "PostgreSQL context is not initialized yet. Call managePgDatabase(action=init). CloudBase 环境会默认走云端 Manager SDK；只有本地调试才需要 connectionUri。",
    nextActions: [
      buildNextAction(
        MANAGE_PG_DATABASE,
        "init",
        "初始化 CloudBase PG 云端执行上下文，然后再查询 schema 或执行 SQL。",
        { action: "init", bootstrapMode: "cloud" },
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

function sanitizePgContext(context: PgRuntimeContext) {
  return {
    envId: context.envId,
    instanceId: context.instanceId,
    defaultSchema: context.defaultSchema,
    runtimeMode: context.runtimeMode,
    bootstrapMode: context.bootstrapMode,
    role: context.role,
    bootstrapProjectDir: context.bootstrapProjectDir,
    connection: context.connectionUri
      ? sanitizeConnectionUri(context.connectionUri)
      : null,
  };
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

function normalizeLimit(limit?: number, fallback = 20, max = 200) {
  if (!Number.isFinite(limit)) {
    return fallback;
  }

  return Math.max(1, Math.min(max, Math.floor(limit!)));
}

function stripLeadingSqlComments(sql: string) {
  let normalized = sql.trim();

  while (normalized.length > 0) {
    if (normalized.startsWith("--")) {
      normalized = normalized.replace(/^--.*(?:\r?\n|$)/, "").trimStart();
      continue;
    }

    if (normalized.startsWith("#")) {
      normalized = normalized.replace(/^#.*(?:\r?\n|$)/, "").trimStart();
      continue;
    }

    if (normalized.startsWith("/*")) {
      normalized = normalized.replace(/^\/\*[\s\S]*?\*\//, "").trimStart();
      continue;
    }

    break;
  }

  return normalized;
}

function getSqlVerb(sql: string) {
  const normalized = stripLeadingSqlComments(sql);
  const match = normalized.match(/^([a-zA-Z]+)/);
  return match ? match[1].toUpperCase() : "";
}

function isReadOnlySql(sql: string) {
  const normalized = stripLeadingSqlComments(sql);
  const verb = getSqlVerb(normalized);
  const readOnlyVerbs = new Set([
    "SELECT",
    "SHOW",
    "EXPLAIN",
    "WITH",
    "VALUES",
  ]);

  if (!readOnlyVerbs.has(verb)) {
    return false;
  }

  return !/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REPLACE|RENAME|GRANT|REVOKE|COMMENT|VACUUM|ANALYZE)\b/i.test(
    normalized,
  );
}

function isDestructiveSql(sql: string) {
  const normalized = stripLeadingSqlComments(sql);
  const verb = getSqlVerb(normalized);

  if (["DROP", "TRUNCATE", "DELETE"].includes(verb)) {
    return true;
  }

  if (verb === "ALTER") {
    return /\b(DROP|RENAME)\b/i.test(normalized);
  }

  return false;
}

function classifySqlRisk(sql: string) {
  const normalized = stripLeadingSqlComments(sql);
  const verb = getSqlVerb(normalized);

  if (!verb) {
    return {
      risk: "unknown_risk",
      readOnly: false,
      requiresConfirm: true,
    };
  }

  if (isReadOnlySql(normalized)) {
    return {
      risk: "read_only",
      readOnly: true,
      requiresConfirm: false,
    };
  }

  if (isDestructiveSql(normalized)) {
    return {
      risk: "destructive",
      readOnly: false,
      requiresConfirm: true,
    };
  }

  if (
    /\b(GRANT|REVOKE|CREATE\s+POLICY|ALTER\s+POLICY|DROP\s+POLICY|ENABLE\s+ROW\s+LEVEL\s+SECURITY|DISABLE\s+ROW\s+LEVEL\s+SECURITY)\b/i.test(
      normalized,
    )
  ) {
    return {
      risk: "security_change",
      readOnly: false,
      requiresConfirm: true,
    };
  }

  if (["CREATE", "ALTER", "COMMENT"].includes(verb)) {
    return {
      risk: "schema_change",
      readOnly: false,
      requiresConfirm: true,
    };
  }

  if (["INSERT", "UPDATE", "DELETE", "MERGE"].includes(verb)) {
    return {
      risk: "normal_write",
      readOnly: false,
      requiresConfirm: true,
    };
  }

  return {
    risk: "unknown_risk",
    readOnly: false,
    requiresConfirm: true,
  };
}

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function buildSchemaNextAction(reason: string, objectName: string) {
  return buildNextAction(QUERY_PG_DATABASE, "schema", reason, {
    action: "schema",
    objectName,
  });
}

function parseSchemaQualifiedName(objectName: string) {
  const match = objectName
    .trim()
    .match(/^([A-Za-z_][A-Za-z0-9_$]*)\.([A-Za-z_][A-Za-z0-9_$]*)$/);
  if (!match) {
    return null;
  }

  return {
    schema: match[1],
    name: match[2],
  };
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [
        key,
        serializeValue(nestedValue),
      ]),
    );
  }

  return value;
}

function truncateText(value: unknown, maxLength = 180) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value);
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function buildSchemaTable(schema: string, name: string) {
  return `${schema}.${name}`;
}

function parseTargetTableFromSql(sql: string, defaultSchema: string) {
  const normalized = stripLeadingSqlComments(sql);
  const identifier = String.raw`((?:[A-Za-z_][A-Za-z0-9_$]*\.)?[A-Za-z_][A-Za-z0-9_$]*)`;
  const patterns = [
    new RegExp(
      String.raw`\bcreate\s+(?:temporary\s+|temp\s+|unlogged\s+)?table\s+(?:if\s+not\s+exists\s+)?${identifier}`,
      "i",
    ),
    new RegExp(
      String.raw`\b(?:alter|drop|truncate)\s+table\s+(?:if\s+exists\s+)?${identifier}`,
      "i",
    ),
    new RegExp(String.raw`\binsert\s+into\s+${identifier}`, "i"),
    new RegExp(String.raw`\bupdate\s+${identifier}`, "i"),
    new RegExp(String.raw`\b(?:delete\s+from|from)\s+${identifier}`, "i"),
  ];
  const match = patterns
    .map((pattern) => normalized.match(pattern))
    .find(Boolean);
  if (!match?.[1]) {
    return undefined;
  }

  if (match[1].includes(".")) {
    return match[1];
  }

  return `${defaultSchema}.${match[1]}`;
}

function summarizeQueryResult(result: PgQueryResult, limit: number) {
  const rows = result.rows.map(
    (row) => serializeValue(row) as Record<string, unknown>,
  );
  const trimmedRows = rows.slice(0, limit);

  return {
    columns:
      result.fields?.map((field) => field.name) ??
      (trimmedRows[0] ? Object.keys(trimmedRows[0]) : []),
    rows: trimmedRows,
    returnedRows: rows.length,
    truncated: rows.length > trimmedRows.length,
    truncatedCount: Math.max(rows.length - trimmedRows.length, 0),
  };
}

async function withPgClient<T>(
  context: PgRuntimeContext,
  deps: PgToolDependencies,
  callback: (client: PgClientLike) => Promise<T>,
) {
  const client = await deps.createClient(context);
  await client.connect();

  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function getTableRowCount(
  client: PgClientLike,
  schema: string,
  table: string,
) {
  const qualifiedName = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
  const result = await client.query(
    `SELECT COUNT(*)::bigint AS row_count FROM ${qualifiedName}`,
  );
  const rawValue = result.rows[0]?.row_count;
  const parsed = Number(rawValue);
  return Number.isFinite(parsed) ? parsed : null;
}

async function listObjects(
  client: PgClientLike,
  schema: string | undefined,
  limit: number,
) {
  const result = await client.query(
    `
      SELECT
        n.nspname AS schema,
        c.relname AS name,
        CASE c.relkind
          WHEN 'r' THEN 'table'
          WHEN 'p' THEN 'partitioned_table'
          WHEN 'v' THEN 'view'
          WHEN 'm' THEN 'materialized_view'
          WHEN 'f' THEN 'foreign_table'
          ELSE c.relkind::text
        END AS kind,
        CASE
          WHEN c.reltuples >= 0 THEN c.reltuples::bigint
          ELSE NULL
        END AS estimated_rows
      FROM pg_class c
      INNER JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind IN ('r', 'p', 'v', 'm', 'f')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
        AND ($1::text IS NULL OR n.nspname = $1)
      ORDER BY n.nspname, c.relname
      LIMIT $2
    `,
    [schema ?? null, limit],
  );

  return result.rows.map((row) => ({
    schema: String(row.schema),
    name: String(row.name),
    schemaTable: buildSchemaTable(String(row.schema), String(row.name)),
    kind: String(row.kind),
    estimatedRows:
      row.estimated_rows === null || row.estimated_rows === undefined
        ? null
        : Number(row.estimated_rows),
  })) as PgObjectSummary[];
}

async function summarizeMetadata(
  client: PgClientLike,
  schema: string | undefined,
  limit: number,
) {
  const result = await client.query(
    `
      SELECT
        n.nspname AS schema,
        c.relname AS name,
        CASE c.relkind
          WHEN 'r' THEN 'table'
          WHEN 'p' THEN 'partitioned_table'
          WHEN 'v' THEN 'view'
          WHEN 'm' THEN 'materialized_view'
          ELSE c.relkind::text
        END AS kind,
        CASE
          WHEN c.reltuples >= 0 THEN c.reltuples::bigint
          ELSE NULL
        END AS estimated_rows,
        c.relrowsecurity AS rls_enabled,
        COALESCE(col_counts.column_count, 0)::int AS column_count
      FROM pg_class c
      INNER JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN LATERAL (
        SELECT COUNT(*) AS column_count
        FROM information_schema.columns cols
        WHERE cols.table_schema = n.nspname
          AND cols.table_name = c.relname
      ) AS col_counts ON TRUE
      WHERE c.relkind IN ('r', 'p', 'v', 'm')
        AND n.nspname NOT IN ('pg_catalog', 'information_schema')
        AND n.nspname NOT LIKE 'pg_toast%'
        AND ($1::text IS NULL OR n.nspname = $1)
      ORDER BY n.nspname, c.relname
      LIMIT $2
    `,
    [schema ?? null, limit],
  );

  const summaries: PgObjectSummary[] = [];
  for (const row of result.rows) {
    const summary: PgObjectSummary = {
      schema: String(row.schema),
      name: String(row.name),
      schemaTable: buildSchemaTable(String(row.schema), String(row.name)),
      kind: String(row.kind),
      estimatedRows:
        row.estimated_rows === null || row.estimated_rows === undefined
          ? null
          : Number(row.estimated_rows),
      columnCount: Number(row.column_count ?? 0),
      rlsEnabled: Boolean(row.rls_enabled),
    };

    if (summary.kind === "table" || summary.kind === "partitioned_table") {
      try {
        summary.rowCount = await getTableRowCount(
          client,
          summary.schema,
          summary.name,
        );
        summary.rowCountSource = "actual";
      } catch {
        summary.rowCount = summary.estimatedRows ?? null;
        summary.rowCountSource = "estimated";
      }
    } else {
      summary.rowCount = null;
      summary.rowCountSource = "not_applicable";
    }

    summaries.push(summary);
  }

  return summaries;
}

async function readSchemaInfo(
  client: PgClientLike,
  schema: string,
  table: string,
) {
  const objectCheck = await client.query(
    `
      SELECT
        CASE c.relkind
          WHEN 'r' THEN 'table'
          WHEN 'p' THEN 'partitioned_table'
          WHEN 'v' THEN 'view'
          WHEN 'm' THEN 'materialized_view'
          WHEN 'f' THEN 'foreign_table'
          ELSE c.relkind::text
        END AS kind,
        c.relrowsecurity AS row_security_enabled,
        c.relforcerowsecurity AS force_row_security
      FROM pg_class c
      INNER JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1 AND c.relname = $2
      LIMIT 1
    `,
    [schema, table],
  );

  if (!objectCheck.rows[0]) {
    return null;
  }

  const columnsResult = await client.query(
    `
      SELECT
        column_name,
        data_type,
        udt_name,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `,
    [schema, table],
  );

  const primaryKeyResult = await client.query(
    `
      SELECT kcu.column_name
      FROM information_schema.table_constraints tc
      INNER JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
       AND tc.table_name = kcu.table_name
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      ORDER BY kcu.ordinal_position
    `,
    [schema, table],
  );

  const foreignKeyResult = await client.query(
    `
      SELECT
        tc.constraint_name,
        kcu.column_name,
        ccu.table_schema AS foreign_table_schema,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints tc
      INNER JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
       AND tc.table_schema = kcu.table_schema
       AND tc.table_name = kcu.table_name
      INNER JOIN information_schema.constraint_column_usage ccu
        ON tc.constraint_name = ccu.constraint_name
       AND tc.table_schema = ccu.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = $1
        AND tc.table_name = $2
      ORDER BY tc.constraint_name, kcu.ordinal_position
    `,
    [schema, table],
  );

  const indexesResult = await client.query(
    `
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = $1 AND tablename = $2
      ORDER BY indexname
    `,
    [schema, table],
  );

  const policiesResult = await client.query(
    `
      SELECT policyname, permissive, roles, cmd, qual, with_check
      FROM pg_policies
      WHERE schemaname = $1 AND tablename = $2
      ORDER BY policyname
    `,
    [schema, table],
  );

  let rowCount: number | null = null;
  try {
    rowCount = await getTableRowCount(client, schema, table);
  } catch {
    rowCount = null;
  }

  const columns = columnsResult.rows.map((row) => ({
    name: String(row.column_name),
    dataType: String(row.data_type),
    isNullable: String(row.is_nullable).toUpperCase() === "YES",
    defaultValue:
      row.column_default === undefined
        ? null
        : truncateText(row.column_default, 120),
  })) as PgColumnInfo[];

  return {
    schemaTable: buildSchemaTable(schema, table),
    kind: String(objectCheck.rows[0].kind),
    rowCount,
    columns,
    primaryKey: primaryKeyResult.rows.map((row) => String(row.column_name)),
    foreignKeys: foreignKeyResult.rows.map((row) => ({
      constraintName: String(row.constraint_name),
      columnName: String(row.column_name),
      references: buildSchemaTable(
        String(row.foreign_table_schema),
        String(row.foreign_table_name),
      ),
      referencedColumn: String(row.foreign_column_name),
    })),
    indexes: indexesResult.rows.map((row) => ({
      name: String(row.indexname),
      definition: truncateText(row.indexdef, 180),
    })),
    security: {
      rowLevelSecurityEnabled: Boolean(
        objectCheck.rows[0].row_security_enabled,
      ),
      forceRowLevelSecurity: Boolean(objectCheck.rows[0].force_row_security),
      policies: policiesResult.rows.map((row) => ({
        name: String(row.policyname),
        permissive: String(row.permissive),
        roles: Array.isArray(row.roles)
          ? row.roles.map((role) => String(role))
          : [],
        command: String(row.cmd),
        using: truncateText(row.qual, 180),
        withCheck: truncateText(row.with_check, 180),
      })),
    },
  };
}

const CONNECTION_URI_ENV_NAMES = [
  "DATABASE_URI",
  "DATABASE_URL",
  "POSTGRES_URL",
] as const;

function resolveConnectionUriFromEnv(): string | undefined {
  for (const envName of CONNECTION_URI_ENV_NAMES) {
    const value = process.env[envName];
    if (value) {
      return value;
    }
  }
  return undefined;
}

class LocalPgBootstrapProvider implements PgBootstrapProvider {
  async bootstrap(request: PgBootstrapRequest): Promise<PgBootstrapResult> {
    const shouldUseCloud =
      request.bootstrapMode === "cloud" ||
      (!request.bootstrapMode &&
        !request.connectionUri &&
        Boolean(request.envId));

    if (shouldUseCloud) {
      return {
        instanceId: request.instanceId ?? "cloudbase-pg",
        defaultSchema: request.defaultSchema ?? "public",
        status: "ready",
        bootstrapMode: "cloud",
        runtimeMode: "cloudbase-manager",
        role: request.role ?? "cloudbase_admin",
      };
    }

    const resolvedUri = request.connectionUri ?? resolveConnectionUriFromEnv();
    const bootstrapMode = resolvedUri
      ? "manual"
      : (request.bootstrapMode ?? "podman");

    if (resolvedUri) {
      return {
        instanceId: request.instanceId ?? "cloudbase-pg-local",
        connectionUri: resolvedUri,
        defaultSchema: request.defaultSchema ?? "public",
        status: "ready",
        bootstrapMode,
      };
    }

    const projectDir = await discoverCloudbasePgsqlProjectDir(
      request.projectDir,
    );
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

function createDefaultDependencies(
  server?: ExtendedMcpServer,
): PgToolDependencies {
  return {
    bootstrapProvider: new LocalPgBootstrapProvider(),
    createClient: async (context: PgRuntimeContext) => {
      if (context.runtimeMode === "cloudbase-manager") {
        return createManagerPgClient(context, server?.cloudBaseOptions);
      }

      if (!context.connectionUri) {
        throw new Error("Local PostgreSQL context requires connectionUri.");
      }

      const pgModule = await import("pg");
      const ClientCtor =
        typeof pgModule.Client === "function"
          ? pgModule.Client
          : typeof pgModule.default?.Client === "function"
            ? pgModule.default.Client
            : null;

      if (!ClientCtor) {
        throw new Error(
          "Unable to resolve PostgreSQL Client constructor from pg module",
        );
      }

      return new ClientCtor({
        connectionString: context.connectionUri,
      });
    },
  };
}

type ExecutePGSqlResult = {
  RequestId?: string;
  AffectedRows?: number;
  Columns?: string[] | null;
  Rows?: string[] | null;
  ExecutionTimeMs?: number;
};

type ExecutePGSqlDatabase = {
  executePGSql(options: {
    Sql: string;
    Role?: string;
    EnvId?: string;
  }): Promise<ExecutePGSqlResult>;
};

type CloudBaseCommonService = {
  call(options: {
    Action: string;
    Param: Record<string, unknown>;
  }): Promise<ExecutePGSqlResult | { Response?: ExecutePGSqlResult }>;
};

type CloudBaseWithCommonService = {
  commonService(service: string, version: string): CloudBaseCommonService;
};

function isExecutePGSqlDatabase(value: unknown): value is ExecutePGSqlDatabase {
  return Boolean(
    value &&
    typeof value === "object" &&
    "executePGSql" in value &&
    typeof (value as { executePGSql?: unknown }).executePGSql === "function",
  );
}

function isCloudBaseWithCommonService(
  value: unknown,
): value is CloudBaseWithCommonService {
  return Boolean(
    value &&
    typeof value === "object" &&
    "commonService" in value &&
    typeof (value as { commonService?: unknown }).commonService === "function",
  );
}

async function executeManagerPGSql(
  context: PgRuntimeContext,
  sql: string,
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"],
): Promise<ExecutePGSqlResult> {
  const manager = await getCloudBaseManager({
    cloudBaseOptions: cloudBaseOptions
      ? {
          ...cloudBaseOptions,
          envId: context.envId,
        }
      : {
          envId: context.envId,
        },
  });
  const options = {
    Sql: sql,
    Role: context.role,
    EnvId: context.envId,
  };

  if (isExecutePGSqlDatabase(manager.database)) {
    return manager.database.executePGSql(options);
  }

  if (isCloudBaseWithCommonService(manager)) {
    const result = await manager.commonService("tcb", "2018-06-08").call({
      Action: "ExecutePGSql",
      Param: options,
    });
    return "Response" in result && result.Response ? result.Response : result;
  }

  throw new Error(
    "Current @cloudbase/manager-node runtime does not expose database.executePGSql or commonService fallback. Upgrade to @cloudbase/manager-node >= 5.4.0.",
  );
}

/** Call a CloudBase PG migration API via commonService fallback */
async function callPgMigrationApi(
  context: PgRuntimeContext,
  action: string,
  params: Record<string, unknown>,
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"],
): Promise<Record<string, unknown>> {
  const manager = await getCloudBaseManager({
    cloudBaseOptions: cloudBaseOptions
      ? { ...cloudBaseOptions, envId: context.envId }
      : { envId: context.envId },
  });

  if (!isCloudBaseWithCommonService(manager)) {
    throw new Error(
      "Current @cloudbase/manager-node runtime does not support migration APIs. Upgrade to @cloudbase/manager-node >= 5.4.0.",
    );
  }

  const result = await manager.commonService("tcb", "2018-06-08").call({
    Action: action,
    Param: { EnvId: context.envId, ...params },
  });
  return "Response" in result && result.Response
    ? (result.Response as Record<string, unknown>)
    : (result as Record<string, unknown>);
}

function parseManagerRows(result: ExecutePGSqlResult) {
  const columns = result.Columns ?? [];
  return (result.Rows ?? []).map((rowText) => {
    let values: unknown;
    try {
      values = JSON.parse(rowText);
    } catch {
      values = [];
    }

    const arrayValues = Array.isArray(values) ? values : [];
    return Object.fromEntries(
      columns.map((column, index) => [column, arrayValues[index] ?? null]),
    );
  });
}

function renderPgLiteral(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "NULL";
  }
  if (typeof value === "boolean") {
    return value ? "TRUE" : "FALSE";
  }
  if (value instanceof Date) {
    return `'${value.toISOString().replace(/'/g, "''")}'`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

function renderParameterizedSql(sql: string, values?: unknown[]) {
  if (!values || values.length === 0) {
    return sql;
  }

  return sql.replace(/\$(\d+)/g, (placeholder, indexText) => {
    const index = Number(indexText);
    if (!Number.isInteger(index) || index < 1 || index > values.length) {
      return placeholder;
    }
    return renderPgLiteral(values[index - 1]);
  });
}

function inferCommand(sql: string) {
  return getSqlVerb(sql) || undefined;
}

function createManagerPgClient(
  context: PgRuntimeContext,
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"],
): PgClientLike {
  return {
    async connect() {
      return undefined;
    },
    async query(sql: string, values?: unknown[]) {
      const renderedSql = renderParameterizedSql(sql, values);
      const result = await executeManagerPGSql(
        context,
        renderedSql,
        cloudBaseOptions,
      );
      const rows = parseManagerRows(result);
      return {
        rows,
        rowCount: result.AffectedRows ?? rows.length,
        command: inferCommand(renderedSql),
        fields: result.Columns?.map((name) => ({ name })) ?? [],
      };
    },
    async end() {
      return undefined;
    },
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensurePgReady(
  context: PgRuntimeContext,
  deps: PgToolDependencies,
  options?: PgReadyCheckOptions,
) {
  const maxAttempts = options?.maxAttempts ?? 20;
  const retryDelayMs = options?.retryDelayMs ?? 1000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await withPgClient(context, deps, async (client) => {
        await client.query("SELECT 1");
      });
      return;
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        break;
      }
      await sleep(retryDelayMs);
    }
  }

  const reason =
    lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(
    `PostgreSQL is not ready after ${maxAttempts} attempts. Last error: ${reason}`,
  );
}

async function handleInit(
  args: ManagePgDatabaseArgs,
  server: ExtendedMcpServer,
  deps: PgToolDependencies,
) {
  const existing = await getPgContext(server);
  const resolvedEnvId =
    args.envId ??
    server.cloudBaseOptions?.envId ??
    process.env.CLOUDBASE_ENV_ID ??
    existing?.envId;
  const bootstrapResult = await deps.bootstrapProvider.bootstrap({
    envId: resolvedEnvId,
    instanceId: args.instanceId,
    defaultSchema: args.defaultSchema,
    connectionUri: args.connectionUri,
    bootstrapMode: args.bootstrapMode,
    projectDir: args.projectDir,
    role: args.role,
  });

  const now = new Date().toISOString();
  const context: PgRuntimeContext = {
    envId: resolvedEnvId ?? "local",
    instanceId: bootstrapResult.instanceId,
    connectionUri: bootstrapResult.connectionUri,
    defaultSchema: bootstrapResult.defaultSchema,
    runtimeMode: bootstrapResult.runtimeMode ?? "local",
    bootstrapMode: bootstrapResult.bootstrapMode,
    role: bootstrapResult.role ?? args.role,
    bootstrapProjectDir: bootstrapResult.bootstrapProjectDir,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  await ensurePgReady(context, deps, deps.readyCheckOptions);
  await savePgContext(server, context);

  return buildPgToolResult({
    success: true,
    data: {
      context: {
        ...sanitizePgContext(context),
      },
      status: bootstrapResult.status,
    },
    message:
      context.runtimeMode === "cloudbase-manager"
        ? "CloudBase PG 云端执行上下文已就绪。先查询对象或 schema，再执行写入 SQL。"
        : "Local PostgreSQL context is ready. Query objects first, then inspect schema before writing SQL.",
    nextActions: [
      buildNextAction(
        QUERY_PG_DATABASE,
        "objects",
        "List schema-qualified database objects before drilling into a specific table.",
        { action: "objects", limit: 20 },
      ),
      buildSchemaNextAction(
        "Inspect a concrete schema-qualified table after you know which object matters.",
        `${context.defaultSchema}.your_table`,
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
        ...sanitizePgContext(context),
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

async function handleListObjects(
  args: QueryPgDatabaseArgs,
  context: PgRuntimeContext,
  deps: PgToolDependencies,
) {
  const limit = normalizeLimit(args.limit);
  const objects = await withPgClient(context, deps, (client) =>
    listObjects(client, args.schema, limit),
  );

  return buildPgToolResult({
    success: true,
    data: {
      objects,
      schemaFilter: args.schema ?? null,
      limit,
    },
    message:
      objects.length > 0
        ? `Listed ${objects.length} schema-qualified PostgreSQL objects. Inspect one object schema before writing SQL.`
        : "No PostgreSQL objects matched the current filter.",
    nextActions:
      objects.length > 0
        ? [
            buildSchemaNextAction(
              "Inspect the most relevant object schema before querying data.",
              objects[0].schemaTable,
            ),
          ]
        : [
            buildNextAction(
              QUERY_PG_DATABASE,
              "context",
              "Re-check the current PG context if no objects were expectedly returned.",
              { action: "context" },
            ),
          ],
  });
}

async function handleMetadata(
  args: QueryPgDatabaseArgs,
  context: PgRuntimeContext,
  deps: PgToolDependencies,
) {
  const limit = normalizeLimit(args.limit);
  const tables = await withPgClient(context, deps, (client) =>
    summarizeMetadata(client, args.schema, limit),
  );

  return buildPgToolResult({
    success: true,
    data: {
      tables,
      schemaFilter: args.schema ?? null,
      limit,
    },
    message:
      tables.length > 0
        ? `Summarized ${tables.length} PostgreSQL objects with row-count and RLS hints. Use schema inspection before composing joins or mutations.`
        : "No PostgreSQL objects matched the current metadata filter.",
    nextActions:
      tables.length > 0
        ? [
            buildSchemaNextAction(
              "Inspect the relevant table schema to confirm columns, keys, and policies.",
              tables[0].schemaTable,
            ),
          ]
        : [
            buildNextAction(
              QUERY_PG_DATABASE,
              "objects",
              "List objects first if metadata is empty or too restrictive.",
              { action: "objects", schema: args.schema, limit },
            ),
          ],
  });
}

async function handleReadOnlySql(
  args: QueryPgDatabaseArgs,
  context: PgRuntimeContext,
  deps: PgToolDependencies,
) {
  if (!args.sql?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "SQL_REQUIRED",
      message: "Provide a read-only SQL statement when action=sql.",
    });
  }

  if (!isReadOnlySql(args.sql)) {
    return buildPgToolResult({
      success: false,
      errorCode: "READ_ONLY_SQL_REQUIRED",
      message:
        "queryPgDatabase(action=sql) only accepts read-only SQL. For DDL/DML (CREATE/ALTER/INSERT/UPDATE/DELETE/...), call managePgDatabase(action=execute) with confirm=true and the same SQL.",
      nextActions: [
        buildNextAction(
          MANAGE_PG_DATABASE,
          "execute",
          "Re-issue this statement via managePgDatabase(action=execute) with confirm=true.",
          { action: "execute", sql: args.sql, confirm: true },
        ),
        buildSchemaNextAction(
          "Inspect schema first if you are deciding which write operation is needed.",
          `${context.defaultSchema}.your_table`,
        ),
      ],
    });
  }

  const limit = normalizeLimit(args.limit);
  const result = await withPgClient(context, deps, (client) =>
    client.query(args.sql!),
  );
  const summary = summarizeQueryResult(result, limit);

  return buildPgToolResult({
    success: true,
    data: {
      ...summary,
      command: result.command ?? "SELECT",
      rowCount: result.rowCount ?? summary.returnedRows,
    },
    message: summary.truncated
      ? `Read-only SQL executed successfully. Showing ${summary.rows.length} of ${summary.returnedRows} rows to control token usage.`
      : "Read-only SQL executed successfully.",
    nextActions: [
      buildSchemaNextAction(
        "Inspect the table schema if you need to refine joins, filters, or mutations.",
        parseTargetTableFromSql(args.sql, context.defaultSchema) ??
          `${context.defaultSchema}.your_table`,
      ),
    ],
  });
}

async function handleExecuteSql(
  args: ManagePgDatabaseArgs,
  context: PgRuntimeContext,
  deps: PgToolDependencies,
) {
  if (!args.sql?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "SQL_REQUIRED",
      message: "Provide a SQL statement when action=execute.",
    });
  }

  const classification = classifySqlRisk(args.sql);
  if (!classification.readOnly && !args.confirm) {
    return buildPgToolResult({
      success: false,
      errorCode: "CONFIRM_REQUIRED",
      message: `This SQL is classified as ${classification.risk}. Re-run managePgDatabase(action=execute) with the same sql and confirm=true to proceed.`,
      data: {
        classification,
      },
      nextActions: [
        buildNextAction(
          MANAGE_PG_DATABASE,
          "execute",
          "Re-issue with confirm=true to actually run the SQL.",
          { action: "execute", sql: args.sql, confirm: true },
        ),
        buildNextAction(
          QUERY_PG_DATABASE,
          "metadata",
          "Inspect table size and shape before destructive changes.",
          { action: "metadata", limit: 20 },
        ),
      ],
    });
  }

  const result = await withPgClient(context, deps, (client) =>
    client.query(args.sql!),
  );
  const targetTable = parseTargetTableFromSql(args.sql, context.defaultSchema);

  return buildPgToolResult({
    success: true,
    data: {
      classification,
      command: result.command ?? getSqlVerb(args.sql),
      rowCount: result.rowCount ?? null,
      previewRows: result.rows
        .slice(0, 5)
        .map((row) => serializeValue(row) as Record<string, unknown>),
      targetTable: targetTable ?? null,
    },
    message: "Write SQL executed successfully.",
    nextActions:
      classification.risk === "schema_change" && targetTable
        ? [
            buildNextAction(
              QUERY_PG_DATABASE,
              "schema",
              "Inspect the table schema, columns, indexes, and RLS policies after schema changes.",
              {
                action: "schema",
                objectName: targetTable,
              },
            ),
          ]
        : [
            buildNextAction(
              QUERY_PG_DATABASE,
              "sql",
              "Verify the mutation with a focused read-only SQL query.",
              {
                action: "sql",
                sql: targetTable
                  ? `SELECT * FROM ${targetTable} LIMIT 20`
                  : "SELECT 1",
                limit: 20,
              },
            ),
          ],
  });
}

async function handleDryRun(args: ManagePgDatabaseArgs) {
  if (!args.sql?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "SQL_REQUIRED",
      message: "Provide a SQL statement when action=dryRun.",
    });
  }

  const classification = classifySqlRisk(args.sql);
  return buildPgToolResult({
    success: true,
    data: {
      classification,
      wouldExecute: false,
      sqlPreview: args.sql.trim().slice(0, 500),
    },
    message: classification.readOnly
      ? "SQL dry run completed. This statement is read-only; use queryPgDatabase(action=sql) to execute it."
      : "SQL dry run completed. Write SQL requires managePgDatabase(action=execute, confirm=true).",
    nextActions: [
      buildNextAction(
        classification.readOnly ? QUERY_PG_DATABASE : MANAGE_PG_DATABASE,
        classification.readOnly ? "sql" : "execute",
        classification.readOnly
          ? "Execute the read-only SQL through queryPgDatabase."
          : "Execute the write SQL only after explicit confirmation.",
        classification.readOnly
          ? { action: "sql", sql: args.sql, limit: 20 }
          : { action: "execute", sql: args.sql, confirm: true },
      ),
    ],
  });
}

async function handlePlanMigration(args: ManagePgDatabaseArgs, context: PgRuntimeContext, deps: PgToolDependencies, cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"]) {
  if (!args.sql?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "SQL_REQUIRED",
      message: "Provide migration SQL when action=planMigration.",
    });
  }

  try {
    const result = await callPgMigrationApi(context, "PreviewPGUserMigrations", {
      Sql: args.sql,
    }, cloudBaseOptions);
    return buildPgToolResult({
      success: true,
      data: result as Record<string, unknown>,
      message: "Migration plan generated via PreviewPGUserMigrations.",
      nextActions: [
        buildNextAction(
          MANAGE_PG_DATABASE,
          "applyMigration",
          "Review the plan above. If it looks correct, call applyMigration to execute.",
          { action: "applyMigration", sql: args.sql, confirm: true },
        ),
      ],
    });
  } catch (error) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_API_ERROR",
      message: `PreviewPGUserMigrations failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleApplyMigration(args: ManagePgDatabaseArgs, context: PgRuntimeContext, deps: PgToolDependencies, cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"]) {
  if (!args.sql?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "SQL_REQUIRED",
      message: "Provide migration SQL when action=applyMigration.",
    });
  }

  if (args.confirm !== true) {
    return buildPgToolResult({
      success: false,
      errorCode: "CONFIRM_REQUIRED",
      message: "PushPGUserMigrations requires confirm=true. Run with confirm=true to proceed.",
    });
  }

  try {
    const result = await callPgMigrationApi(context, "PushPGUserMigrations", {
      Sql: args.sql,
    }, cloudBaseOptions);
    return buildPgToolResult({
      success: true,
      data: result as Record<string, unknown>,
      message: "Migrations applied via PushPGUserMigrations.",
    });
  } catch (error) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_API_ERROR",
      message: `PushPGUserMigrations failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleListMigrations(args: ManagePgDatabaseArgs, context: PgRuntimeContext, deps: PgToolDependencies, cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"]) {
  try {
    const result = await callPgMigrationApi(context, "ListPGUserMigrations", {}, cloudBaseOptions);
    return buildPgToolResult({
      success: true,
      data: result as Record<string, unknown>,
      message: "Migration list retrieved via ListPGUserMigrations.",
    });
  } catch (error) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_API_ERROR",
      message: `ListPGUserMigrations failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleMigrationDetail(args: ManagePgDatabaseArgs, context: PgRuntimeContext, deps: PgToolDependencies, cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"]) {
  if (!args.objectName?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "OBJECT_NAME_REQUIRED",
      message: "Provide objectName (migration ID) when action=migrationDetail.",
    });
  }

  try {
    const result = await callPgMigrationApi(context, "DescribePGUserMigration", {
      ObjectId: args.objectName,
    }, cloudBaseOptions);
    return buildPgToolResult({
      success: true,
      data: result as Record<string, unknown>,
      message: "Migration detail retrieved via DescribePGUserMigration.",
    });
  } catch (error) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_API_ERROR",
      message: `DescribePGUserMigration failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleRollbackMigration(args: ManagePgDatabaseArgs, context: PgRuntimeContext, deps: PgToolDependencies, cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"]) {
  if (!args.objectName?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "OBJECT_NAME_REQUIRED",
      message: "Provide objectName (migration ID) when action=rollbackMigration.",
    });
  }

  if (args.confirm !== true) {
    return buildPgToolResult({
      success: false,
      errorCode: "CONFIRM_REQUIRED",
      message: "RollbackPGUserMigrations requires confirm=true. Run with confirm=true to proceed.",
    });
  }

  try {
    const result = await callPgMigrationApi(context, "RollbackPGUserMigrations", {
      ObjectId: args.objectName,
    }, cloudBaseOptions);
    return buildPgToolResult({
      success: true,
      data: result as Record<string, unknown>,
      message: "Migration rolled back via RollbackPGUserMigrations.",
    });
  } catch (error) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_API_ERROR",
      message: `RollbackPGUserMigrations failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleGetPgSchema(
  args: Pick<QueryPgDatabaseArgs, "objectName">,
  context: PgRuntimeContext,
  deps: PgToolDependencies,
) {
  const objectName = args.objectName ?? "";
  const parsed = parseSchemaQualifiedName(objectName);
  if (!parsed) {
    return buildPgToolResult({
      success: false,
      errorCode: "SCHEMA_QUALIFIED_NAME_REQUIRED",
      message:
        "queryPgDatabase(action=schema) requires a schema-qualified object name like public.users.",
    });
  }

  const schemaInfo = await withPgClient(context, deps, (client) =>
    readSchemaInfo(client, parsed.schema, parsed.name),
  );

  if (!schemaInfo) {
    return buildPgToolResult({
      success: false,
      errorCode: "OBJECT_NOT_FOUND",
      message: `PostgreSQL object ${objectName} was not found in the current local context.`,
      nextActions: [
        buildNextAction(
          QUERY_PG_DATABASE,
          "objects",
          "List schema-qualified objects to find the correct table or view name.",
          { action: "objects", schema: parsed.schema, limit: 20 },
        ),
      ],
    });
  }

  const security = schemaInfo.security;
  const rlsWithoutPolicies =
    security.rowLevelSecurityEnabled && security.policies.length === 0;

  return buildPgToolResult({
    success: true,
    data: schemaInfo as unknown as Record<string, unknown>,
    message: rlsWithoutPolicies
      ? "Resolved PostgreSQL schema, key, index, and security details. WARNING: RLS is enabled but no policies were found; browser/client reads and writes will be denied until policies are created or RLS is disabled."
      : "Resolved PostgreSQL schema, key, index, and security details. Use this structure before composing multi-table SQL.",
    nextActions: [
      ...(rlsWithoutPolicies
        ? [
            buildNextAction(
              MANAGE_PG_DATABASE,
              "execute",
              "Create SELECT/INSERT/UPDATE/DELETE RLS policies or disable RLS before browser-side app.rdb() CRUD.",
              {
                action: "execute",
                sql: `-- Example: CREATE POLICY ... ON ${objectName} FOR SELECT USING (true);`,
                confirm: true,
              },
            ),
          ]
        : []),
      buildNextAction(
        QUERY_PG_DATABASE,
        "metadata",
        "Check row-count and RLS hints for nearby tables before more complex queries.",
        { action: "metadata", schema: parsed.schema, limit: 20 },
      ),
      buildNextAction(
        QUERY_PG_DATABASE,
        "sql",
        "Run a focused read-only query now that the schema is known.",
        {
          action: "sql",
          sql: `SELECT * FROM ${objectName} LIMIT 20`,
          limit: 20,
        },
      ),
    ],
  });
}

export function registerPGDatabaseTools(
  server: ExtendedMcpServer,
  providedDeps?: Partial<PgToolDependencies>,
) {
  const deps = {
    ...createDefaultDependencies(server),
    ...providedDeps,
  } satisfies PgToolDependencies;

  server.registerTool?.(
    QUERY_PG_DATABASE,
    {
      title: "查询 PostgreSQL 上下文、对象、元数据或执行只读 SQL",
      description:
        "查询 CloudBase PostgreSQL 数据库。支持获取当前 PG 上下文、列出带 schema 的数据库对象、读取轻量元数据、检查单个对象结构，以及执行只读 SQL。",
      inputSchema: {
        action: z
          .enum(QUERY_ACTIONS)
          .describe(
            "操作类型：context=获取当前 PostgreSQL 上下文；objects=列出带 schema 的数据库对象；metadata=获取轻量表元数据；schema=检查单个带 schema 的对象结构；sql=执行只读 SQL",
          ),
        sql: z.string().optional().describe("action=sql 时使用的只读 SQL"),
        objectName: z
          .string()
          .optional()
          .describe(
            "action=schema 时使用的带 schema 的 PostgreSQL 对象名，例如 public.users",
          ),
        schema: z
          .string()
          .optional()
          .describe(
            "可选的 schema 过滤条件，用于 action=objects 或 action=metadata",
          ),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe(
            "可选的摘要数量上限，用于对象、元数据或 SQL 返回行数，默认 20，最大 200。",
          ),
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
          return handleListObjects(args, context, deps);
        case "metadata":
          return handleMetadata(args, context, deps);
        case "schema":
          return handleGetPgSchema(args, context, deps);
        case "sql":
          return handleReadOnlySql(args, context, deps);
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
      title: "管理 PostgreSQL 上下文或执行写入 SQL",
      description:
        "管理 CloudBase PostgreSQL MCP 上下文。支持绑定云端 Manager SDK 执行路径、本地开发环境初始化、SQL 风险预检、迁移规划占位，以及在显式确认后执行写入 SQL。",
      inputSchema: {
        action: z
          .enum(MANAGE_ACTIONS)
          .describe(
            "操作类型：init=初始化或绑定 PostgreSQL 上下文；execute=执行已确认的写入 SQL 或 DDL；dryRun=只分析 SQL 风险不执行；planMigration=通过 PreviewPGUserMigrations 预览迁移计划；applyMigration=通过 PushPGUserMigrations 应用迁移；listMigrations=查询已应用的 Migration 列表；migrationDetail=查看单条 Migration 详情；rollbackMigration=回滚指定 Migration",
          ),
        sql: z
          .string()
          .optional()
          .describe("action=execute、dryRun 或 planMigration 使用的 SQL 语句"),
        confirm: z
          .boolean()
          .optional()
          .describe("执行任何写入 SQL 前都需要显式设置为 true。"),
        envId: z
          .string()
          .optional()
          .describe("可选的 CloudBase 环境 ID，不传时使用当前 MCP 环境。"),
        instanceId: z
          .string()
          .optional()
          .describe("可选的 PostgreSQL 逻辑实例标识。"),
        defaultSchema: z
          .string()
          .optional()
          .describe("默认 schema，会保存到 PG 上下文中，默认 public。"),
        connectionUri: z
          .string()
          .optional()
          .describe(
            "可选的 PostgreSQL 直连 URI。提供该参数时会进入本地 manual 模式。",
          ),
        bootstrapMode: z
          .enum(BOOTSTRAP_MODES)
          .optional()
          .describe(
            "action=init 的初始化模式。cloud 使用 CloudBase Manager SDK executePGSql；podman/local/manual 用于本地开发路径。",
          ),
        projectDir: z
          .string()
          .optional()
          .describe("可选的 cloudbase-pgsql 项目目录，用于本地 action=init。"),
        role: z
          .string()
          .optional()
          .describe(
            "可选的 PostgreSQL role，会传给 Manager SDK executePGSql；例如需要管理策略时可传 postgres。",
          ),
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

          return handleExecuteSql(args, context, deps);
        }
        case "dryRun":
          return handleDryRun(args);
        case "planMigration":
        case "applyMigration":
        case "listMigrations":
        case "migrationDetail":
        case "rollbackMigration": {
          const migrationCtx = await getPgContext(server);
          if (!migrationCtx) {
            return buildMissingContextResult();
          }
          const cbOpts = server.cloudBaseOptions;
          switch (args.action) {
            case "planMigration": return handlePlanMigration(args, migrationCtx, deps, cbOpts);
            case "applyMigration": return handleApplyMigration(args, migrationCtx, deps, cbOpts);
            case "listMigrations": return handleListMigrations(args, migrationCtx, deps, cbOpts);
            case "migrationDetail": return handleMigrationDetail(args, migrationCtx, deps, cbOpts);
            case "rollbackMigration": return handleRollbackMigration(args, migrationCtx, deps, cbOpts);
            default: return buildPgToolResult({ success: false, errorCode: "UNSUPPORTED_ACTION", message: `Unsupported action: ${args.action}` });
          }
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
}
