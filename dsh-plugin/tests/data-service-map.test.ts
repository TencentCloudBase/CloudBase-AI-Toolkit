import { describe, expect, it } from "vitest";
import { createCloudBaseDataService } from "../src/server/data-service.js";
import type { CloudBaseMcpBridge } from "../src/server/mcp-client.js";

function capiBridge(
  handlers: Record<string, unknown>,
  authHandlers: Record<string, unknown> = {},
): CloudBaseMcpBridge & { calls: Array<{ name: string; args: Record<string, unknown> }> } {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    async callTool(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      if (name === "callCloudApi") {
        const service = String(args.service);
        const action = String(args.action);
        const key = `${service}:${action}`;
        const result = handlers[key] ?? handlers[action] ?? handlers["*"];
        if (result instanceof Error) throw result;
        return result ?? {};
      }
      if (name === "auth") {
        const action = String(args.action ?? "");
        const result = authHandlers[`auth:${action}`] ?? authHandlers.auth;
        if (result instanceof Error) throw result;
        return result ?? {};
      }
      if (name === "readNoSqlDatabaseStructure") {
        return handlers.nosql ?? { collections: [] };
      }
      throw new Error(`unexpected ${name}`);
    },
    async listTools() {
      return ["callCloudApi", "auth"];
    },
    dispose() {},
  } as CloudBaseMcpBridge & { calls: Array<{ name: string; args: Record<string, unknown> }> };
}

describe("cloudbase-data mapping", () => {
  const envId = "ai-share-d2guukyxybb63b206";
  const auth = { "auth:status": { current_env_id: envId, auth_status: "READY" } };

  it("exports product names and a full env id via capi DescribeEnvs", async () => {
    const bridge = capiBridge(
      {
        "tcb:DescribeEnvs": {
          EnvList: [{ EnvId: envId, Region: "ap-shanghai" }],
        },
        "tcb:ListFunctions": { Functions: [{ FunctionName: "fn_a" }] },
        "tcb:DescribeHostingDomain": { Domains: [{ Domain: "x.tcloudbaseapp.com" }] },
        "tcb:DescribeUsage": {
          Usages: [{ Module: "FLEXDB", CreditsValue: 12 }, { Module: "SCF", CreditsValue: 3 }],
        },
        "tcb:DescribeCurveData": { Values: [1, 4, 9] },
      },
      auth,
    );
    const data = createCloudBaseDataService(bridge);

    const info = await data.envInfo();
    expect(info.envId).toBe(envId);
    expect(info.regionLabel).toContain("上海");
    expect(info.functionCount).toBe(1);

    const usage = await data.usage();
    expect(usage.map((item) => item.productName)).toEqual(["文档型数据库", "云函数"]);
    expect(usage[0]?.usedLabel).toBe("12 资源点");
    expect(JSON.stringify(usage)).not.toContain("FLEXDB");
    expect(JSON.stringify(usage)).not.toContain("SCF");
    expect(bridge.calls.some((c) => c.name === "callCloudApi" && c.args.action === "DescribeEnvs")).toBe(
      true,
    );
  });

  it("counts hosting domains from DescribeHostingDomain", async () => {
    const bridge = capiBridge(
      {
        "tcb:DescribeEnvs": { EnvList: [{ EnvId: "env-x", Region: "ap-guangzhou" }] },
        "tcb:ListFunctions": { Functions: [] },
        "tcb:DescribeHostingDomain": { DefaultDomain: "env-x.tcloudbaseapp.com" },
      },
      { "auth:status": { current_env_id: "env-x" } },
    );
    const data = createCloudBaseDataService(bridge);
    const info = await data.envInfo();
    expect(info.hostingDomainCount).toBe(1);
    expect(info.regionLabel).toContain("广州");
  });

  it("maps DescribeCurveData metrics and ExecutePGSql table list", async () => {
    const bridge = capiBridge(
      {
        "tcb:DescribeCurveData": { Values: [1, 4, 9] },
        "tcb:ExecutePGSql": {
          rows: [
            {
              schema: "public",
              name: "todos",
              kind: "r",
              estimated_rows: 12,
            },
          ],
        },
        "tcb:DescribeEnvs": { EnvList: [{ EnvId: envId }] },
      },
      auth,
    );
    const data = createCloudBaseDataService(bridge);
    const metrics = await data.metrics();
    expect(metrics[0]?.points).toEqual([1, 4, 9]);
    expect(metrics[0]?.label).toBe("函数调用");

    const tables = await data.listTables();
    expect(tables[0]).toMatchObject({
      name: "todos",
      schema: "public",
      kind: "table",
      rowCount: 12,
    });
  });

  it("quotes table identifiers in readRows SQL", async () => {
    const bridge = capiBridge(
      {
        "tcb:ExecutePGSql": { rows: [{ id: 1 }], columns: ["id"] },
        "tcb:DescribeEnvs": { EnvList: [{ EnvId: envId }] },
      },
      auth,
    );
    const data = createCloudBaseDataService(bridge);
    await data.readRows("public.todos", { limit: 10, offset: 0 });
    const capiCall = bridge.calls.find((c) => c.args.action === "ExecutePGSql");
    const sql = String((capiCall?.args.params as Record<string, unknown>)?.Sql);
    expect(sql).toContain('"public"."todos"');
    expect(sql).not.toContain("public.todos LIMIT");
  });

  it("rejects write SQL on the panel read path", async () => {
    const data = createCloudBaseDataService(capiBridge({}, auth));
    await expect(data.runReadSql("DELETE FROM public.todos")).rejects.toThrow(/写 SQL/);
  });

  it("maps ExecutePGSql columns and DescribeUserList users", async () => {
    const bridge = capiBridge(
      {
        "tcb:ExecutePGSql": {
          rows: [
            { column_name: "id", data_type: "integer", is_nullable: "NO", is_pk: true },
            { column_name: "title", data_type: "text", is_nullable: "YES", is_pk: false },
          ],
        },
        "tcb:DescribeUserList": {
          Data: { UserList: [{ Uid: "u1", Name: "alice", UserStatus: "ACTIVE" }] },
        },
        "tcb:ListFunctions": { Functions: [] },
        "tcb:DescribeEnvs": { EnvList: [{ EnvId: envId }] },
      },
      auth,
    );
    const data = createCloudBaseDataService(bridge);
    const columns = await data.listTableColumns("public.todos");
    expect(columns[0]).toMatchObject({ name: "id", primaryKey: true, dataType: "integer" });
    expect(columns[1]?.nullable).toBe(true);
    const users = await data.listAppUsers({ limit: 20 });
    expect(users[0]).toMatchObject({ uid: "u1", name: "alice" });
    const secrets = await data.listSecrets();
    expect(secrets).toEqual([]);
  });
});
