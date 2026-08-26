import { z, type ZodType } from "zod";
import type { ColumnSummary } from "./types.js";
import { quotePgIdent, quotePgTable, sqlLiteral } from "./sql-ident.js";

export function mapPgTypeToFormKind(
  dataType: string,
): "number" | "boolean" | "array" | "enum" | "string" {
  const type = dataType.toLowerCase();
  if (type.includes("bool")) return "boolean";
  if (
    type.includes("int") ||
    type.includes("numeric") ||
    type.includes("decimal") ||
    type.includes("float") ||
    type.includes("double") ||
    type.includes("real") ||
    type.includes("serial")
  ) {
    return "number";
  }
  if (type.includes("[]") || type.includes("array")) return "array";
  return "string";
}

export function columnFieldSchema(column: ColumnSummary): ZodType {
  const kind = mapPgTypeToFormKind(column.dataType);
  let schema: ZodType;
  if (column.enums && column.enums.length > 0) {
    const [first, ...rest] = column.enums;
    schema = first ? z.enum([first, ...rest]) : z.string();
  } else if (kind === "boolean") {
    schema = z.boolean();
  } else if (kind === "number") {
    schema = z.number();
  } else if (kind === "array") {
    schema = z.array(z.string());
  } else {
    schema = z.string();
  }
  return column.nullable ? schema.nullish() : schema;
}

export function columnsToZodObject(columns: ColumnSummary[]) {
  const shape: Record<string, ZodType> = {};
  for (const column of columns) {
    shape[column.name] = columnFieldSchema(column);
  }
  return z.object(shape);
}

export function coerceFormValue(column: ColumnSummary, raw: unknown): unknown {
  if (raw === "" || raw === undefined) return column.nullable ? null : raw;
  if (typeof raw !== "string") return raw;
  const kind = mapPgTypeToFormKind(column.dataType);
  if (column.enums && column.enums.length > 0) return raw;
  if (kind === "boolean") {
    if (raw === "true" || raw === "1") return true;
    if (raw === "false" || raw === "0") return false;
    return raw;
  }
  if (kind === "number") {
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : raw;
  }
  if (kind === "array") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : raw.split(",").map((item) => item.trim());
    } catch {
      return raw.split(",").map((item) => item.trim());
    }
  }
  return raw;
}

export function coerceFormValues(
  columns: ColumnSummary[],
  values: Record<string, unknown>,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const column of columns) {
    next[column.name] = coerceFormValue(column, values[column.name]);
  }
  return next;
}

export function buildUpdateSql(opts: {
  table: string;
  columns: ColumnSummary[];
  original: Record<string, unknown>;
  next: Record<string, unknown>;
}): string | undefined {
  const table = quotePgTable(opts.table);
  const assignments: string[] = [];
  for (const column of opts.columns) {
    if (!column.isUpdatable || column.primaryKey) continue;
    const before = opts.original[column.name];
    const after = opts.next[column.name];
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    assignments.push(`${quotePgIdent(column.name)} = ${sqlLiteral(after)}`);
  }
  if (assignments.length === 0) return undefined;
  const keys = opts.columns.filter((column) => column.primaryKey);
  const whereCols = keys.length > 0 ? keys : opts.columns.slice(0, 1);
  const where = whereCols
    .map((column) => `${quotePgIdent(column.name)} = ${sqlLiteral(opts.original[column.name])}`)
    .join(" AND ");
  return `UPDATE ${table} SET ${assignments.join(", ")} WHERE ${where};`;
}

export function mapSchemaColumns(payload: {
  columns?: unknown;
  primaryKey?: unknown;
  kind?: unknown;
}): ColumnSummary[] {
  const primary = new Set(
    Array.isArray(payload.primaryKey) ? payload.primaryKey.map((item) => String(item)) : [],
  );
  const updatable = String(payload.kind ?? "table").toLowerCase().includes("table");
  const columns = Array.isArray(payload.columns) ? payload.columns : [];
  return columns.map((item) => {
    const row =
      item !== null && typeof item === "object" && !Array.isArray(item)
        ? (item as Record<string, unknown>)
        : {};
    const name = String(row.name ?? row.column_name ?? "");
    const dataType = String(row.dataType ?? row.data_type ?? row.type ?? "text");
    const nullable = Boolean(row.isNullable ?? row.nullable ?? row.is_nullable === "YES");
    const enums = Array.isArray(row.enums) ? row.enums.map((value) => String(value)) : undefined;
    return {
      name,
      type: dataType,
      dataType,
      nullable,
      isUpdatable: updatable && row.isUpdatable !== false,
      primaryKey: primary.has(name) || Boolean(row.primaryKey),
      enums,
    } satisfies ColumnSummary;
  });
}
