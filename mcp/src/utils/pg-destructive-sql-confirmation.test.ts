import { describe, expect, it, vi, afterEach } from "vitest";
import { z } from "zod";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { ElicitRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { wrapServerWithTelemetry } from "./tool-wrapper.js";
import { resolveDestructiveAction } from "./destructive-actions.js";
import { t } from "../i18n/index.js";

/**
 * PostgreSQL 破坏性 SQL 的执行前确认（#52）。
 *
 * 判据复用 `sql-risk.ts` 的 `isDestructiveSql`，但**触发面是参数谓词**：同一个
 * `managePgDatabase.execute` 既能跑 SELECT 也能跑 DELETE，按 action 名拦会把两者一起拦下。
 *
 * 范围（Booker 给定）：① execute 里的 DELETE；② applyMigration 里的 DROP / TRUNCATE / ALTER…DROP；
 * ③ allowDdlViaExecute=true 时的 execute（同样只 DROP / TRUNCATE / ALTER…DROP）。
 * 普通 INSERT / UPDATE / CREATE TABLE **不拦**。
 *
 * 全程 mock / 本地：不连任何真实数据库。
 */

const DELETE_SQL = 'DELETE FROM "orders" WHERE status = $$cancelled$$';
const DDL_SQL = 'DROP TABLE "orders"';
const TRUNCATE_SQL = 'TRUNCATE TABLE "orders"';
const ALTER_DROP_SQL = 'ALTER TABLE "orders" DROP COLUMN "legacy"';

function pgResolve(action: "execute" | "applyMigration", extra: Record<string, unknown>) {
  return resolveDestructiveAction("managePgDatabase", { action, ...extra });
}

describe("谓词触发面：只有参数里确实有破坏性 SQL 才命中", () => {
  it("① execute 里的 DELETE ⇒ 命中，且文案点名那条语句", () => {
    const hit = pgResolve("execute", { sql: DELETE_SQL, confirm: true });

    expect(hit?.key).toBe("managePgDatabase.execute");
    expect(hit?.spec.messageKey).toBe("confirmation.message.pgExecuteDestructiveSql");
    expect(hit?.spec.target({ sql: DELETE_SQL })).toEqual({ resource: DELETE_SQL });
  });

  it("② applyMigration 里的 DROP / TRUNCATE / ALTER…DROP ⇒ 命中（三种都要）", () => {
    for (const sql of [DDL_SQL, TRUNCATE_SQL, ALTER_DROP_SQL]) {
      const hit = pgResolve("applyMigration", { sql, migrationName: "drop_orders" });
      expect(hit?.key, `${sql} 应命中`).toBe("managePgDatabase.applyMigration");
      expect(hit?.spec.messageKey).toBe("confirmation.message.pgApplyMigrationDestructive");
    }
  });

  it("③ execute + allowDdlViaExecute=true 的 DDL ⇒ 命中；没开这个开关时不命中（DDL 走 migration）", () => {
    for (const sql of [DDL_SQL, TRUNCATE_SQL, ALTER_DROP_SQL]) {
      expect(
        pgResolve("execute", { sql, allowDdlViaExecute: true })?.key,
        `${sql}（allowDdlViaExecute=true）应命中`,
      ).toBe("managePgDatabase.execute");
      expect(
        pgResolve("execute", { sql, allowDdlViaExecute: false })?.key,
        `${sql}（未开 allowDdlViaExecute）不该命中`,
      ).toBeUndefined();
    }
  });

  it("④ INSERT / UPDATE / CREATE TABLE 不命中（普通写操作不加确认）", () => {
    const ordinary = [
      'INSERT INTO "orders" ("id") VALUES (1)',
      'UPDATE "orders" SET "status" = $$paid$$ WHERE "id" = 1',
      'CREATE TABLE "orders" ("id" int)',
      'SELECT * FROM "orders"',
    ];
    for (const sql of ordinary) {
      expect(pgResolve("execute", { sql })?.key, `${sql} 不该命中`).toBeUndefined();
      expect(pgResolve("applyMigration", { sql })?.key, `${sql} 不该命中`).toBeUndefined();
    }
    // DDL 不在 execute 的默认范围里：CREATE TABLE 即使开了 allowDdl 也不是破坏性
    expect(pgResolve("execute", { sql: ordinary[2], allowDdlViaExecute: true })?.key).toBeUndefined();
  });

  it("多语句脚本：只挑出破坏性那几条，并把条数报出来", () => {
    const script = `INSERT INTO "a" VALUES (1);\nDELETE FROM "b";\nDROP TABLE "c";`;
    const hit = pgResolve("execute", { sql: script, allowDdlViaExecute: true });

    expect(hit?.spec.target({ sql: script, allowDdlViaExecute: true })).toEqual({
      resource: 'DELETE FROM "b"',
      count: 2,
    });
  });

  it("前导注释 / 大小写 / 结尾分号都不影响判定", () => {
    expect(pgResolve("execute", { sql: '-- cleanup\ndelete from "b";' })?.key).toBe(
      "managePgDatabase.execute",
    );
    expect(pgResolve("applyMigration", { sql: '  /* 前置说明 */ TrUnCaTe table "b";' })?.key).toBe(
      "managePgDatabase.applyMigration",
    );
  });

  it("⑥ 未命中时既有行为不变：不动名单里的其它动作，也不改它们的判定", () => {
    // 其它条目仍然是"命中 action 即触发"（没有 when）
    expect(
      resolveDestructiveAction("manageFunctions", { action: "deleteFunction", functionName: "f" })?.key,
    ).toBe("manageFunctions.deleteFunction");
    // 非名单动作照旧不命中
    expect(resolveDestructiveAction("managePgDatabase", { action: "planMigration", sql: DDL_SQL })).toBeUndefined();
    expect(resolveDestructiveAction("queryPgDatabase", { action: "sql", sql: DELETE_SQL })).toBeUndefined();
  });
});

// ---- 真实 elicitation 通道：拒绝 ⇒ 绝不执行 ----

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanup.map((fn) => fn()));
  cleanup.length = 0;
});

async function setupGuard(
  options: { reply?: { action: string; content?: Record<string, unknown> }; answerDelayMs?: number } = {},
) {
  const server = new McpServer({ name: "pg-guard-server", version: "0.0.1" });
  (server as unknown as { cloudBaseOptions?: unknown }).cloudBaseOptions = { envId: "env-pg" };
  wrapServerWithTelemetry(server);

  const handler = vi.fn(async () => ({
    content: [{ type: "text" as const, text: "handler 执行了" }],
  }));
  server.registerTool(
    "managePgDatabase",
    {
      title: "managePgDatabase",
      description: "pg guard probe",
      inputSchema: {
        action: z.string(),
        sql: z.string().optional(),
        confirm: z.boolean().optional(),
        allowDdlViaExecute: z.boolean().optional(),
        migrationName: z.string().optional(),
      },
    },
    handler,
  );

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "pg-guard-client", version: "0.0.1" },
    { capabilities: { elicitation: { form: {} } } },
  );
  const elicitations: Array<Record<string, unknown>> = [];
  client.setRequestHandler(ElicitRequestSchema, async (req) => {
    elicitations.push(req.params as unknown as Record<string, unknown>);
    if (options.answerDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.answerDelayMs));
    }
    return (options.reply ?? { action: "decline" }) as never;
  });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
  cleanup.push(() => client.close(), () => server.close());
  return { server, client, handler, elicitations };
}

describe("真实通道：人拒绝 ⇒ 不执行", () => {
  it("⑤ DELETE 被拦：弹出确认、人拒绝 ⇒ handler 一次都没跑", async () => {
    const { client, handler, elicitations } = await setupGuard({ reply: { action: "decline" }, answerDelayMs: 600 });

    const result = await client.callTool({
      name: "managePgDatabase",
      arguments: { action: "execute", sql: DELETE_SQL, confirm: true },
    });

    expect(elicitations).toHaveLength(1);
    // 确认框里必须点名那条语句，而不是只问"确定吗"
    expect(String(elicitations[0].message)).toContain('DELETE FROM "orders"');
    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).not.toBe(true);
  });

  it("confirm=true 不能替代人的确认：人拒绝时照样不执行", async () => {
    const { client, handler } = await setupGuard({ reply: { action: "decline" }, answerDelayMs: 600 });

    const result = await client.callTool({
      name: "managePgDatabase",
      arguments: { action: "execute", sql: DDL_SQL, confirm: true, allowDdlViaExecute: true },
    });

    expect(handler).not.toHaveBeenCalled();
    expect(result.isError).not.toBe(true);
  });

  it("人确认后才执行（同一套通道的正向对照）", async () => {
    // 受控选项：客户端必须把人选的那一项回填进 content.confirm（不接受自由文本）
    const { client, handler } = await setupGuard({
      reply: { action: "accept", content: { confirm: t("confirmation.option.confirm") } },
    });

    const result = await client.callTool({
      name: "managePgDatabase",
      arguments: { action: "execute", sql: DELETE_SQL, confirm: true },
    });

    expect(handler).toHaveBeenCalledTimes(1);
    expect((result.content as Array<{ text: string }>)[0].text).toContain("handler 执行了");
  });

  it("⑥ 未命中（INSERT）⇒ 不弹确认、照常执行", async () => {
    const { client, handler, elicitations } = await setupGuard();

    const result = await client.callTool({
      name: "managePgDatabase",
      arguments: { action: "execute", sql: 'INSERT INTO "orders" ("id") VALUES (1)', confirm: true },
    });

    expect(elicitations).toHaveLength(0);
    expect(handler).toHaveBeenCalledTimes(1);
    expect((result.content as Array<{ text: string }>)[0].text).toContain("handler 执行了");
  });
});
