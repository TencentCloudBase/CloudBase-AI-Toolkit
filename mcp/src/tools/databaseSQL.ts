import CloudBase from "@cloudbase/manager-node";
import { z } from "zod";
import {
  getCloudBaseManager,
  getEnvId,
  logCloudBaseResult,
} from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { t } from "../i18n/index.js";
import { buildJsonToolResult, ToolNextStep } from "../utils/tool-result.js";

const CATEGORY = "SQL database";
const MYSQL_GATE_CACHE = new Map<string, boolean>();

/**
 * Check whether MySQL tools should be blocked because the env is in PG-only mode.
 * Returns an error result if blocked, or null if MySQL is available/can't be determined.
 */
async function checkMysqlGate(server: ExtendedMcpServer): Promise<any> {
  const { envId } = server.cloudBaseOptions ?? {};
  if (!envId) return null;

  if (MYSQL_GATE_CACHE.has(envId)) {
    if (MYSQL_GATE_CACHE.get(envId)) return null; // cached as available
    // cached as blocked — return the gate error
    return buildJsonToolResult({
      success: false,
      errorCode: "MYSQL_NOT_AVAILABLE",
      message: t("databaseSQL.gate.mysqlNotAvailable", { envId }),
      nextActions: [{ tool: "managePgDatabase", params: { action: "execute" }, description: t("databaseSQL.gate.useManagePg") }],
    });
  }

  try {
    const manager = await getCloudBaseManager({ cloudBaseOptions: { envId } });
    const envInfo: any = await manager.env.getEnvInfo?.();
    const backends = envInfo?.EnvInfo?.RuntimeBackends;
    if (backends?.postgresql === true && backends?.mysql !== true) {
      MYSQL_GATE_CACHE.set(envId, false);
      return buildJsonToolResult({
        success: false,
        errorCode: "MYSQL_NOT_AVAILABLE",
        message: t("databaseSQL.gate.pgOnlyMode", { envId }),
        nextActions: [{ tool: "managePgDatabase", params: { action: "execute" }, description: t("databaseSQL.gate.useManagePg") }],
      });
    }
  } catch { /* probe failure — allow through */ }

  MYSQL_GATE_CACHE.set(envId, true);
  return null;
}
const QUERY_MYSQL_DATABASE = "queryMysqlDatabase";
const MANAGE_MYSQL_DATABASE = "manageMysqlDatabase";

const QUERY_ACTIONS = [
  "runQuery",
  "describeCreateResult",
  "describeTaskStatus",
  "getInstanceInfo",
  "describeInstance",
  "getConnectionInfo",
  "describeInstanceSlowQueries",
  "describeInstanceErrorLogs",
] as const;

const SLOW_QUERY_ORDER_BY = [
  "QueryTime",
  "LockTime",
  "RowsExamined",
  "RowsSent",
] as const;

const ERROR_LOG_LEVELS = ["error", "warning", "note"] as const;

const ORDER_BY_TYPE = ["asc", "desc", "ASC", "DESC"] as const;

const MANAGE_ACTIONS = [
  "provisionMySQL",
  "destroyMySQL",
  "runStatement",
  "initializeSchema",
] as const;

type QueryAction = (typeof QUERY_ACTIONS)[number];
type ManageAction = (typeof MANAGE_ACTIONS)[number];
type SqlLifecycleStatus =
  | "NOT_CREATED"
  | "PENDING"
  | "RUNNING"
  | "READY"
  | "FAILED";

type DbInstanceInput = {
  instanceId?: string;
  schema?: string;
};

type SqlContext = {
  envId: string;
  instanceId: string;
  schema: string;
};

type SqlToolPayload = {
  success: boolean;
  data?: Record<string, unknown>;
  message: string;
  errorCode?: string;
  nextActions?: ToolNextStep[];
};

type InstanceInfoResult = {
  exists: boolean;
  envId: string;
  instanceId: string;
  schema: string;
  rawStatus: string | null;
  status: SqlLifecycleStatus;
  clusterId?: string;
  /** Raw cluster payload — only attached for getConnectionInfo. */
  clusterDetail?: Record<string, unknown>;
  /** Raw create-result payload — only attached for getConnectionInfo. */
  createResult?: Record<string, unknown>;
};

/** Lifecycle fields safe to return from getInstanceInfo (no connection secrets). */
type SanitizedInstanceInfo = Omit<
  InstanceInfoResult,
  "clusterDetail" | "createResult"
>;

function sanitizeInstanceInfo(
  instanceInfo: InstanceInfoResult,
): SanitizedInstanceInfo {
  return {
    exists: instanceInfo.exists,
    envId: instanceInfo.envId,
    instanceId: instanceInfo.instanceId,
    schema: instanceInfo.schema,
    rawStatus: instanceInfo.rawStatus,
    status: instanceInfo.status,
    ...(instanceInfo.clusterId ? { clusterId: instanceInfo.clusterId } : {}),
  };
}

type QuerySqlDatabaseArgs = {
  action: QueryAction;
  sql?: string;
  request?: Record<string, unknown>;
  dbInstance?: DbInstanceInput;
  startTime?: string;
  endTime?: string;
  limit?: number;
  offset?: number;
  username?: string;
  host?: string;
  database?: string;
  orderBy?: (typeof SLOW_QUERY_ORDER_BY)[number] | "Timestamp";
  orderByType?: (typeof ORDER_BY_TYPE)[number];
  sqlText?: string;
  logLevels?: Array<(typeof ERROR_LOG_LEVELS)[number]>;
  keyWords?: string[];
};

type ManageSqlDatabaseArgs = {
  action: ManageAction;
  confirm?: boolean;
  sql?: string;
  request?: Record<string, unknown>;
  statements?: string[];
  requireReady?: boolean;
  statusContext?: {
    createResultRequest?: Record<string, unknown>;
    taskStatusRequest?: Record<string, unknown>;
  };
  dbInstance?: DbInstanceInput;
};

type QueryManageContext = {
  getManager: () => Promise<CloudBase>;
  cloudBaseOptions: ExtendedMcpServer["cloudBaseOptions"];
  server: ExtendedMcpServer;
};

type TcbServiceResult = Record<string, unknown> & {
  Items?: unknown[];
  Infos?: unknown[];
  RowsAffected?: number;
  RequestId?: string;
};

type ToolResult = ReturnType<typeof buildJsonToolResult>;

type InitializationReadiness =
  | {
      ready: true;
      instanceInfo: InstanceInfoResult;
    }
  | {
      ready: false;
      payload: ToolResult;
    };

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

function buildSqlToolResult(payload: SqlToolPayload) {
  return buildJsonToolResult(payload);
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
  const readOnlyVerbs = new Set(["SELECT", "SHOW", "DESCRIBE", "DESC", "EXPLAIN", "WITH"]);

  if (!readOnlyVerbs.has(verb)) {
    return false;
  }

  return !/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|REPLACE|RENAME|GRANT|REVOKE|COMMIT|ROLLBACK)\b/i.test(
    normalized,
  );
}

function parseJsonValue(value: unknown) {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeRunSqlResult(result: TcbServiceResult) {
  const rows = Array.isArray(result.Items)
    ? result.Items.map((item) => parseJsonValue(item))
    : [];
  const columns = Array.isArray(result.Infos)
    ? result.Infos.map((info) => parseJsonValue(info))
    : [];

  return {
    rows,
    columns,
    rowsAffected:
      typeof result.RowsAffected === "number" ? result.RowsAffected : 0,
    requestId:
      typeof result.RequestId === "string" ? result.RequestId : undefined,
  };
}

function pickLifecycleSource(result: Record<string, unknown>) {
  return (
    result.Status ??
    result.TaskStatus ??
    result.State ??
    result.Phase ??
    result.ProgressStatus ??
    (result.Data as Record<string, unknown> | undefined)?.Status ??
    (result.Data as Record<string, unknown> | undefined)?.TaskStatus
  );
}

function pickDataPayload(result: Record<string, unknown>) {
  const data = result.Data;
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return undefined;
  }

  return data as Record<string, unknown>;
}

function pickProgress(result: Record<string, unknown>) {
  return result.Progress ?? result.Percent ?? result.Schedule ?? undefined;
}

function pickClusterDetail(result: Record<string, unknown>) {
  const candidate =
    result.ClusterDetail ??
    (result.Data as Record<string, unknown> | undefined);

  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
    return undefined;
  }

  return candidate as Record<string, unknown>;
}

function buildTaskRequest(
  request: Record<string, unknown> | undefined,
  result: Record<string, unknown>,
) {
  const data = pickDataPayload(result);
  const taskId =
    (data?.TaskId as string | undefined) ??
    (result.TaskId as string | undefined) ??
    (request?.TaskId as string | undefined);
  const taskName =
    (data?.TaskName as string | undefined) ??
    (result.TaskName as string | undefined) ??
    (request?.TaskName as string | undefined);

  return {
    ...(request || {}),
    ...(taskId ? { TaskId: taskId } : {}),
    ...(taskName ? { TaskName: taskName } : {}),
  };
}

function extractErrorCode(error: unknown) {
  if (!error || typeof error !== "object") {
    return undefined;
  }

  const maybeCode =
    (error as Record<string, unknown>).code ??
    (error as Record<string, unknown>).Code ??
    (error as Record<string, unknown>).errorCode;

  return typeof maybeCode === "string" ? maybeCode : undefined;
}

function normalizeCreateResultStatus(rawStatus: unknown): SqlLifecycleStatus {
  if (typeof rawStatus !== "string" || rawStatus.trim().length === 0) {
    return "PENDING";
  }

  const normalized = rawStatus.trim().toUpperCase();

  if (["NOTEXIST", "NOT_EXIST", "NOTFOUND", "NOT_FOUND", "NONE"].includes(normalized)) {
    return "NOT_CREATED";
  }

  if (normalized === "SUCCESS") {
    return "READY";
  }

  if (/(FAIL|FAILED|ERROR|ABNORMAL|EXCEPTION)/.test(normalized)) {
    return "FAILED";
  }

  if (/(PENDING|CREATE|INIT|START|QUEUE|SUBMIT|PROVISION)/.test(normalized)) {
    return "PENDING";
  }

  return "PENDING";
}

function normalizeTaskStatus(rawStatus: unknown): SqlLifecycleStatus {
  if (typeof rawStatus !== "string" || rawStatus.trim().length === 0) {
    return "RUNNING";
  }

  const normalized = rawStatus.trim().toUpperCase();

  if (/(FAIL|FAILED|ERROR|ABNORMAL|EXCEPTION)/.test(normalized)) {
    return "FAILED";
  }

  if (normalized === "SUCCESS") {
    return "READY";
  }

  if (/(PENDING|CREATE|INIT|START|QUEUE|SUBMIT|PROVISION)/.test(normalized)) {
    return "PENDING";
  }

  if (/(RUNNING|PROCESS|WORKING)/.test(normalized)) {
    return "RUNNING";
  }

  return "RUNNING";
}

function normalizeClusterDetailStatus(
  rawStatus: unknown,
  options?: {
    hasInstance?: boolean;
  },
): SqlLifecycleStatus {
  const hasInstance = options?.hasInstance;

  if (typeof rawStatus !== "string" || rawStatus.trim().length === 0) {
    return hasInstance === false ? "NOT_CREATED" : "READY";
  }

  const normalized = rawStatus.trim().toUpperCase();

  if (["NOTEXIST", "NOT_EXIST", "NOTFOUND", "NOT_FOUND", "NONE"].includes(normalized)) {
    return "NOT_CREATED";
  }

  if (/(FAIL|FAILED|ERROR|ABNORMAL|EXCEPTION)/.test(normalized)) {
    return "FAILED";
  }

  if (/(PENDING|CREATE|INIT|START|QUEUE|SUBMIT|PROVISION)/.test(normalized)) {
    return "PENDING";
  }

  if (["RUNNING", "ONLINE", "AVAILABLE", "NORMAL", "READY"].includes(normalized)) {
    return "READY";
  }

  return hasInstance === false ? "NOT_CREATED" : "READY";
}

async function resolveSqlDbContext(
  getManager: () => Promise<CloudBase>,
  cloudBaseOptions: ExtendedMcpServer["cloudBaseOptions"],
  dbInstance?: DbInstanceInput,
): Promise<SqlContext> {
  await getManager();
  const envId = await getEnvId(cloudBaseOptions);

  return {
    envId,
    instanceId: dbInstance?.instanceId || "default",
    schema: dbInstance?.schema || envId,
  };
}

async function callSqlControlPlane(
  cloudbase: CloudBase,
  action: string,
  param: Record<string, unknown>,
) {
  return cloudbase.commonService("tcb", "2018-06-08").call({
    Action: action,
    Param: param,
  }) as Promise<TcbServiceResult>;
}

async function getSqlInstanceInfo({
  getManager,
  cloudBaseOptions,
  server,
}: QueryManageContext): Promise<InstanceInfoResult> {
  const cloudbase = await getManager();
  const envId = await getEnvId(cloudBaseOptions);
  const createResult = await callSqlControlPlane(cloudbase, "DescribeCreateMySQLResult", {
    EnvId: envId,
  });
  logCloudBaseResult(server.logger, createResult);

  const createData = pickDataPayload(createResult);
  const createRawStatus = createData?.Status ?? pickLifecycleSource(createResult);
  const createStatus = normalizeCreateResultStatus(createRawStatus);

  if (createStatus === "NOT_CREATED") {
    return {
      exists: false,
      envId,
      instanceId: "default",
      schema: envId,
      rawStatus:
        typeof createRawStatus === "string" ? createRawStatus : null,
      status: "NOT_CREATED",
      createResult: createData ?? createResult,
    };
  }

  try {
    const clusterResult = await callSqlControlPlane(
      cloudbase,
      "DescribeMySQLClusterDetail",
      {
        EnvId: envId,
      },
    );
    logCloudBaseResult(server.logger, clusterResult);

    const clusterDetail = pickClusterDetail(clusterResult);
    const dbInfo =
      clusterDetail?.DbInfo &&
      typeof clusterDetail.DbInfo === "object" &&
      !Array.isArray(clusterDetail.DbInfo)
        ? (clusterDetail.DbInfo as Record<string, unknown>)
        : undefined;
    const clusterId =
      typeof clusterDetail?.DbClusterId === "string"
        ? clusterDetail.DbClusterId
        : typeof clusterDetail?.ClusterId === "string"
          ? clusterDetail.ClusterId
        : undefined;
    const instanceId =
      typeof clusterDetail?.InstanceId === "string"
        ? clusterDetail.InstanceId
        : "default";
    const rawStatusSource =
      dbInfo?.ClusterStatus ??
      dbInfo?.Status ??
      clusterDetail?.ClusterStatus ??
      clusterDetail?.Status ??
      pickLifecycleSource(clusterResult) ??
      createRawStatus;
    const rawStatus =
      typeof rawStatusSource === "string" ? rawStatusSource : null;

    return {
      exists: true,
      envId,
      instanceId,
      schema: envId,
      rawStatus,
      status: normalizeClusterDetailStatus(rawStatusSource, {
        hasInstance: true,
      }),
      clusterId,
      clusterDetail,
      createResult: createData ?? createResult,
    };
  } catch (error) {
    const errorCode = extractErrorCode(error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isNotFound = errorCode === "FailedOperation.DataSourceNotExist"
      || /envLink not exist|not exist|not found/i.test(errorMessage);

    if (!isNotFound) {
      throw error;
    }

    return {
      exists: createStatus === "PENDING" || createStatus === "RUNNING",
      envId,
      instanceId: "default",
      schema: envId,
      rawStatus:
        typeof createRawStatus === "string" ? createRawStatus : null,
      status: createStatus === "PENDING" || createStatus === "RUNNING" ? createStatus : "NOT_CREATED",
      createResult: createData ?? createResult,
    };
  }
}

function buildProvisionNextActions(
  status: SqlLifecycleStatus,
  request?: Record<string, unknown>,
) {
  if (status === "READY") {
    return [
      buildNextAction(
        MANAGE_MYSQL_DATABASE,
        "initializeSchema",
        t("databaseSQL.next.readyInitializeSchema"),
      ),
    ];
  }

  if (status === "FAILED") {
    return [];
  }

  return [
    buildNextAction(
      QUERY_MYSQL_DATABASE,
      "describeCreateResult",
      t("databaseSQL.next.provisionStillRunning"),
      request
        ? { action: "describeCreateResult", request }
        : { action: "describeCreateResult" },
    ),
  ];
}

function inferTaskKind(request?: Record<string, unknown>) {
  const taskName = request?.TaskName;
  if (typeof taskName === "string" && /(DELETE|DESTROY)/i.test(taskName)) {
    return "destroy";
  }

  return "provision";
}

function buildTaskStatusNextActions(
  status: SqlLifecycleStatus,
  request?: Record<string, unknown>,
) {
  if (status === "FAILED") {
    return [];
  }

  if (status === "READY") {
    if (inferTaskKind(request) === "destroy") {
      return [
        buildNextAction(
          QUERY_MYSQL_DATABASE,
          "getInstanceInfo",
          t("databaseSQL.next.destroyCompletedConfirm"),
        ),
      ];
    }

    return [
      buildNextAction(
        MANAGE_MYSQL_DATABASE,
        "initializeSchema",
        t("databaseSQL.next.readyInitializeSchema"),
      ),
    ];
  }

  return [
    buildNextAction(
      QUERY_MYSQL_DATABASE,
      "describeTaskStatus",
      t("databaseSQL.next.taskStillRunning"),
      request ? { action: "describeTaskStatus", request } : { action: "describeTaskStatus" },
    ),
  ];
}

async function handleRunQuery(
  args: QuerySqlDatabaseArgs,
  context: QueryManageContext,
): Promise<ToolResult> {
  if (!args.sql) {
    return buildSqlToolResult({
      success: false,
      errorCode: "SQL_REQUIRED",
      message: t("databaseSQL.runQuery.sqlRequired"),
      nextActions: [
        buildNextAction(
          QUERY_MYSQL_DATABASE,
          "runQuery",
          t("databaseSQL.runQuery.provideReadOnly"),
        ),
      ],
    });
  }

  if (!isReadOnlySql(args.sql)) {
    return buildSqlToolResult({
      success: false,
      errorCode: "READ_ONLY_SQL_REQUIRED",
      message: t("databaseSQL.runQuery.readOnlyOnly"),
      nextActions: [
        buildNextAction(
          MANAGE_MYSQL_DATABASE,
          "runStatement",
          t("databaseSQL.runQuery.useManage"),
        ),
      ],
    });
  }

  const cloudbase = await context.getManager();
  const dbContext = await resolveSqlDbContext(
    context.getManager,
    context.cloudBaseOptions,
    args.dbInstance,
  );
  let result;
  try {
    result = await callSqlControlPlane(cloudbase, "RunSql", {
      EnvId: dbContext.envId,
      Sql: args.sql,
      ReadOnly: true,
      DbInstance: {
        EnvId: dbContext.envId,
        InstanceId: dbContext.instanceId,
        Schema: dbContext.schema,
      },
    });
    logCloudBaseResult(context.server.logger, result);
  } catch (error: any) {
    const errorCode = typeof error === "object" && error && "code" in error ? (error as any).code : "";
    if (errorCode === "FailedOperation.DataSourceNotExist" || error.message?.includes("Database instance not found")) {
      return buildSqlToolResult({
        success: false,
        errorCode: "MYSQL_NOT_CREATED",
        message: t("databaseSQL.runQuery.notProvisioned"),
        nextActions: [
          buildNextAction(
            MANAGE_MYSQL_DATABASE,
            "provisionMySQL",
            t("databaseSQL.next.provisionBeforeQuery"),
            { action: "provisionMySQL", confirm: true },
          ),
        ],
      });
    }
    throw error;
  }

  const normalized = normalizeRunSqlResult(result);
  return buildSqlToolResult({
    success: true,
    data: {
      ...normalized,
      untrustedData: true,
    },
    message: t("databaseSQL.runQuery.successUntrusted"),
  });
}

async function handleDescribeCreateResult(
  args: QuerySqlDatabaseArgs,
  context: QueryManageContext,
): Promise<ToolResult> {
  const cloudbase = await context.getManager();
  const envId = await getEnvId(context.cloudBaseOptions);
  const request = args.request || {};
  const result = await callSqlControlPlane(cloudbase, "DescribeCreateMySQLResult", {
    ...request,
    EnvId: envId,
  });
  logCloudBaseResult(context.server.logger, result);

  const createData = pickDataPayload(result);
  const rawStatus = createData?.Status ?? pickLifecycleSource(result);
  const status = normalizeCreateResultStatus(rawStatus);
  return buildSqlToolResult({
    success: status !== "FAILED",
    errorCode: status === "FAILED" ? "MYSQL_PROVISION_FAILED" : undefined,
    data: {
      status,
      rawStatus,
      createResult: createData ?? result,
      instance: {
        envId,
        instanceId:
          (createData?.InstanceId as string | undefined) ||
          (result.InstanceId as string | undefined) ||
          (request.InstanceId as string | undefined) ||
          "default",
      },
      task: {
        request: buildTaskRequest(request, result),
        requestId: result.RequestId,
      },
      progress: pickProgress(result),
    },
    message:
      status === "READY"
        ? t("databaseSQL.describeCreateResult.ready")
        : status === "FAILED"
          ? t("databaseSQL.describeCreateResult.failed")
          : t("databaseSQL.describeCreateResult.pending"),
    nextActions: buildProvisionNextActions(status, buildTaskRequest(request, result)),
  });
}

async function handleDescribeTaskStatus(
  args: QuerySqlDatabaseArgs,
  context: QueryManageContext,
): Promise<ToolResult> {
  const cloudbase = await context.getManager();
  const envId = await getEnvId(context.cloudBaseOptions);
  const request = args.request || {};
  const result = await callSqlControlPlane(cloudbase, "DescribeMySQLTaskStatus", {
    ...request,
    EnvId: envId,
  });
  logCloudBaseResult(context.server.logger, result);

  const rawStatus = pickLifecycleSource(result);
  const status = normalizeTaskStatus(rawStatus);
  const taskRequest = buildTaskRequest(request, result);

  return buildSqlToolResult({
    success: status !== "FAILED",
    errorCode: status === "FAILED" ? "MYSQL_TASK_FAILED" : undefined,
    data: {
      status,
      rawStatus,
      progress: pickProgress(result),
      task: {
        request: taskRequest,
        requestId: result.RequestId,
      },
    },
    message:
      status === "READY"
        ? t("databaseSQL.describeTaskStatus.ready")
        : status === "FAILED"
          ? t("databaseSQL.describeTaskStatus.failed")
          : t("databaseSQL.describeTaskStatus.inProgress"),
    nextActions: buildTaskStatusNextActions(status, taskRequest),
  });
}

async function handleGetInstanceInfo(
  context: QueryManageContext,
): Promise<ToolResult> {
  const instanceInfo = await getSqlInstanceInfo(context);
  const sanitized = sanitizeInstanceInfo(instanceInfo);
  return buildSqlToolResult({
    success: true,
    data: sanitized,
    message: instanceInfo.exists
      ? t("databaseSQL.getInstanceInfo.exists")
      : t("databaseSQL.getInstanceInfo.notExists"),
    nextActions: instanceInfo.exists
      ? undefined
      : [
          buildNextAction(
            MANAGE_MYSQL_DATABASE,
            "provisionMySQL",
            t("databaseSQL.next.provisionBeforeSql"),
            { action: "provisionMySQL", confirm: true },
          ),
        ],
  });
}

async function handleGetConnectionInfo(
  context: QueryManageContext,
): Promise<ToolResult> {
  const instanceInfo = await getSqlInstanceInfo(context);

  if (!instanceInfo.exists) {
    return buildSqlToolResult({
      success: false,
      errorCode: "MYSQL_NOT_CREATED",
      data: sanitizeInstanceInfo(instanceInfo),
      message: t("databaseSQL.getConnectionInfo.notExists"),
      nextActions: [
        buildNextAction(
          MANAGE_MYSQL_DATABASE,
          "provisionMySQL",
          t("databaseSQL.getConnectionInfo.provisionFirst"),
          { action: "provisionMySQL", confirm: true },
        ),
      ],
    });
  }

  return buildSqlToolResult({
    success: true,
    data: {
      ...sanitizeInstanceInfo(instanceInfo),
      // Full backend passthrough for explicit TCP migration only (may include credentials).
      clusterDetail: instanceInfo.clusterDetail,
      createResult: instanceInfo.createResult,
    },
    message: t("databaseSQL.getConnectionInfo.success"),
    nextActions: [
      buildNextAction(
        QUERY_MYSQL_DATABASE,
        "runQuery",
        t("databaseSQL.getConnectionInfo.preferDelegated"),
        { action: "runQuery", sql: "SELECT 1" },
      ),
    ],
  });
}

function resolveMysqlInstanceId(
  instanceInfo: InstanceInfoResult,
  args: QuerySqlDatabaseArgs,
): string | null {
  const fromRequest =
    typeof args.request?.InstanceId === "string"
      ? args.request.InstanceId
      : undefined;
  const fromDbInstance = args.dbInstance?.instanceId;
  const candidate = fromRequest || fromDbInstance || instanceInfo.instanceId;
  if (!candidate || candidate === "default") {
    return null;
  }
  return candidate;
}

async function requireReadyMysqlInstance(
  args: QuerySqlDatabaseArgs,
  context: QueryManageContext,
): Promise<
  | { ok: true; instanceInfo: InstanceInfoResult; instanceId: string }
  | { ok: false; payload: ToolResult }
> {
  const instanceInfo = await getSqlInstanceInfo(context);
  if (!instanceInfo.exists) {
    return {
      ok: false,
      payload: buildSqlToolResult({
        success: false,
        errorCode: "MYSQL_NOT_CREATED",
        data: sanitizeInstanceInfo(instanceInfo),
        message: t("databaseSQL.instanceLogs.notProvisioned"),
        nextActions: [
          buildNextAction(
            MANAGE_MYSQL_DATABASE,
            "provisionMySQL",
            t("databaseSQL.next.provisionBeforeSql"),
            { action: "provisionMySQL", confirm: true },
          ),
        ],
      }),
    };
  }

  const instanceId = resolveMysqlInstanceId(instanceInfo, args);
  if (!instanceId) {
    return {
      ok: false,
      payload: buildSqlToolResult({
        success: false,
        errorCode: "MYSQL_INSTANCE_ID_REQUIRED",
        data: sanitizeInstanceInfo(instanceInfo),
        message: t("databaseSQL.instanceLogs.instanceIdRequired"),
        nextActions: [
          buildNextAction(
            QUERY_MYSQL_DATABASE,
            "getInstanceInfo",
            t("databaseSQL.instanceLogs.resolveInstanceId"),
            { action: "getInstanceInfo" },
          ),
        ],
      }),
    };
  }

  return { ok: true, instanceInfo, instanceId };
}

async function handleDescribeInstanceSlowQueries(
  args: QuerySqlDatabaseArgs,
  context: QueryManageContext,
): Promise<ToolResult> {
  const ready = await requireReadyMysqlInstance(args, context);
  if (!ready.ok) {
    return ready.payload;
  }

  const request = args.request || {};
  const cloudbase = await context.getManager();
  const result = await cloudbase.mysql.describeInstanceSlowQueries({
    InstanceId: ready.instanceId,
    StartTime:
      (typeof request.StartTime === "string" ? request.StartTime : undefined) ??
      args.startTime,
    EndTime:
      (typeof request.EndTime === "string" ? request.EndTime : undefined) ??
      args.endTime,
    Limit:
      (typeof request.Limit === "number" ? request.Limit : undefined) ??
      args.limit,
    Offset:
      (typeof request.Offset === "number" ? request.Offset : undefined) ??
      args.offset,
    Username:
      (typeof request.Username === "string" ? request.Username : undefined) ??
      args.username,
    Host:
      (typeof request.Host === "string" ? request.Host : undefined) ??
      args.host,
    Database:
      (typeof request.Database === "string" ? request.Database : undefined) ??
      args.database,
    OrderBy:
      (typeof request.OrderBy === "string" ? request.OrderBy : undefined) ??
      args.orderBy,
    OrderByType:
      (typeof request.OrderByType === "string"
        ? request.OrderByType
        : undefined) ?? args.orderByType,
    SqlText:
      (typeof request.SqlText === "string" ? request.SqlText : undefined) ??
      args.sqlText,
  });
  logCloudBaseResult(context.server.logger, result);

  return buildSqlToolResult({
    success: true,
    data: {
      action: "describeInstanceSlowQueries",
      instanceId: ready.instanceId,
      totalCount: result.TotalCount ?? 0,
      slowQueries: result.SlowQueries ?? [],
      requestId: result.RequestId,
      raw: result,
    },
    message: t("databaseSQL.instanceLogs.slowQueriesSuccess"),
  });
}

async function handleDescribeInstanceErrorLogs(
  args: QuerySqlDatabaseArgs,
  context: QueryManageContext,
): Promise<ToolResult> {
  const ready = await requireReadyMysqlInstance(args, context);
  if (!ready.ok) {
    return ready.payload;
  }

  const request = args.request || {};
  const cloudbase = await context.getManager();
  const result = await cloudbase.mysql.describeInstanceErrorLogs({
    InstanceId: ready.instanceId,
    Limit:
      (typeof request.Limit === "number" ? request.Limit : undefined) ??
      args.limit,
    Offset:
      (typeof request.Offset === "number" ? request.Offset : undefined) ??
      args.offset,
    StartTime:
      (typeof request.StartTime === "string" ? request.StartTime : undefined) ??
      args.startTime,
    EndTime:
      (typeof request.EndTime === "string" ? request.EndTime : undefined) ??
      args.endTime,
    OrderBy:
      (typeof request.OrderBy === "string" ? request.OrderBy : undefined) ??
      (args.orderBy === "Timestamp" ? args.orderBy : undefined),
    OrderByType:
      (typeof request.OrderByType === "string"
        ? request.OrderByType
        : undefined) ?? args.orderByType,
    LogLevels:
      (Array.isArray(request.LogLevels)
        ? (request.LogLevels as string[])
        : undefined) ?? args.logLevels,
    KeyWords:
      (Array.isArray(request.KeyWords)
        ? (request.KeyWords as string[])
        : undefined) ?? args.keyWords,
  });
  logCloudBaseResult(context.server.logger, result);

  return buildSqlToolResult({
    success: true,
    data: {
      action: "describeInstanceErrorLogs",
      instanceId: ready.instanceId,
      totalCount: result.TotalCount ?? 0,
      errorLogs: result.ErrorLogs ?? [],
      requestId: result.RequestId,
      raw: result,
    },
    message: t("databaseSQL.instanceLogs.errorLogsSuccess"),
  });
}

async function handleProvisionMySQL(
  args: ManageSqlDatabaseArgs,
  context: QueryManageContext,
): Promise<ToolResult> {
  if (args.confirm !== true) {
    return buildSqlToolResult({
      success: false,
      errorCode: "CONFIRM_REQUIRED",
      message: t("databaseSQL.provision.confirmRequired"),
      nextActions: [
        buildNextAction(
          MANAGE_MYSQL_DATABASE,
          "provisionMySQL",
          t("databaseSQL.provision.needsConfirmation"),
          { action: "provisionMySQL", confirm: true },
        ),
      ],
    });
  }

  const existing = await getSqlInstanceInfo(context);
  if (
    existing.status === "READY" ||
    existing.status === "PENDING" ||
    existing.status === "RUNNING"
  ) {
    return buildSqlToolResult({
      success: true,
      data: sanitizeInstanceInfo(existing),
      message: t("databaseSQL.provision.alreadyExists"),
      nextActions:
        existing.status === "READY"
          ? [
              buildNextAction(
                MANAGE_MYSQL_DATABASE,
                "initializeSchema",
                t("databaseSQL.provision.existsCanInitialize"),
              ),
            ]
          : undefined,
    });
  }

  const cloudbase = await context.getManager();
  const envId = await getEnvId(context.cloudBaseOptions);
  const request = args.request || {};
  const result = await callSqlControlPlane(cloudbase, "CreateMySQL", {
    DbInstanceType: "MYSQL",
    ...request,
    EnvId: envId,
  });
  logCloudBaseResult(context.server.logger, result);

  const rawStatus = pickLifecycleSource(result);
  const status = normalizeTaskStatus(rawStatus);

  const taskRequest = buildTaskRequest(request, result);

  return buildSqlToolResult({
    success: true,
    data: {
      status,
      rawStatus,
      instance: {
        envId,
        instanceId:
          (result.InstanceId as string | undefined) ||
          (request.InstanceId as string | undefined) ||
          "default",
      },
      task: {
        request: taskRequest,
        requestId: result.RequestId,
      },
    },
    message:
      status === "READY"
        ? t("databaseSQL.provision.completedImmediately")
        : t("databaseSQL.provision.submitted"),
    nextActions: buildProvisionNextActions(status, taskRequest),
  });
}

async function handleDestroyMySQL(
  args: ManageSqlDatabaseArgs,
  context: QueryManageContext,
): Promise<ToolResult> {
  if (args.confirm !== true) {
    return buildSqlToolResult({
      success: false,
      errorCode: "CONFIRM_REQUIRED",
      message: t("databaseSQL.destroy.confirmRequired"),
      nextActions: [
        buildNextAction(
          MANAGE_MYSQL_DATABASE,
          "destroyMySQL",
          t("databaseSQL.destroy.needsConfirmation"),
          { action: "destroyMySQL", confirm: true },
        ),
      ],
    });
  }

  const existing = await getSqlInstanceInfo(context);
  if (!existing.exists) {
    return buildSqlToolResult({
      success: false,
      errorCode: "MYSQL_NOT_CREATED",
      message: t("databaseSQL.destroy.notExists"),
    });
  }

  const cloudbase = await context.getManager();
  const envId = await getEnvId(context.cloudBaseOptions);
  const request = args.request || {};
  const result = await callSqlControlPlane(cloudbase, "DestroyMySQL", {
    ...request,
    EnvId: envId,
  });
  logCloudBaseResult(context.server.logger, result);

  const destroyData = pickDataPayload(result);
  const isSuccess =
    typeof destroyData?.IsSuccess === "boolean"
      ? destroyData.IsSuccess
      : typeof result.IsSuccess === "boolean"
        ? result.IsSuccess
        : false;
  const taskRequest = buildTaskRequest(request, result);

  return buildSqlToolResult({
    success: isSuccess,
    errorCode: isSuccess ? undefined : "MYSQL_DESTROY_REJECTED",
    data: {
      status: isSuccess ? "RUNNING" : "FAILED",
      destroyResult: destroyData ?? result,
      instance: {
        envId,
        instanceId: existing.instanceId,
      },
      task: {
        request: taskRequest,
        requestId: result.RequestId,
      },
    },
    message: isSuccess
      ? t("databaseSQL.destroy.submitted")
      : t("databaseSQL.destroy.rejected"),
    nextActions: isSuccess
      ? [
          buildNextAction(
            QUERY_MYSQL_DATABASE,
            "describeTaskStatus",
            t("databaseSQL.destroy.checkTaskStatus"),
            {
              action: "describeTaskStatus",
              request: taskRequest,
            },
          ),
        ]
      : [],
  });
}

async function handleRunStatement(
  args: ManageSqlDatabaseArgs,
  context: QueryManageContext,
): Promise<ToolResult> {
  if (!args.sql) {
    return buildSqlToolResult({
      success: false,
      errorCode: "SQL_REQUIRED",
      message: t("databaseSQL.runStatement.sqlRequired"),
    });
  }

  const instanceInfo = await getSqlInstanceInfo(context);
  if (!instanceInfo.exists) {
    return buildSqlToolResult({
      success: false,
      errorCode: "MYSQL_NOT_CREATED",
      message: t("databaseSQL.runStatement.notProvisioned"),
      nextActions: [
        buildNextAction(
          MANAGE_MYSQL_DATABASE,
          "provisionMySQL",
          t("databaseSQL.runStatement.provisionBeforeWrite"),
          { action: "provisionMySQL", confirm: true },
        ),
      ],
    });
  }

  if (instanceInfo.status !== "READY") {
    return buildSqlToolResult({
      success: false,
      errorCode: "MYSQL_NOT_READY",
      message: t("databaseSQL.runStatement.notReady", { status: instanceInfo.status }),
      nextActions: [
        buildNextAction(
          QUERY_MYSQL_DATABASE,
          "getInstanceInfo",
          t("databaseSQL.runStatement.checkStatus"),
        ),
      ],
    });
  }

  const cloudbase = await context.getManager();
  const dbContext = await resolveSqlDbContext(
    context.getManager,
    context.cloudBaseOptions,
    args.dbInstance,
  );
  let result;
  try {
    result = await callSqlControlPlane(cloudbase, "RunSql", {
      EnvId: dbContext.envId,
      Sql: args.sql,
      DbInstance: {
        EnvId: dbContext.envId,
        InstanceId: dbContext.instanceId,
        Schema: dbContext.schema,
      },
    });
    logCloudBaseResult(context.server.logger, result);
  } catch (error: any) {
    const errorCode = typeof error === "object" && error && "code" in error ? (error as any).code : "";
    if (errorCode === "FailedOperation.DataSourceNotExist" || error.message?.includes("Database instance not found")) {
      return buildSqlToolResult({
        success: false,
        errorCode: "MYSQL_NOT_CREATED",
        message: t("databaseSQL.runStatement.notProvisionedNotFound"),
        nextActions: [
          buildNextAction(
            MANAGE_MYSQL_DATABASE,
            "provisionMySQL",
            t("databaseSQL.next.provisionBeforeStatements"),
            { action: "provisionMySQL", confirm: true },
          ),
        ],
      });
    }
    throw error;
  }

  const statementType = getSqlVerb(args.sql) || "UNKNOWN";
  const normalized = normalizeRunSqlResult(result);
  return buildSqlToolResult({
    success: true,
    data: {
      ...normalized,
      statementType,
    },
    message:
      statementType === "CREATE"
        ? t("databaseSQL.runStatement.createSuccess")
        : t("databaseSQL.runStatement.success"),
  });
}

async function resolveInitializationReadiness(
  args: ManageSqlDatabaseArgs,
  context: QueryManageContext,
): Promise<InitializationReadiness> {
  const instanceInfo = await getSqlInstanceInfo(context);
  if (!instanceInfo.exists) {
    return {
      ready: false,
      payload: buildSqlToolResult({
        success: false,
        errorCode: "MYSQL_NOT_CREATED",
        message: t("databaseSQL.initializeSchema.notProvisioned"),
        nextActions: [
          buildNextAction(
            MANAGE_MYSQL_DATABASE,
            "provisionMySQL",
            t("databaseSQL.initializeSchema.provisionFirst"),
            { action: "provisionMySQL", confirm: true },
          ),
        ],
      }),
    };
  }

  let status = instanceInfo.status;
  let rawStatus: unknown = instanceInfo.rawStatus;

  if (args.statusContext?.createResultRequest) {
    const cloudbase = await context.getManager();
    const result = await callSqlControlPlane(cloudbase, "DescribeCreateMySQLResult", {
      ...args.statusContext.createResultRequest,
      EnvId: instanceInfo.envId,
    });
    logCloudBaseResult(context.server.logger, result);
    rawStatus = pickLifecycleSource(result);
    status = normalizeCreateResultStatus(rawStatus);
  }

  if (
    status !== "READY" &&
    args.statusContext?.taskStatusRequest
  ) {
    const cloudbase = await context.getManager();
    const result = await callSqlControlPlane(cloudbase, "DescribeMySQLTaskStatus", {
      ...args.statusContext.taskStatusRequest,
      EnvId: instanceInfo.envId,
    });
    logCloudBaseResult(context.server.logger, result);
    rawStatus = pickLifecycleSource(result);
    status = normalizeTaskStatus(rawStatus);
  }

  if (status !== "READY") {
    return {
      ready: false,
      payload: buildSqlToolResult({
        success: false,
        errorCode: "MYSQL_NOT_READY",
        message: t("databaseSQL.initializeSchema.notReady", { status }),
        data: {
          status,
          rawStatus,
        },
        nextActions: [
          buildNextAction(
            QUERY_MYSQL_DATABASE,
            "describeTaskStatus",
            t("databaseSQL.initializeSchema.checkUntilReady"),
            args.statusContext?.taskStatusRequest
              ? {
                  action: "describeTaskStatus",
                  request: args.statusContext.taskStatusRequest,
                }
              : { action: "getInstanceInfo" },
          ),
        ],
      }),
    };
  }

  return {
    ready: true,
    instanceInfo,
  };
}

async function handleInitializeSchema(
  args: ManageSqlDatabaseArgs,
  context: QueryManageContext,
): Promise<ToolResult> {
  if (!Array.isArray(args.statements) || args.statements.length === 0) {
    return buildSqlToolResult({
      success: false,
      errorCode: "STATEMENTS_REQUIRED",
      message: t("databaseSQL.initializeSchema.statementsRequired"),
    });
  }

  if (args.requireReady !== false) {
    const readiness = await resolveInitializationReadiness(args, context);
    if (!readiness.ready) {
      return readiness.payload;
    }
  }

  const cloudbase = await context.getManager();
  const dbContext = await resolveSqlDbContext(
    context.getManager,
    context.cloudBaseOptions,
    args.dbInstance,
  );

  const executedStatements: Array<Record<string, unknown>> = [];
  const failedStatements: Array<Record<string, unknown>> = [];
  const requestIdList: string[] = [];

  for (const statement of args.statements) {
    try {
      let result;
      try {
        result = await callSqlControlPlane(cloudbase, "RunSql", {
          EnvId: dbContext.envId,
          Sql: statement,
          DbInstance: {
            EnvId: dbContext.envId,
            InstanceId: dbContext.instanceId,
            Schema: dbContext.schema,
          },
        });
        logCloudBaseResult(context.server.logger, result);
      } catch (error: any) {
        const errorCode = typeof error === "object" && error && "code" in error ? (error as any).code : "";
        if (errorCode === "FailedOperation.DataSourceNotExist" || error.message?.includes("Database instance not found")) {
          return buildSqlToolResult({
            success: false,
            errorCode: "MYSQL_NOT_CREATED",
            message: t("databaseSQL.initializeSchema.notProvisionedNotFound"),
            nextActions: [
              buildNextAction(
                MANAGE_MYSQL_DATABASE,
                "provisionMySQL",
                t("databaseSQL.next.provisionBeforeStatements"),
                { action: "provisionMySQL", confirm: true },
              ),
            ],
          });
        }
        throw error;
      }
      const normalized = normalizeRunSqlResult(result);
      if (typeof normalized.requestId === "string") {
        requestIdList.push(normalized.requestId);
      }
      executedStatements.push({
        sql: statement,
        statementType: getSqlVerb(statement) || "UNKNOWN",
        rowsAffected: normalized.rowsAffected,
        requestId: normalized.requestId,
      });
    } catch (error) {
      failedStatements.push({
        sql: statement,
        statementType: getSqlVerb(statement) || "UNKNOWN",
        message: error instanceof Error ? error.message : String(error),
      });
      break;
    }
  }

  const success = failedStatements.length === 0;
  return buildSqlToolResult({
    success,
    errorCode: success ? undefined : "SCHEMA_INITIALIZATION_FAILED",
    data: {
      executedStatements,
      failedStatements,
      requestIdList,
    },
    message: success
      ? t("databaseSQL.initializeSchema.success")
      : t("databaseSQL.initializeSchema.stoppedOnFailure"),
  });
}

export function registerSQLDatabaseTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });
  const context: QueryManageContext = {
    getManager,
    cloudBaseOptions,
    server,
  };

  server.registerTool?.(
    QUERY_MYSQL_DATABASE,
    {
      title: "databaseSQL.queryMysqlDatabase.title",
      description: "databaseSQL.queryMysqlDatabase.description",
      inputSchema: {
        action: z
          .enum(QUERY_ACTIONS)
          .describe("databaseSQL.schema.query.action"),
        sql: z
          .string()
          .optional()
          .describe("databaseSQL.schema.query.sql"),
        request: z
          .record(z.unknown())
          .optional()
          .describe("databaseSQL.schema.query.request"),
        dbInstance: z
          .object({
            instanceId: z.string().optional(),
            schema: z.string().optional(),
          })
          .optional()
          .describe("databaseSQL.schema.query.dbInstance"),
        startTime: z
          .string()
          .optional()
          .describe("databaseSQL.schema.query.startTime"),
        endTime: z
          .string()
          .optional()
          .describe("databaseSQL.schema.query.endTime"),
        limit: z
          .number()
          .optional()
          .describe("databaseSQL.schema.query.limit"),
        offset: z
          .number()
          .optional()
          .describe("databaseSQL.schema.query.offset"),
        username: z
          .string()
          .optional()
          .describe("databaseSQL.schema.query.username"),
        host: z
          .string()
          .optional()
          .describe("databaseSQL.schema.query.host"),
        database: z
          .string()
          .optional()
          .describe("databaseSQL.schema.query.database"),
        orderBy: z
          .enum([...SLOW_QUERY_ORDER_BY, "Timestamp"] as const)
          .optional()
          .describe("databaseSQL.schema.query.orderBy"),
        orderByType: z
          .enum(ORDER_BY_TYPE)
          .optional()
          .describe("databaseSQL.schema.query.orderByType"),
        sqlText: z
          .string()
          .optional()
          .describe("databaseSQL.schema.query.sqlText"),
        logLevels: z
          .array(z.enum(ERROR_LOG_LEVELS))
          .optional()
          .describe("databaseSQL.schema.query.logLevels"),
        keyWords: z
          .array(z.string())
          .optional()
          .describe("databaseSQL.schema.query.keyWords"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
        category: CATEGORY,
      },
    },
    async (args: QuerySqlDatabaseArgs) => {
      const gate = await checkMysqlGate(server);
      if (gate) return gate;
      switch (args.action) {
        case "runQuery":
          return handleRunQuery(args, context);
        case "describeCreateResult":
          return handleDescribeCreateResult(args, context);
        case "describeTaskStatus":
          return handleDescribeTaskStatus(args, context);
        case "getInstanceInfo":
        case "describeInstance":
          return handleGetInstanceInfo(context);
        case "getConnectionInfo":
          return handleGetConnectionInfo(context);
        case "describeInstanceSlowQueries":
          return handleDescribeInstanceSlowQueries(args, context);
        case "describeInstanceErrorLogs":
          return handleDescribeInstanceErrorLogs(args, context);
        default:
          throw new Error(t("databaseSQL.unsupportedQueryAction", { action: args.action }));
      }
    },
  );

  server.registerTool?.(
    MANAGE_MYSQL_DATABASE,
    {
      title: "databaseSQL.manageMysqlDatabase.title",
      description: "databaseSQL.manageMysqlDatabase.description",
      inputSchema: {
        action: z
          .enum(MANAGE_ACTIONS)
          .describe("databaseSQL.schema.manage.action"),
        confirm: z
          .boolean()
          .optional()
          .describe("databaseSQL.schema.manage.confirm"),
        sql: z
          .string()
          .optional()
          .describe("databaseSQL.schema.manage.sql"),
        request: z
          .record(z.unknown())
          .optional()
          .describe("databaseSQL.schema.manage.request"),
        statements: z
          .array(z.string())
          .optional()
          .describe("databaseSQL.schema.manage.statements"),
        requireReady: z
          .boolean()
          .optional()
          .describe("databaseSQL.schema.manage.requireReady"),
        statusContext: z
          .object({
            createResultRequest: z.record(z.unknown()).optional(),
            taskStatusRequest: z.record(z.unknown()).optional(),
          })
          .optional()
          .describe("databaseSQL.schema.manage.statusContext"),
        dbInstance: z
          .object({
            instanceId: z.string().optional(),
            schema: z.string().optional(),
          })
          .optional()
          .describe("databaseSQL.schema.manage.dbInstance"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
        category: CATEGORY,
      },
    },
    async (args: ManageSqlDatabaseArgs) => {
      const gate = await checkMysqlGate(server);
      if (gate) return gate;
      switch (args.action) {
        case "provisionMySQL":
          return handleProvisionMySQL(args, context);
        case "destroyMySQL":
          return handleDestroyMySQL(args, context);
        case "runStatement":
          return handleRunStatement(args, context);
        case "initializeSchema":
          return handleInitializeSchema(args, context);
        default:
          return buildSqlToolResult({
            success: false,
            errorCode: "UNSUPPORTED_ACTION",
            message: t("databaseSQL.unsupportedManageAction", { action: args.action }),
          });
      }
    },
  );
}
