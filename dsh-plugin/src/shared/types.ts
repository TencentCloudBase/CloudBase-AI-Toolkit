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

export interface AuthStatus {
  signedIn: boolean;
  envId?: string;
  authMode?: string;
  persisted: boolean;
  tempCredentialsAvailable: boolean;
  verificationUrl?: string;
  userCode?: string;
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
  createdAt?: string;
  lastLoginAt?: string;
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
}

export interface LogEntry {
  title: string;
  time?: string;
  level: "error" | "warn" | "info";
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
}

export interface DeployPreview {
  domain?: string;
  url?: string;
  deployedAt?: string;
  statusLabel: string;
  files?: string[];
}

/** @typert object */
export interface CloudBaseData {
  listTables(): Promise<TableSummary[]>;
  listTableColumns(table: string): Promise<ColumnSummary[]>;
  listAppUsers(opts?: { limit?: number; offset?: number }): Promise<AppUser[]>;
  listSecrets(): Promise<SecretItem[]>;
  readRows(table: string, opts?: { limit?: number; offset?: number }): Promise<RowPage>;
  runReadSql(sql: string): Promise<RowPage>;
  listStorage(path?: string): Promise<StorageObject[]>;
  storageUrl(cloudPath: string): Promise<{ url: string; expiresInSec: number }>;
  authStatus(): Promise<AuthStatus>;
  /** 发起 device-code 登录（auth start_auth device），返回验证 URL 与用户码。 */
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
  /** 从指定会话工具历史读取最近一次 auth set_env 的环境 ID（未绑定返回 undefined）。 */
  sessionBoundEnv(sessionId?: string): Promise<string | undefined>;
}
