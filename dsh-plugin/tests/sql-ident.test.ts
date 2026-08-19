import { describe, expect, it } from "vitest";
import { parseDdlImpact, quotePgIdent, quotePgTable, sqlLiteral } from "../src/shared/sql-ident.js";

describe("quotePgTable", () => {
  it("quotes schema and table", () => {
    expect(quotePgTable("public.todos")).toBe('"public"."todos"');
    expect(quotePgTable("todos")).toBe('"public"."todos"');
  });

  it("rejects injection payloads", () => {
    expect(() => quotePgIdent('todos"; DROP TABLE users; --')).toThrow(/Invalid/);
    expect(() => quotePgTable("public.todos;drop")).toThrow(/Invalid/);
    expect(() => quotePgTable("a.b.c")).toThrow(/Invalid table reference/);
    expect(sqlLiteral(null)).toBe("NULL");
    expect(sqlLiteral(true)).toBe("TRUE");
  });
});

describe("parseDdlImpact", () => {
  it("summarizes CREATE TABLE", () => {
    const impact = parseDdlImpact("CREATE TABLE public.todos (id serial primary key, title text);");
    expect(impact.kind).toBe("ddl");
    expect(impact.summary).toContain("CREATE TABLE public.todos");
  });

  it("summarizes ALTER TABLE add column", () => {
    const impact = parseDdlImpact("ALTER TABLE public.todos ADD COLUMN done boolean DEFAULT false;");
    expect(impact.kind).toBe("ddl");
    expect(impact.summary).toContain("ALTER TABLE public.todos");
    expect(impact.details.column).toBe("done");
  });

  it("summarizes GRANT privileges", () => {
    const impact = parseDdlImpact("GRANT SELECT, INSERT ON public.todos TO app_user;");
    expect(impact.kind).toBe("privilege");
    expect(impact.summary).toContain("GRANT SELECT, INSERT ON public.todos TO app_user");
    expect(impact.details.role).toBe("app_user");
  });

  it("classifies DML mutations", () => {
    const impact = parseDdlImpact("UPDATE public.todos SET done = true WHERE id = 1;");
    expect(impact.kind).toBe("dml");
    expect(impact.summary).toContain("UPDATE public.todos");
  });
});
