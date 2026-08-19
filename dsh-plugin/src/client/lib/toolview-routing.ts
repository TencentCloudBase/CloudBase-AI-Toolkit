import { getBlockArgs, normalizeToolName, type ToolBlock } from "./parse-tool-result.js";
import { parseDdlImpact } from "../../shared/sql-ident.js";

export type ToolViewCardKind =
  | "data-table"
  | "ddl"
  | "mutation"
  | "privileges"
  | "schema"
  | "nosql-schema"
  | "env-bound"
  | "auth-status";

export function resolveToolViewKind(toolName: string, block?: ToolBlock): ToolViewCardKind {
  const normalized = normalizeToolName(toolName);
  const args = getBlockArgs(block);
  const action = String(args.action ?? "");

  if (normalized === "auth" || normalized === "manageAuth") {
    if (action === "set_env") return "env-bound";
    if (action === "status" || action === "start_auth") return "auth-status";
  }

  if (normalized === "managePgDatabase") {
    if (action === "execute") {
      const sql = typeof args.sql === "string" ? args.sql : "";
      const impact = parseDdlImpact(sql);
      if (impact.kind === "privilege") return "privileges";
      if (impact.kind === "ddl") return "ddl";
      if (impact.kind === "dml") return "mutation";
    }
  }

  if (normalized === "queryPgDatabase") {
    if (action === "schema" || action === "metadata" || action === "describe") {
      return "schema";
    }
  }

  if (normalized === "readNoSqlDatabaseStructure") {
    if (action === "listCollections" || action === "describeCollection" || action === "structure") {
      return "nosql-schema";
    }
  }

  return "data-table";
}
