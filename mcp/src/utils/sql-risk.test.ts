import { describe, expect, it } from "vitest";
import {
  findDestructiveStatements,
  getSqlVerb,
  isDestructiveSql,
  splitSqlStatements,
  stripLeadingSqlComments,
} from "./sql-risk.js";

describe("stripLeadingSqlComments", () => {
  it("strips line, hash and block comments", () => {
    expect(stripLeadingSqlComments("-- c\nSELECT 1")).toBe("SELECT 1");
    expect(stripLeadingSqlComments("# c\nSELECT 1")).toBe("SELECT 1");
    expect(stripLeadingSqlComments("/* c */ SELECT 1")).toBe("SELECT 1");
  });
});

describe("getSqlVerb", () => {
  it("returns the leading verb uppercased, ignoring comments", () => {
    expect(getSqlVerb("  drop table x")).toBe("DROP");
    expect(getSqlVerb("/* x */ create table y (id int)")).toBe("CREATE");
    expect(getSqlVerb("")).toBe("");
  });
});

describe("isDestructiveSql", () => {
  it("flags DROP / TRUNCATE / DELETE", () => {
    expect(isDestructiveSql("DROP TABLE users")).toBe(true);
    expect(isDestructiveSql("TRUNCATE t")).toBe(true);
    expect(isDestructiveSql("DELETE FROM t WHERE 1=1")).toBe(true);
  });

  it("flags ALTER ... DROP / RENAME but not additive ALTER", () => {
    expect(isDestructiveSql("ALTER TABLE t DROP COLUMN c")).toBe(true);
    expect(isDestructiveSql("ALTER TABLE t RENAME TO t2")).toBe(true);
    expect(isDestructiveSql("ALTER TABLE t ADD COLUMN c int")).toBe(false);
  });

  it("does not flag additive DDL / reads", () => {
    expect(isDestructiveSql("CREATE TABLE t (id int)")).toBe(false);
    expect(isDestructiveSql("SELECT * FROM t")).toBe(false);
    expect(isDestructiveSql("INSERT INTO t VALUES (1)")).toBe(false);
  });
});

describe("splitSqlStatements", () => {
  it("splits on top-level semicolons", () => {
    expect(splitSqlStatements("CREATE TABLE a (id int); DROP TABLE b;")).toEqual([
      "CREATE TABLE a (id int)",
      "DROP TABLE b",
    ]);
  });

  it("does not split on semicolons inside string literals", () => {
    const sql = "INSERT INTO t VALUES ('a; b'); DROP TABLE x;";
    expect(splitSqlStatements(sql)).toEqual([
      "INSERT INTO t VALUES ('a; b')",
      "DROP TABLE x",
    ]);
  });

  it("does not split inside dollar-quoted function bodies", () => {
    const sql =
      "CREATE FUNCTION f() RETURNS void AS $$ BEGIN DELETE FROM t; END; $$ LANGUAGE plpgsql; DROP TABLE y;";
    const parts = splitSqlStatements(sql);
    expect(parts).toHaveLength(2);
    expect(parts[1]).toBe("DROP TABLE y");
  });

  it("ignores semicolons inside comments", () => {
    const sql = "SELECT 1 -- inline ; not a split\n; DROP TABLE z;";
    expect(splitSqlStatements(sql)).toEqual([
      "SELECT 1 -- inline ; not a split",
      "DROP TABLE z",
    ]);
  });
});

describe("findDestructiveStatements", () => {
  it("returns only the destructive statements from a multi-statement script", () => {
    const sql = [
      "CREATE TABLE a (id int);",
      "ALTER TABLE a ADD COLUMN name text;",
      "DROP TABLE b;",
      "ALTER TABLE a DROP COLUMN name;",
    ].join("\n");
    const hits = findDestructiveStatements(sql);
    expect(hits).toHaveLength(2);
    expect(hits[0]).toContain("DROP TABLE b");
    expect(hits[1]).toContain("DROP COLUMN name");
  });

  it("returns empty for purely additive migrations", () => {
    const sql = "CREATE TABLE a (id int);\nALTER TABLE a ADD COLUMN c int;";
    expect(findDestructiveStatements(sql)).toEqual([]);
  });

  it("does not false-positive on the word drop inside a string / comment", () => {
    const sql =
      "-- this migration will not drop anything\nINSERT INTO log VALUES ('drop table note');";
    expect(findDestructiveStatements(sql)).toEqual([]);
  });
});
