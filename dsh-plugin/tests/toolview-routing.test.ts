import { describe, expect, it } from "vitest";
import { resolveToolViewKind } from "../src/client/lib/toolview-routing.js";
import type { ToolBlock } from "../src/client/lib/parse-tool-result.js";

describe("resolveToolViewKind", () => {
  it("routes queryPgDatabase read/sql to data-table", () => {
    const block: ToolBlock = {
      toolName: "queryPgDatabase",
      args: { action: "sql", sql: "SELECT * FROM todos" },
    };
    expect(resolveToolViewKind("queryPgDatabase", block)).toBe("data-table");
  });

  it("routes queryPgDatabase schema to schema card", () => {
    const block: ToolBlock = {
      toolName: "queryPgDatabase",
      args: { action: "schema", objectName: "public.todos" },
    };
    expect(resolveToolViewKind("mcp__cloudbase__queryPgDatabase", block)).toBe("schema");
  });

  it("routes managePgDatabase CREATE to ddl card", () => {
    const block: ToolBlock = {
      toolName: "managePgDatabase",
      args: {
        action: "execute",
        sql: "CREATE TABLE public.notes (id serial PRIMARY KEY)",
      },
    };
    expect(resolveToolViewKind("managePgDatabase", block)).toBe("ddl");
  });

  it("routes managePgDatabase GRANT to privileges card", () => {
    const block: ToolBlock = {
      toolName: "managePgDatabase",
      args: {
        action: "execute",
        sql: "GRANT SELECT ON public.notes TO authenticated",
      },
    };
    expect(resolveToolViewKind("managePgDatabase", block)).toBe("privileges");
  });

  it("routes auth set_env to env-bound card", () => {
    const block: ToolBlock = {
      toolName: "auth",
      args: { action: "set_env", envId: "ai-native-d1ggefhgb8c27e3e8" },
    };
    expect(resolveToolViewKind("mcp__cloudbase__auth", block)).toBe("env-bound");
  });

  it("routes readNoSqlDatabaseStructure listCollections to nosql-schema", () => {
    const block: ToolBlock = {
      toolName: "readNoSqlDatabaseStructure",
      args: { action: "listCollections" },
    };
    expect(resolveToolViewKind("readNoSqlDatabaseStructure", block)).toBe("nosql-schema");
  });
});
