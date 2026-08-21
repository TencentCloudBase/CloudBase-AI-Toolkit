import { describe, expect, it, vi } from "vitest";
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

  it("searchLogs maps CLS topic-not-exist to a not-enabled message", async () => {
    const bridge = capiBridge(
      { ...baseHandlers, "tcb:SearchClsLog": new Error("[SearchClsLog] topic not exist") },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    await expect(data.searchLogs({ queryString: "*" })).rejects.toThrow("当前环境未开通日志服务");
    expect(await data.checkLogService()).toBe(false);
  });

  it("searchAppUsers uses DescribeUserList", async () => {
    const bridge = capiBridge(baseHandlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    const result = await data.searchAppUsers({ pageNo: 1, pageSize: 20 });
    expect(result.users[0]?.uid).toBe("u1");
    expect(bridge.capiCalls.find((c) => c.action === "DescribeUserList")?.params.EnvId).toBe(envId);
  });

  it("searchAppUsers with keyword does not send server-side AND filters", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        "tcb:DescribeUserList": {
          Data: {
            Total: 3,
            UserList: [
              { Uid: "u1", Name: "alice", Phone: "13800000001", UserStatus: "ACTIVE" },
              { Uid: "u2", Name: "", Email: "bob@example.com", UserStatus: "ACTIVE" },
              { Uid: "u3", Name: "carol", Email: "carol@example.com", Phone: "13900000003", UserStatus: "ACTIVE" },
            ],
          },
        },
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    // Phone-only user: server-side Name+Email AND filter would drop this row,
    // so the fix pulls up to 100 rows and filters on the client.
    const result = await data.searchAppUsers({ keyword: "13800000001", pageNo: 1, pageSize: 20 });
    expect(result.users.map((u) => u.uid)).toEqual(["u1"]);
    const call = bridge.capiCalls.find((c) => c.action === "DescribeUserList");
    expect(call?.params.Name).toBeUndefined();
    expect(call?.params.Email).toBeUndefined();
    expect(call?.params.PageSize).toBe(100);
  });

  it("searchAppUsers filters on email and name client-side", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        "tcb:DescribeUserList": {
          Data: {
            Total: 3,
            UserList: [
              { Uid: "u1", Name: "alice", Phone: "13800000001", UserStatus: "ACTIVE" },
              { Uid: "u2", Name: "", Email: "bob@example.com", UserStatus: "ACTIVE" },
              { Uid: "u3", Name: "carol", Email: "carol@example.com", Phone: "13900000003", UserStatus: "ACTIVE" },
            ],
          },
        },
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    const byEmail = await data.searchAppUsers({ keyword: "bob@example.com", pageNo: 1, pageSize: 20 });
    expect(byEmail.users.map((u) => u.uid)).toEqual(["u2"]);
    const byName = await data.searchAppUsers({ keyword: "carol", pageNo: 1, pageSize: 20 });
    expect(byName.users.map((u) => u.uid)).toEqual(["u3"]);
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

  it("deleteAuthDomain uses tcb DeleteAuthDomain with DomainIds and requires confirm", async () => {
    const bridge = capiBridge(baseHandlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    await expect(data.deleteAuthDomain!("d1", false)).rejects.toThrow("confirm");
    await data.deleteAuthDomain!("d1", true);
    const call = bridge.capiCalls.find((c) => c.action === "DeleteAuthDomain");
    expect(call?.service).toBe("tcb");
    expect(call?.params).toEqual({ EnvId: envId, DomainIds: ["d1"] });
  });

  it("listAuthDomains maps DescribeAuthDomains rows with id and status", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        "tcb:DescribeAuthDomains": {
          Domains: [{ Domain: "app.example.com", Id: "id-1", Status: "NORMAL" }],
        },
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    const domains = await data.listAuthDomains?.();
    expect(domains?.[0]).toMatchObject({ domain: "app.example.com", id: "id-1", status: "NORMAL" });
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

  it("envInfo derives postgresql when RuntimeMode missing but PostgreSQL present", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        "tcb:DescribeEnvs": {
          EnvList: [
            {
              EnvId: envId,
              Region: "ap-shanghai",
              PostgreSQL: [{ InstanceId: "pg-1", Status: "RUNNING" }],
              Meta: [{ Key: "postgresql", Value: "enable" }],
            },
          ],
        },
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    const info = await data.envInfo();
    expect(info.runtimeMode).toBe("postgresql");
    expect(info.isPostgresEnv).toBe(true);
  });

  it("envInfo uses DescribeEnvs and ListFunctions capi", async () => {
    const bridge = capiBridge(baseHandlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    const info = await data.envInfo();
    expect(info.envId).toBe(envId);
    expect(info.functionCount).toBe(1);
    expect(bridge.toolCalls.every((t) => t.name === "callCloudApi" || t.name === "auth")).toBe(true);
  });

  it("envInfo probes ExecutePGSql when DescribeEnvs record has no PG signal", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        // weda / platform env invisible to DescribeEnvs → empty EnvList
        "tcb:DescribeEnvs": { EnvList: [] },
        // data plane is authorized → probe succeeds
        "tcb:ExecutePGSql": { rows: [{ ok: 1 }] },
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    const info = await data.envInfo();
    expect(info.isPostgresEnv).toBe(true);
    expect(info.runtimeMode).toBe("postgresql");
    const probe = bridge.capiCalls.find((c) => c.action === "ExecutePGSql");
    expect(probe?.params).toMatchObject({ EnvId: envId, Sql: expect.stringContaining("SELECT 1") });
  });

  it("envInfo keeps nosql when ExecutePGSql probe fails", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        "tcb:DescribeEnvs": { EnvList: [{ EnvId: envId, Region: "ap-shanghai", RuntimeMode: "nosql" }] },
        "tcb:ExecutePGSql": new Error("environment not found or not authorized"),
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    const info = await data.envInfo();
    expect(info.isPostgresEnv).toBe(false);
    expect(info.runtimeMode).toBe("nosql");
  });

  it("listFunctions uses tcb ListFunctions", async () => {
    const bridge = capiBridge(baseHandlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    const fns = await data.listFunctions!({ searchKey: "fn" });
    expect(fns[0]?.name).toBe("fn_a");
    const call = bridge.capiCalls.find((c) => c.action === "ListFunctions");
    expect(call?.service).toBe("tcb");
    expect(call?.params.SearchKey).toBe("fn");
  });

  it("listStorageBuckets maps DescribeEnvs Storages", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        "tcb:DescribeEnvs": {
          EnvList: [
            {
              EnvId: envId,
              Storages: [{ Bucket: "636c-test-1", Region: "ap-shanghai", CdnDomain: "cdn.example.com" }],
            },
          ],
        },
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    const buckets = await data.listStorageBuckets!();
    expect(buckets[0]?.name).toBe("636c-test-1");
    expect(buckets[0]?.region).toBe("ap-shanghai");
  });

  it("listCloudRunServices uses tcbr DescribeCloudRunServers with API version", async () => {
    const bridge = capiBridge(
      { ...baseHandlers, "tcbr:DescribeCloudRunServers": { ServerList: [], Total: 0 } },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    const servers = await data.listCloudRunServices!();
    expect(servers).toEqual([]);
    const call = bridge.toolCalls.find((t) => t.args.action === "DescribeCloudRunServers");
    expect(call?.args.service).toBe("tcbr");
    expect(call?.args.version).toBe("2022-02-17");
    expect(call?.args.params).toEqual({ EnvId: envId });
  });

  it("listHostingDomains reads DomainSet", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        "tcb:DescribeHostingDomain": { DomainSet: [{ Domain: "a.tcloudbaseapp.com", Status: "online" }] },
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    const domains = await data.listHostingDomains!();
    expect(domains.some((item) => item.domain.includes("tcloudbaseapp.com"))).toBe(true);
  });

  it("createStorageBucket writes via ExecutePGSql on PG env", async () => {
    const bridge = capiBridge(baseHandlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    await data.createStorageBucket!("my-bucket");
    expect(bridge.capiCalls.some((c) => c.action === "ExecutePGSql")).toBe(true);
    const pgCall = bridge.capiCalls.find((c) => c.action === "ExecutePGSql");
    expect(JSON.stringify(pgCall?.params)).toMatch(/storage\.buckets/);
    expect(bridge.capiCalls.some((c) => c.action === "CreateBucket")).toBe(false);
  });

  it("listStorageBuckets on PG env reads storage.buckets via ExecutePGSql", async () => {
    const handlers = {
      ...baseHandlers,
      "tcb:ExecutePGSql": {
        rows: [{ id: "avatars", name: "avatars", public: false, created_at: "2026-01-01" }],
      },
    };
    const bridge = capiBridge(handlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    const buckets = await data.listStorageBuckets!();
    expect(buckets[0]?.name).toBe("avatars");
    expect(bridge.capiCalls.some((c) => c.action === "ExecutePGSql")).toBe(true);
    expect(JSON.stringify(bridge.capiCalls.find((c) => c.action === "ExecutePGSql")?.params)).toMatch(/storage\.buckets/);
  });

  it("deleteStorageBucket writes DELETE via ExecutePGSql on PG env", async () => {
    const bridge = capiBridge(baseHandlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    await data.deleteStorageBucket!("avatars", true);
    const pgCall = bridge.capiCalls.find((c) => c.action === "ExecutePGSql");
    expect(JSON.stringify(pgCall?.params)).toMatch(/DELETE FROM storage\.buckets/);
  });

  it("createStorageBucket rejects on non-PG env with in-place reason", async () => {
    const handlers = {
      ...baseHandlers,
      "tcb:DescribeEnvs": { EnvList: [{ EnvId: envId, Region: "ap-shanghai", RuntimeMode: "nosql" }] },
    };
    const bridge = capiBridge(handlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    await expect(data.createStorageBucket!("extra")).rejects.toThrow("该环境不支持创建存储桶");
    expect(bridge.capiCalls.some((c) => c.action === "ExecutePGSql")).toBe(false);
  });

  it("createStorageBucket writes public flag via ExecutePGSql when opted in", async () => {
    const bridge = capiBridge(baseHandlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    await data.createStorageBucket!("public-bucket", { public: true });
    const pgCall = bridge.capiCalls.find((c) => c.action === "ExecutePGSql");
    expect(JSON.stringify(pgCall?.params)).toMatch(/storage\.buckets/);
    expect(JSON.stringify(pgCall?.params)).toContain("true");
  });

  it("invokeFunction uses scf Invoke", async () => {
    const handlers = {
      ...baseHandlers,
      "scf:Invoke": { Result: { RetMsg: "ok" } },
    };
    const bridge = capiBridge(handlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    const result = await data.invokeFunction!("fn_a", "{}");
    expect(result.result).toContain("ok");
    expect(bridge.capiCalls.some((c) => c.service === "scf" && c.action === "Invoke")).toBe(true);
    expect(bridge.capiCalls.some((c) => c.action === "InvokeFunction")).toBe(false);
  });

  it("listHostingObjects lists hosting files via host COS contract", async () => {
    const handlers = {
      ...baseHandlers,
      "tcb:DescribeStaticStore": {
        Data: [{ Bucket: "tcb-hosting-test-123", Region: "ap-shanghai", Status: "online" }],
      },
    };
    const authHandlers = {
      ...baseAuth,
      "auth:get_temp_credentials": {
        ok: true,
        code: "TEMP_CREDENTIALS_READY",
        credentials: {
          secretId: "AKID-secret-id",
          secretKey: "secret-key-value",
          token: "session-token-value",
          masked: false,
        },
      },
    };
    const bridge = capiBridge(handlers, authHandlers);
    const data = createCloudBaseDataService(bridge);
    const xml =
      `<?xml version="1.0" encoding="UTF-8"?>` +
      `<ListBucketResult>` +
      `<Name>tcb-hosting-test-123</Name><Prefix></Prefix><Marker></Marker><MaxKeys>1000</MaxKeys>` +
      `<IsTruncated>false</IsTruncated>` +
      `<Contents><Key>index.html</Key><LastModified>2026-01-01T00:00:00Z</LastModified><ETag>"abc"</ETag><Size>1024</Size><StorageClass>STANDARD</StorageClass></Contents>` +
      `<Contents><Key>assets/logo.png</Key><LastModified>2026-01-02T00:00:00Z</LastModified><ETag>"def"</ETag><Size>2048</Size><StorageClass>STANDARD</StorageClass></Contents>` +
      `<CommonPrefixes><Prefix>css/</Prefix></CommonPrefixes>` +
      `</ListBucketResult>`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      expect(url).toContain("tcb-hosting-test-123.cos.ap-shanghai.myqcloud.com");
      return {
        ok: true,
        status: 200,
        text: async () => xml,
      } as Response;
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const objects = await data.listHostingObjects!("");
      expect(objects.some((o) => o.cloudPath === "index.html" && o.size === 1024)).toBe(true);
      expect(objects.some((o) => o.isDirectory && o.cloudPath === "css/")).toBe(true);
      const authCall = bridge.toolCalls.find(
        (t) => t.name === "auth" && t.args.action === "get_temp_credentials",
      );
      expect(authCall?.args.action).toBe("get_temp_credentials");
      expect(authCall?.args.confirm).toBe("yes");
      const authHeader = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string> | undefined;
      expect(authHeader?.Authorization).toContain("q-sign-algorithm=sha1");
      expect(authHeader?.["x-cos-security-token"]).toBe("session-token-value");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("listHostingObjects returns empty when hosting store is absent", async () => {
    const handlers = {
      ...baseHandlers,
      "tcb:DescribeStaticStore": { Data: null },
    };
    const bridge = capiBridge(handlers, baseAuth);
    const data = createCloudBaseDataService(bridge);
    const objects = await data.listHostingObjects!("");
    expect(objects).toEqual([]);
    expect(bridge.toolCalls.some((t) => t.name === "auth" && t.args.action === "get_temp_credentials")).toBe(false);
  });

  it("listAccessEndpoints falls back to DescribeEnvs StaticStorages domains", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        "tcb:DescribeCloudAppList": { ServiceList: [] },
        "tcb:DescribeHostingDomain": { DomainSet: [] },
        "tcb:DescribeEnvs": {
          EnvList: [
            {
              EnvId: envId,
              StaticStorages: [{ StaticDomain: "my-app.tcloudbaseapp.com", Status: "online" }],
            },
          ],
        },
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    const endpoints = await data.listAccessEndpoints();
    expect(endpoints.some((e) => e.url === "https://my-app.tcloudbaseapp.com")).toBe(true);
  });

  it("listAccessEndpoints returns [] when env is not bound instead of throwing", async () => {
    const bridge = capiBridge(baseHandlers, {
      "auth:status": { auth_status: "READY", current_env_id: null },
    });
    const data = createCloudBaseDataService(bridge);
    await expect(data.listAccessEndpoints()).resolves.toEqual([]);
    await expect(data.listDeployments()).resolves.toEqual([]);
  });

  it("listDeployments maps CloudApp versions and never throws on CAPI failure", async () => {
    const bridge = capiBridge(
      {
        ...baseHandlers,
        "tcb:DescribeCloudAppList": new Error("[DescribeCloudAppList] network down"),
      },
      baseAuth,
    );
    const data = createCloudBaseDataService(bridge);
    await expect(data.listDeployments()).resolves.toEqual([]);
    await expect(data.listAccessEndpoints()).resolves.toEqual([]);
  });
});
