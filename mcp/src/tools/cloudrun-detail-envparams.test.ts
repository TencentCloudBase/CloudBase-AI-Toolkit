import { describe, expect, it, vi } from "vitest";

const { mockGetCloudBaseManager, mockGetEnvId } = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
}));

async function createCloudRunTools() {
  const tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }> = {};
  const server: any = {
    cloudBaseOptions: {},
    ide: "CodeBuddy",
    server: {
      sendLoggingMessage: vi.fn(),
    },
    registerTool: vi.fn((name: string, meta: any, handler: (args: any) => Promise<any>) => {
      tools[name] = { meta, handler };
    }),
  };
  const { registerCloudRunTools } = await import("./cloudrun.js");
  registerCloudRunTools(server);
  return { tools, server };
}

function parseToolResult(res: any) {
  return JSON.parse(res.content[0].text);
}

function makeManager(detailResponse: any) {
  return {
    commonService: vi.fn().mockReturnValue({ call: vi.fn() }),
    cloudrun: {
      detail: vi.fn().mockResolvedValue(detailResponse),
      getDeployRecords: vi.fn().mockResolvedValue({
        DeployRecords: [
          {
            DeployId: "d1",
            DeployTime: "2026-09-01 10:00:00",
            Status: "normal",
            RunId: "run-1",
            BuildId: 100,
            FlowRatio: 100,
            ImageUrl: "",
            ScaleStatus: "normal",
            HasTraffic: true,
            TrafficType: "FULL",
            IsReleasing: false,
          },
        ],
      }),
    },
  };
}

function makeDetailResponse(envParams: string) {
  return {
    BaseInfo: { ServerName: "my-svc", Status: "normal" },
    ServerConfig: {
      EnvParams: envParams,
      Cpu: 0.5,
      Mem: 1,
      MinNum: 0,
      MaxNum: 2,
    },
    OnlineVersionInfos: [
      { VersionName: "my-svc-001", ImageUrl: "img", FlowRatio: "100" },
    ],
    RequestId: "req-1",
  };
}

describe("queryCloudRun detail EnvParams masking", () => {
  it("masks EnvParams values by default while preserving keys", async () => {
    const manager = makeManager(
      makeDetailResponse(
        JSON.stringify({
          DATABASE_URL: "postgres://user:pass@10.0.0.1:5432/db",
          NODE_ENV: "production",
        }),
      ),
    );
    mockGetCloudBaseManager.mockResolvedValue(manager);

    const { tools } = await createCloudRunTools();
    const res = await tools.queryCloudRun.handler({
      action: "detail",
      detailServerName: "my-svc",
    });
    const payload = parseToolResult(res);

    expect(payload.success).toBe(true);
    const envParams = JSON.parse(payload.data.service.ServerConfig.EnvParams);
    expect(envParams).toEqual({
      DATABASE_URL: "***",
      NODE_ENV: "***",
    });
    expect(payload.data.service.ServerConfig.Cpu).toBe(0.5);
  });

  it("returns plaintext EnvParams when revealEnvParams=true", async () => {
    const plaintext = JSON.stringify({
      DATABASE_URL: "postgres://user:pass@10.0.0.1:5432/db",
    });
    const manager = makeManager(makeDetailResponse(plaintext));
    mockGetCloudBaseManager.mockResolvedValue(manager);

    const { tools } = await createCloudRunTools();
    const res = await tools.queryCloudRun.handler({
      action: "detail",
      detailServerName: "my-svc",
      revealEnvParams: true,
    });
    const payload = parseToolResult(res);

    expect(payload.success).toBe(true);
    expect(payload.data.service.ServerConfig.EnvParams).toBe(plaintext);
  });

  it("masks the whole EnvParams string when it is not valid JSON", async () => {
    const manager = makeManager(makeDetailResponse("not-a-json-value"));
    mockGetCloudBaseManager.mockResolvedValue(manager);

    const { tools } = await createCloudRunTools();
    const res = await tools.queryCloudRun.handler({
      action: "detail",
      detailServerName: "my-svc",
    });
    const payload = parseToolResult(res);

    expect(payload.success).toBe(true);
    expect(payload.data.service.ServerConfig.EnvParams).toBe("***");
  });

  it("keeps the detail response intact when EnvParams is absent or empty", async () => {
    const manager = makeManager(makeDetailResponse(""));
    mockGetCloudBaseManager.mockResolvedValue(manager);

    const { tools } = await createCloudRunTools();
    const res = await tools.queryCloudRun.handler({
      action: "detail",
      detailServerName: "my-svc",
    });
    const payload = parseToolResult(res);

    expect(payload.success).toBe(true);
    expect(payload.data.service.ServerConfig.EnvParams).toBe("");
  });

  it("exposes revealEnvParams as a boolean input with default false", async () => {
    const { tools } = await createCloudRunTools();
    const reveal = tools.queryCloudRun.meta.inputSchema.revealEnvParams;
    expect(reveal).toBeDefined();
    expect(reveal._def.typeName).toBe("ZodDefault");
    expect(reveal._def.innerType._def.typeName).toBe("ZodOptional");
    expect(reveal.parse(undefined)).toBe(false);
    expect(reveal.parse(true)).toBe(true);
  });
});
