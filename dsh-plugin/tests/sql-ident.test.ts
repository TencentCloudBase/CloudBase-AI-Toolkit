import { describe, expect, it } from "vitest";
import { quotePgIdent, quotePgTable } from "../src/shared/sql-ident.js";

describe("quotePgTable", () => {
  it("quotes schema and table", () => {
    expect(quotePgTable("public.todos")).toBe('"public"."todos"');
    expect(quotePgTable("todos")).toBe('"public"."todos"');
  });

  it("rejects injection payloads", () => {
    expect(() => quotePgIdent('todos"; DROP TABLE users; --')).toThrow(/Invalid/);
    expect(() => quotePgTable("public.todos;drop")).toThrow(/Invalid/);
    expect(() => quotePgTable("a.b.c")).toThrow(/Invalid table reference/);
  });
});
