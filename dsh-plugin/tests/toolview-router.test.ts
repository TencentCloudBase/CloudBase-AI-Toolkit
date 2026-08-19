import { describe, expect, it } from "vitest";
import { resolveToolViewKind } from "../src/client/lib/toolview-routing.js";
import type { ToolBlock } from "../src/client/lib/parse-tool-result.js";

describe("toolview routing", () => {
  it("routes queryPgDatabase read rows to DataTableCard", () => {
    const block: ToolBlock = {
      toolName: "queryPgDatabase",
      args: { action: "sql", sql: "SELECT * FROM public.todos" },
    };
    expect(resolveToolViewKind("queryPgDatabase", block)).toBe("data-table");
  });

  it("routes queryPgDatabase schema to SchemaCard", () => {
    const block: ToolBlock = {
      toolName: "queryPgDatabase",
      args: { action: "schema", objectName: "public.todos" },
    };
    expect(resolveToolViewKind("mcp__cloudbase__queryPgDatabase", block)).toBe("schema");
  });

  it("routes managePgDatabase CREATE to DdlCard", () => {
    const block: ToolBlock = {
      toolName: "managePgDatabase",
      args: {
        action: "execute",
        sql: "CREATE TABLE public.todos (id serial primary key);",
        confirm: true,
      },
    };
    expect(resolveToolViewKind("managePgDatabase", block)).toBe("ddl");
  });

  it("routes managePgDatabase GRANT to PrivilegesCard", () => {
    const block: ToolBlock = {
      toolName: "managePgDatabase",
      args: {
        action: "execute",
        sql: "GRANT SELECT ON public.todos TO app_user;",
        confirm: true,
      },
    };
    expect(resolveToolViewKind("managePgDatabase", block)).toBe("privileges");
  });

  it("routes auth set_env to EnvBoundCard", () => {
    const block: ToolBlock = {
      toolName: "auth",
      args: { action: "set_env", envId: "demo-env" },
    };
    expect(resolveToolViewKind("auth", block)).toBe("env-bound");
  });
});
