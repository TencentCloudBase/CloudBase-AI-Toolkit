import { parseDdlImpact, type DdlImpactSummary } from "../../shared/sql-ident.js";
import { parseArgsFromBlock, stripToolPrefix } from "./toolview-routing.js";
import { unwrapBlockPayload, type ToolBlock } from "./parse-tool-result.js";

function rec(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arr(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function sqlFromBlock(block?: ToolBlock): string | undefined {
  const args = parseArgsFromBlock(block);
  return str(args.sql) ?? str(args.statement);
}

export function ddlImpactFromBlock(block?: ToolBlock): DdlImpactSummary {
  const sql = sqlFromBlock(block) ?? "";
  return parseDdlImpact(sql);
}

export interface MutationSummary {
  sql: string;
  rowCount?: number;
  verb: string;
  elapsed?: string;
}

export function mutationFromBlock(block?: ToolBlock): MutationSummary {
  const sql = sqlFromBlock(block) ?? "";
  const payload = rec(unwrapBlockPayload(block));
  const nested = rec(payload.data);
  const source = Object.keys(nested).length > 0 ? nested : payload;
  const rowCount =
    typeof source.rowCount === "number"
      ? source.rowCount
      : typeof source.rowsAffected === "number"
        ? source.rowsAffected
        : typeof source.affectedRows === "number"
          ? source.affectedRows
          : undefined;
  const verb = sql.trim().split(/\s+/)[0]?.toUpperCase() ?? "WRITE";
  const elapsed =
    str(source.elapsed) ??
    (typeof block?.durationMs === "number" ? `${(block.durationMs / 1000).toFixed(1)}s` : undefined);
  return { sql, rowCount, verb, elapsed };
}

export interface SchemaColumn {
  name: string;
  type: string;
  nullable?: boolean;
  defaultValue?: string;
}

export interface SchemaIndex {
  name: string;
  definition?: string;
}

export interface SchemaForeignKey {
  name?: string;
  column: string;
  references: string;
}

export interface SchemaSummary {
  objectName?: string;
  rowCount?: number;
  columns: SchemaColumn[];
  primaryKey: string[];
  indexes: SchemaIndex[];
  foreignKeys: SchemaForeignKey[];
  policies: Array<{ name: string; command?: string; roles?: string[] }>;
  rlsEnabled?: boolean;
}

export function schemaFromBlock(block?: ToolBlock): SchemaSummary {
  const payload = rec(unwrapBlockPayload(block));
  const nested = rec(payload.data);
  const source = Object.keys(nested).length > 0 ? nested : payload;
  const args = parseArgsFromBlock(block);

  const columnsRaw = arr(source.columns ?? source.fields);
  const columns: SchemaColumn[] = columnsRaw.map((item) => {
    const col = rec(item);
    return {
      name: str(col.column_name ?? col.name ?? col.field) ?? "—",
      type: str(col.data_type ?? col.udt_name ?? col.type) ?? "—",
      nullable: col.is_nullable === "YES" || col.nullable === true,
      defaultValue: str(col.column_default ?? col.default),
    };
  });

  const pkRaw = arr(source.primaryKey ?? source.primary_key);
  const primaryKey = pkRaw.map((item) => String(item));

  const indexesRaw = arr(source.indexes ?? source.indexList);
  const indexes: SchemaIndex[] = indexesRaw.map((item) => {
    const idx = rec(item);
    return {
      name: str(idx.indexname ?? idx.name) ?? "—",
      definition: str(idx.indexdef ?? idx.definition),
    };
  });

  const fkRaw = arr(source.foreignKeys ?? source.foreign_keys);
  const foreignKeys: SchemaForeignKey[] = fkRaw.map((item) => {
    const fk = rec(item);
    const refTable = str(fk.foreign_table_name ?? fk.references_table);
    const refCol = str(fk.foreign_column_name ?? fk.references_column);
    return {
      name: str(fk.constraint_name ?? fk.name),
      column: str(fk.column_name ?? fk.column) ?? "—",
      references: refTable && refCol ? `${refTable}.${refCol}` : (refTable ?? "—"),
    };
  });

  const policiesRaw = arr(rec(source.security).policies ?? source.policies);
  const policies = policiesRaw.map((item) => {
    const p = rec(item);
    const roles = arr(p.roles).map((r) => String(r));
    return {
      name: str(p.policyname ?? p.name) ?? "—",
      command: str(p.cmd ?? p.command),
      roles: roles.length > 0 ? roles : undefined,
    };
  });

  const security = rec(source.security);
  return {
    objectName: str(source.schemaTable ?? source.objectName ?? args.objectName),
    rowCount: typeof source.rowCount === "number" ? source.rowCount : undefined,
    columns,
    primaryKey,
    indexes,
    foreignKeys,
    policies,
    rlsEnabled:
      security.rowLevelSecurityEnabled === true ||
      source.rowLevelSecurityEnabled === true ||
      source.row_security_enabled === true,
  };
}

export interface NoSQLCollectionField {
  name: string;
  type: string;
}

export interface NoSQLSchemaSummary {
  action: string;
  collections: Array<{ name: string; count?: number }>;
  fields: NoSQLCollectionField[];
  collectionName?: string;
}

export function nosqlSchemaFromBlock(block?: ToolBlock): NoSQLSchemaSummary {
  const payload = rec(unwrapBlockPayload(block));
  const nested = rec(payload.data);
  const source = Object.keys(nested).length > 0 ? nested : payload;
  const args = parseArgsFromBlock(block);
  const action = str(args.action) ?? "listCollections";

  const collectionsRaw = arr(source.collections ?? source.CollectionList ?? source.tables);
  const collections = collectionsRaw.map((item) => {
    if (typeof item === "string") return { name: item };
    const col = rec(item);
    return {
      name: str(col.CollectionName ?? col.name ?? col.collection) ?? "—",
      count: typeof col.Count === "number" ? col.Count : undefined,
    };
  });

  const fieldsRaw = arr(source.fields ?? source.schema ?? source.properties);
  const fields: NoSQLCollectionField[] = fieldsRaw.map((item) => {
    const f = rec(item);
    return {
      name: str(f.name ?? f.field ?? f.key) ?? "—",
      type: str(f.type ?? f.bsonType ?? f.dataType) ?? "—",
    };
  });

  return {
    action,
    collections,
    fields,
    collectionName: str(args.collectionName ?? source.collectionName),
  };
}

export interface EnvBoundSummary {
  envId?: string;
  alias?: string;
  status: "bound" | "unbound" | "failed";
  message?: string;
}

export function envBoundFromBlock(block?: ToolBlock): EnvBoundSummary {
  const args = parseArgsFromBlock(block);
  const payload = rec(unwrapBlockPayload(block));
  const nested = rec(payload.data);
  const source = Object.keys(nested).length > 0 ? nested : payload;
  const envId = str(args.envId ?? source.envId ?? source.EnvId ?? source.current_env_id);
  const alias = str(source.alias ?? source.Alias);
  const success = payload.success !== false && block?.status !== "error";
  const status: EnvBoundSummary["status"] = !success ? "failed" : envId ? "bound" : "unbound";
  return {
    envId,
    alias,
    status,
    message: str(payload.message ?? payload.error ?? source.message),
  };
}

export interface AuthStatusSummary {
  action: string;
  signedIn: boolean;
  envId?: string;
  authMode?: string;
  verificationUrl?: string;
  userCode?: string;
  message?: string;
}

export function authStatusFromBlock(block?: ToolBlock): AuthStatusSummary {
  const args = parseArgsFromBlock(block);
  const action = str(args.action) ?? "status";
  const payload = rec(unwrapBlockPayload(block));
  const nested = rec(payload.data);
  const source = Object.keys(nested).length > 0 ? nested : payload;
  const authStatus = str(source.auth_status ?? source.status ?? source.code);
  const signedIn =
    authStatus === "READY" ||
    authStatus === "AUTH_READY" ||
    authStatus === "ENV_READY" ||
    source.signedIn === true ||
    source.authenticated === true;
  return {
    action,
    signedIn,
    envId: str(source.envId ?? source.EnvId ?? source.current_env_id),
    authMode: str(source.authMode ?? source.mode),
    verificationUrl: str(source.verificationUrl ?? source.verification_uri),
    userCode: str(source.userCode ?? source.user_code),
    message: str(payload.message ?? source.message),
  };
}

export function toolLabel(toolName: string, block?: ToolBlock): string {
  const canonical = stripToolPrefix(toolName);
  const args = parseArgsFromBlock(block);
  const action = str(args.action);
  return action ? `${canonical} · ${action}` : canonical;
}
