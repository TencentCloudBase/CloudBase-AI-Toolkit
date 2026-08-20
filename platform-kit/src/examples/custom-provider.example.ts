/**
 * Copy-and-adapt this file to plug @cloudbase/platform-kit into any backend.
 *
 * Kit components never call CloudBase-specific MCP tools. Data goes through
 * `capi(service, action, params)` (or equivalent HTTP). Comments on each
 * method name the CloudBase CAPI action used by the reference adapter
 * (`dsh-plugin/src/server/data-service.ts`).
 */
import type { PlatformProvider } from "../core/provider.js";
import type {
  AccessEndpoint,
  AppAuthConfig,
  AppUser,
  AuthStatus,
  ColumnSummary,
  DeploymentRecord,
  EnvInfoView,
  EnvItem,
  GatewayPrivilege,
  GatewayRoute,
  GatewayRouteInput,
  LogEntry,
  LogSearchFilters,
  LogSearchResult,
  LoginOption,
  MetricQueryOpts,
  MetricSeries,
  PgExtensionRow,
  PgFunctionRow,
  PgMigrationRow,
  PgRoleRow,
  PolicyInput,
  PolicySummary,
  RowPage,
  SecretItem,
  StorageObject,
  TableSchemaDetail,
  TableSummary,
  UsageItem,
} from "../core/types.js";

const LOGIN_OPTIONS: LoginOption[] = [
  { method: "device-code", title: "Device code", description: "OAuth device authorization flow" },
  { method: "apikey", title: "API Key", description: "Environment API Key login" },
];

const MOCK_API_KEY = "mock-key";

function signedOut(message: string): AuthStatus {
  return {
    signedIn: false,
    persisted: false,
    tempCredentialsAvailable: false,
    loginOptions: LOGIN_OPTIONS,
    message,
  };
}

function signedIn(envId: string, message: string, extra?: Partial<AuthStatus>): AuthStatus {
  return {
    signedIn: true,
    envId,
    persisted: true,
    tempCredentialsAvailable: false,
    message,
    ...extra,
  };
}

const emptyPage: RowPage = { columns: ["id"], rows: [], total: 0 };

/**
 * In-memory PlatformProvider. Safe to copy into a host app and replace
 * `capi()` with a real Cloud API / MCP bridge.
 */
export class MockPlatformProvider implements PlatformProvider {
  private envId = "mock-env-001";
  private session: AuthStatus = signedOut("未登录，请选择登录方式");
  private listeners = new Set<(status: AuthStatus) => void>();

  /** Raw CAPI escape hatch. CloudBase uses service `tcb` + action name. */
  async capi(service: string, action: string, params: Record<string, unknown> = {}): Promise<unknown> {
    return { service, action, params, mock: true };
  }

  /** Valid credentials = signedIn true after host-injected / accepted apikey. */
  async authStatus(): Promise<AuthStatus> {
    return this.session;
  }

  /**
   * Three login modes:
   * - host-injected → passthrough (host already authenticated)
   * - apikey → require envId + apiKey === "mock-key"
   * - device-code → return verificationUrl + userCode (signedIn stays false)
   */
  async startLogin(
    method: string = "device-code",
    params?: { envId?: string; apiKey?: string },
  ): Promise<AuthStatus> {
    if (method === "host-injected") {
      this.session = signedIn(this.envId, "host-injected session", { authMode: "host-injected" });
      this.emit();
      return this.session;
    }
    if (method === "apikey") {
      if (!params?.envId || params.apiKey !== MOCK_API_KEY) {
        this.session = signedOut("API Key 登录需要 envId 与有效 apiKey");
        this.emit();
        return this.session;
      }
      this.envId = params.envId;
      this.session = signedIn(this.envId, "apikey ok", { authMode: "apikey" });
      this.emit();
      return this.session;
    }
    this.session = {
      ...signedOut("请在浏览器完成 device-code 授权"),
      authMode: "device-code",
      verificationUrl: "https://example.com/device",
      userCode: "ABCD-1234",
    };
    this.emit();
    return this.session;
  }

  authStateChange(listener: (status: AuthStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.session);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async logout(): Promise<AuthStatus> {
    this.session = signedOut("已退出登录");
    this.emit();
    return this.session;
  }

  // capi tcb DescribeEnvs
  async listEnvironments(): Promise<EnvItem[]> {
    return [{ envId: this.envId, alias: "mock", region: "ap-shanghai" }];
  }

  async setEnvironment(envId: string): Promise<AuthStatus> {
    this.envId = envId;
    this.session = { ...this.session, envId };
    this.emit();
    return this.session;
  }

  // capi tcb DescribeEnvs + DescribeFunctions + DescribeHostingDomain
  async envInfo(): Promise<EnvInfoView> {
    return {
      envId: this.envId,
      regionLabel: "Shanghai",
      functionCount: 0,
      hostingDomainCount: 0,
      timezone: "Asia/Shanghai",
      alias: "mock",
      runtimeMode: "postgresql",
    };
  }

  // capi tcb ExecutePGSql (list tables)
  async listTables(): Promise<TableSummary[]> {
    return [];
  }

  async listTableColumns(_table: string): Promise<ColumnSummary[]> {
    return [];
  }

  async readRows(_table: string, _opts?: { limit?: number; offset?: number }): Promise<RowPage> {
    return emptyPage;
  }

  async runReadSql(_sql: string): Promise<RowPage> {
    return { columns: ["ok"], rows: [{ ok: 1 }], total: 1 };
  }

  async listStorage(_path?: string): Promise<StorageObject[]> {
    return [];
  }

  async storageUrl(cloudPath: string): Promise<{ url: string; expiresInSec: number }> {
    return { url: `https://example.com/${cloudPath}`, expiresInSec: 600 };
  }

  // capi tcb DescribeAppAuth
  async appAuthConfig(): Promise<AppAuthConfig> {
    return { providers: [{ name: "anonymous", enabled: true }], userCount: 0 };
  }

  async getAuthLoginConfig(): Promise<AppAuthConfig> {
    return this.appAuthConfig();
  }

  async listAppUsers(_opts?: { limit?: number; offset?: number }): Promise<AppUser[]> {
    return [];
  }

  // capi tcb DescribeUserList
  async searchAppUsers(_opts?: {
    keyword?: string;
    pageNo?: number;
    pageSize?: number;
  }): Promise<{ users: AppUser[]; total?: number }> {
    return { users: [], total: 0 };
  }

  // capi tcb ModifyUser
  async setAppUserStatus(_uid: string, _enabled: boolean): Promise<void> {}

  async listSecrets(): Promise<SecretItem[]> {
    return [];
  }

  // capi tcb DescribeCurveData
  async metrics(): Promise<MetricSeries[]> {
    return [];
  }

  async fetchMetricSeries(metricName: string, _opts?: MetricQueryOpts): Promise<MetricSeries> {
    return { name: metricName, label: metricName, valueLabel: "0", points: [] };
  }

  // capi tcb DescribeUsage
  async usage(): Promise<UsageItem[]> {
    return [];
  }

  async recentErrors(): Promise<LogEntry[]> {
    return [];
  }

  // capi tcb DescribeCloudAppList / DescribeHostingDomain
  async listAccessEndpoints(): Promise<AccessEndpoint[]> {
    return [];
  }

  async listDeployments(): Promise<DeploymentRecord[]> {
    return [];
  }

  async rollbackDeployment(_record: DeploymentRecord): Promise<boolean> {
    return false;
  }

  // capi tcb SearchClsLog
  async searchLogs(_opts: LogSearchFilters): Promise<LogSearchResult> {
    return { entries: [] };
  }

  async checkLogService(): Promise<boolean> {
    return true;
  }

  async getTableSchema(schemaTable: string): Promise<TableSchemaDetail> {
    return {
      schemaTable,
      kind: "table",
      columns: [],
      primaryKey: [],
      indexes: [],
      foreignKeys: [],
      security: { rowLevelSecurityEnabled: false, forceRowLevelSecurity: false, policies: [] },
    };
  }

  async listSchemaPolicies(_schema?: string): Promise<PolicySummary[]> {
    return [];
  }

  // capi tcb ExecutePGSql (confirmed DDL)
  async runPgDDL(_sql: string, confirm: boolean): Promise<{ ok: boolean; message: string }> {
    if (!confirm) return { ok: false, message: "confirm required" };
    return { ok: true, message: "OK" };
  }

  async listPgFunctions(_schema?: string): Promise<PgFunctionRow[]> {
    return [];
  }

  async listPgExtensions(): Promise<PgExtensionRow[]> {
    return [];
  }

  async listPgRoles(): Promise<PgRoleRow[]> {
    return [];
  }

  async listMigrations(): Promise<PgMigrationRow[]> {
    return [];
  }

  async listPgMigrations(): Promise<PgMigrationRow[]> {
    return this.listMigrations();
  }

  async listSchemas(): Promise<Array<{ name: string; owner?: string }>> {
    return [{ name: "public" }];
  }

  async listTriggers(_schema?: string): Promise<Array<{ schema: string; table: string; name: string; definition?: string }>> {
    return [];
  }

  async listTypes(_schema?: string): Promise<Array<{ schema: string; name: string; definition?: string }>> {
    return [];
  }

  async listColumnPrivileges(
    _schemaTable: string,
  ): Promise<Array<{ grantee: string; columnName: string; privilegeType: string }>> {
    return [];
  }

  async upsertPolicy(_input: PolicyInput & { previousName?: string }, _confirm: boolean): Promise<void> {}

  async dropPolicy(_schemaTable: string, _policyName: string, _confirm: boolean): Promise<void> {}

  async toggleTableRls(_schemaTable: string, _enable: boolean, _confirm: boolean): Promise<void> {}

  // capi tcb DescribeHTTPServiceRoute
  async listGatewayRoutes(): Promise<GatewayRoute[]> {
    return [];
  }

  // capi tcb CreateHTTPServiceRoute / ModifyHTTPServiceRoute
  async upsertGatewayRoute(_input: GatewayRouteInput): Promise<void> {}

  // capi tcb DeleteHTTPServiceRoute
  async deleteGatewayRoute(_routeId: string, confirm: boolean): Promise<void> {
    if (!confirm) throw new Error("confirm required");
  }

  // capi tcb DescribeCloudBaseGWService
  async getGatewayPrivilege(): Promise<GatewayPrivilege> {
    return { enableService: true, enableAuth: false };
  }

  // capi tcb DescribePublicGwDomains
  async listCustomDomains(): Promise<
    Array<{ domain: string; status: string; accessType?: string; certificateId?: string; cnameTarget?: string; createdAt?: string }>
  > {
    return [];
  }

  async listGatewayDomains(): Promise<string[]> {
    return [];
  }

  // capi tcb CreatePublicGwCustomDomain / BindPublicGwCustomDomain
  async bindCustomDomain(_input: {
    domain: string;
    certId?: string;
    cnameDomain?: string;
    accessType?: string;
    description?: string;
  }): Promise<void> {}

  // capi tcb UnbindPublicGwCustomDomain
  async deleteCustomDomain(_domain: string, confirm: boolean): Promise<void> {
    if (!confirm) throw new Error("confirm required");
  }

  async listSafetyDomains(): Promise<Array<{ id: string; appName: string }>> {
    return [];
  }

  async getStorageSecurityRules(): Promise<{ aclTag: string; rule?: string }> {
    return { aclTag: "READONLY" };
  }

  async setStorageSecurityRules(_rules: { aclTag: string; rule?: string }): Promise<void> {}

  async listCdnCacheConfig(): Promise<{ status: string }> {
    return { status: "unknown" };
  }

  async getStorageCustomDomains(): Promise<Array<{ domain: string; status?: string }>> {
    return [];
  }

  async listFunctionNames(): Promise<string[]> {
    return [];
  }

  // capi tcb ModifyCloudBaseGWPrivilege
  async setGatewayServiceEnabled(_enable: boolean): Promise<void> {}

  async setGatewayAuthEnabled(_enable: boolean): Promise<void> {}

  private emit(): void {
    for (const listener of this.listeners) listener(this.session);
  }
}

export function createMockPlatformProvider(): PlatformProvider {
  return new MockPlatformProvider();
}
