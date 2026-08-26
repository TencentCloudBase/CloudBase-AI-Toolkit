import { describe, expect, it } from "vitest";
import { parseDdlImpact } from "../src/shared/sql-ident.js";

describe("parseDdlImpact", () => {
  it("summarizes CREATE TABLE with indexes and foreign keys", () => {
    const impact = parseDdlImpact(`
      CREATE TABLE public.todos (
        id serial PRIMARY KEY,
        org_id int REFERENCES public.orgs(id)
      );
      CREATE INDEX todos_org_idx ON public.todos (org_id);
    `);
    expect(impact.kind).toBe("ddl");
    expect(impact.tablesCreated).toContain("public.todos");
    expect(impact.indexesCreated).toContain("todos_org_idx");
    expect(impact.foreignKeys.length).toBeGreaterThan(0);
    expect(impact.impacts.some((line) => line.includes("CREATE TABLE"))).toBe(true);
  });

  it("classifies GRANT as privilege impact", () => {
    const impact = parseDdlImpact("GRANT SELECT ON public.todos TO authenticated");
    expect(impact.kind).toBe("privilege");
    expect(impact.grants).toHaveLength(1);
    expect(impact.grants[0]?.role).toBe("authenticated");
    expect(impact.warning).toBe(true);
  });

  it("classifies INSERT as dml", () => {
    const impact = parseDdlImpact("INSERT INTO public.todos (title) VALUES ('a')");
    expect(impact.kind).toBe("dml");
    expect(impact.impacts[0]).toContain("INSERT");
  });

  it("flags DROP TABLE as destructive ddl", () => {
    const impact = parseDdlImpact("DROP TABLE public.todos");
    expect(impact.kind).toBe("ddl");
    expect(impact.tablesDropped).toContain("public.todos");
    expect(impact.warning).toBe(true);
  });
});
