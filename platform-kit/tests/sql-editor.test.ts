import { describe, expect, it } from "vitest";
import { isReadSql, runSqlStatement } from "../src/utils/sql-read.js";
import { isClsUnavailableError } from "../src/utils/cls-errors.js";
import { t } from "../src/i18n/index.js";
import { KIT_CSS } from "../src/theme/styles.js";

describe("sql editor", () => {
  it("treats SELECT/SHOW/EXPLAIN as read SQL", () => {
    expect(isReadSql("SELECT 1")).toBe(true);
    expect(isReadSql("show tables")).toBe(true);
    expect(isReadSql("EXPLAIN SELECT 1")).toBe(true);
    expect(isReadSql("INSERT INTO t VALUES (1)")).toBe(false);
    expect(isReadSql("DELETE FROM t")).toBe(false);
  });

  it("mock provider runs read SQL without confirm and write SQL with confirm", async () => {
    const calls: string[] = [];
    const provider = {
      async runReadSql(sql: string) {
        calls.push(`read:${sql}`);
        return { columns: ["ok"], rows: [{ ok: 1 }] };
      },
      async runPgDDL(sql: string, confirm: boolean) {
        calls.push(`ddl:${sql}:${confirm}`);
        return { ok: true, message: "OK" };
      },
    };

    const readPage = await runSqlStatement("SELECT 1 AS ok", provider, () => {
      throw new Error("confirm should not run for SELECT");
    });
    expect(readPage?.rows[0]?.ok).toBe(1);
    expect(calls).toEqual(["read:SELECT 1 AS ok"]);

    const writePage = await runSqlStatement("DELETE FROM public.todos", provider, () => true);
    expect(writePage?.columns).toEqual(["message"]);
    expect(calls).toContain("ddl:DELETE FROM public.todos:true");

    await expect(runSqlStatement("DELETE FROM public.todos", provider, () => false)).rejects.toThrow(
      /cancelled/,
    );
  });
});

describe("cls unavailable mapping", () => {
  it("detects topic-not-exist and HTTP 404", () => {
    expect(isClsUnavailableError(new Error("[SearchClsLog] topic not exist"))).toBe(true);
    expect(isClsUnavailableError("transport failure for /api/cloudbaseData/searchLogs: HTTP 404")).toBe(
      true,
    );
    expect(isClsUnavailableError("timeout")).toBe(false);
  });
});

describe("i18n + layout tokens", () => {
  it("uses the console-enable copy for CLS disabled", () => {
    expect(t("zh", "logs.cls.disabled")).toContain("CloudBase 控制台开通");
    expect(t("zh", "db.tab.sql")).toBe("SQL");
  });

  it("defines narrow-width toolbar classes", () => {
    expect(KIT_CSS).toContain(".cb-kit-page-head");
    expect(KIT_CSS).toContain("flex-wrap");
    expect(KIT_CSS).toContain("writing-mode: horizontal-tb");
  });
});
