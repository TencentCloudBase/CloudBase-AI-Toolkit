export type TableKind = "table" | "view" | "function";

export interface TableSummary {
  name: string;
  schema: string;
  kind: TableKind;
  columnCount?: number;
  rowCount?: number;
  owner?: string;
  size?: string;
  columns?: ColumnSummary[];
}

export interface ColumnSummary {
  name: string;
  type: string;
  dataType: string;
  nullable: boolean;
  isUpdatable: boolean;
  primaryKey: boolean;
  enums?: string[];
}

export interface RowPage {
  columns: string[];
  rows: Record<string, unknown>[];
  total?: number;
  elapsedMs?: number;
}

export interface StorageObject {
  name: string;
  cloudPath: string;
  size: number;
  sizeLabel: string;
  updatedAt?: string;
  isDirectory: boolean;
}

export type LoginMethod = "device-code" | "apikey" | "host-injected";

export interface LoginOption {
  method: LoginMethod;
  title: string;
  description?: string;
}

export interface AuthStatus {
  signedIn: boolean;
  envId?: string;
  authMode?: LoginMethod | string;
  persisted: boolean;
  tempCredentialsAvailable: boolean;
  verificationUrl?: string;
  userCode?: string;
  loginOptions?: LoginOption[];
  message: string;
}

export interface EnvItem {
  envId: string;
  alias?: string;
  region?: string;
  status?: string;
  envType?: string;
}

/** Session-scoped env binding tracked by the host bridge (in-memory only). */
export interface BoundEnvEntry {
  sessionId: string;
  envId: string;
  alias?: string;
  updatedAt: number;
}

/** Result of auth action=list_bound_envs (also exposed via session cache). */
export interface ListBoundEnvsResult {
  bound: BoundEnvEntry[];
  current?: BoundEnvEntry;
}

export interface AppAuthProvider {
  name: string;
  enabled: boolean;
}

export interface AppAuthConfig {
  providers: AppAuthProvider[];
  userCount?: number;
  lastLoginAt?: string;
}

export interface AppUser {
  uid: string;
  name?: string;
  email?: string;
  phone?: string;
  createdAt?: string;
  lastLoginAt?: string;
  status?: "normal" | "disabled";
}

export interface SecretItem {
  source: string;
  sourceKind: "function" | "cloudrun";
  key: string;
  valueMasked: string;
}

export interface MetricSeries {
  name: string;
  label: string;
  valueLabel: string;
  points: number[];
  danger?: boolean;
}

export interface UsageItem {
  productName: string;
  usedLabel: string;
  quotaLabel?: string;
  progress?: number;
}

export interface LogEntry {
  id?: string;
  time?: string;
  level: "error" | "warn" | "info" | "debug";
  service?: string;
  message: string;
  title?: string;
  raw?: Record<string, unknown>;
}

export interface LogSearchFilters {
  queryString: string;
  service?: "tcb" | "tcbr";
  startTime?: string;
  endTime?: string;
  limit?: number;
  sort?: "asc" | "desc";
  context?: string;
}

export interface LogSearchResult {
  entries: LogEntry[];
  context?: string;
}

export interface PolicySummary {
  name: string;
  schema?: string;
  table?: string;
  permissive?: string;
  roles: string[];
  command: string;
  using?: string;
  withCheck?: string;
}

export interface PolicyInput {
  name: string;
  schemaTable: string;
  command: string;
  roles: string[];
  using?: string;
  withCheck?: string;
  permissive?: boolean;
}

export interface TableSchemaDetail {
  schemaTable: string;
  kind: string;
  rowCount?: number | null;
  columns: ColumnSummary[];
  primaryKey: string[];
  indexes: { name: string; definition: string }[];
  foreignKeys: {
    constraintName: string;
    columnName: string;
    references: string;
    referencedColumn: string;
  }[];
  security: {
    rowLevelSecurityEnabled: boolean;
    forceRowLevelSecurity: boolean;
    policies: PolicySummary[];
  };
}

export interface PgFunctionRow {
  name: string;
  schema: string;
  returnType?: string;
  language?: string;
}

export interface PgExtensionRow {
  name: string;
  schema?: string;
  version?: string;
}

export interface PgRoleRow {
  name: string;
  superuser?: boolean;
  canLogin?: boolean;
}

export interface PgMigrationRow {
  version: string;
  name?: string;
  appliedAt?: string;
  sql?: string;
}

export interface GatewayRoute {
  routeId?: string;
  domain: string;
  path: string;
  upstreamResourceType: string;
  upstreamResourceName: string;
  enableAuth?: boolean;
  enable?: boolean;
  domainType?: string;
}

export interface GatewayRouteInput {
  routeId?: string;
  domain: string;
  path: string;
  upstreamResourceType: string;
  upstreamResourceName: string;
  enableAuth?: boolean;
  enablePathTransmission?: boolean;
  enable?: boolean;
}

export interface GatewayPrivilege {
  enableService?: boolean;
  enableAuth?: boolean;
}

export interface EnvInfoView {
  envId: string;
  regionLabel: string;
  regionCode?: string;
  functionCount: number;
  hostingDomainCount: number;
  timezone: string;
  alias?: string;
  runtimeMode?: string;
  /** Derived from RuntimeMode / PostgreSQL[] / Meta; preferred over guessing runtimeMode alone. */
  isPostgresEnv?: boolean;
}

export interface DeployPreview {
  domain?: string;
  url?: string;
  deployedAt?: string;
  statusLabel: string;
  files?: string[];
}

export type ResourceType = "app" | "hosting" | "function" | "cloudrun" | "gateway";

export interface AccessEndpoint {
  id: string;
  label: string;
  url: string;
  resourceType: ResourceType;
  serviceName?: string;
}

export type DeploymentStatus = "success" | "failed" | "building" | "pending" | "unknown";

export interface DeploymentRecord {
  id: string;
  resourceType: ResourceType | string;
  resourceName: string;
  status: DeploymentStatus;
  deployedAt?: string;
  previewUrl?: string;
  buildId?: string;
  versionName?: string;
  relatedResources?: Array<{ type: string; name: string }>;
}

/** @typert object */
export interface CloudBaseData {
  listTables(): Promise<TableSummary[]>;
  listTableColumns(table: string): Promise<ColumnSummary[]>;
  listAppUsers(opts?: { limit?: number; offset?: number }): Promise<AppUser[]>;
  searchAppUsers(opts?: {
    keyword?: string;
    pageNo?: number;
    pageSize?: number;
  }): Promise<{ users: AppUser[]; total?: number }>;
  setAppUserStatus(uid: string, enabled: boolean): Promise<void>;
  checkLogService(): Promise<boolean>;
  searchLogs(opts: LogSearchFilters): Promise<LogSearchResult>;
  getTableSchema(schemaTable: string): Promise<TableSchemaDetail>;
  listSchemaPolicies(schema?: string): Promise<PolicySummary[]>;
  runPgDDL(sql: string, confirm: boolean): Promise<{ ok: boolean; message: string }>;
  listPgFunctions?(schema?: string): Promise<PgFunctionRow[]>;
  listPgExtensions?(): Promise<PgExtensionRow[]>;
  listPgRoles?(): Promise<PgRoleRow[]>;
  listMigrations?(): Promise<PgMigrationRow[]>;
  /** @deprecated use listMigrations */
  listPgMigrations?(): Promise<PgMigrationRow[]>;
  listSchemas?(): Promise<Array<{ name: string; owner?: string }>>;
  listTriggers?(schema?: string): Promise<Array<{ schema: string; table: string; name: string; definition?: string }>>;
  listTypes?(schema?: string): Promise<Array<{ schema: string; name: string; definition?: string }>>;
  listColumnPrivileges?(schemaTable: string): Promise<Array<{ grantee: string; columnName: string; privilegeType: string }>>;
  upsertPolicy?(input: PolicyInput & { previousName?: string }, confirm: boolean): Promise<void>;
  dropPolicy?(schemaTable: string, policyName: string, confirm: boolean): Promise<void>;
  toggleTableRls?(schemaTable: string, enable: boolean, confirm: boolean): Promise<void>;
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
  listCdnCacheItems?(bucket?: string): Promise<Array<{ id: string; status: string; bucket?: string }>>;
  listStorageBuckets?(): Promise<Array<{ name: string; region?: string; createdAt?: string; sizeLabel?: string; cdnDomain?: string; kind?: "storage" | "hosting" }>>;
  createStorageBucket?(name: string): Promise<void>;
  deleteStorageBucket?(name: string, confirm: boolean): Promise<void>;
  listFunctions?(opts?: { searchKey?: string; limit?: number; offset?: number }): Promise<Array<{ name: string; runtime?: string; status?: string; invokeCount?: number; updatedAt?: string }>>;
  getFunction?(name: string): Promise<{
    name: string;
    runtime?: string;
    status?: string;
    handler?: string;
    environment: Array<{ key: string; value: string }>;
    triggers: Array<{ name: string; type: string; triggerDesc?: string }>;
  }>;
  listFunctionTriggers?(name: string): Promise<Array<{ name: string; type: string; triggerDesc?: string }>>;
  listFunctionLogs?(name: string, opts?: { limit?: number }): Promise<Array<{ requestId?: string; time?: string; message: string }>>;
  invokeFunction?(name: string, payload?: string): Promise<{ result: string; unsupportedReason?: string }>;
  listCloudRunServices?(): Promise<Array<{ name: string; status?: string; version?: string; traffic?: string; cpu?: string; memory?: string; instanceCount?: number }>>;
  getCloudRunService?(name: string): Promise<{
    service: { name: string; status?: string; version?: string };
    versions: Array<{ versionName: string; status?: string; deployedAt?: string }>;
  }>;
  listCloudRunDeployRecords?(name: string): Promise<Array<{ id: string; status?: string; deployedAt?: string; runId?: string; buildId?: string }>>;
  getCloudRunProcessLog?(name: string, runId?: string): Promise<Array<{ time?: string; message: string }>>;
  getCloudRunBuildLog?(name: string, buildId?: string): Promise<{ text: string; unsupportedReason?: string }>;
  listHostingDomains?(): Promise<Array<{ domain: string; status?: string; kind?: "default" | "custom" | "app" }>>;
  listHostingVersions?(): Promise<Array<{ serviceName: string; versionName: string; status?: string; deployedAt?: string }>>;
  getStorageCustomDomains?(): Promise<Array<{ domain: string; status?: string }>>;
  /** @deprecated use listCustomDomains */
  listGatewayDomains?(): Promise<string[]>;
  listFunctionNames?(): Promise<string[]>;
  setGatewayServiceEnabled?(enable: boolean): Promise<void>;
  setGatewayAuthEnabled?(enable: boolean): Promise<void>;
  fetchMetricSeries(
    metricName: string,
    opts?: { startTime?: string; endTime?: string; period?: number },
  ): Promise<MetricSeries>;
  listSecrets(): Promise<SecretItem[]>;
  readRows(table: string, opts?: { limit?: number; offset?: number }): Promise<RowPage>;
  runReadSql(sql: string): Promise<RowPage>;
  listStorage(path?: string, opts?: { bucket?: string }): Promise<StorageObject[]>;
  storageUrl(cloudPath: string, opts?: { bucket?: string }): Promise<{ url: string; expiresInSec: number }>;
  listHostingObjects?(prefix?: string): Promise<StorageObject[]>;
  uploadStorage?(
    cloudPath: string,
    opts?: { bucket?: string; fileBase64?: string; fileName?: string; contentType?: string },
  ): Promise<void>;
  authStatus(): Promise<AuthStatus>;
  startLogin?(method?: LoginMethod, params?: { envId?: string; apiKey?: string }): Promise<AuthStatus>;
  authStateChange?(listener: (status: AuthStatus) => void): () => void;
  logout?(): Promise<AuthStatus>;
  getAuthLoginConfig?(): Promise<AppAuthConfig>;
  /** @deprecated use startLogin('device-code') */
  startAuth(): Promise<AuthStatus>;
  /** 登录后列出账号下可用环境（auth status 的 env_candidates）。未登录返回空数组。 */
  listEnvironments(): Promise<EnvItem[]>;
  /** 选中环境：auth set_env envId=xxx。返回设置后的 auth status。 */
  setEnvironment(envId: string): Promise<AuthStatus>;
  appAuthConfig(): Promise<AppAuthConfig>;
  metrics(): Promise<MetricSeries[]>;
  usage(): Promise<UsageItem[]>;
  recentErrors(): Promise<LogEntry[]>;
  envInfo(): Promise<EnvInfoView>;
  appendToSession(text: string): Promise<void>;
  /** 直调腾讯云控制面 API（MCP capi / callCloudApi）。输出为解包后的 JSON。 */
  capi(service: string, action: string, params?: Record<string, unknown>): Promise<unknown>;
  /** Live access URLs (v1 = manageApps / queryApps apps). */
  listAccessEndpoints(): Promise<AccessEndpoint[]>;
  /** Aggregated deployment records (apps + hosting + cloudrun when available). */
  listDeployments(): Promise<DeploymentRecord[]>;
  /** Optional rollback for supported deployment types. */
  rollbackDeployment?(record: DeploymentRecord): Promise<boolean>;
  /** 从指定会话工具历史读取最近一次 auth set_env 的环境 ID（未绑定返回 undefined）。 */
  sessionBoundEnv(sessionId?: string): Promise<string | undefined>;
}
