export type ResourceType = "app" | "hosting" | "function" | "cloudrun" | "gateway";

export interface AccessEndpoint {
  id: string;
  label: string;
  url: string;
  resourceType: ResourceType;
  serviceName?: string;
}

export type DeploymentStatus = "success" | "failed" | "building" | "pending" | "unknown";

export interface DeploymentRelatedResource {
  type: string;
  name: string;
}

export interface DeploymentRecord {
  id: string;
  resourceType: ResourceType | string;
  resourceName: string;
  status: DeploymentStatus;
  deployedAt?: string;
  previewUrl?: string;
  buildId?: string;
  versionName?: string;
  relatedResources?: DeploymentRelatedResource[];
}

export interface EnvFeatureContext {
  envId?: string;
  runtimeMode?: string;
  isPostgresEnv?: boolean;
}

export type TableKind = "table" | "view" | "function";

export interface TableSummary {
  name: string;
  schema: string;
  kind: TableKind;
  columnCount?: number;
  rowCount?: number;
}

export interface ColumnSummary {
  name: string;
  type: string;
  dataType: string;
  nullable: boolean;
  isUpdatable: boolean;
  primaryKey: boolean;
}

export interface RowPage {
  columns: string[];
  rows: Record<string, unknown>[];
  total?: number;
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
  message: string;
  /** Login method that produced this status, when known. */
  authMode?: LoginMethod | string;
  /** True when credentials are persisted by the host (not only in-memory). */
  persisted?: boolean;
  /** True when short-lived host credentials are available. */
  tempCredentialsAvailable?: boolean;
  /** Browser URL for device-code verification. */
  verificationUrl?: string;
  /** User-facing device code shown alongside verificationUrl. */
  userCode?: string;
  /** Methods the host can offer when signedIn is false. */
  loginOptions?: LoginOption[];
}

export interface EnvItem {
  envId: string;
  alias?: string;
  region?: string;
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
  /** @deprecated use message */
  title?: string;
  raw?: Record<string, unknown>;
}

export interface LogSearchFilters {
  queryString: string;
  service?: "tcb" | "tcbr" | "";
  level?: "all" | "error" | "warn" | "info";
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

export interface PolicyInput {
  name: string;
  schemaTable: string;
  command: string;
  roles: string[];
  using?: string;
  withCheck?: string;
  permissive?: boolean;
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

export interface MetricQueryOpts {
  startTime?: string;
  endTime?: string;
  period?: number;
}

export interface EnvInfoView {
  envId: string;
  regionLabel: string;
  functionCount: number;
  hostingDomainCount: number;
  timezone: string;
  alias?: string;
  runtimeMode?: string;
}

export interface AppAuthConfig {
  providers: Array<{ name: string; enabled: boolean }>;
  userCount?: number;
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

export interface CloudFunctionSummary {
  name: string;
  runtime?: string;
  status?: string;
  invokeCount?: number;
  updatedAt?: string;
}

export interface CloudFunctionDetail extends CloudFunctionSummary {
  handler?: string;
  timeout?: number;
  memorySize?: number;
  description?: string;
  environment: Array<{ key: string; value: string }>;
  triggers: CloudFunctionTrigger[];
}

export interface CloudFunctionTrigger {
  name: string;
  type: string;
  triggerDesc?: string;
}

export interface CloudFunctionLog {
  requestId?: string;
  time?: string;
  durationMs?: number;
  message: string;
}

export interface CloudRunService {
  name: string;
  status?: string;
  version?: string;
  traffic?: string;
  cpu?: string;
  memory?: string;
  instanceCount?: number;
}

export interface CloudRunVersion {
  versionName: string;
  status?: string;
  deployedAt?: string;
  flowRatio?: number;
}

export interface CloudRunDeployRecord {
  id: string;
  status?: string;
  deployedAt?: string;
  buildId?: string;
  runId?: string;
}

export interface CloudRunLogLine {
  time?: string;
  message: string;
}

export interface HostingDomain {
  domain: string;
  status?: string;
  kind?: "default" | "custom" | "app";
}

export interface HostingVersion {
  serviceName: string;
  versionName: string;
  status?: string;
  deployedAt?: string;
}

export interface StorageBucket {
  name: string;
  region?: string;
  createdAt?: string;
  sizeLabel?: string;
  cdnDomain?: string;
  kind?: "storage" | "hosting";
}

export interface StorageSecurityRule {
  aclTag: string;
  rule?: string;
}

export interface CdnCacheItem {
  id: string;
  status: string;
  bucket?: string;
}
