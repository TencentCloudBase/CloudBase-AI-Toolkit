import { Remote, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";
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
} from "../shared/types.js";

const JSON_CODEC = { mode: "src-json" } as const;

/**
 * 递归清理返回值，保证通过 api-gateway 的 assertJsonValue（src-json codec）：
 * - 删除对象里的 undefined 字段（JSON.stringify 会丢弃，但 assertJsonValue 会拒绝）
 * - 数组里的 undefined 置为 null
 * - 非有限数字（NaN/Infinity）置为 null
 */
function toJsonSafe<T>(value: T): T {
  if (value === undefined) return null as T;
  if (typeof value === "number") return (Number.isFinite(value) ? value : null) as T;
  if (Array.isArray(value)) return value.map((item) => toJsonSafe(item)) as T;
  if (value !== null && typeof value === "object") {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return value;
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item === undefined) continue;
      out[key] = toJsonSafe(item);
    }
    return out as T;
  }
  return value;
}

interface TypertInvocation {
  id: string;
  service: string;
  namespace: string;
  method: string;
  invocation: { kind: "direct" };
  parameters: Array<{ name: string; wire: string; source: "json"; codec: typeof JSON_CODEC }>;
  result: typeof JSON_CODEC;
}

function invoke(method: string, params: string[] = []): TypertInvocation {
  return {
    id: `@cloudbase/dsh-plugin#cloudbaseData/${method}`,
    service: "cloudbaseData",
    namespace: "cloudbaseData",
    method,
    invocation: { kind: "direct" },
    parameters: params.map((name) => ({ name, wire: name, source: "json" as const, codec: JSON_CODEC })),
    result: JSON_CODEC,
  };
}

/**
 * Host 侧 Typert manifest：把 cloudbaseData endpoints 注册进 typert 的 local 注册表，
 * 让 api-gateway 的 claimsEndpoint 命中（srcClaims 依赖 strict ctx.get，apply 期间
 * fiber state 非 active 时收集不到，导致 404）。local 注册表不依赖 fiber state。
 */
export function buildCloudBaseTypertContribution(): {
  package: string;
  face: "host";
  schemas: unknown[];
  invocations: TypertInvocation[];
} {
  return {
    package: "@cloudbase/dsh-plugin",
    face: "host",
    schemas: [],
    invocations: [
      invoke("listTables"),
      invoke("listTableColumns", ["table"]),
      invoke("listAppUsers", ["limit", "offset"]),
      invoke("listSecrets"),
      invoke("readRows", ["table", "limit", "offset"]),
      invoke("runReadSql", ["sql"]),
      invoke("listStorage", ["path"]),
      invoke("storageUrl", ["cloudPath"]),
      invoke("authStatus"),
      invoke("startAuth"),
      invoke("startLogin", ["method", "params"]),
      invoke("logout"),
      invoke("listMigrations"),
      invoke("listEnvironments"),
      invoke("setEnvironment", ["envId"]),
      invoke("appAuthConfig"),
      invoke("metrics"),
      invoke("usage"),
      invoke("recentErrors"),
      invoke("envInfo"),
      invoke("appendToSession", ["text"]),
      invoke("capi", ["service", "action", "params"]),
      invoke("listAccessEndpoints"),
      invoke("listDeployments"),
      invoke("rollbackDeployment", ["record"]),
      invoke("sessionBoundEnv", ["sessionId"]),
      invoke("searchAppUsers", ["keyword", "pageNo", "pageSize"]),
      invoke("setAppUserStatus", ["uid", "enabled"]),
      invoke("checkLogService"),
      invoke("searchLogs", ["queryString", "service", "startTime", "endTime", "limit", "sort", "context"]),
      invoke("getTableSchema", ["schemaTable"]),
      invoke("listSchemaPolicies", ["schema"]),
      invoke("runPgDDL", ["sql", "confirm"]),
      invoke("listPgFunctions", ["schema"]),
      invoke("listPgExtensions"),
      invoke("listPgRoles"),
      invoke("listPgMigrations"),
      invoke("listCustomDomains"),
      invoke("bindCustomDomain", ["input"]),
      invoke("deleteCustomDomain", ["domain", "confirm"]),
      invoke("listSslCertificates"),
      invoke("listAuthDomains"),
      invoke("getGatewayQpsLimit"),
      invoke("listSchemas"),
      invoke("listTriggers", ["schema"]),
      invoke("listTypes", ["schema"]),
      invoke("listColumnPrivileges", ["schemaTable"]),
      invoke("listSafetyDomains"),
      invoke("getStorageSecurityRules"),
      invoke("setStorageSecurityRules", ["rules"]),
      invoke("listCdnCacheConfig"),
      invoke("getStorageCustomDomains"),
      invoke("getAuthLoginConfig"),
      invoke("listGatewayRoutes"),
      invoke("upsertGatewayRoute", ["input"]),
      invoke("deleteGatewayRoute", ["routeId", "confirm"]),
      invoke("getGatewayPrivilege"),
      invoke("listGatewayDomains"),
      invoke("listFunctionNames"),
      invoke("setGatewayServiceEnabled", ["enable"]),
      invoke("setGatewayAuthEnabled", ["enable"]),
      invoke("fetchMetricSeries", ["metricName", "startTime", "endTime", "period"]),
    ],
  };
}

/**
 * 把 CloudBase 数据服务通过 dsh Typert Remote 暴露给浏览器 client。
 *
 * - serviceKey = "cloudbaseData"：client 端通过 `ctx.remote.cloudbaseData.<method>()` 调用
 *   （dsh 的 api-gateway 自动拦截 `/api/cloudbaseData/<method>` RPC 并分发到本服务）。
 * - 方法用 @Remote 标记，参数必须是简单命名参数（SRC fallback 通过
 *   Function.prototype.toString 解析参数名），返回值必须 JSON 可序列化。
 * - 继承 TypertRemoteService：`super(ctx, key)` 自动把实例注册为 Cordis service，
 *   同时绑定 Typert Remote namespace（api-gateway 的 SRC 发现路径）。
 */
export class CloudBaseRemoteService extends TypertRemoteService {
  private readonly data: CloudBaseData;

  constructor(ctx: unknown, data: CloudBaseData) {
    super(ctx as never, "cloudbaseData");
    this.data = data;
  }

  @Remote("listTables")
  async listTables(): Promise<TableSummary[]> {
    return toJsonSafe(await this.data.listTables());
  }

  @Remote("listTableColumns")
  async listTableColumns(table: string): Promise<ColumnSummary[]> {
    return toJsonSafe(await this.data.listTableColumns(table));
  }

  @Remote("listAppUsers")
  async listAppUsers(limit?: number, offset?: number): Promise<AppUser[]> {
    return toJsonSafe(
      await this.data.listAppUsers({
        limit: limit === undefined ? undefined : limit,
        offset: offset === undefined ? undefined : offset,
      }),
    );
  }

  @Remote("listSecrets")
  async listSecrets(): Promise<SecretItem[]> {
    return toJsonSafe(await this.data.listSecrets());
  }

  @Remote("readRows")
  async readRows(table: string, limit?: number, offset?: number): Promise<RowPage> {
    return toJsonSafe(await this.data.readRows(table, {
      limit: limit === undefined ? undefined : limit,
      offset: offset === undefined ? undefined : offset,
    }));
  }

  @Remote("runReadSql")
  async runReadSql(sql: string): Promise<RowPage> {
    return toJsonSafe(await this.data.runReadSql(sql));
  }

  @Remote("listStorage")
  async listStorage(path?: string): Promise<StorageObject[]> {
    return toJsonSafe(await this.data.listStorage(path === undefined ? "" : path));
  }

  @Remote("storageUrl")
  async storageUrl(cloudPath: string): Promise<{ url: string; expiresInSec: number }> {
    return toJsonSafe(await this.data.storageUrl(cloudPath));
  }

  @Remote("authStatus")
  async authStatus(): Promise<AuthStatus> {
    return toJsonSafe(await this.data.authStatus());
  }

  @Remote("startAuth")
  async startAuth(): Promise<AuthStatus> {
    return toJsonSafe(await this.data.startAuth());
  }

  @Remote("startLogin")
  async startLogin(method?: string, params?: { envId?: string; apiKey?: string }): Promise<AuthStatus> {
    return toJsonSafe(await this.data.startLogin!(method as never, params));
  }

  @Remote("logout")
  async logout(): Promise<AuthStatus> {
    return toJsonSafe(await this.data.logout!());
  }

  @Remote("getAuthLoginConfig")
  async getAuthLoginConfig(): Promise<AppAuthConfig> {
    return toJsonSafe(await this.data.getAuthLoginConfig!());
  }

  @Remote("listEnvironments")
  async listEnvironments(): Promise<EnvItem[]> {
    return toJsonSafe(await this.data.listEnvironments());
  }

  @Remote("setEnvironment")
  async setEnvironment(envId: string): Promise<AuthStatus> {
    return toJsonSafe(await this.data.setEnvironment(envId));
  }

  @Remote("appAuthConfig")
  async appAuthConfig(): Promise<AppAuthConfig> {
    return toJsonSafe(await this.data.appAuthConfig());
  }

  @Remote("metrics")
  async metrics(): Promise<MetricSeries[]> {
    return toJsonSafe(await this.data.metrics());
  }

  @Remote("usage")
  async usage(): Promise<UsageItem[]> {
    return toJsonSafe(await this.data.usage());
  }

  @Remote("recentErrors")
  async recentErrors(): Promise<LogEntry[]> {
    return toJsonSafe(await this.data.recentErrors());
  }

  @Remote("envInfo")
  async envInfo(): Promise<EnvInfoView> {
    return toJsonSafe(await this.data.envInfo());
  }

  @Remote("appendToSession")
  async appendToSession(text: string): Promise<void> {
    return toJsonSafe(await this.data.appendToSession(text));
  }

  @Remote("capi")
  async capi(service: string, action: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return toJsonSafe(await this.data.capi(service, action, params));
  }

  @Remote("listAccessEndpoints")
  async listAccessEndpoints(): Promise<AccessEndpoint[]> {
    return toJsonSafe(await this.data.listAccessEndpoints());
  }

  @Remote("listDeployments")
  async listDeployments(): Promise<DeploymentRecord[]> {
    return toJsonSafe(await this.data.listDeployments());
  }

  @Remote("rollbackDeployment")
  async rollbackDeployment(record: DeploymentRecord): Promise<boolean> {
    if (!this.data.rollbackDeployment) return false;
    return toJsonSafe(await this.data.rollbackDeployment(record));
  }

  @Remote("sessionBoundEnv")
  async sessionBoundEnv(sessionId?: string): Promise<string | undefined> {
    return toJsonSafe(await this.data.sessionBoundEnv(sessionId));
  }

  @Remote("searchAppUsers")
  async searchAppUsers(keyword?: string, pageNo?: number, pageSize?: number) {
    return toJsonSafe(await this.data.searchAppUsers({ keyword, pageNo, pageSize }));
  }

  @Remote("setAppUserStatus")
  async setAppUserStatus(uid: string, enabled: boolean): Promise<void> {
    return toJsonSafe(await this.data.setAppUserStatus(uid, enabled));
  }

  @Remote("checkLogService")
  async checkLogService(): Promise<boolean> {
    return toJsonSafe(await this.data.checkLogService());
  }

  @Remote("searchLogs")
  async searchLogs(
    queryString: string,
    service?: string,
    startTime?: string,
    endTime?: string,
    limit?: number,
    sort?: "asc" | "desc",
    context?: string,
  ) {
    return toJsonSafe(
      await this.data.searchLogs({
        queryString,
        service: service as "tcb" | "tcbr" | undefined,
        startTime,
        endTime,
        limit,
        sort,
        context,
      }),
    );
  }

  @Remote("getTableSchema")
  async getTableSchema(schemaTable: string) {
    return toJsonSafe(await this.data.getTableSchema(schemaTable));
  }

  @Remote("listSchemaPolicies")
  async listSchemaPolicies(schema?: string) {
    return toJsonSafe(await this.data.listSchemaPolicies(schema));
  }

  @Remote("runPgDDL")
  async runPgDDL(sql: string, confirm: boolean) {
    return toJsonSafe(await this.data.runPgDDL(sql, confirm));
  }

  @Remote("listPgFunctions")
  async listPgFunctions(schema?: string) {
    return toJsonSafe(await this.data.listPgFunctions?.(schema));
  }

  @Remote("listPgExtensions")
  async listPgExtensions() {
    return toJsonSafe(await this.data.listPgExtensions?.());
  }

  @Remote("listPgRoles")
  async listPgRoles() {
    return toJsonSafe(await this.data.listPgRoles?.());
  }

  @Remote("listPgMigrations")
  async listPgMigrations() {
    return toJsonSafe(await this.data.listPgMigrations?.());
  }

  @Remote("listMigrations")
  async listMigrations() {
    return toJsonSafe(await this.data.listMigrations?.());
  }

  @Remote("listCustomDomains")
  async listCustomDomains() {
    return toJsonSafe(await this.data.listCustomDomains?.());
  }

  @Remote("bindCustomDomain")
  async bindCustomDomain(input: Record<string, unknown>): Promise<void> {
    return toJsonSafe(await this.data.bindCustomDomain?.(input as never));
  }

  @Remote("deleteCustomDomain")
  async deleteCustomDomain(domain: string, confirm: boolean): Promise<void> {
    return toJsonSafe(await this.data.deleteCustomDomain?.(domain, confirm));
  }

  @Remote("listSslCertificates")
  async listSslCertificates() {
    return toJsonSafe(await this.data.listSslCertificates?.());
  }

  @Remote("listAuthDomains")
  async listAuthDomains() {
    return toJsonSafe(await this.data.listAuthDomains?.());
  }

  @Remote("getGatewayQpsLimit")
  async getGatewayQpsLimit() {
    return toJsonSafe(await this.data.getGatewayQpsLimit?.());
  }

  @Remote("listSchemas")
  async listSchemas() {
    return toJsonSafe(await this.data.listSchemas?.());
  }

  @Remote("listTriggers")
  async listTriggers(schema?: string) {
    return toJsonSafe(await this.data.listTriggers?.(schema));
  }

  @Remote("listTypes")
  async listTypes(schema?: string) {
    return toJsonSafe(await this.data.listTypes?.(schema));
  }

  @Remote("listColumnPrivileges")
  async listColumnPrivileges(schemaTable: string) {
    return toJsonSafe(await this.data.listColumnPrivileges?.(schemaTable));
  }

  @Remote("listSafetyDomains")
  async listSafetyDomains() {
    return toJsonSafe(await this.data.listSafetyDomains?.());
  }

  @Remote("getStorageSecurityRules")
  async getStorageSecurityRules() {
    return toJsonSafe(await this.data.getStorageSecurityRules?.());
  }

  @Remote("setStorageSecurityRules")
  async setStorageSecurityRules(rules: { aclTag: string; rule?: string }): Promise<void> {
    return toJsonSafe(await this.data.setStorageSecurityRules?.(rules));
  }

  @Remote("listCdnCacheConfig")
  async listCdnCacheConfig() {
    return toJsonSafe(await this.data.listCdnCacheConfig?.());
  }

  @Remote("getStorageCustomDomains")
  async getStorageCustomDomains() {
    return toJsonSafe(await this.data.getStorageCustomDomains?.());
  }

  @Remote("listGatewayRoutes")
  async listGatewayRoutes() {
    return toJsonSafe(await this.data.listGatewayRoutes());
  }

  @Remote("upsertGatewayRoute")
  async upsertGatewayRoute(input: Record<string, unknown>): Promise<void> {
    return toJsonSafe(await this.data.upsertGatewayRoute(input as never));
  }

  @Remote("deleteGatewayRoute")
  async deleteGatewayRoute(routeId: string, confirm: boolean): Promise<void> {
    return toJsonSafe(await this.data.deleteGatewayRoute(routeId, confirm));
  }

  @Remote("getGatewayPrivilege")
  async getGatewayPrivilege() {
    return toJsonSafe(await this.data.getGatewayPrivilege());
  }

  @Remote("listGatewayDomains")
  async listGatewayDomains() {
    return toJsonSafe(await this.data.listGatewayDomains?.());
  }

  @Remote("listFunctionNames")
  async listFunctionNames() {
    return toJsonSafe(await this.data.listFunctionNames?.());
  }

  @Remote("setGatewayServiceEnabled")
  async setGatewayServiceEnabled(enable: boolean): Promise<void> {
    return toJsonSafe(await this.data.setGatewayServiceEnabled?.(enable));
  }

  @Remote("setGatewayAuthEnabled")
  async setGatewayAuthEnabled(enable: boolean): Promise<void> {
    return toJsonSafe(await this.data.setGatewayAuthEnabled?.(enable));
  }

  @Remote("fetchMetricSeries")
  async fetchMetricSeries(metricName: string, startTime?: string, endTime?: string, period?: number) {
    return toJsonSafe(await this.data.fetchMetricSeries(metricName, { startTime, endTime, period }));
  }
}
