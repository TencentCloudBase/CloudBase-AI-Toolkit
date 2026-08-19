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
