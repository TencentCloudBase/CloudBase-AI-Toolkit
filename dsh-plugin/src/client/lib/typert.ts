import type {
  AppAuthConfig,
  AppUser,
  AccessEndpoint,
  AuthStatus,
  CloudBaseData,
  ColumnSummary,
  DeploymentRecord,
  EnvInfoView,
  EnvItem,
  LogEntry,
  MetricSeries,
  RowPage,
  SecretItem,
  StorageObject,
  TableSummary,
  UsageItem,
} from "../../shared/types.js";
import type { SlotHost } from "./slots.js";

interface RpcResult {
  ok: boolean;
  value?: unknown;
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
}

interface RpcConnection {
  rpc?: {
    call: (channel: string, endpoint: string, payload: unknown, signal?: AbortSignal) => Promise<RpcResult>;
  };
}

/**
 * 用 dsh connection 的 RPC 直调 host 侧 CloudBaseRemoteService（/api/cloudbaseData/*）。
 *
 * 为什么不用 `ctx.remote.cloudbaseData`：client 端 remote 能力集是编译期固定的
 * （dsh-api-remotes 只 mount 内置贡献），第三方插件无法通过 $mount 后经
 * traceable proxy 访问（shadow context 的 isolate 不匹配 root 注册的 service，
 * 抛 "cannot get property remote.cloudbaseData without inject"）。
 * connection.rpc 是底层通道，绕开 Cordis service 代理，直接向 host api-gateway
 * 发 `/api/cloudbaseData/<method>` 调用；host 侧 SRC fallback 发现
 * CloudBaseRemoteService 并 dispatch。
 */
export function createRemoteCloudBaseData(
  ctx: SlotHost | undefined,
): CloudBaseData | undefined {
  const connection = (ctx as unknown as { connection?: RpcConnection })?.connection;
  if (!connection?.rpc?.call) return undefined;

  const call = async (method: string, args: Record<string, unknown> = {}): Promise<unknown> => {
    const result = await connection.rpc?.call("/api", `cloudbaseData/${method}`, { args });
    if (!result) throw new Error("CloudBase RPC 通道不可用");
    if (!result.ok) {
      const message = result.error?.message ?? "CloudBase RPC 调用失败";
      throw new Error(message);
    }
    return result.value;
  };

  return {
    async listTables(): Promise<TableSummary[]> {
      return (await call("listTables")) as TableSummary[];
    },
    async listTableColumns(table: string): Promise<ColumnSummary[]> {
      return (await call("listTableColumns", { table })) as ColumnSummary[];
    },
    async listAppUsers(opts?: { limit?: number; offset?: number }): Promise<AppUser[]> {
      return (await call("listAppUsers", {
        limit: opts?.limit,
        offset: opts?.offset,
      })) as AppUser[];
    },
    async listSecrets(): Promise<SecretItem[]> {
      return (await call("listSecrets")) as SecretItem[];
    },
    async readRows(table: string, opts?: { limit?: number; offset?: number }): Promise<RowPage> {
      return (await call("readRows", {
        table,
        limit: opts?.limit,
        offset: opts?.offset,
      })) as RowPage;
    },
    async runReadSql(sql: string): Promise<RowPage> {
      return (await call("runReadSql", { sql })) as RowPage;
    },
    async listStorage(path?: string): Promise<StorageObject[]> {
      return (await call("listStorage", { path: path ?? "" })) as StorageObject[];
    },
    async storageUrl(cloudPath: string): Promise<{ url: string; expiresInSec: number }> {
      return (await call("storageUrl", { cloudPath })) as { url: string; expiresInSec: number };
    },
    async authStatus(): Promise<AuthStatus> {
      return (await call("authStatus")) as AuthStatus;
    },
    async startAuth(): Promise<AuthStatus> {
      return (await call("startAuth")) as AuthStatus;
    },
    async startLogin(method, params) {
      return (await call("startLogin", { method, params })) as AuthStatus;
    },
    authStateChange(listener) {
      // 兜底轮询：服务端 authStatus 已是纯本地读（零云端调用），60s 一次只为
      // 进程外变更兜底；登录态/环境态的主同步路径是用户操作 + 服务端事件广播。
      const timer = window.setInterval(() => {
        void call("authStatus").then((status) => listener(status as AuthStatus));
      }, 60000);
      void call("authStatus").then((status) => listener(status as AuthStatus));
      return () => window.clearInterval(timer);
    },
    async logout() {
      return (await call("logout")) as AuthStatus;
    },
    async getAuthLoginConfig() {
      return (await call("getAuthLoginConfig")) as AppAuthConfig;
    },
    async listEnvironments(): Promise<EnvItem[]> {
      return (await call("listEnvironments")) as EnvItem[];
    },
    async setEnvironment(envId: string): Promise<AuthStatus> {
      return (await call("setEnvironment", { envId })) as AuthStatus;
    },
    async appAuthConfig(): Promise<AppAuthConfig> {
      return (await call("appAuthConfig")) as AppAuthConfig;
    },
    async metrics(): Promise<MetricSeries[]> {
      return (await call("metrics")) as MetricSeries[];
    },
    async usage(): Promise<UsageItem[]> {
      return (await call("usage")) as UsageItem[];
    },
    async recentErrors(): Promise<LogEntry[]> {
      return (await call("recentErrors")) as LogEntry[];
    },
    async envInfo(): Promise<EnvInfoView> {
      return (await call("envInfo")) as EnvInfoView;
    },
    async appendToSession(text: string): Promise<void> {
      await call("appendToSession", { text });
    },
    async capi(service: string, action: string, params: Record<string, unknown> = {}): Promise<unknown> {
      return call("capi", { service, action, params });
    },
    async listAccessEndpoints(): Promise<AccessEndpoint[]> {
      return (await call("listAccessEndpoints")) as AccessEndpoint[];
    },
    async listDeployments(): Promise<DeploymentRecord[]> {
      return (await call("listDeployments")) as DeploymentRecord[];
    },
    async rollbackDeployment(record) {
      return Boolean(await call("rollbackDeployment", { record }));
    },
    async sessionBoundEnv(sessionId?: string): Promise<string | undefined> {
      return (await call("sessionBoundEnv", { sessionId })) as string | undefined;
    },
    async searchAppUsers(opts) {
      return (await call("searchAppUsers", opts ?? {})) as { users: AppUser[]; total?: number };
    },
    async setAppUserStatus(uid, enabled) {
      await call("setAppUserStatus", { uid, enabled });
    },
    async checkLogService() {
      return Boolean(await call("checkLogService"));
    },
    async searchLogs(opts) {
      return (await call("searchLogs", opts as unknown as Record<string, unknown>)) as import("../../shared/types.js").LogSearchResult;
    },
    async getTableSchema(schemaTable) {
      return (await call("getTableSchema", { schemaTable })) as import("../../shared/types.js").TableSchemaDetail;
    },
    async listSchemaPolicies(schema = "public") {
      return (await call("listSchemaPolicies", { schema })) as import("../../shared/types.js").PolicySummary[];
    },
    async runPgDDL(sql, confirm) {
      return (await call("runPgDDL", { sql, confirm })) as { ok: boolean; message: string };
    },
    async listPgFunctions(schema = "public") {
      return (await call("listPgFunctions", { schema })) as import("../../shared/types.js").PgFunctionRow[];
    },
    async listPgExtensions() {
      return (await call("listPgExtensions")) as import("../../shared/types.js").PgExtensionRow[];
    },
    async listPgRoles() {
      return (await call("listPgRoles")) as import("../../shared/types.js").PgRoleRow[];
    },
    async listPgMigrations() {
      return (await call("listMigrations")) as import("../../shared/types.js").PgMigrationRow[];
    },
    async listMigrations() {
      return (await call("listMigrations")) as import("../../shared/types.js").PgMigrationRow[];
    },
    async listGatewayRoutes() {
      return (await call("listGatewayRoutes")) as import("../../shared/types.js").GatewayRoute[];
    },
    async upsertGatewayRoute(input) {
      await call("upsertGatewayRoute", { input });
    },
    async deleteGatewayRoute(routeId, confirm) {
      await call("deleteGatewayRoute", { routeId, confirm });
    },
    async getGatewayPrivilege() {
      return (await call("getGatewayPrivilege")) as import("../../shared/types.js").GatewayPrivilege;
    },
    async listGatewayDomains() {
      const rows = (await call("listCustomDomains")) as Array<{ domain: string }>;
      return rows.map((row) => row.domain);
    },
    async listCustomDomains() {
      return (await call("listCustomDomains")) as Array<{ domain: string; status: string }>;
    },
    async listFunctionNames() {
      return (await call("listFunctionNames")) as string[];
    },
    async setGatewayServiceEnabled(enable) {
      await call("setGatewayServiceEnabled", { enable });
    },
    async setGatewayAuthEnabled(enable) {
      await call("setGatewayAuthEnabled", { enable });
    },
    async fetchMetricSeries(metricName, opts) {
      return (await call("fetchMetricSeries", {
        metricName,
        ...(opts ?? {}),
      })) as MetricSeries;
    },
    async listFunctions(opts) {
      return (await call("listFunctions", opts ?? {})) as Array<{
        name: string;
        runtime?: string;
        status?: string;
        invokeCount?: number;
        updatedAt?: string;
      }>;
    },
    async getFunction(name) {
      return (await call("getFunction", { name })) as Awaited<
        ReturnType<NonNullable<CloudBaseData["getFunction"]>>
      >;
    },
    async listFunctionTriggers(name) {
      return (await call("listFunctionTriggers", { name })) as Array<{
        name: string;
        type: string;
        triggerDesc?: string;
      }>;
    },
    async listFunctionLogs(name, opts) {
      return (await call("listFunctionLogs", { name, limit: opts?.limit })) as Array<{
        requestId?: string;
        time?: string;
        message: string;
      }>;
    },
    async invokeFunction(name, payload) {
      return (await call("invokeFunction", { name, payload })) as { result: string };
    },
    async listCloudRunServices() {
      return (await call("listCloudRunServices")) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listCloudRunServices"]>>
      >;
    },
    async getCloudRunService(name) {
      return (await call("getCloudRunService", { name })) as Awaited<
        ReturnType<NonNullable<CloudBaseData["getCloudRunService"]>>
      >;
    },
    async listCloudRunDeployRecords(name) {
      return (await call("listCloudRunDeployRecords", { name })) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listCloudRunDeployRecords"]>>
      >;
    },
    async getCloudRunProcessLog(name, runId) {
      return (await call("getCloudRunProcessLog", { name, runId })) as Array<{
        time?: string;
        message: string;
      }>;
    },
    async getCloudRunBuildLog(name, buildId) {
      return (await call("getCloudRunBuildLog", { name, buildId })) as {
        text: string;
        unsupportedReason?: string;
      };
    },
    async listHostingDomains() {
      return (await call("listHostingDomains")) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listHostingDomains"]>>
      >;
    },
    async listHostingVersions() {
      return (await call("listHostingVersions")) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listHostingVersions"]>>
      >;
    },
    async listHostingObjects(prefix) {
      return (await call("listHostingObjects", { prefix })) as StorageObject[];
    },
    async listStorageBuckets() {
      return (await call("listStorageBuckets")) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listStorageBuckets"]>>
      >;
    },
    async uploadStorage(cloudPath, opts) {
      await call("uploadStorage", { cloudPath, ...(opts ?? {}) });
    },
    async createStorageBucket(name, opts) {
      await call("createStorageBucket", { name, isPublic: opts?.public });
    },
    async deleteStorageBucket(name, confirm) {
      await call("deleteStorageBucket", { name, confirm });
    },
    async listSslCertificates() {
      return (await call("listSslCertificates")) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listSslCertificates"]>>
      >;
    },
    async listCdnCacheItems(bucketName) {
      return (await call("listCdnCacheItems", { bucketName })) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listCdnCacheItems"]>>
      >;
    },
    async listAuthDomains() {
      return (await call("listAuthDomains")) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listAuthDomains"]>>
      >;
    },
    async deleteAuthDomain(domainId, confirm) {
      await call("deleteAuthDomain", { domainId, confirm });
    },
    async upsertPolicy(input, confirm) {
      await call("upsertPolicy", { input, confirm });
    },
    async dropPolicy(schemaTable, policyName, confirm) {
      await call("dropPolicy", { schemaTable, policyName, confirm });
    },
    async toggleTableRls(schemaTable, enable, confirm) {
      await call("toggleTableRls", { schemaTable, enable, confirm });
    },
    async bindCustomDomain(input) {
      await call("bindCustomDomain", { input });
    },
    async deleteCustomDomain(domain, confirm) {
      await call("deleteCustomDomain", { domain, confirm });
    },
    async listSchemas() {
      return (await call("listSchemas")) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listSchemas"]>>
      >;
    },
    async listTriggers(schema = "public") {
      return (await call("listTriggers", { schema })) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listTriggers"]>>
      >;
    },
    async listTypes(schema = "public") {
      return (await call("listTypes", { schema })) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listTypes"]>>
      >;
    },
    async listColumnPrivileges(schemaTable) {
      return (await call("listColumnPrivileges", { schemaTable })) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listColumnPrivileges"]>>
      >;
    },
    async listSafetyDomains() {
      return (await call("listSafetyDomains")) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listSafetyDomains"]>>
      >;
    },
    async getStorageSecurityRules(bucket) {
      return (await call("getStorageSecurityRules", { bucket })) as Awaited<
        ReturnType<NonNullable<CloudBaseData["getStorageSecurityRules"]>>
      >;
    },
    async setStorageSecurityRules(rules) {
      await call("setStorageSecurityRules", rules);
    },
    async listCdnCacheConfig(bucket) {
      return (await call("listCdnCacheConfig", { bucket })) as Awaited<
        ReturnType<NonNullable<CloudBaseData["listCdnCacheConfig"]>>
      >;
    },
    async getStorageCustomDomains() {
      return (await call("getStorageCustomDomains")) as Awaited<
        ReturnType<NonNullable<CloudBaseData["getStorageCustomDomains"]>>
      >;
    },
  };
}

export function getDataService(ctx: SlotHost | undefined): CloudBaseData | undefined {
  return createRemoteCloudBaseData(ctx);
}

export async function appendUserMessage(
  data: CloudBaseData | undefined,
  text: string,
): Promise<void> {
  if (!data?.appendToSession) {
    throw new Error("无法写入会话。请直接在对话框发送该指令。");
  }
  await data.appendToSession(text);
}
