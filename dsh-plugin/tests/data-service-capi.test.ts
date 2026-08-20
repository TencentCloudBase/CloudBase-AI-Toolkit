import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createCloudBaseDataService } from "../src/server/data-service.js";
import type { CloudBaseMcpBridge } from "../src/server/mcp-client.js";

const FORBIDDEN =
  /queryPgDatabase|queryLogs|queryGateway|manageGateway|queryPermissions|managePermissions|queryEnv|queryFunctions|queryAppAuth|queryHosting|queryStorage/;

const SOURCE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../src/server/data-service.ts"),
  "utf8",
);

type CapiCall = { service: string; action: string; params: Record<string, unknown> };

function capiBridge(
  handlers: Record<string, unknown>,
  authHandlers: Record<string, unknown> = {},
): CloudBaseMcpBridge & { capiCalls: CapiCall[]; toolCalls: Array<{ name: string; args: Record<string, unknown> }> } {
  const capiCalls: CapiCall[] = [];
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    capiCalls,
    toolCalls,
    async callTool(name: string, args: Record<string, unknown>) {
      toolCalls.push({ name, args });
      if (name === "callCloudApi") {
        const service = String(args.service);
        const action = String(args.action);
        const params = (args.params ?? {}) as Record<string, unknown>;
        capiCalls.push({ service, action, params });
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
      throw new Error(`unexpected tool ${name}`);
    },
    async listTools() {
      return ["callCloudApi", "auth"];
    },
    dispose() {},
  } as CloudBaseMcpBridge & {
    capiCalls: CapiCall[];
    toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  };
}

describe("data-service capi-only guard", () => {
  it("source has zero forbidden dedicated tool references", () => {
    const matches = SOURCE.match(new RegExp(FORBIDDEN.source, "g"));
    expect(matches ?? []).toHaveLength(0);
  });
});

describe("data-service capi mappings", () => {
  const envId = "test-env-001";

  const baseAuth = {
    "auth:status": {
      current_env_id: envId,
      auth_status: "READY",
      signedIn: true,
    },
  };

  const baseHandlers: Record<string, unknown> = {
    "tcb:DescribeEnvs": { EnvList: [{ EnvId: envId, Region: "ap-shanghai", RuntimeMode: "postgresql" }] },
    "tcb:ExecutePGSql": {
      rows: [{ name: "todos", schema: "public", kind: "r", estimated_rows: 3 }],
      columns: ["name", "schema"],
    },
    "tcb:DescribeUserList": {
      Data: { Total: 1, UserList: [{ Uid: "u1", Name: "alice", UserStatus: "ACTIVE" }] },
    },
    "tcb:SearchClsLog": { Results: [{ Msg: "hello", Level: "INFO" }], Context: "ctx-1" },
    "tcb:DescribeHTTPServiceRoute": {
      Domains: [{ Domain: "gw.example.com", Routes: [{ Path: "/api", UpstreamResourceName: "fn" }] }],
    },
    "tcb:DescribeCloudBaseGWService": { EnableService: true, EnableAuth: false },
    "tcb:ListFunctions": { Functions: [{ FunctionName: "fn_a" }] },
    "tcb:DescribeFunctions": { Functions: [{ FunctionName: "fn_a" }] },
    "tcb:DescribeHostingDomain": { Domains: [{ Domain: "x.tcloudbaseapp.com" }] },
    "tcb:DescribeUsage": { Usages: [{ Module: "FLEXDB", CreditsValue: 5 }] },
    "tcb:DescribeCurveData": { Values: [1, 2, 3] },
    "tcb:DescribeCloudAppList": { ServiceList: [{ ServiceName: "web", Domain: "https://web.example.com" }] },
    "tcb:DescribeCloudAppVersionList": { VersionList: [{ VersionName: "v1", Status: "success" }] },
    nosql: { collections: [] },
  };

  it("searchLogs uses SearchClsLog capi only", async () => {
    const bridge = capiBridge(baseHandlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    const result = await data.searchLogs({ queryString: "log:ERROR", limit: 10 });
    expect(result.entries.length).toBeGreaterThan(0);
    const call = bridge.capiCalls.find((c) => c.action === "SearchClsLog");
    expect(call).toBeTruthy();
    expect(String(call?.params.StartTime)).toMatch(/^\d{4}-\d{2}-\d{2} /);
    expect(call?.params.Sort).toBe("desc");
    expect(bridge.toolCalls.every((t) => !FORBIDDEN.test(t.name))).toBe(true);
  });

  it("searchLogs maps CLS topic-not-exist to a console enable message", async () => {
    const bridge = capiBridge(
      { ...baseHandlers, "tcb:SearchClsLog": new Error("[SearchClsLog] topic not exist") },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    await expect(data.searchLogs({ queryString: "*" })).rejects.toThrow(/控制台开通/);
    expect(await data.checkLogService()).toBe(false);
  });

  it("searchAppUsers uses DescribeUserList", async () => {
    const bridge = capiBridge(baseHandlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    const result = await data.searchAppUsers({ pageNo: 1, pageSize: 20 });
    expect(result.users[0]?.uid).toBe("u1");
    expect(bridge.capiCalls.find((c) => c.action === "DescribeUserList")?.params.EnvId).toBe(envId);
  });

  it("setAppUserStatus uses ModifyUser", async () => {
    const bridge = capiBridge({ ...baseHandlers, "tcb:ModifyUser": {} }, baseAuth);
    const data = createCloudBaseDataService(bridge);
    await data.setAppUserStatus("u1", false);
    const call = bridge.capiCalls.find((c) => c.action === "ModifyUser");
    expect(call?.params).toMatchObject({ Uid: "u1", UserStatus: "BLOCKED" });
  });

  it("listTables uses ExecutePGSql", async () => {
    const bridge = capiBridge(baseHandlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    const tables = await data.listTables();
    expect(tables[0]?.name).toBe("todos");
    expect(bridge.capiCalls.some((c) => c.action === "ExecutePGSql")).toBe(true);
  });

  it("listGatewayRoutes uses DescribeHTTPServiceRoute", async () => {
    const bridge = capiBridge(baseHandlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    const routes = await data.listGatewayRoutes();
    expect(routes[0]?.domain).toBe("gw.example.com");
  });

  it("authStatus requires DescribeEnvs probe", async () => {
    const bridge = capiBridge(
      { "tcb:DescribeEnvs": { EnvList: [] } },
      { "auth:status": { auth_status: "READY" } },
    );
    const data = createCloudBaseDataService(bridge);
    const status = await data.authStatus();
    expect(status.signedIn).toBe(false);
    expect(status.loginOptions?.length).toBeGreaterThan(0);
  });

  it("startLogin device-code does not mark signed-in without probe", async () => {
    const bridge = capiBridge(baseHandlers, {
      "auth:start_auth": {
        verification_uri_complete: "https://example.com/verify",
        user_code: "ABCD-1234",
      },
    });
    const data = createCloudBaseDataService(bridge);
    const status = await data.startLogin!("device-code");
    expect(status.signedIn).toBe(false);
    expect(status.verificationUrl).toContain("verify");
  });

  it("envInfo uses DescribeEnvs and ListFunctions capi", async () => {
    const bridge = capiBridge(baseHandlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    const info = await data.envInfo();
    expect(info.envId).toBe(envId);
    expect(info.functionCount).toBe(1);
    expect(bridge.capiCalls.some((c) => c.action === "ListFunctions")).toBe(true);
    expect(bridge.toolCalls.every((t) => t.name === "callCloudApi" || t.name === "auth")).toBe(true);
  });

  it("listFunctions uses tcb/ListFunctions", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        "tcb:ListFunctions": {
          Functions: [{ FunctionName: "hello", Runtime: "Nodejs18.15", Status: "Active", ModTime: "2026-08-01" }],
        },
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    const list = await data.listFunctions!({ searchKey: "he" });
    expect(list[0]?.name).toBe("hello");
    expect(bridge.capiCalls.find((c) => c.action === "ListFunctions")?.params).toMatchObject({
      EnvId: envId,
      SearchKey: "he",
    });
  });

  it("listCloudRunServices uses tcbr with version 2022-02-17 and only EnvId", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        "tcbr:DescribeCloudRunServers": { ServerList: [{ ServerName: "api", Status: "running", Cpu: "0.5" }] },
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    const list = await data.listCloudRunServices!();
    expect(list[0]?.name).toBe("api");
    const call = bridge.toolCalls.find((t) => t.args.action === "DescribeCloudRunServers");
    expect(call?.args.service).toBe("tcbr");
    expect(call?.args.version).toBe("2022-02-17");
    expect(call?.args.params).toEqual({ EnvId: envId });
  });

  it("listStorageBuckets maps DescribeEnvs Storages", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        "tcb:DescribeEnvs": {
          EnvList: [
            {
              EnvId: envId,
              Storages: [{ Bucket: "a-123", Region: "ap-shanghai", CreateTime: "2026-01-01", Size: 2048 }],
            },
          ],
        },
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    const buckets = await data.listStorageBuckets!();
    expect(buckets[0]?.name).toBe("a-123");
    expect(buckets[0]?.sizeLabel).toContain("kB");
  });

  it("getHostingOverview reads DomainSet", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        "tcb:DescribeHostingDomain": { DomainSet: [{ Domain: "app.tcloudbaseapp.com", Status: "ONLINE" }] },
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    const info = await data.getHostingOverview!();
    expect(info.domains[0]?.domain).toBe("app.tcloudbaseapp.com");
  });

  it("invokeFunction and bucket writes degrade without calling missing Actions", async () => {
    const bridge = capiBridge(baseHandlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    const invoke = await data.invokeFunction!("hello");
    expect("supported" in invoke && invoke.supported).toBe(false);
    const write = await data.describeBucketWriteSupport!();
    expect(write.supported).toBe(false);
    expect(bridge.capiCalls.some((c) => c.action === "InvokeFunction" || c.action === "CreateBucket")).toBe(
      false,
    );
  });
});
