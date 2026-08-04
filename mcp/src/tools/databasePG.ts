import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { getCloudBaseManager, getEnvId } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { buildJsonToolResult, ToolNextStep } from "../utils/tool-result.js";

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
  "execute",
  "dryRun",
  "planMigration",
  "applyMigration",
  "listMigrations",
  "migrationDetail",
  "describeMigrationTask",
  "fetchMigration",
  "rollbackMigration",
  "repairMigration",
] as const;
type QueryPgAction = (typeof QUERY_ACTIONS)[number];
type ManagePgAction = (typeof MANAGE_ACTIONS)[number];
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
  role?: string;
  objectName?: string;
  migrationName?: string;
  migrationVersion?: string;
  rollbackSql?: string;
  lastN?: number;
  limit?: number;
  offset?: number;
  lockTimeoutMs?: number;
  statementTimeoutMs?: number;
  /**
   * How long applyMigration polls DescribeTaskResult before MIGRATION_TASK_TIMEOUT.
   * Default aligns with CLI `tcb db pg migration up` (10 minutes). Clamped to
   * [MIGRATION_TASK_MIN_WAIT_MS, MIGRATION_TASK_MAX_WAIT_MS].
   */
  taskPollTimeoutMs?: number;
  /**
   * When false, skip DescribeTaskResult polling and return TaskId immediately
   * (MIGRATION_TASK_PENDING). Caller must listMigrations before retrying.
   * Default true.
   */
  waitForTask?: boolean;
  /**
   * describeMigrationTask: TaskId returned by PushPGUserMigrations / applyMigration
   * (MIGRATION_TASK_PENDING / MIGRATION_TASK_TIMEOUT). Polls DescribeTaskResult once.
   */
  taskId?: string;
  repairStatus?: "applied" | "reverted";
  repairReason?: string;
  /**
   * fetchMigration: when true, overwrite existing local SQL files under cloudbase/migrations/.
   * Default false — skip files that already exist (CLI `tcb db pg migration fetch --force` parity).
   */
  force?: boolean;
  /**
   * planMigration / applyMigration: allow out-of-order migrations (version older than
   * LatestVersion). Matches CLI `tcb db pg migration up --include-all`. Default false.
   */
  includeAll?: boolean;
  /** Escape hatch: allow schema DDL through execute instead of applyMigration. Default false. */
  allowDdlViaExecute?: boolean;
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
  createClient: (
    context: PgDbContext,
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

/**
 * PG 执行上下文（无状态，每次调用推导）
 * 替代旧的 PgRuntimeContext，不包含 createdAt/updatedAt 等可变状态
 */
interface PgDbContext {
  envId: string;
  instanceId: string;
  defaultSchema: string;
  role: string;
}

/**
 * 从 cloudBaseOptions + args 推导 PG 执行上下文（无状态）
 * 照搬 MySQL 的 resolveSqlDbContext 模式
 */
async function resolvePgDbContext(
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"],
  args?: { envId?: string; instanceId?: string; defaultSchema?: string; role?: string },
): Promise<PgDbContext> {
  const envId =
    args?.envId ??
    cloudBaseOptions?.envId ??
    (await getEnvId(cloudBaseOptions));

  return {
    envId,
    instanceId: args?.instanceId ?? "cloudbase-pg",
    defaultSchema: args?.defaultSchema ?? "public",
    role: args?.role ?? "cloudbase_admin",
  };
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

  return !/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REPLACE|RENAME|GRANT|REVOKE|COMMENT|VACUUM|ANALYZE|FOR\s+UPDATE|FOR\s+SHARE)\b/i.test(
    normalized,
  );
}

function buildLimitedReadOnlySql(sql: string, limit: number) {
  const normalized = stripLeadingSqlComments(sql).replace(/;\s*$/, "");
  const verb = getSqlVerb(normalized);
  if (!["SELECT", "WITH", "VALUES"].includes(verb)) {
    return sql;
  }
  return `SELECT * FROM (${normalized}) AS cloudbase_mcp_readonly_limit LIMIT ${limit}`;
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

/**
 * Schema DDL that must go through applyMigration by default.
 * Includes CREATE/ALTER/COMMENT (schema_change) and DROP/TRUNCATE / destructive ALTER.
 * Excludes DML DELETE and security_change (GRANT/POLICY), which may still use execute.
 */
function isSchemaDdlRisk(risk: string, sql: string): boolean {
  if (risk === "schema_change") {
    return true;
  }
  if (risk !== "destructive") {
    return false;
  }
  const verb = getSqlVerb(stripLeadingSqlComments(sql));
  return ["DROP", "TRUNCATE", "ALTER"].includes(verb);
}

/**
 * Canonical local migration directory — must match CloudBase CLI
 * `MIGRATIONS_DIR` (`cloudbase/migrations`) so MCP+CLI mixed workflows share files.
 * Legacy bare `migrations/` is accepted only when an existing matching file is found.
 */
const LOCAL_MIGRATIONS_DIR = "cloudbase/migrations";
const LOCAL_MIGRATIONS_DIR_LEGACY = "migrations";
/** Same constraint as applyMigration.migrationName (broader than CLI /^[a-z_]+$/ — digits allowed). */
const MIGRATION_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

function getMigrationProjectRoot(): string {
  const fromEnv =
    process.env.WORKSPACE_FOLDER_PATHS ||
    process.env.PROJECT_ROOT ||
    process.env.GITHUB_WORKSPACE ||
    process.env.CI_PROJECT_DIR ||
    process.env.BUILD_SOURCESDIRECTORY;
  if (fromEnv && fromEnv.trim()) {
    // IDEs may inject multiple folders separated by path.delimiter.
    const first = fromEnv.split(path.delimiter).map((p) => p.trim()).find(Boolean);
    if (first) {
      return first;
    }
  }
  return process.cwd();
}

function buildLocalMigrationFileName(version: string, name: string): string {
  return `${version}_${name}.sql`;
}

function buildLocalMigrationFileHint(version: string, name: string): string {
  return `${LOCAL_MIGRATIONS_DIR}/${buildLocalMigrationFileName(version, name)}`;
}

/** Normalize SQL for local file compare/write (LF + single trailing newline). */
function normalizeMigrationSqlForLocalFile(sql: string): string {
  const normalized = sql.replace(/\r\n/g, "\n").replace(/\s+$/u, "");
  return `${normalized}\n`;
}

type LocalMigrationFileEnsureResult =
  | {
      ok: true;
      relativePath: string;
      absolutePath: string;
      action: "created" | "matched";
    }
  | {
      ok: false;
      errorCode: "LOCAL_MIGRATION_FILE_MISMATCH" | "LOCAL_MIGRATION_FILE_WRITE_FAILED";
      message: string;
      relativePath?: string;
      absolutePath?: string;
    };

/**
 * Ensure the workspace has a Git-truth SQL file for this migration before Push.
 * Prefer write-to-workspace when missing; fail closed on mismatch or write failure
 * (Supabase MCP#241 class: remote apply without local truth source).
 */
function ensureLocalMigrationSqlFile(
  version: string,
  name: string,
  sql: string,
): LocalMigrationFileEnsureResult {
  const fileName = buildLocalMigrationFileName(version, name);
  const expected = normalizeMigrationSqlForLocalFile(sql);
  const projectRoot = getMigrationProjectRoot();
  const candidates = [
    {
      relativePath: `${LOCAL_MIGRATIONS_DIR}/${fileName}`,
      absolutePath: path.join(projectRoot, LOCAL_MIGRATIONS_DIR, fileName),
    },
    {
      relativePath: `${LOCAL_MIGRATIONS_DIR_LEGACY}/${fileName}`,
      absolutePath: path.join(projectRoot, LOCAL_MIGRATIONS_DIR_LEGACY, fileName),
    },
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate.absolutePath)) {
      continue;
    }
    let existing: string;
    try {
      existing = fs.readFileSync(candidate.absolutePath, "utf8");
    } catch (error) {
      return {
        ok: false,
        errorCode: "LOCAL_MIGRATION_FILE_WRITE_FAILED",
        message:
          `Failed to read existing local migration file ${candidate.relativePath}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
        relativePath: candidate.relativePath,
        absolutePath: candidate.absolutePath,
      };
    }
    if (normalizeMigrationSqlForLocalFile(existing) === expected) {
      return {
        ok: true,
        relativePath: candidate.relativePath,
        absolutePath: candidate.absolutePath,
        action: "matched",
      };
    }
    return {
      ok: false,
      errorCode: "LOCAL_MIGRATION_FILE_MISMATCH",
      message:
        `Local migration file ${candidate.relativePath} already exists but its content does not match the sql argument. ` +
        "Refuse to overwrite (fail closed). Update the local file to match, or use a new migrationVersion / migrationName. " +
        "Push was NOT submitted.",
      relativePath: candidate.relativePath,
      absolutePath: candidate.absolutePath,
    };
  }

  const target = candidates[0];
  try {
    fs.mkdirSync(path.dirname(target.absolutePath), { recursive: true });
    fs.writeFileSync(target.absolutePath, expected, "utf8");
  } catch (error) {
    return {
      ok: false,
      errorCode: "LOCAL_MIGRATION_FILE_WRITE_FAILED",
      message:
        `Failed to write local migration file ${target.relativePath} under workspace ${projectRoot}: ` +
        `${error instanceof Error ? error.message : String(error)}. ` +
        "Push was NOT submitted. Fix workspace permissions or write the file manually, then retry applyMigration.",
      relativePath: target.relativePath,
      absolutePath: target.absolutePath,
    };
  }

  return {
    ok: true,
    relativePath: target.relativePath,
    absolutePath: target.absolutePath,
    action: "created",
  };
}

type FetchedRemoteMigration = {
  Version: string;
  Name: string;
  Query: string;
};

type FetchLocalFileResult = {
  version: string;
  name: string;
  relativePath: string;
  absolutePath: string;
  action: "written" | "skipped";
};

/**
 * Sync remote migration Query bodies into cloudbase/migrations/ (CLI fetch parity).
 * Without force, existing files are skipped; with force, overwritten.
 */
function syncFetchedMigrationsToLocalFiles(
  items: FetchedRemoteMigration[],
  force: boolean,
): { ok: true; files: FetchLocalFileResult[] } | {
  ok: false;
  errorCode: "LOCAL_MIGRATION_FETCH_EMPTY_QUERY" | "LOCAL_MIGRATION_FETCH_INVALID_NAME" | "LOCAL_MIGRATION_FILE_WRITE_FAILED";
  message: string;
  relativePath?: string;
} {
  const projectRoot = getMigrationProjectRoot();
  const migrationsDir = path.join(projectRoot, LOCAL_MIGRATIONS_DIR);
  const files: FetchLocalFileResult[] = [];

  for (const item of items) {
    const version = item.Version.trim();
    const name = item.Name.trim();
    if (!MIGRATION_NAME_PATTERN.test(name)) {
      return {
        ok: false,
        errorCode: "LOCAL_MIGRATION_FETCH_INVALID_NAME",
        message:
          `Remote migration name "${name}" (version=${version}) is invalid. ` +
          "Names must match /^[a-z][a-z0-9_]*$/ (same as applyMigration.migrationName). " +
          "Repair the remote history record, then retry fetchMigration.",
      };
    }
    if (!item.Query.trim()) {
      return {
        ok: false,
        errorCode: "LOCAL_MIGRATION_FETCH_EMPTY_QUERY",
        message:
          `DescribePGUserMigration returned empty Query for version=${version} (${name}). ` +
          "Refuse to write an empty local migration file (would poison Git checksums).",
      };
    }

    const relativePath = buildLocalMigrationFileHint(version, name);
    const absolutePath = path.join(migrationsDir, buildLocalMigrationFileName(version, name));
    const exists = fs.existsSync(absolutePath);
    if (exists && !force) {
      files.push({ version, name, relativePath, absolutePath, action: "skipped" });
      continue;
    }

    try {
      fs.mkdirSync(migrationsDir, { recursive: true });
      fs.writeFileSync(absolutePath, normalizeMigrationSqlForLocalFile(item.Query), "utf8");
    } catch (error) {
      return {
        ok: false,
        errorCode: "LOCAL_MIGRATION_FILE_WRITE_FAILED",
        message:
          `Failed to write local migration file ${relativePath} under workspace ${projectRoot}: ` +
          `${error instanceof Error ? error.message : String(error)}`,
        relativePath,
      };
    }
    files.push({ version, name, relativePath, absolutePath, action: "written" });
  }

  return { ok: true, files };
}

/** How many recent migration records to scan when verifying a freshly pushed version. */
const MIGRATION_VERIFY_LIMIT = 100;

/**
 * Collect every migration version mentioned anywhere in a migration-list API response.
 * The response shape is not strongly typed, so walk it generically and pick up any
 * `Version` / `MigrationVersion` string field instead of guessing a single container key.
 */
function collectMigrationVersions(value: unknown, found: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMigrationVersions(item, found);
    }
    return found;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if ((key === "Version" || key === "MigrationVersion") && typeof child === "string" && child.trim()) {
        found.add(child.trim());
      } else {
        collectMigrationVersions(child, found);
      }
    }
  }
  return found;
}

/** Brief retries before concluding a pushed migration never landed (Push can be async). */
const MIGRATION_VERIFY_ATTEMPTS = 4;
const MIGRATION_VERIFY_DELAY_MS = 1500;

/** Page size when hydrating remote migration history into a Push/Preview payload. */
const MIGRATION_LIST_PAGE_SIZE = 100;

/**
 * PushPGUserMigrations is async: poll DescribeTaskResult until Succeed/Failed.
 * Default wait aligns with CLI `tcb db pg migration up` (10 minutes).
 * Override per call via applyMigration.taskPollTimeoutMs.
 */
const MIGRATION_TASK_POLL_INTERVAL_MS = 1500;
/** CLI parity: `TASK_MAX_WAIT_MS = 10 * 60 * 1000` in cloudbase-cli migration up. */
const MIGRATION_TASK_DEFAULT_WAIT_MS = 10 * 60 * 1000;
const MIGRATION_TASK_MIN_WAIT_MS = 5_000;
const MIGRATION_TASK_MAX_WAIT_MS = MIGRATION_TASK_DEFAULT_WAIT_MS;

function resolveMigrationTaskPollTimeoutMs(requested?: number): number {
  if (requested === undefined || !Number.isFinite(requested)) {
    return MIGRATION_TASK_DEFAULT_WAIT_MS;
  }
  const rounded = Math.floor(requested);
  if (rounded < MIGRATION_TASK_MIN_WAIT_MS) {
    return MIGRATION_TASK_MIN_WAIT_MS;
  }
  if (rounded > MIGRATION_TASK_MAX_WAIT_MS) {
    return MIGRATION_TASK_MAX_WAIT_MS;
  }
  return rounded;
}

type PgMigrationInput = {
  Version: string;
  Name: string;
  Query: string;
  Rollback?: string;
};

type PgMigrationTaskResult = {
  TaskId?: string;
  TaskType?: string;
  Status?: string;
  Phase?: string;
  Reason?: string;
  RequestId?: string;
  CreatedAt?: string;
  UpdatedAt?: string;
};

/**
 * Confirm a pushed migration version is present in the remote migration history.
 *
 * `PushPGUserMigrations` can return a TaskId without the migration actually being
 * applied, so the raw API response is not sufficient evidence of success. Retries
 * briefly to tolerate async application, then returns `true`/`false` when the
 * history could be read, or `null` when verification itself failed (in which case
 * the caller must not claim the migration is applied).
 */
async function verifyMigrationApplied(
  context: PgDbContext,
  version: string,
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"],
): Promise<{ applied: boolean | null; error?: string }> {
  let lastError: string | undefined;
  let sawSuccessfulList = false;
  for (let attempt = 1; attempt <= MIGRATION_VERIFY_ATTEMPTS; attempt++) {
    try {
      const history = await callPgMigrationApi(
        context,
        "ListPGUserMigrations",
        { Limit: MIGRATION_VERIFY_LIMIT },
        cloudBaseOptions,
      );
      sawSuccessfulList = true;
      if (collectMigrationVersions(history).has(version)) {
        return { applied: true };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // Keep retrying: a transient list failure should not immediately fail verification.
    }
    if (attempt < MIGRATION_VERIFY_ATTEMPTS) {
      await sleep(MIGRATION_VERIFY_DELAY_MS);
    }
  }
  if (sawSuccessfulList) {
    return { applied: false };
  }
  return { applied: null, error: lastError };
}

function extractMigrationSummaries(history: Record<string, unknown>): Array<{ Version: string; Name: string }> {
  const raw = history.Migrations;
  if (!Array.isArray(raw)) {
    return [];
  }
  const summaries: Array<{ Version: string; Name: string }> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") {
      continue;
    }
    const row = item as Record<string, unknown>;
    const version = typeof row.Version === "string" ? row.Version.trim() : "";
    const name = typeof row.Name === "string" ? row.Name.trim() : "";
    if (version) {
      summaries.push({ Version: version, Name: name || version });
    }
  }
  return summaries;
}

/**
 * List every remote migration summary (paginated). Required before Push/Preview:
 * submitting only the pending migration while remote history exists yields
 * Executable=false with Conflicts reason remote_history_not_found_locally, and the
 * async task fails with "migration plan is not executable".
 */
async function listAllRemoteMigrationSummaries(
  context: PgDbContext,
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"],
): Promise<{ summaries: Array<{ Version: string; Name: string }>; latestVersion: string; total: number }> {
  const summaries: Array<{ Version: string; Name: string }> = [];
  let offset = 0;
  let latestVersion = "";
  let total = 0;

  while (true) {
    const page = await callPgMigrationApi(
      context,
      "ListPGUserMigrations",
      { Limit: MIGRATION_LIST_PAGE_SIZE, Offset: offset },
      cloudBaseOptions,
    );
    const pageItems = extractMigrationSummaries(page);
    summaries.push(...pageItems);
    if (typeof page.LatestVersion === "string" && page.LatestVersion.trim()) {
      latestVersion = page.LatestVersion.trim();
    }
    if (typeof page.Total === "number" && Number.isFinite(page.Total)) {
      total = page.Total;
    } else {
      total = summaries.length;
    }
    if (pageItems.length < MIGRATION_LIST_PAGE_SIZE) {
      break;
    }
    offset += MIGRATION_LIST_PAGE_SIZE;
  }

  return { summaries, latestVersion, total };
}

/**
 * Build Push/Preview Migrations = remote history Queries + the pending migration.
 * Matches CLI behavior (submit full set; server skips already-applied versions).
 */
async function buildMigrationsPayloadWithRemoteHistory(
  context: PgDbContext,
  pending: PgMigrationInput,
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"],
): Promise<{
  migrations: PgMigrationInput[];
  remoteCount: number;
  latestVersion: string;
}> {
  const { summaries, latestVersion } = await listAllRemoteMigrationSummaries(context, cloudBaseOptions);
  const migrations: PgMigrationInput[] = [];

  for (const summary of summaries) {
    if (summary.Version === pending.Version) {
      // Caller supplies the authoritative SQL for this version.
      continue;
    }
    const detail = await callPgMigrationApi(
      context,
      "DescribePGUserMigration",
      { MigrationVersion: summary.Version },
      cloudBaseOptions,
    );
    const query = typeof detail.Query === "string" ? detail.Query : "";
    if (!query.trim()) {
      throw new Error(
        `DescribePGUserMigration returned empty Query for version=${summary.Version} (${summary.Name}). ` +
          "Cannot hydrate remote history for PushPGUserMigrations.",
      );
    }
    migrations.push({
      Version: typeof detail.Version === "string" && detail.Version.trim() ? detail.Version.trim() : summary.Version,
      Name: typeof detail.Name === "string" && detail.Name.trim() ? detail.Name.trim() : summary.Name,
      Query: query,
    });
  }

  migrations.push(pending);
  return { migrations, remoteCount: summaries.length, latestVersion };
}

async function waitPgMigrationTask(
  context: PgDbContext,
  taskId: string,
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"],
  maxWaitMs: number = MIGRATION_TASK_DEFAULT_WAIT_MS,
): Promise<PgMigrationTaskResult> {
  const deadline = Date.now() + maxWaitMs;
  let last: PgMigrationTaskResult = { TaskId: taskId };

  while (Date.now() <= deadline) {
    last = (await callPgMigrationApi(
      context,
      "DescribeTaskResult",
      { TaskId: taskId },
      cloudBaseOptions,
    )) as PgMigrationTaskResult;

    const status = String(last.Status || "").toLowerCase();
    if (status === "succeed" || status === "failed") {
      return last;
    }
    await sleep(MIGRATION_TASK_POLL_INTERVAL_MS);
  }

  const error = new Error(
    `DescribeTaskResult timed out after ${Math.floor(maxWaitMs / 1000)}s ` +
      `for TaskId=${taskId} (last Status=${last.Status || "-"}, Phase=${last.Phase || "-"}).`,
  );
  (error as Error & { lastTask?: PgMigrationTaskResult }).lastTask = last;
  throw error;
}

function buildMigrationTaskPendingNextActions(version: string, taskId?: string): ToolNextStep[] {
  const actions: ToolNextStep[] = [];
  if (taskId) {
    actions.push(
      buildNextAction(
        MANAGE_PG_DATABASE,
        "describeMigrationTask",
        "FIRST: poll DescribeTaskResult for Status/Phase/Reason. listMigrations alone cannot explain a Failed task (see issue #857).",
        { action: "describeMigrationTask", taskId },
      ),
    );
  }
  actions.push(
    buildNextAction(
      MANAGE_PG_DATABASE,
      "listMigrations",
      "Check whether migrationVersion landed in remote history. Do NOT re-push the same version while the task may still be running.",
      { action: "listMigrations", limit: 20 },
    ),
    buildNextAction(
      MANAGE_PG_DATABASE,
      "migrationDetail",
      "If listMigrations already shows this version, inspect the applied record. If missing after several minutes and the task is Failed/terminal, inspect Conflicts/SQL before considering a NEW migrationVersion.",
      { action: "migrationDetail", migrationVersion: version },
    ),
  );
  return actions;
}

const MIGRATION_VERSION_REQUIRED_MESSAGE =
  "migrationVersion is required (14-digit UTC timestamp YYYYMMDDHHMMSS). " +
  "Decide the version first, write local file cloudbase/migrations/<version>_<migrationName>.sql, " +
  "then call planMigration/applyMigration with the same migrationVersion and migrationName.";

function requireExplicitMigrationVersion(
  args: ManagePgDatabaseArgs,
  actionLabel: string,
) {
  const version = args.migrationVersion?.trim();
  if (!version) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_VERSION_REQUIRED",
      message: `Provide migrationVersion when action=${actionLabel}. ${MIGRATION_VERSION_REQUIRED_MESSAGE}`,
    });
  }
  return version;
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
  context: PgDbContext,
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
      summary.rowCount = summary.estimatedRows ?? null;
      summary.rowCountSource = "estimated";
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

function createDefaultDependencies(
  server?: ExtendedMcpServer,
): PgToolDependencies {
  return {
    createClient: async (context: PgDbContext) =>
      createManagerPgClient(context, server?.cloudBaseOptions),
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

/**
 * Native PG migration methods on `manager.database`, added in
 * @cloudbase/manager-node >= 5.6.5. Each method is a typed wrapper over the same
 * tcb/2018-06-08 platform channel used by the commonService fallback, and returns
 * the unwrapped API `Response` (same shape as `callPgMigrationApi`).
 */
type PgMigrationApiDatabase = {
  previewPGUserMigrations(options: {
    EnvId?: string;
    Migrations: PgMigrationInput[];
    IncludeAll?: boolean;
  }): Promise<Record<string, unknown>>;
  pushPGUserMigrations(options: {
    EnvId?: string;
    Migrations: PgMigrationInput[];
    LockTimeoutMs?: number;
    StatementTimeoutMs?: number;
    IncludeAll?: boolean;
  }): Promise<Record<string, unknown>>;
  repairPGUserMigrationHistory(options: {
    EnvId?: string;
    MigrationVersion: string;
    Name: string;
    Status: "applied" | "reverted";
    Reason: string;
    Query?: string;
  }): Promise<Record<string, unknown>>;
  listPGUserMigrations(options?: {
    EnvId?: string;
    Limit?: number;
    Offset?: number;
  }): Promise<Record<string, unknown>>;
  listAllPGUserMigrations(options?: {
    EnvId?: string;
    PageSize?: number;
  }): Promise<Record<string, unknown>>;
  describePGUserMigration(options: {
    EnvId?: string;
    MigrationVersion: string;
  }): Promise<Record<string, unknown>>;
  describeTaskResult(options: { EnvId?: string; TaskId: string }): Promise<Record<string, unknown>>;
};

function isPgMigrationApiDatabase(value: unknown): value is PgMigrationApiDatabase {
  return Boolean(
    value &&
    typeof value === "object" &&
    "previewPGUserMigrations" in value &&
    typeof (value as { previewPGUserMigrations?: unknown }).previewPGUserMigrations === "function" &&
    "pushPGUserMigrations" in value &&
    typeof (value as { pushPGUserMigrations?: unknown }).pushPGUserMigrations === "function" &&
    "listPGUserMigrations" in value &&
    typeof (value as { listPGUserMigrations?: unknown }).listPGUserMigrations === "function" &&
    "describeTaskResult" in value &&
    typeof (value as { describeTaskResult?: unknown }).describeTaskResult === "function",
  );
}

/**
 * Actions without a native wrapper in manager-node (e.g. RollbackPGUserMigrations)
 * are intentionally absent and keep using the commonService fallback.
 */
const PgMigrationNativeActionMethods: Record<string, keyof PgMigrationApiDatabase> = {
  PreviewPGUserMigrations: "previewPGUserMigrations",
  PushPGUserMigrations: "pushPGUserMigrations",
  RepairPGUserMigrationHistory: "repairPGUserMigrationHistory",
  ListPGUserMigrations: "listPGUserMigrations",
  DescribePGUserMigration: "describePGUserMigration",
  DescribeTaskResult: "describeTaskResult",
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
  context: PgDbContext,
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

/**
 * Call a CloudBase PG migration API, preferring native manager-node methods
 * (>= 5.6.5) and falling back to the commonService channel for older runtimes
 * and actions without a native wrapper (RollbackPGUserMigrations).
 */
async function callPgMigrationApi(
  context: PgDbContext,
  action: string,
  params: Record<string, unknown>,
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"],
): Promise<Record<string, unknown>> {
  const manager = await getCloudBaseManager({
    cloudBaseOptions: cloudBaseOptions
      ? { ...cloudBaseOptions, envId: context.envId }
      : { envId: context.envId },
  });

  const nativeMethod = PgMigrationNativeActionMethods[action];
  if (nativeMethod && isPgMigrationApiDatabase(manager.database)) {
    const invoke = manager.database[nativeMethod] as (
      options: Record<string, unknown>,
    ) => Promise<Record<string, unknown>>;
    return invoke.call(manager.database, { EnvId: context.envId, ...params });
  }

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
  context: PgDbContext,
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

/**
 * 模块级 Promise 缓存：同一 server 生命周期内只探测一次 PG 就绪状态
 * 照搬 MySQL lazy 就绪检查模式，避免每次业务调用都 SELECT 1
 */
let pgReadyPromise: Promise<void> | null = null;

/**
 * @internal 重置就绪探测缓存（仅供测试使用）
 */
export function __resetPgReadyCache() {
  pgReadyPromise = null;
}

/**
 * 首次 SQL 调用时探测 PG 就绪，Promise 缓存避免重复探测
 * 探测失败抛错，由调用方捕获返回 PG_NOT_READY 错误码
 */
async function ensurePgReadyOnce(
  cloudBaseOptions: ExtendedMcpServer["cloudBaseOptions"] | undefined,
  deps: PgToolDependencies,
): Promise<void> {
  if (pgReadyPromise) {
    return pgReadyPromise;
  }

  pgReadyPromise = (async () => {
    const context = await resolvePgDbContext(cloudBaseOptions);
    const maxAttempts = deps.readyCheckOptions?.maxAttempts ?? 20;
    const retryDelayMs = deps.readyCheckOptions?.retryDelayMs ?? 1000;
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
  })();

  return pgReadyPromise;
}

async function handleQueryContext(server: ExtendedMcpServer) {
  const context = await resolvePgDbContext(server.cloudBaseOptions);

  return buildPgToolResult({
    success: true,
    data: {
      context: {
        envId: context.envId,
        instanceId: context.instanceId,
        defaultSchema: context.defaultSchema,
        runtimeMode: "cloudbase-manager",
        bootstrapMode: "cloud",
        role: context.role,
      },
    },
    message: "Resolved current CloudBase PostgreSQL context (auto-derived).",
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
  context: PgDbContext,
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
  context: PgDbContext,
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
  context: PgDbContext,
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
  const limitedSql = buildLimitedReadOnlySql(args.sql, limit);
  const result = await withPgClient(context, deps, (client) =>
    client.query(limitedSql),
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
  context: PgDbContext,
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

  if (isSchemaDdlRisk(classification.risk, args.sql) && args.allowDdlViaExecute !== true) {
    return buildPgToolResult({
      success: false,
      errorCode: "DDL_USE_APPLY_MIGRATION",
      message:
        "Schema DDL (CREATE/ALTER/DROP/TRUNCATE/...) must use applyMigration with an explicit migrationVersion, " +
        "not execute. Write local cloudbase/migrations/<version>_<name>.sql first, then call applyMigration. " +
        "Set allowDdlViaExecute=true only for exceptional one-off ops that intentionally bypass migration history.",
      data: {
        classification,
        localFileHintPattern: "cloudbase/migrations/<migrationVersion>_<migrationName>.sql",
      },
      nextActions: [
        buildNextAction(
          MANAGE_PG_DATABASE,
          "planMigration",
          "Preview the schema change as a versioned migration (provide migrationVersion + migrationName).",
          {
            action: "planMigration",
            migrationName: "describe_your_change",
            migrationVersion: "YYYYMMDDHHMMSS",
            sql: args.sql,
          },
        ),
        buildNextAction(
          MANAGE_PG_DATABASE,
          "applyMigration",
          "Apply the schema change via PushPGUserMigrations with the same explicit migrationVersion.",
          {
            action: "applyMigration",
            migrationName: "describe_your_change",
            migrationVersion: "YYYYMMDDHHMMSS",
            sql: args.sql,
            confirm: true,
          },
        ),
      ],
    });
  }

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
          {
            action: "execute",
            sql: args.sql,
            confirm: true,
            ...(args.allowDdlViaExecute === true ? { allowDdlViaExecute: true } : {}),
          },
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
      ...(args.allowDdlViaExecute === true && isSchemaDdlRisk(classification.risk, args.sql)
        ? {
            warning:
              "DDL executed via allowDdlViaExecute bypasses migration history. Prefer applyMigration for reproducible schema changes.",
          }
        : {}),
    },
    message:
      args.allowDdlViaExecute === true && isSchemaDdlRisk(classification.risk, args.sql)
        ? "Write SQL executed successfully (DDL via allowDdlViaExecute; migration history was bypassed)."
        : "Write SQL executed successfully.",
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
  const schemaDdl = isSchemaDdlRisk(classification.risk, args.sql);

  if (classification.readOnly) {
    return buildPgToolResult({
      success: true,
      data: {
        classification,
        wouldExecute: false,
        sqlPreview: args.sql.trim().slice(0, 500),
      },
      message:
        "SQL dry run completed. This statement is read-only; use queryPgDatabase(action=sql) to execute it.",
      nextActions: [
        buildNextAction(
          QUERY_PG_DATABASE,
          "sql",
          "Execute the read-only SQL through queryPgDatabase.",
          { action: "sql", sql: args.sql, limit: 20 },
        ),
      ],
    });
  }

  if (schemaDdl) {
    return buildPgToolResult({
      success: true,
      data: {
        classification,
        wouldExecute: false,
        sqlPreview: args.sql.trim().slice(0, 500),
        preferredAction: "applyMigration",
        localFileHintPattern: "cloudbase/migrations/<migrationVersion>_<migrationName>.sql",
      },
      message:
        "SQL dry run completed. Schema DDL should use applyMigration with an explicit migrationVersion, not execute.",
      nextActions: [
        buildNextAction(
          MANAGE_PG_DATABASE,
          "applyMigration",
          "Apply schema DDL via versioned migration (provide migrationVersion + migrationName + confirm=true).",
          {
            action: "applyMigration",
            migrationName: "describe_your_change",
            migrationVersion: "YYYYMMDDHHMMSS",
            sql: args.sql,
            confirm: true,
          },
        ),
      ],
    });
  }

  return buildPgToolResult({
    success: true,
    data: {
      classification,
      wouldExecute: false,
      sqlPreview: args.sql.trim().slice(0, 500),
    },
    message:
      "SQL dry run completed. Write SQL requires managePgDatabase(action=execute, confirm=true).",
    nextActions: [
      buildNextAction(
        MANAGE_PG_DATABASE,
        "execute",
        "Execute the write SQL only after explicit confirmation.",
        { action: "execute", sql: args.sql, confirm: true },
      ),
    ],
  });
}

async function handlePlanMigration(args: ManagePgDatabaseArgs, context: PgDbContext, deps: PgToolDependencies, cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"]) {
  if (!args.sql?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "SQL_REQUIRED",
      message: "Provide migration SQL when action=planMigration.",
    });
  }

  if (!args.migrationName?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_NAME_REQUIRED",
      message: "Provide migrationName (lowercase letters, digits and underscores, starting with a letter) when action=planMigration.",
    });
  }

  const versionOrError = requireExplicitMigrationVersion(args, "planMigration");
  if (typeof versionOrError !== "string") {
    return versionOrError;
  }
  const version = versionOrError;
  const localFileHint = buildLocalMigrationFileHint(version, args.migrationName);

  const pending: PgMigrationInput = {
    Version: version,
    Name: args.migrationName,
    Query: args.sql,
  };
  if (args.rollbackSql?.trim()) {
    pending.Rollback = args.rollbackSql;
  }

  try {
    const hydrated = await buildMigrationsPayloadWithRemoteHistory(
      context,
      pending,
      cloudBaseOptions,
    );
    const includeAll = Boolean(args.includeAll);
    const result = await callPgMigrationApi(context, "PreviewPGUserMigrations", {
      Migrations: hydrated.migrations,
      IncludeAll: includeAll,
    }, cloudBaseOptions);
    const executable = result.Executable === true;
    return buildPgToolResult({
      success: true,
      data: {
        migrationVersion: version,
        migrationName: args.migrationName,
        localFileHint,
        hydratedRemoteCount: hydrated.remoteCount,
        latestRemoteVersion: hydrated.latestVersion || null,
        includeAll,
        executable,
        apiResult: result as Record<string, unknown>,
      },
      message: executable
        ? `Migration plan generated via PreviewPGUserMigrations (hydrated ${hydrated.remoteCount} remote migration(s)${includeAll ? ", includeAll=true" : ""}). Reuse migrationVersion=${version} on applyMigration. Ensure local file ${localFileHint} exists and matches.`
        : `Migration plan is NOT executable (PreviewPGUserMigrations.Executable=false after hydrating ${hydrated.remoteCount} remote migration(s)${includeAll ? ", includeAll=true" : ""}). Inspect apiResult.Conflicts before applyMigration. Common causes: version older than latest remote (${hydrated.latestVersion || "unknown"}) — retry with includeAll=true (CLI --include-all) if intentionally out-of-order, or pick a newer version; checksum mismatch.`,
      nextActions: [
        buildNextAction(
          MANAGE_PG_DATABASE,
          "applyMigration",
          executable
            ? "Review the plan above. If it looks correct, call applyMigration with the same migrationVersion."
            : "Resolve Conflicts (often pick a migrationVersion newer than LatestVersion, or set includeAll=true for intentional out-of-order), then retry planMigration/applyMigration.",
          {
            action: "applyMigration",
            migrationName: args.migrationName,
            migrationVersion: version,
            sql: args.sql,
            confirm: true,
            ...(args.rollbackSql ? { rollbackSql: args.rollbackSql } : {}),
            ...(includeAll ? { includeAll: true } : {}),
          },
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

async function handleApplyMigration(args: ManagePgDatabaseArgs, context: PgDbContext, deps: PgToolDependencies, cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"]) {
  if (!args.sql?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "SQL_REQUIRED",
      message: "Provide migration SQL when action=applyMigration.",
    });
  }

  if (!args.migrationName?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_NAME_REQUIRED",
      message: "Provide migrationName (lowercase letters, digits and underscores, starting with a letter) when action=applyMigration.",
    });
  }

  if (args.confirm !== true) {
    return buildPgToolResult({
      success: false,
      errorCode: "CONFIRM_REQUIRED",
      message: "PushPGUserMigrations requires confirm=true. Run with confirm=true to proceed.",
    });
  }

  const versionOrError = requireExplicitMigrationVersion(args, "applyMigration");
  if (typeof versionOrError !== "string") {
    return versionOrError;
  }
  const version = versionOrError;
  const localFileHint = buildLocalMigrationFileHint(version, args.migrationName);

  // Prefer write-to-workspace (or fail closed) so remote history cannot advance without a Git truth source.
  const localFile = ensureLocalMigrationSqlFile(version, args.migrationName, args.sql);
  if (!localFile.ok) {
    return buildPgToolResult({
      success: false,
      errorCode: localFile.errorCode,
      data: {
        migrationVersion: version,
        migrationName: args.migrationName,
        localFileHint,
        localFilePath: localFile.relativePath ?? localFileHint,
        localFileAbsolutePath: localFile.absolutePath ?? null,
        verified: false,
      },
      message: localFile.message,
      nextActions: [
        buildNextAction(
          MANAGE_PG_DATABASE,
          "planMigration",
          "After aligning the local SQL file with the sql argument (or choosing a new migrationVersion), preview again.",
          {
            action: "planMigration",
            migrationName: args.migrationName,
            migrationVersion: version,
            sql: args.sql,
            ...(args.rollbackSql ? { rollbackSql: args.rollbackSql } : {}),
            ...(args.includeAll ? { includeAll: true } : {}),
          },
        ),
      ],
    });
  }

  const pending: PgMigrationInput = {
    Version: version,
    Name: args.migrationName,
    Query: args.sql,
  };
  if (args.rollbackSql?.trim()) {
    pending.Rollback = args.rollbackSql;
  }

  const includeAll = Boolean(args.includeAll);

  try {
    // Pushing only the pending migration while remote history exists makes the plan
    // non-executable (remote_history_not_found_locally). Hydrate remote Queries first,
    // matching CLI `tcb db pg migration up` (full list; server skips applied).
    const hydrated = await buildMigrationsPayloadWithRemoteHistory(
      context,
      pending,
      cloudBaseOptions,
    );

    const preview = await callPgMigrationApi(
      context,
      "PreviewPGUserMigrations",
      { Migrations: hydrated.migrations, IncludeAll: includeAll },
      cloudBaseOptions,
    );

    if (preview.Executable !== true) {
      return buildPgToolResult({
        success: false,
        errorCode: "MIGRATION_NOT_EXECUTABLE",
        data: {
          migrationVersion: version,
          migrationName: args.migrationName,
          localFileHint,
          hydratedRemoteCount: hydrated.remoteCount,
          latestRemoteVersion: hydrated.latestVersion || null,
          includeAll,
          previewResult: preview as Record<string, unknown>,
          verified: false,
        },
        message:
          `PreviewPGUserMigrations reported Executable=false for migrationVersion=${version} ` +
          `(latest remote=${hydrated.latestVersion || "unknown"}, hydratedRemoteCount=${hydrated.remoteCount}, includeAll=${includeAll}). ` +
          "Push was NOT submitted. Inspect previewResult.Conflicts — common reasons: " +
          "local_migration_before_latest_remote (pick a newer 14-digit version, or set includeAll=true / CLI --include-all for intentional out-of-order) or checksum_mismatch. " +
          "If the schema change is urgent you may fall back to action=execute with allowDdlViaExecute=true, but that bypasses migration history.",
        nextActions: [
          buildNextAction(
            MANAGE_PG_DATABASE,
            "listMigrations",
            "Check LatestVersion and pick a migrationVersion strictly newer than it.",
            { action: "listMigrations", limit: 20 },
          ),
          buildNextAction(
            MANAGE_PG_DATABASE,
            "planMigration",
            "Re-run planMigration after adjusting migrationVersion/SQL (or includeAll=true for out-of-order).",
            {
              action: "planMigration",
              migrationName: args.migrationName,
              migrationVersion: version,
              sql: args.sql,
              ...(args.rollbackSql ? { rollbackSql: args.rollbackSql } : {}),
              ...(includeAll ? { includeAll: true } : {}),
            },
          ),
        ],
      });
    }

    const params: Record<string, unknown> = {
      Migrations: hydrated.migrations,
      IncludeAll: includeAll,
    };
    if (args.lockTimeoutMs !== undefined) {
      params.LockTimeoutMs = args.lockTimeoutMs;
    }
    if (args.statementTimeoutMs !== undefined) {
      params.StatementTimeoutMs = args.statementTimeoutMs;
    }

    const result = await callPgMigrationApi(context, "PushPGUserMigrations", params, cloudBaseOptions);
    const taskId = typeof result.TaskId === "string" ? result.TaskId.trim() : "";
    const pollTimeoutMs = resolveMigrationTaskPollTimeoutMs(args.taskPollTimeoutMs);
    const shouldWaitForTask = args.waitForTask !== false;

    let taskResult: PgMigrationTaskResult | null = null;
    if (taskId && !shouldWaitForTask) {
      return buildPgToolResult({
        success: false,
        errorCode: "MIGRATION_TASK_PENDING",
        data: {
          migrationVersion: version,
          migrationName: args.migrationName,
          localFileHint,
          hydratedRemoteCount: hydrated.remoteCount,
          apiResult: result as Record<string, unknown>,
          taskResult: { TaskId: taskId },
          taskPollTimeoutMs: pollTimeoutMs,
          waitForTask: false,
          verified: null,
        },
        message:
          `PushPGUserMigrations accepted TaskId=${taskId} (waitForTask=false). ` +
          "TaskId means accepted, not applied. Call action=describeMigrationTask FIRST for Status/Phase/Reason, " +
          `then listMigrations to see whether migrationVersion=${version} landed. ` +
          "Do NOT re-push the same version while the task may still be running.",
        nextActions: buildMigrationTaskPendingNextActions(version, taskId),
      });
    }

    if (taskId) {
      try {
        taskResult = await waitPgMigrationTask(context, taskId, cloudBaseOptions, pollTimeoutMs);
      } catch (error) {
        const lastTask = (error as Error & { lastTask?: PgMigrationTaskResult }).lastTask;
        return buildPgToolResult({
          success: false,
          errorCode: "MIGRATION_TASK_TIMEOUT",
          data: {
            migrationVersion: version,
            migrationName: args.migrationName,
            localFileHint,
            hydratedRemoteCount: hydrated.remoteCount,
            apiResult: result as Record<string, unknown>,
            taskResult: lastTask ?? { TaskId: taskId },
            taskPollTimeoutMs: pollTimeoutMs,
            verified: null,
          },
          message:
            `PushPGUserMigrations returned TaskId=${taskId}, but waiting for DescribeTaskResult timed out ` +
            `after ${Math.floor(pollTimeoutMs / 1000)}s: ${error instanceof Error ? error.message : String(error)}. ` +
            "The migration may STILL be running in the background (large DDL / lock waits). " +
            "Call action=describeMigrationTask FIRST (Status/Phase/Reason), then listMigrations. " +
            "Do NOT re-push the same migrationVersion, and do NOT fall back to execute until the task is terminal " +
            "and listMigrations confirms the version is missing.",
          nextActions: buildMigrationTaskPendingNextActions(version, taskId),
        });
      }

      const status = String(taskResult.Status || "").toLowerCase();
      if (status === "failed") {
        return buildPgToolResult({
          success: false,
          errorCode: "MIGRATION_TASK_FAILED",
          data: {
            migrationVersion: version,
            migrationName: args.migrationName,
            localFileHint,
            hydratedRemoteCount: hydrated.remoteCount,
            apiResult: result as Record<string, unknown>,
            taskResult: taskResult as Record<string, unknown>,
            verified: false,
          },
          message:
            `PushPGUserMigrations TaskId=${taskId} failed at phase=${taskResult.Phase || "-"}: ` +
            `${taskResult.Reason || "unknown reason"}. ` +
            "The migration did NOT take effect. Fix Conflicts/SQL (or use a newer migrationVersion), then retry applyMigration. " +
            "Urgent bypass: action=execute with allowDdlViaExecute=true (skips migration history).",
          nextActions: [
            buildNextAction(
              MANAGE_PG_DATABASE,
              "planMigration",
              "Preview again to inspect Conflicts before retrying apply.",
              {
                action: "planMigration",
                migrationName: args.migrationName,
                migrationVersion: version,
                sql: args.sql,
                ...(args.rollbackSql ? { rollbackSql: args.rollbackSql } : {}),
                ...(includeAll ? { includeAll: true } : {}),
              },
            ),
            buildNextAction(
              MANAGE_PG_DATABASE,
              "listMigrations",
              "Confirm the version is still absent from remote history.",
              { action: "listMigrations", limit: 20 },
            ),
          ],
        });
      }
    }

    // Task Succeed (or sync response without TaskId): confirm history records the version.
    const verification = await verifyMigrationApplied(context, version, cloudBaseOptions);

    if (verification.applied === false) {
      return buildPgToolResult({
        success: false,
        errorCode: "MIGRATION_NOT_APPLIED",
        data: {
          migrationVersion: version,
          migrationName: args.migrationName,
          localFileHint,
          hydratedRemoteCount: hydrated.remoteCount,
          includeAll,
          apiResult: result as Record<string, unknown>,
          taskResult: taskResult as Record<string, unknown> | null,
          verified: false,
        },
        message:
          `PushPGUserMigrations completed (TaskId=${taskId || "none"}), but migrationVersion=${version} is not present in the remote migration history, ` +
          "so the migration did NOT take effect. Do not assume the schema change is applied. " +
          "Re-check the SQL and migrationVersion, inspect the migration with action=migrationDetail, and retry action=applyMigration. " +
          "If the schema change is urgent you may fall back to action=execute with allowDdlViaExecute=true, but that bypasses migration history.",
        nextActions: [
          buildNextAction(
            MANAGE_PG_DATABASE,
            "listMigrations",
            "Inspect the remote migration history to confirm the migration is missing.",
            { action: "listMigrations", limit: 20 },
          ),
          buildNextAction(
            MANAGE_PG_DATABASE,
            "migrationDetail",
            "Inspect the backend record for this migrationVersion to find why it was not applied.",
            { action: "migrationDetail", migrationVersion: version },
          ),
        ],
      });
    }

    if (verification.applied === null) {
      return buildPgToolResult({
        success: false,
        errorCode: "MIGRATION_VERIFICATION_FAILED",
        data: {
          migrationVersion: version,
          migrationName: args.migrationName,
          localFileHint,
          hydratedRemoteCount: hydrated.remoteCount,
          apiResult: result as Record<string, unknown>,
          taskResult: taskResult as Record<string, unknown> | null,
          verified: null,
        },
        message:
          `PushPGUserMigrations was submitted, but verifying migrationVersion=${version} against the remote history failed: ${verification.error}. ` +
          "The migration may or may not have been applied — verify with action=listMigrations before running any dependent SQL.",
        nextActions: [
          buildNextAction(
            MANAGE_PG_DATABASE,
            "listMigrations",
            "Manually verify whether the remote migration history records this migrationVersion.",
            { action: "listMigrations", limit: 20 },
          ),
        ],
      });
    }

    return buildPgToolResult({
      success: true,
      data: {
        migrationVersion: version,
        migrationName: args.migrationName,
        localFileHint,
        localFilePath: localFile.relativePath,
        localFileAbsolutePath: localFile.absolutePath,
        localFileAction: localFile.action,
        hydratedRemoteCount: hydrated.remoteCount,
        includeAll,
        apiResult: result as Record<string, unknown>,
        taskResult: taskResult as Record<string, unknown> | null,
        verified: true,
      },
      message:
        `Migrations applied via PushPGUserMigrations (hydrated ${hydrated.remoteCount} remote migration(s)${includeAll ? ", includeAll=true" : ""}), task ${taskId ? `TaskId=${taskId} ` : ""}verified present in the remote migration history. ` +
        `Local SQL ${localFile.action === "created" ? "written" : "matched"} at ${localFile.relativePath}.`,
    });
  } catch (error) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_API_ERROR",
      message: `PushPGUserMigrations failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleListMigrations(args: ManagePgDatabaseArgs, context: PgDbContext, deps: PgToolDependencies, cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"]) {
  const params: Record<string, unknown> = {};
  if (args.limit !== undefined) {
    params.Limit = args.limit;
  }
  if (args.offset !== undefined) {
    params.Offset = args.offset;
  }

  try {
    const result = await callPgMigrationApi(context, "ListPGUserMigrations", params, cloudBaseOptions);
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

async function handleMigrationDetail(args: ManagePgDatabaseArgs, context: PgDbContext, deps: PgToolDependencies, cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"]) {
  if (!args.migrationVersion?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_VERSION_REQUIRED",
      message: "Provide migrationVersion (14-digit timestamp YYYYMMDDHHMMSS) when action=migrationDetail.",
    });
  }

  try {
    const result = await callPgMigrationApi(context, "DescribePGUserMigration", {
      MigrationVersion: args.migrationVersion,
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

/**
 * One-shot DescribeTaskResult for a PushPGUserMigrations TaskId.
 * Complements listMigrations: history shows whether a version landed; task result shows
 * Status/Phase/Reason while the job is running or after it Failed (issue #857 evidence path).
 */
async function handleDescribeMigrationTask(
  args: ManagePgDatabaseArgs,
  context: PgDbContext,
  _deps: PgToolDependencies,
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"],
) {
  const taskId = args.taskId?.trim();
  if (!taskId) {
    return buildPgToolResult({
      success: false,
      errorCode: "TASK_ID_REQUIRED",
      message:
        "Provide taskId when action=describeMigrationTask " +
        "(from applyMigration Push / MIGRATION_TASK_PENDING / MIGRATION_TASK_TIMEOUT data.taskResult.TaskId).",
    });
  }

  try {
    const taskResult = (await callPgMigrationApi(
      context,
      "DescribeTaskResult",
      { TaskId: taskId },
      cloudBaseOptions,
    )) as PgMigrationTaskResult;
    const status = String(taskResult.Status || "").toLowerCase();
    const versionHint = args.migrationVersion?.trim();

    const nextActions: ToolNextStep[] = [];
    if (status === "succeed") {
      nextActions.push(
        buildNextAction(
          MANAGE_PG_DATABASE,
          "listMigrations",
          "Task Succeed — confirm migrationVersion is present in remote history before dependent SQL.",
          { action: "listMigrations", limit: 20 },
        ),
      );
      if (versionHint) {
        nextActions.push(
          buildNextAction(
            MANAGE_PG_DATABASE,
            "migrationDetail",
            "Inspect the applied migration record.",
            { action: "migrationDetail", migrationVersion: versionHint },
          ),
        );
      }
    } else if (status === "failed") {
      nextActions.push(
        buildNextAction(
          MANAGE_PG_DATABASE,
          "listMigrations",
          "Confirm the version is absent from history, then fix Conflicts/SQL and retry with a NEW migrationVersion (do not re-push the failed version blindly).",
          { action: "listMigrations", limit: 20 },
        ),
      );
    } else {
      nextActions.push(
        buildNextAction(
          MANAGE_PG_DATABASE,
          "describeMigrationTask",
          "Task still running — poll again shortly. Do NOT re-push the same migrationVersion.",
          { action: "describeMigrationTask", taskId },
        ),
        buildNextAction(
          MANAGE_PG_DATABASE,
          "listMigrations",
          "Optionally check whether the version already landed while Status is still non-terminal.",
          { action: "listMigrations", limit: 20 },
        ),
      );
    }

    const statusLabel = taskResult.Status || "unknown";
    return buildPgToolResult({
      success: true,
      data: {
        taskId,
        taskResult: taskResult as Record<string, unknown>,
        terminal: status === "succeed" || status === "failed",
        ...(versionHint ? { migrationVersion: versionHint } : {}),
      },
      message:
        status === "succeed"
          ? `DescribeTaskResult TaskId=${taskId} Status=Succeed (Phase=${taskResult.Phase || "-"}). Verify with listMigrations before treating schema as applied.`
          : status === "failed"
            ? `DescribeTaskResult TaskId=${taskId} Status=Failed at phase=${taskResult.Phase || "-"}: ${taskResult.Reason || "unknown reason"}. Do NOT re-push the same migrationVersion until Conflicts/SQL are fixed.`
            : `DescribeTaskResult TaskId=${taskId} Status=${statusLabel} Phase=${taskResult.Phase || "-"}. Task is not terminal yet — poll again; do not re-push.`,
      nextActions,
    });
  } catch (error) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_API_ERROR",
      message: `DescribeTaskResult failed for TaskId=${taskId}: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

/**
 * Pull remote migration history SQL into cloudbase/migrations/ (CLI `tcb db pg migration fetch`).
 * Optional migrationVersion fetches one record; omit for full history. force overwrites existing files.
 */
async function handleFetchMigration(
  args: ManagePgDatabaseArgs,
  context: PgDbContext,
  _deps: PgToolDependencies,
  cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"],
) {
  const force = args.force === true;
  const singleVersion = args.migrationVersion?.trim();

  try {
    const remoteItems: FetchedRemoteMigration[] = [];

    if (singleVersion) {
      const detail = await callPgMigrationApi(
        context,
        "DescribePGUserMigration",
        { MigrationVersion: singleVersion },
        cloudBaseOptions,
      );
      const version =
        typeof detail.Version === "string" && detail.Version.trim()
          ? detail.Version.trim()
          : singleVersion;
      const name =
        typeof detail.Name === "string" && detail.Name.trim()
          ? detail.Name.trim()
          : "";
      const query = typeof detail.Query === "string" ? detail.Query : "";
      remoteItems.push({ Version: version, Name: name || version, Query: query });
    } else {
      const { summaries } = await listAllRemoteMigrationSummaries(context, cloudBaseOptions);
      for (const summary of summaries) {
        const detail = await callPgMigrationApi(
          context,
          "DescribePGUserMigration",
          { MigrationVersion: summary.Version },
          cloudBaseOptions,
        );
        const version =
          typeof detail.Version === "string" && detail.Version.trim()
            ? detail.Version.trim()
            : summary.Version;
        const name =
          typeof detail.Name === "string" && detail.Name.trim()
            ? detail.Name.trim()
            : summary.Name;
        const query = typeof detail.Query === "string" ? detail.Query : "";
        remoteItems.push({ Version: version, Name: name, Query: query });
      }
    }

    const sync = syncFetchedMigrationsToLocalFiles(remoteItems, force);
    if (!sync.ok) {
      return buildPgToolResult({
        success: false,
        errorCode: sync.errorCode,
        message: sync.message,
        data: {
          migrationsDir: LOCAL_MIGRATIONS_DIR,
          force,
          localFilePath: sync.relativePath,
        },
      });
    }

    const written = sync.files.filter((f) => f.action === "written");
    const skipped = sync.files.filter((f) => f.action === "skipped");

    return buildPgToolResult({
      success: true,
      data: {
        migrationsDir: LOCAL_MIGRATIONS_DIR,
        force,
        migrationVersion: singleVersion || null,
        total: remoteItems.length,
        writtenCount: written.length,
        skippedCount: skipped.length,
        written: written.map((f) => f.relativePath),
        skipped: skipped.map((f) => f.relativePath),
        files: sync.files.map(({ version, name, relativePath, action }) => ({
          version,
          name,
          relativePath,
          action,
        })),
      },
      message:
        remoteItems.length === 0
          ? "No remote migrations to fetch. Local cloudbase/migrations/ unchanged."
          : `Fetched ${remoteItems.length} remote migration(s): wrote ${written.length}, skipped ${skipped.length}` +
            (skipped.length > 0 && !force
              ? " (existing files left untouched; pass force=true to overwrite, matching CLI --force)."
              : ".") +
            ` Directory: ${LOCAL_MIGRATIONS_DIR}/.`,
      nextActions:
        skipped.length > 0 && !force
          ? [
              buildNextAction(
                MANAGE_PG_DATABASE,
                "fetchMigration",
                "Re-run with force=true to overwrite skipped local files from remote history (checksum realign).",
                {
                  action: "fetchMigration",
                  force: true,
                  ...(singleVersion ? { migrationVersion: singleVersion } : {}),
                },
              ),
            ]
          : undefined,
    });
  } catch (error) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_API_ERROR",
      message: `fetchMigration failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleRollbackMigration(args: ManagePgDatabaseArgs, context: PgDbContext, deps: PgToolDependencies, cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"]) {
  if (args.lastN === undefined || args.lastN < 1 || !Number.isInteger(args.lastN)) {
    return buildPgToolResult({
      success: false,
      errorCode: "LAST_N_REQUIRED",
      message: "Provide lastN (positive integer) when action=rollbackMigration.",
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
      LastN: args.lastN,
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

async function handleRepairMigration(args: ManagePgDatabaseArgs, context: PgDbContext, deps: PgToolDependencies, cloudBaseOptions?: ExtendedMcpServer["cloudBaseOptions"]) {
  if (!args.migrationVersion?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_VERSION_REQUIRED",
      message: "Provide migrationVersion (14-digit timestamp YYYYMMDDHHMMSS) when action=repairMigration.",
    });
  }

  if (!args.migrationName?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_NAME_REQUIRED",
      message: "Provide migrationName when action=repairMigration.",
    });
  }

  if (!args.repairStatus) {
    return buildPgToolResult({
      success: false,
      errorCode: "REPAIR_STATUS_REQUIRED",
      message: "Provide repairStatus (applied or reverted) when action=repairMigration.",
    });
  }

  if (!args.repairReason?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "REPAIR_REASON_REQUIRED",
      message: "Provide repairReason when action=repairMigration.",
    });
  }

  if (args.repairStatus === "applied" && !args.sql?.trim()) {
    return buildPgToolResult({
      success: false,
      errorCode: "SQL_REQUIRED",
      message: "Provide sql (Query) when action=repairMigration with repairStatus=applied.",
    });
  }

  const params: Record<string, unknown> = {
    MigrationVersion: args.migrationVersion,
    Name: args.migrationName,
    Status: args.repairStatus,
    Reason: args.repairReason,
  };
  if (args.repairStatus === "applied" && args.sql?.trim()) {
    params.Query = args.sql;
  }

  try {
    const result = await callPgMigrationApi(context, "RepairPGUserMigrationHistory", params, cloudBaseOptions);
    return buildPgToolResult({
      success: true,
      data: result as Record<string, unknown>,
      message: "Migration history repaired via RepairPGUserMigrationHistory.",
    });
  } catch (error) {
    return buildPgToolResult({
      success: false,
      errorCode: "MIGRATION_API_ERROR",
      message: `RepairPGUserMigrationHistory failed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }
}

async function handleGetPgSchema(
  args: Pick<QueryPgDatabaseArgs, "objectName">,
  context: PgDbContext,
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
      message: `PostgreSQL object ${objectName} was not found in the current CloudBase PG context.`,
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

      const context = await resolvePgDbContext(server.cloudBaseOptions);

      try {
        await ensurePgReadyOnce(server.cloudBaseOptions, deps);
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        return buildPgToolResult({
          success: false,
          errorCode: "PG_NOT_READY",
          message: `CloudBase PostgreSQL is not ready. ${reason}`,
          nextActions: [
            buildNextAction(
              "queryEnv",
              "info",
              "检查当前环境 PostgreSQL 实例状态。",
              { action: "info", envId: context.envId },
            ),
          ],
        });
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
        "管理 CloudBase PostgreSQL：执行已确认的写入 SQL、SQL 风险预检、迁移管理。建表/ALTER/DROP 等 schema 变更必须使用 applyMigration（显式 migrationVersion；成功前自动写入或校验本地 cloudbase/migrations/<version>_<name>.sql，与 CLI tcb db pg migration 一致），不要默认用 execute。execute 主要用于 DML 与 GRANT/RLS 等运维 SQL。",
      inputSchema: {
        action: z
          .enum(MANAGE_ACTIONS)
          .describe(
            "操作类型：execute=执行已确认的写入 SQL（DML/GRANT/RLS；schema DDL 默认拒绝，需 allowDdlViaExecute=true）；dryRun=只分析 SQL 风险不执行；planMigration=预览迁移计划（需 migrationName + migrationVersion + sql；可选 includeAll=true 允许乱序，对齐 CLI --include-all）；applyMigration=应用迁移，建表/改 schema 首选（需 migrationName + migrationVersion + sql + confirm=true；可选 includeAll；本地 SQL 缺失则自动写入 cloudbase/migrations/，内容不一致则 LOCAL_MIGRATION_FILE_MISMATCH fail-closed；成功返回前会轮询 DescribeTaskResult（默认最长 10 分钟，可用 taskPollTimeoutMs / waitForTask 调整）并校验 migrationVersion 已落入远端历史；超时返回 MIGRATION_TASK_TIMEOUT，必须先 describeMigrationTask 再 listMigrations，禁止立刻重推同 version；未落库时返回 success=false 且 errorCode=MIGRATION_NOT_APPLIED）；listMigrations=查询已应用的 Migration 列表（可传 limit/offset 分页）；migrationDetail=查看单条 Migration 详情（需 migrationVersion）；describeMigrationTask=按 TaskId 查询 Push 异步任务状态（DescribeTaskResult：Status/Phase/Reason；需 taskId；用于 waitForTask=false / MIGRATION_TASK_TIMEOUT / 失败诊断，listMigrations 看不到 Reason）；fetchMigration=从远端 history 拉取 SQL 写入本地 cloudbase/migrations/（对齐 CLI tcb db pg migration fetch；可选 migrationVersion 拉单条，省略则全量；force=true 覆盖已存在文件，默认跳过）；rollbackMigration=回滚最近 N 条 Migration（需 lastN + confirm=true）；repairMigration=修复 Migration 历史记录（需 migrationVersion + migrationName + repairStatus + repairReason）",
          ),
        sql: z
          .string()
          .optional()
          .describe("action=execute、dryRun、planMigration、applyMigration 或 repairMigration(applied) 使用的 SQL 语句"),
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
          .describe("可选的 PostgreSQL 逻辑实例标识，默认 cloudbase-pg。"),
        defaultSchema: z
          .string()
          .optional()
          .describe("可选的默认 schema，默认 public。"),
        role: z
          .string()
          .optional()
          .describe(
            "可选的 PostgreSQL role，会传给 Manager SDK executePGSql；例如需要管理策略时可传 postgres。",
          ),
        objectName: z
          .string()
          .optional()
          .describe(
            "可选的对象名，当前仅用于非 migration 场景。migration 相关操作请使用 migrationName / migrationVersion / lastN。",
          ),
        migrationName: z
          .string()
          .regex(/^[a-z][a-z0-9_]*$/)
          .optional()
          .describe("plan/apply/repair 必填：migration 名称，小写字母开头，仅允许小写字母、数字和下划线。"),
        migrationVersion: z
          .string()
          .regex(/^\d{14}$/)
          .optional()
          .describe("14 位时间戳 YYYYMMDDHHMMSS。plan/apply/detail/repair 必填；fetchMigration 可选（传入则只拉该条，省略则拉全量远端 history）；禁止由服务端静默生成，避免与本地 cloudbase/migrations/<version>_<name>.sql 分叉。"),
        rollbackSql: z
          .string()
          .optional()
          .describe("plan/apply 可选：回滚 SQL 语句。"),
        lastN: z
          .number()
          .int()
          .positive()
          .optional()
          .describe("rollback 必填：回滚最近 N 条已应用的 Migration，正整数。"),
        limit: z
          .number()
          .int()
          .min(1)
          .max(500)
          .optional()
          .describe("list 可选：返回数量上限，1-500，默认 100。"),
        offset: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe("list 可选：分页偏移，默认 0。"),
        lockTimeoutMs: z
          .number()
          .int()
          .optional()
          .describe("apply 可选：获取数据库锁的最长时间（毫秒），默认 5000。"),
        statementTimeoutMs: z
          .number()
          .int()
          .optional()
          .describe("apply 可选：单条 SQL 执行最长时间（毫秒），默认 300000。"),
        taskPollTimeoutMs: z
          .number()
          .int()
          .min(MIGRATION_TASK_MIN_WAIT_MS)
          .max(MIGRATION_TASK_MAX_WAIT_MS)
          .optional()
          .describe(
            `apply 可选：轮询 DescribeTaskResult 的最长等待（毫秒）。默认 ${MIGRATION_TASK_DEFAULT_WAIT_MS}（与 CLI tcb db pg migration up 的 10 分钟对齐）。范围 ${MIGRATION_TASK_MIN_WAIT_MS}-${MIGRATION_TASK_MAX_WAIT_MS}。超时后务必先 describeMigrationTask(taskId) 再 listMigrations，禁止立刻重推同 version。`,
          ),
        waitForTask: z
          .boolean()
          .optional()
          .describe(
            "apply 可选，默认 true。设为 false 时 Push 后立即返回 TaskId（errorCode=MIGRATION_TASK_PENDING），由调用方用 describeMigrationTask 轮询任务终态，再用 listMigrations 确认是否落库；适合 MCP host 工具调用超时较短的场景。默认 true 会同步等到任务终态。",
          ),
        taskId: z
          .string()
          .optional()
          .describe(
            "describeMigrationTask 必填：PushPGUserMigrations / applyMigration 返回的 TaskId。用于一次性查询 DescribeTaskResult（Status/Phase/Reason），不轮询等待。",
          ),
        repairStatus: z
          .enum(["applied", "reverted"])
          .optional()
          .describe("repair 必填：applied=标记为已应用（可补录 Query），reverted=删除 history 记录。"),
        repairReason: z
          .string()
          .optional()
          .describe("repair 必填：修复原因。"),
        force: z
          .boolean()
          .optional()
          .describe(
            "fetchMigration 可选，默认 false。true=覆盖本地已存在的同名 SQL 文件（对齐 CLI tcb db pg migration fetch --force）；false=跳过已存在文件。用于从远端 history 重新对齐 Git checksum。",
          ),
        includeAll: z
          .boolean()
          .optional()
          .describe(
            "planMigration / applyMigration 可选，默认 false。true=允许 out-of-order（version 小于远端 LatestVersion）仍可 Preview/Push，对齐 CLI tcb db pg migration up --include-all；仅在确认要补历史/乱序迁移时使用，日常应选更大的 migrationVersion。",
          ),
        allowDdlViaExecute: z
          .boolean()
          .optional()
          .describe(
            "可选，默认 false。仅当需要故意绕过 migration history 时设为 true，才允许 schema DDL 走 execute；正常建表/改 schema 必须用 applyMigration。",
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
      const context = await resolvePgDbContext(server.cloudBaseOptions, args);
      const cbOpts = server.cloudBaseOptions;

      switch (args.action) {
        case "execute": {
          // Soft-block schema DDL before readiness probe so agents get migration guidance immediately.
          if (args.sql?.trim()) {
            const classification = classifySqlRisk(args.sql);
            if (
              isSchemaDdlRisk(classification.risk, args.sql) &&
              args.allowDdlViaExecute !== true
            ) {
              return handleExecuteSql(args, context, deps);
            }
          }

          try {
            await ensurePgReadyOnce(cbOpts, deps);
          } catch (error) {
            const reason = error instanceof Error ? error.message : String(error);
            return buildPgToolResult({
              success: false,
              errorCode: "PG_NOT_READY",
              message: `CloudBase PostgreSQL is not ready. ${reason}`,
              nextActions: [
                buildNextAction(
                  "queryEnv",
                  "info",
                  "检查当前环境 PostgreSQL 实例状态。",
                  { action: "info", envId: context.envId },
                ),
              ],
            });
          }

          return handleExecuteSql(args, context, deps);
        }
        case "dryRun":
          return handleDryRun(args);
        case "planMigration":
        case "applyMigration":
        case "listMigrations":
        case "migrationDetail":
        case "describeMigrationTask":
        case "fetchMigration":
        case "rollbackMigration":
        case "repairMigration": {
          switch (args.action) {
            case "planMigration": return handlePlanMigration(args, context, deps, cbOpts);
            case "applyMigration": return handleApplyMigration(args, context, deps, cbOpts);
            case "listMigrations": return handleListMigrations(args, context, deps, cbOpts);
            case "migrationDetail": return handleMigrationDetail(args, context, deps, cbOpts);
            case "describeMigrationTask": return handleDescribeMigrationTask(args, context, deps, cbOpts);
            case "fetchMigration": return handleFetchMigration(args, context, deps, cbOpts);
            case "rollbackMigration": return handleRollbackMigration(args, context, deps, cbOpts);
            case "repairMigration": return handleRepairMigration(args, context, deps, cbOpts);
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
