import { describe, expect, it } from "vitest";
import {
  assessSqlBatchRisk,
  assessSqlRisk,
  quotePgIdent,
  quotePgTable,
  splitSqlStatements,
  sqlLiteral,
} from "../src/shared/sql-ident.js";

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

describe("assessSqlRisk", () => {
  it("classifies read-only SELECT", () => {
    expect(assessSqlRisk("SELECT * FROM todos").readOnly).toBe(true);
    expect(assessSqlRisk("SELECT * FROM todos").risk).toBe("read_only");
  });

  it("classifies DML", () => {
    const insert = assessSqlRisk("INSERT INTO public.todos (title) VALUES ('a')");
    expect(insert.risk).toBe("normal_write");
    expect(insert.requiresAck).toBe(false);
  });

  it("classifies destructive DDL", () => {
    const drop = assessSqlRisk("DROP TABLE public.todos");
    expect(drop.risk).toBe("destructive");
    expect(drop.requiresAck).toBe(true);
  });

  it("classifies GRANT as security_change", () => {
    const grant = assessSqlRisk("GRANT SELECT ON public.todos TO authenticated");
    expect(grant.risk).toBe("security_change");
    expect(grant.requiresAck).toBe(true);
  });

  it("splits multi-statement SQL", () => {
    expect(splitSqlStatements("SELECT 1; INSERT INTO t VALUES (1);")).toHaveLength(2);
  });

  it("batch risk picks destructive over DML", () => {
    const batch = assessSqlBatchRisk("INSERT INTO t VALUES (1); DROP TABLE t;");
    expect(batch.risk).toBe("destructive");
  });
});
