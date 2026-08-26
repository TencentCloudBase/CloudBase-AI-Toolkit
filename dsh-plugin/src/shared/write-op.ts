import { assessSqlBatchRisk, type SqlRiskAssessment } from "./sql-ident.js";

export const WRITE_OP_TOOL_NAMES = [
  "managePgDatabase",
  "manageMysqlDatabase",
  "writeNoSqlDatabaseStructure",
  "writeNoSqlDatabaseContent",
  "executeWriteSQL",
] as const;

export type WriteOpKind = "sql" | "nosql" | "permission";

export interface WriteOpPayload {
  toolName: string;
  action?: string;
  sql: string;
  kind: WriteOpKind;
  risk: SqlRiskAssessment;
  confirmed: boolean;
  label: string;
}

function stripToolPrefix(toolName: string): string {
  const marker = "mcp__cloudbase__";
  return toolName.startsWith(marker) ? toolName.slice(marker.length) : toolName;
}

function parseArgsRaw(argsRaw: string | undefined): Record<string, unknown> {
  if (!argsRaw?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(argsRaw);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

const PG_WRITE_ACTIONS = new Set([
  "execute",
  "applyMigration",
  "rollbackMigration",
  "repairMigration",
  "planMigration",
]);

const MYSQL_WRITE_ACTIONS = new Set([
  "executeSQL",
  "runStatement",
  "initializeSchema",
  "provisionMySQL",
  "destroyMySQL",
]);

export function extractWriteOp(toolName: string, argsRaw: string | undefined): WriteOpPayload | null {
  const canonical = stripToolPrefix(toolName);
  const args = parseArgsRaw(argsRaw);
  const action = str(args.action) ?? str(args.Action);

  if (canonical === "managePgDatabase") {
    if (!action || !PG_WRITE_ACTIONS.has(action)) return null;
    const sql = str(args.sql);
    if (!sql) return null;
    const risk = assessSqlBatchRisk(sql);
    if (risk.readOnly) return null;
    return {
      toolName: canonical,
      action,
      sql,
      kind: "sql",
      risk,
      confirmed: args.confirm === true,
      label: `PostgreSQL · ${action}`,
    };
  }

  if (canonical === "manageMysqlDatabase") {
    if (!action || !MYSQL_WRITE_ACTIONS.has(action)) return null;
    const sql = str(args.sql) ?? str(args.statement);
    if (sql) {
      const risk = assessSqlBatchRisk(sql);
      if (risk.readOnly) return null;
      return {
        toolName: canonical,
        action,
        sql,
        kind: "sql",
        risk,
        confirmed: args.confirm === true,
        label: `MySQL · ${action}`,
      };
    }
    if (action === "provisionMySQL" || action === "destroyMySQL") {
      return {
        toolName: canonical,
        action,
        sql: `-- ${action}\n-- confirm=${String(args.confirm ?? false)}`,
        kind: "sql",
        risk: { risk: "destructive", readOnly: false, requiresAck: true, verb: action },
        confirmed: args.confirm === true,
        label: `MySQL · ${action}`,
      };
    }
    return null;
  }

  if (canonical === "executeWriteSQL") {
    const sql = str(args.sql) ?? str(args.statement);
    if (!sql) return null;
    const risk = assessSqlBatchRisk(sql);
    if (risk.readOnly) return null;
    return {
      toolName: canonical,
      action: action ?? "execute",
      sql,
      kind: "sql",
      risk,
      confirmed: args.confirm === true,
      label: "SQL execute",
    };
  }

  if (canonical === "writeNoSqlDatabaseContent" || canonical === "writeNoSqlDatabaseStructure") {
    const payload = JSON.stringify(args, null, 2);
    return {
      toolName: canonical,
      action,
      sql: payload,
      kind: "nosql",
      risk: { risk: "normal_write", readOnly: false, requiresAck: false, verb: "WRITE" },
      confirmed: args.confirm === true,
      label: canonical.includes("Structure") ? "NoSQL schema" : "NoSQL write",
    };
  }

  return null;
}

export function buildRunQueryMessage(op: WriteOpPayload): string {
  if (op.toolName === "managePgDatabase") {
    return [
      "请在 CloudBase PostgreSQL 中执行以下写操作，调用 managePgDatabase(action=execute, confirm=true)：",
      op.sql,
    ].join("\n");
  }
  if (op.toolName === "manageMysqlDatabase") {
    return [
      `请在 CloudBase MySQL 中执行以下写操作，调用 manageMysqlDatabase(action=${op.action ?? "executeSQL"}, confirm=true)：`,
      op.sql,
    ].join("\n");
  }
  if (op.toolName === "executeWriteSQL") {
    return [`请执行以下写 SQL（confirm=true）：`, op.sql].join("\n");
  }
  return [`请执行以下 CloudBase 写操作（confirm=true）：`, op.sql].join("\n");
}
