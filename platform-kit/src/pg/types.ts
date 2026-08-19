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

export interface PolicyEditInput extends PolicyInput {
  previousName?: string;
}
