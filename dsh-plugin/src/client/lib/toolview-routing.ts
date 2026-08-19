import { parseDdlImpact, type SqlStatementKind } from "../../shared/sql-ident.js";
import type { ToolBlock } from "./parse-tool-result.js";

export type ToolViewKind =
  | "data-table"
  | "ddl"
  | "mutation"
  | "privileges"
  | "schema"
  | "nosql-schema"
  | "env-bound"
  | "auth-status";

export const ACTION_AWARE_TOOLVIEW_TOOLS = [
  "queryPgDatabase",
  "readNoSqlDatabaseStructure",
  "queryStorage",
  "auth",
] as const;

function str(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

export function stripToolPrefix(toolName: string): string {
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

export function parseArgsFromBlock(block?: ToolBlock): Record<string, unknown> {
  if (!block) return {};
  if (block.args && typeof block.args === "object" && !Array.isArray(block.args)) {
    return block.args as Record<string, unknown>;
  }
  if (typeof block.args === "string") return parseArgsRaw(block.args);
  const settled = block as ToolBlock & { call?: { argsRaw?: string } };
  return parseArgsRaw(block.argsRaw ?? settled.call?.argsRaw);
}

function classifySqlKind(sql: string): SqlStatementKind {
  return parseDdlImpact(sql).kind;
}

function resolveManagePgKind(args: Record<string, unknown>): ToolViewKind {
  const action = str(args.action);
  if (!action || !["execute", "applyMigration", "rollbackMigration", "repairMigration"].includes(action)) {
    return "data-table";
  }
  const sql = str(args.sql);
  if (!sql) return "data-table";
  const kind = classifySqlKind(sql);
  if (kind === "privilege") return "privileges";
  if (kind === "dml") return "mutation";
  if (kind === "ddl") return "ddl";
  return "data-table";
}

/** Pick specialized toolview card kind from tool name + block args/action. */
export function resolveToolViewKind(toolName: string, block?: ToolBlock): ToolViewKind {
  const canonical = stripToolPrefix(toolName);
  const args = parseArgsFromBlock(block);

  if (canonical === "auth") {
    const action = str(args.action);
    if (action === "set_env") return "env-bound";
    if (action === "status" || action === "start_auth" || action === "list_bound_envs") {
      return "auth-status";
    }
    return "auth-status";
  }

  if (canonical === "readNoSqlDatabaseStructure") {
    const action = str(args.action) ?? "listCollections";
    if (["listCollections", "describeCollection", "structure", "checkCollection"].includes(action)) {
      return "nosql-schema";
    }
    return "data-table";
  }

  if (canonical === "queryPgDatabase") {
    const action = str(args.action) ?? "sql";
    if (["schema", "metadata", "objects", "context"].includes(action)) return "schema";
    return "data-table";
  }

  if (canonical === "managePgDatabase") {
    return resolveManagePgKind(args);
  }

  return "data-table";
}

export function isActionAwareTool(toolName: string): boolean {
  const canonical = stripToolPrefix(toolName);
  return (ACTION_AWARE_TOOLVIEW_TOOLS as readonly string[]).includes(canonical);
}
