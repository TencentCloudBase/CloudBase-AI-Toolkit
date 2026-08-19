import { describe, expect, it } from "vitest";
import {
  buildUpdateSql,
  coerceFormValues,
  columnsToZodObject,
  mapPgTypeToFormKind,
  mapSchemaColumns,
} from "../src/shared/column-form.js";
import { bucketUserGrowth, buildSuggestions } from "../src/shared/kit-insights.js";
import { sqlLiteral } from "../src/shared/sql-ident.js";

describe("column form mapping", () => {
  it("maps pg types and builds a typed UPDATE", () => {
    expect(mapPgTypeToFormKind("integer")).toBe("number");
    expect(mapPgTypeToFormKind("boolean")).toBe("boolean");
    const columns = mapSchemaColumns({
      kind: "table",
      primaryKey: ["id"],
      columns: [
        { name: "id", dataType: "integer", isNullable: false },
        { name: "title", dataType: "text", isNullable: true },
      ],
    });
    expect(columns[0]?.primaryKey).toBe(true);
    expect(columns[1]?.isUpdatable).toBe(true);
    const sql = buildUpdateSql({
      table: "public.todos",
      columns,
      original: { id: 1, title: "a" },
      next: { id: 1, title: "b" },
    });
    expect(sql).toBe(`UPDATE "public"."todos" SET "title" = 'b' WHERE "id" = 1;`);
    expect(sqlLiteral("O'Brien")).toBe("'O''Brien'");
  });

  it("validates coerced form values with Zod", () => {
    const columns = mapSchemaColumns({
      kind: "table",
      primaryKey: ["id"],
      columns: [
        { name: "id", dataType: "integer", isNullable: false },
        { name: "done", dataType: "boolean", isNullable: false },
      ],
    });
    const values = coerceFormValues(columns, { id: "2", done: "true" });
    const parsed = columnsToZodObject(columns).safeParse(values);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toMatchObject({ id: 2, done: true });
  });
});

describe("kit suggestion and growth helpers", () => {
  it("buckets user growth and emits empty-table suggestions", () => {
    const points = bucketUserGrowth(
      [
        { uid: "1", createdAt: new Date().toISOString() },
        { uid: "2", createdAt: new Date(Date.now() - 3 * 86400000).toISOString() },
      ],
      7,
    );
    expect(points[points.length - 1]).toBe(2);
    const items = buildSuggestions({
      tables: [{ name: "empty", schema: "public", kind: "table", rowCount: 0 }],
      errors: [{ title: "boom", level: "error" }],
    });
    expect(items.some((item) => item.title.includes("empty"))).toBe(true);
    expect(items.some((item) => item.title.includes("错误"))).toBe(true);
  });
});
