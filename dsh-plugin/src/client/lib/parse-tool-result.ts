export interface ToolBlock {
  toolName?: string;
  name?: string;
  status?: string;
  durationMs?: number;
  args?: unknown;
  result?: unknown;
  output?: unknown;
  content?: unknown;
}

export interface ParsedTable {
  columns: string[];
  rows: Record<string, unknown>[];
  title: string;
  elapsed?: string;
}

export interface ParsedDeploy {
  url?: string;
  domain?: string;
  statusLabel: string;
  deployedAt?: string;
  files: string[];
}

export interface ParsedExecuteResult {
  sql: string;
  rowCount?: number | null;
  command?: string;
  classification?: { risk?: string; readOnly?: boolean };
  previewRows: Record<string, unknown>[];
  targetTable?: string | null;
  warning?: string;
  success: boolean;
  message?: string;
}

export interface ParsedSchemaResult {
  objectName?: string;
  kind?: string;
  columns: Array<{ name: string; dataType: string; nullable?: boolean; primaryKey?: boolean }>;
  indexes: Array<{ name: string; columns?: string[]; unique?: boolean }>;
  foreignKeys: Array<{ name?: string; columns?: string[]; references?: string }>;
  policies: Array<{ name?: string; command?: string; roles?: string[] }>;
  rowLevelSecurityEnabled?: boolean;
  metadataObjects: Record<string, unknown>[];
}

export interface ParsedNoSqlSchema {
  action: string;
  collections: Array<{ name: string; count?: number; fields?: Array<{ name: string; type?: string }> }>;
}

export interface ParsedAuthResult {
  action: string;
  ok: boolean;
  code?: string;
  message?: string;
  envId?: string;
  alias?: string;
  signedIn?: boolean;
}

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

export function getBlockArgs(block: ToolBlock | undefined): Record<string, unknown> {
  if (!block) return {};
  const direct = block.args;
  if (direct !== null && typeof direct === "object" && !Array.isArray(direct)) {
    return direct as Record<string, unknown>;
  }
  const nested = (block as { block?: { args?: unknown } }).block?.args;
  if (nested !== null && typeof nested === "object" && !Array.isArray(nested)) {
    return nested as Record<string, unknown>;
  }
  return {};
}

export function normalizeToolName(toolName: string): string {
  return toolName.replace(/^mcp__cloudbase__/, "");
}

export function unwrapBlockPayload(block: ToolBlock | undefined): unknown {
  if (!block) return undefined;
  const result = rec(block.result);
  const content = arr(result.content ?? block.content);
  const texts = content
    .map((item) => rec(item).text)
    .filter((text): text is string => typeof text === "string");
  if (texts.length > 0) {
    try {
      return JSON.parse(texts.join("\n"));
    } catch {
      return texts.join("\n");
    }
  }
  if (result.structuredContent !== undefined) return result.structuredContent;
  if (result.data !== undefined) return result.data;
  if (block.output !== undefined) return block.output;
  return block.result ?? block;
}

export function parseTable(block: ToolBlock | undefined, toolName: string): ParsedTable {
  const payload = rec(unwrapBlockPayload(block));
  const nested = rec(payload.data);
  const source = Object.keys(nested).length > 0 ? nested : payload;
  const rowsRaw = arr(source.rows ?? source.records ?? source.items ?? source.objects ?? source.tables);
  const rows = rowsRaw.map((item) => rec(item));
  const columnsFromMeta = arr(source.columns)
    .map((item) => (typeof item === "string" ? item : str(rec(item).name)))
    .filter((name): name is string => Boolean(name));
  const columns = columnsFromMeta.length > 0 ? columnsFromMeta : rows[0] ? Object.keys(rows[0]) : [];
  const elapsed =
    str(source.elapsed) ??
    (typeof block?.durationMs === "number" ? `${(block.durationMs / 1000).toFixed(1)}s` : undefined);
  return {
    columns,
    rows,
    title: toolName,
    elapsed,
  };
}

export function parseDeploy(block: ToolBlock | undefined): ParsedDeploy {
  const payload = rec(unwrapBlockPayload(block));
  const nested = rec(payload.data);
  const source = Object.keys(nested).length > 0 ? nested : payload;
  const url =
    str(source.accessUrl) ??
    str(arr(source.accessUrls)[0]) ??
    str(source.url) ??
    str(source.defaultDomain) ??
    str(source.StaticDomain) ??
    str(source.websiteUrl) ??
    str(rec(source.websiteConfig).url);
  const domain = url?.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const files = arr(source.files ?? source.uploaded)
    .map((item) => (typeof item === "string" ? item : str(rec(item).path ?? rec(item).Key)))
    .filter((name): name is string => Boolean(name));
  return {
    url: url?.startsWith("http") ? url : url ? `https://${url}` : undefined,
    domain,
    statusLabel: str(source.status) === "error" ? "失败" : "已上线",
    deployedAt: str(source.deployedAt ?? source.updateTime ?? source.time),
    files,
  };
}

export function toCsv(columns: string[], rows: Record<string, unknown>[]): string {
  const escape = (value: unknown) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  return [columns.join(","), ...rows.map((row) => columns.map((col) => escape(row[col])).join(","))].join(
    "\n",
  );
}

export function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * 把 CloudBase MCP 的原始错误转成面板友好提示：
 * - 资源过期/欠费 → 明确提示续费，不展示 RequestId/Issue 链接等噪音
 * - 其他长错误 → 只保留首行，超出 200 字符截断
 */
export function parseExecuteResult(block: ToolBlock | undefined): ParsedExecuteResult {
  const args = getBlockArgs(block);
  const payload = rec(unwrapBlockPayload(block));
  const nested = rec(payload.data);
  const source = Object.keys(nested).length > 0 ? nested : payload;
  const previewRows = arr(source.previewRows ?? source.rows).map((item) => rec(item));
  return {
    sql: typeof args.sql === "string" ? args.sql : String(source.sqlPreview ?? ""),
    rowCount: typeof source.rowCount === "number" ? source.rowCount : null,
    command: str(source.command),
    classification: rec(source.classification) as ParsedExecuteResult["classification"],
    previewRows,
    targetTable: str(source.targetTable) ?? null,
    warning: str(source.warning),
    success: payload.success !== false && payload.ok !== false,
    message: str(payload.message),
  };
}

export function parseSchemaResult(block: ToolBlock | undefined): ParsedSchemaResult {
  const args = getBlockArgs(block);
  const payload = rec(unwrapBlockPayload(block));
  const nested = rec(payload.data);
  const source = Object.keys(nested).length > 0 ? nested : payload;
  const columnsRaw = arr(source.columns);
  const columns = columnsRaw.map((item) => {
    const row = rec(item);
    const name = String(row.name ?? row.column_name ?? "");
    return {
      name,
      dataType: String(row.dataType ?? row.data_type ?? row.type ?? "text"),
      nullable: Boolean(row.isNullable ?? row.nullable ?? row.is_nullable === "YES"),
      primaryKey: Boolean(row.primaryKey) || arr(source.primaryKey).map(String).includes(name),
    };
  });
  const indexes = arr(source.indexes).map((item) => {
    const row = rec(item);
    return {
      name: String(row.name ?? row.indexname ?? "index"),
      columns: arr(row.columns ?? row.columnNames).map((col) => String(col)),
      unique: Boolean(row.unique ?? row.isUnique),
    };
  });
  const foreignKeys = arr(source.foreignKeys ?? source.foreign_keys).map((item) => {
    const row = rec(item);
    return {
      name: str(row.name ?? row.constraint_name),
      columns: arr(row.columns ?? row.columnNames).map((col) => String(col)),
      references: str(row.references ?? row.referencedTable ?? row.refTable),
    };
  });
  const security = rec(source.security);
  const policies = arr(security.policies ?? source.policies).map((item) => {
    const row = rec(item);
    return {
      name: str(row.name ?? row.policyname),
      command: str(row.command ?? row.cmd),
      roles: arr(row.roles).map((role) => String(role)),
    };
  });
  const metadataObjects = arr(source.objects ?? source.tables).map((item) => rec(item));
  return {
    objectName: str(args.objectName) ?? str(source.objectName ?? source.schemaTable),
    kind: str(source.kind),
    columns,
    indexes,
    foreignKeys,
    policies,
    rowLevelSecurityEnabled: Boolean(security.rowLevelSecurityEnabled ?? source.rowLevelSecurityEnabled),
    metadataObjects,
  };
}

export function parseNoSqlSchema(block: ToolBlock | undefined): ParsedNoSqlSchema {
  const args = getBlockArgs(block);
  const action = String(args.action ?? "listCollections");
  const payload = rec(unwrapBlockPayload(block));
  const nested = rec(payload.data);
  const source = Object.keys(nested).length > 0 ? nested : payload;
  const collectionsRaw = arr(source.collections ?? source.Tables ?? source.tables);
  const collections = collectionsRaw.map((item) => {
    if (typeof item === "string") return { name: item };
    const row = rec(item);
    const name = String(row.TableName ?? row.collectionName ?? row.name ?? "");
    const fields = arr(row.fields ?? row.schema ?? row.Indexes).map((field) => {
      const f = rec(field);
      return {
        name: String(f.Name ?? f.name ?? f.field ?? ""),
        type: str(f.Type ?? f.type ?? f.dataType),
      };
    }).filter((field) => field.name.length > 0);
    return {
      name,
      count: typeof row.Count === "number" ? row.Count : undefined,
      fields: fields.length > 0 ? fields : undefined,
    };
  }).filter((item) => item.name.length > 0);
  return { action, collections };
}

export function parseAuthResult(block: ToolBlock | undefined): ParsedAuthResult {
  const args = getBlockArgs(block);
  const action = String(args.action ?? "status");
  const payload = rec(unwrapBlockPayload(block));
  const envId =
    str(payload.current_env_id) ??
    str(payload.envId) ??
    (typeof args.envId === "string" ? args.envId : undefined);
  return {
    action,
    ok: payload.ok !== false && payload.success !== false,
    code: str(payload.code),
    message: str(payload.message),
    envId,
    alias: str(payload.alias ?? payload.envAlias),
    signedIn: Boolean(payload.signedIn ?? payload.authenticated ?? payload.ok === true),
  };
}

export function friendlyError(message: string): string {
  const text = String(message).trim();
  if (/resource has expired|renewal fee|欠费|expired/i.test(text)) {
    return "该环境资源已过期或欠费，请在 CloudBase 控制台续费后重试。";
  }
  const firstLine = text.split("\n")[0] ?? text;
  return firstLine.length > 200 ? `${firstLine.slice(0, 200)}…` : firstLine;
}
