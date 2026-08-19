import { describe, expect, it } from "vitest";
import { createCloudBaseDataService } from "../src/server/data-service.js";
import type { CloudBaseMcpBridge } from "../src/server/mcp-client.js";

function fakeBridge(handlers: Record<string, unknown>): CloudBaseMcpBridge & {
  calls: Array<{ name: string; args: Record<string, unknown> }>;
} {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    calls,
    async callTool(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      const key = `${name}:${String(args.action ?? "")}`;
      if (!(key in handlers) && !(name in handlers)) {
        throw new Error(`unexpected ${key}`);
      }
      const result = handlers[key] ?? handlers[name];
      if (result instanceof Error) throw result;
      return result;
    },
    async listTools() {
      return Object.keys(handlers);
    },
    dispose() {},
  } as CloudBaseMcpBridge & { calls: Array<{ name: string; args: Record<string, unknown> }> };
}

describe("cloudbase-data mapping", () => {
  it("exports product names and a full env id, passing envId into queryEnv", async () => {
    const bridge = fakeBridge({
      "auth:status": { envId: "ai-share-d2guukyxybb63b206" },
      "queryEnv:info": {
        EnvInfo: {
          EnvId: "ai-share-d2guukyxybb63b206",
          Region: "ap-shanghai",
        },
      },
      "queryFunctions:listFunctions": { Functions: [{ Name: "fn_a" }] },
      "queryHosting:websiteConfig": { defaultDomain: "x.tcloudbaseapp.com" },
      "queryEnv:usage": {
        Usages: [{ Module: "FLEXDB", CreditsValue: 12 }, { Module: "SCF", CreditsValue: 3 }],
      },
    });
    const data = createCloudBaseDataService(bridge);

    const info = await data.envInfo();
    expect(info.envId).toBe("ai-share-d2guukyxybb63b206");
    expect(info.regionLabel).toContain("上海");
    expect(info.functionCount).toBe(1);

    const usage = await data.usage();
    expect(usage.map((item) => item.productName)).toEqual(["文档型数据库", "云函数"]);
    expect(usage[0]?.usedLabel).toBe("12 资源点");
    expect(JSON.stringify(usage)).not.toContain("FLEXDB");
    expect(JSON.stringify(usage)).not.toContain("SCF");
    // envId 来自 auth 绑定环境，而不是插件硬编码传入
    expect(bridge.calls.some((call) => call.name === "queryEnv" && call.args.envId)).toBe(true);
    expect(bridge.calls.find((call) => call.name === "auth")?.args).toEqual({ action: "status" });
  });

  it("counts hosting domains from CdnDomain without fabricating extra sites", async () => {
    const bridge = fakeBridge({
      "queryEnv:info": { EnvInfo: { EnvId: "env-x", Region: "ap-guangzhou" } },
      "queryFunctions:listFunctions": { Functions: [] },
      "queryHosting:websiteConfig": { CdnDomain: "env-x.tcloudbaseapp.com" },
    });
    const data = createCloudBaseDataService(bridge);
    const info = await data.envInfo();
    expect(info.hostingDomainCount).toBe(1);
    expect(info.regionLabel).toContain("广州");
  });

  it("maps queryEnv metrics Curve.Values and queryPgDatabase metadata", async () => {
    const bridge = fakeBridge({
      "queryEnv:metrics": {
        MetricName: "FunctionInvocation",
        Curve: { Values: [1, 4, 9], NewValues: [1, 4, 9] },
      },
      "queryPgDatabase:metadata": {
        objects: [
          {
            schema: "public",
            name: "todos",
            schemaTable: "public.todos",
            kind: "table",
            estimatedRows: 12,
            columnCount: 4,
          },
        ],
      },
    });
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
      columnCount: 4,
    });
  });

  it("quotes table identifiers in readRows SQL", async () => {
    const bridge = fakeBridge({
      "queryPgDatabase:sql": { rows: [{ id: 1 }], columns: ["id"] },
    });
    const data = createCloudBaseDataService(bridge);
    await data.readRows("public.todos", { limit: 10, offset: 0 });
    const sql = String(bridge.calls[0]?.args.sql);
    expect(sql).toContain('"public"."todos"');
    expect(sql).not.toContain("public.todos LIMIT");
  });

  it("rejects write SQL on the panel read path", async () => {
    const data = createCloudBaseDataService(fakeBridge({}));
    await expect(data.runReadSql("DELETE FROM public.todos")).rejects.toThrow(/写 SQL/);
  });
});
