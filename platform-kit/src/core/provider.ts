import type {
  AccessEndpoint,
  AppAuthConfig,
  AppUser,
  AuthStatus,
  DeploymentRecord,
  EnvInfoView,
  EnvItem,
  GatewayPrivilege,
  GatewayRoute,
  GatewayRouteInput,
  LogEntry,
  LogSearchFilters,
  LogSearchResult,
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
  ColumnSummary,
} from "./types.js";

/**
 * Platform data provider — kit components consume only this interface.
 * CloudBase, custom clouds, or mocks implement the same contract.
 */
export interface PlatformProvider {
  listTables(): Promise<TableSummary[]>;
  listTableColumns(table: string): Promise<ColumnSummary[]>;
  readRows(table: string, opts?: { limit?: number; offset?: number }): Promise<RowPage>;
  runReadSql(sql: string): Promise<RowPage>;
  listStorage(path?: string, opts?: { bucket?: string }): Promise<StorageObject[]>;
  storageUrl(cloudPath: string, opts?: { bucket?: string }): Promise<{ url: string; expiresInSec: number }>;
  /** Host COS listing for static hosting (signed). */
  listHostingObjects?(prefix?: string): Promise<StorageObject[]>;
  uploadStorage?(cloudPath: string, opts?: { bucket?: string; fileBase64?: string; fileName?: string; contentType?: string }): Promise<void>;
  authStatus(): Promise<AuthStatus>;
  /**
   * Begin a login flow.
   * `host-injected` — host already has credentials; return signed-in status.
   * `apikey` — validate envId + apiKey; signedIn only when both are accepted.
   * `device-code` (default) — return verificationUrl + userCode without flipping signedIn.
   */
  startLogin?(method?: string, params?: { envId?: string; apiKey?: string }): Promise<AuthStatus>;
  authStateChange?(listener: (status: AuthStatus) => void): () => void;
  logout?(): Promise<AuthStatus>;
  getAuthLoginConfig?(): Promise<AppAuthConfig>;
  listEnvironments(): Promise<EnvItem[]>;
  setEnvironment(envId: string): Promise<AuthStatus>;
  appAuthConfig(): Promise<AppAuthConfig>;
  listAppUsers(opts?: { limit?: number; offset?: number }): Promise<AppUser[]>;
  listSecrets(): Promise<SecretItem[]>;
  metrics(): Promise<MetricSeries[]>;
  usage(): Promise<UsageItem[]>;
  recentErrors(): Promise<LogEntry[]>;
  envInfo(): Promise<EnvInfoView>;
  /** Live access URLs (v1 = manageApps apps). */
  listAccessEndpoints(): Promise<AccessEndpoint[]>;
  /** Aggregated deployment history across resources. */
  listDeployments(): Promise<DeploymentRecord[]>;
  /** Optional rollback hook — returns false when unsupported. */
  rollbackDeployment?(record: DeploymentRecord): Promise<boolean>;
  /** Raw CAPI escape hatch for P1 resource aggregation. */
  capi?(service: string, action: string, params?: Record<string, unknown>): Promise<unknown>;

  /** CLS log search with pagination context. */
  searchLogs(opts: LogSearchFilters): Promise<LogSearchResult>;
  /** Whether CLS log service is enabled. */
  checkLogService?(): Promise<boolean>;

  /** PG table schema including security metadata. */
  getTableSchema(schemaTable: string): Promise<TableSchemaDetail>;
  /** All RLS policies in a schema. */
  listSchemaPolicies(schema?: string): Promise<PolicySummary[]>;
  /** Execute confirmed PG DDL/DML (RLS, policies). */
  runPgDDL(sql: string, confirm: boolean): Promise<{ ok: boolean; message: string }>;
  /** P1: list functions in schema. */
  listPgFunctions?(schema?: string): Promise<PgFunctionRow[]>;
  /** P1: list installed extensions. */
  listPgExtensions?(): Promise<PgExtensionRow[]>;
  /** P1: list database roles. */
  listPgRoles?(): Promise<PgRoleRow[]>;
  /** P1: list applied migrations. */
  listMigrations?(): Promise<PgMigrationRow[]>;
  /** @deprecated use listMigrations */
  listPgMigrations?(): Promise<PgMigrationRow[]>;
  listSchemas?(): Promise<Array<{ name: string; owner?: string }>>;
  listTriggers?(schema?: string): Promise<Array<{ schema: string; table: string; name: string; definition?: string }>>;
  listTypes?(schema?: string): Promise<Array<{ schema: string; name: string; definition?: string }>>;
  listColumnPrivileges?(schemaTable: string): Promise<Array<{ grantee: string; columnName: string; privilegeType: string }>>;
  /** Create or alter RLS policy. */
  upsertPolicy?(input: PolicyInput & { previousName?: string }, confirm: boolean): Promise<void>;
  /** Drop RLS policy. */
  dropPolicy?(schemaTable: string, policyName: string, confirm: boolean): Promise<void>;
  /** Toggle table RLS. */
  toggleTableRls?(schemaTable: string, enable: boolean, confirm: boolean): Promise<void>;

  /** App users with optional keyword filter server-side. */
  searchAppUsers(opts?: {
    keyword?: string;
    pageNo?: number;
    pageSize?: number;
  }): Promise<{ users: AppUser[]; total?: number }>;
  setAppUserStatus(uid: string, enabled: boolean): Promise<void>;

  listGatewayRoutes(): Promise<GatewayRoute[]>;
  upsertGatewayRoute(input: GatewayRouteInput): Promise<void>;
  deleteGatewayRoute(routeId: string, confirm: boolean): Promise<void>;
  getGatewayPrivilege(): Promise<GatewayPrivilege>;
  listCustomDomains?(): Promise<Array<{ domain: string; status: string; accessType?: string; certificateId?: string; cnameTarget?: string; createdAt?: string }>>;
  listSslCertificates?(): Promise<Array<{ id: string; name: string; status?: string }>>;
  listAuthDomains?(): Promise<Array<{ domain: string; id?: string; status?: string }>>;
  bindCustomDomain?(input: { domain: string; certId?: string; cnameDomain?: string; accessType?: string; description?: string }): Promise<void>;
  deleteCustomDomain?(domain: string, confirm: boolean): Promise<void>;
  listSafetyDomains?(): Promise<Array<{ id: string; appName: string }>>;
  getStorageSecurityRules?(bucket?: string): Promise<{ aclTag: string; rule?: string }>;
  setStorageSecurityRules?(rules: { aclTag: string; rule?: string; bucket?: string }): Promise<void>;
  listCdnCacheConfig?(bucket?: string): Promise<{ status: string }>;
  listCdnCacheItems?(bucket?: string): Promise<import("./types.js").CdnCacheItem[]>;
  listStorageBuckets?(): Promise<import("./types.js").StorageBucket[]>;
  createStorageBucket?(name: string): Promise<void>;
  deleteStorageBucket?(name: string, confirm: boolean): Promise<void>;

  listFunctions?(opts?: { searchKey?: string; limit?: number; offset?: number }): Promise<import("./types.js").CloudFunctionSummary[]>;
  getFunction?(name: string): Promise<import("./types.js").CloudFunctionDetail>;
  listFunctionTriggers?(name: string): Promise<import("./types.js").CloudFunctionTrigger[]>;
  listFunctionLogs?(name: string, opts?: { limit?: number }): Promise<import("./types.js").CloudFunctionLog[]>;
  invokeFunction?(name: string, payload?: string): Promise<{ result: string; unsupportedReason?: string }>;

  listCloudRunServices?(): Promise<import("./types.js").CloudRunService[]>;
  getCloudRunService?(name: string): Promise<{ service: import("./types.js").CloudRunService; versions: import("./types.js").CloudRunVersion[] }>;
  listCloudRunDeployRecords?(name: string): Promise<import("./types.js").CloudRunDeployRecord[]>;
  getCloudRunProcessLog?(name: string, runId?: string): Promise<import("./types.js").CloudRunLogLine[]>;
  getCloudRunBuildLog?(name: string, buildId?: string): Promise<{ text: string; unsupportedReason?: string }>;

  listHostingDomains?(): Promise<import("./types.js").HostingDomain[]>;
  listHostingVersions?(): Promise<import("./types.js").HostingVersion[]>;
  getStorageCustomDomains?(): Promise<Array<{ domain: string; status?: string }>>;
  /** @deprecated use listCustomDomains */
  listGatewayDomains?(): Promise<string[]>;
  listFunctionNames?(): Promise<string[]>;
  setGatewayServiceEnabled?(enable: boolean): Promise<void>;
  setGatewayAuthEnabled?(enable: boolean): Promise<void>;

  fetchMetricSeries(metricName: string, opts?: MetricQueryOpts): Promise<MetricSeries>;
}

export const KIT_EVENTS = {
  envBound: "cloudbase-dsh:env-bound",
  envChanging: "cloudbase-dsh:env-changing",
  envChanged: "cloudbase-dsh:env-changed",
  activatePreview: "cloudbase-dsh:activate-preview",
  recentDeploys: "cloudbase-dsh:recent-deploys",
} as const;

export type KitEventName = (typeof KIT_EVENTS)[keyof typeof KIT_EVENTS];
