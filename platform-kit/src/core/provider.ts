import type {
  AccessEndpoint,
  AppAuthConfig,
  AppUser,
  AuthStatus,
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
  listStorage(path?: string): Promise<StorageObject[]>;
  storageUrl(cloudPath: string): Promise<{ url: string; expiresInSec: number }>;
  authStatus(): Promise<AuthStatus>;
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
}

export const KIT_EVENTS = {
  envBound: "cloudbase-dsh:env-bound",
  envChanging: "cloudbase-dsh:env-changing",
  envChanged: "cloudbase-dsh:env-changed",
  activatePreview: "cloudbase-dsh:activate-preview",
  recentDeploys: "cloudbase-dsh:recent-deploys",
} as const;

export type KitEventName = (typeof KIT_EVENTS)[keyof typeof KIT_EVENTS];
