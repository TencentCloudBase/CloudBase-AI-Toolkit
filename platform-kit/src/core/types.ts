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

export interface AuthStatus {
  signedIn: boolean;
  envId?: string;
  message: string;
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
}

export interface LogEntry {
  title: string;
  time?: string;
  level: "error" | "warn" | "info";
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
}

export interface SecretItem {
  source: string;
  sourceKind: "function" | "cloudrun";
  key: string;
  valueMasked: string;
}
