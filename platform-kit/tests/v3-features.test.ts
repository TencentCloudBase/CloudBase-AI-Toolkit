import { describe, expect, it } from "vitest";
import {
  sqlAlterPolicy,
  sqlCreatePolicy,
  sqlDropPolicy,
  sqlListSchemaPolicies,
  sqlToggleRLS,
} from "../src/pg/sql.js";
import { bucketUserGrowth } from "../src/utils/insights.js";
import { buildLogQueryString, buildLogSearchFilters } from "../src/utils/log-filters.js";

describe("pg/sql", () => {
  it("generates schema policy list SQL", () => {
    expect(sqlListSchemaPolicies("public")).toContain("pg_policies");
    expect(sqlListSchemaPolicies("public")).toContain("schemaname = 'public'");
  });

  it("generates RLS toggle SQL", () => {
    expect(sqlToggleRLS("public.users", true)).toBe(
      'ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;',
    );
    expect(sqlToggleRLS("public.users", false)).toContain("DISABLE ROW LEVEL SECURITY");
  });

  it("generates policy CRUD SQL", () => {
    const create = sqlCreatePolicy({
      name: "select_own",
      schemaTable: "public.todos",
      command: "SELECT",
      roles: ["public"],
      using: "auth.uid() = user_id",
    });
    expect(create).toContain('CREATE POLICY "select_own"');
    expect(create).toContain("USING (auth.uid() = user_id)");

    const alter = sqlAlterPolicy({
      name: "select_own",
      schemaTable: "public.todos",
      command: "SELECT",
      roles: ["authenticated"],
      using: "true",
      previousName: "select_own",
    });
    expect(alter).toContain('ALTER POLICY "select_own"');

    expect(sqlDropPolicy("public.todos", "select_own")).toContain('DROP POLICY "select_own"');
  });
});

describe("insights", () => {
  it("bucketUserGrowth accumulates by createdAt", () => {
    const now = new Date();
    const users = [
      { uid: "a", createdAt: new Date(now.getTime() - 86400000).toISOString() },
      { uid: "b", createdAt: now.toISOString() },
    ];
    const points = bucketUserGrowth(users, 7);
    expect(points[points.length - 1]).toBe(2);
  });
});

describe("logs filters", () => {
  it("combines service and level into queryString", () => {
    const q = buildLogQueryString("", "scf", "error");
    expect(q).toContain("src:app");
    expect(q).toContain("log:ERROR");
  });

  it("buildLogSearchFilters includes time range", () => {
    const filters = buildLogSearchFilters({
      queryString: "",
      service: "gateway",
      level: "all",
      timePreset: "4h",
    });
    expect(filters.queryString).toContain("logType:accesslog");
    expect(filters.startTime).toBeTruthy();
    expect(filters.endTime).toBeTruthy();
  });
});
