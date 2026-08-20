import { describe, expect, it, vi } from "vitest";

const { mockGetCloudBaseManager, mockGetEnvId } = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
}));

type RegisteredTool = { meta: any; handler: (args: any) => Promise<any> };

async function createCloudRunTools() {
  const tools: Record<string, RegisteredTool> = {};
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

function makeManager(overrides: {
  getProcessLog?: ReturnType<typeof vi.fn>;
  getBuildLog?: ReturnType<typeof vi.fn>;
  getDeployRecords?: ReturnType<typeof vi.fn>;
} = {}) {
  return {
    commonService: vi.fn().mockReturnValue({ call: vi.fn() }),
    cloudrun: {
      getDeployRecords: overrides.getDeployRecords ?? vi.fn().mockResolvedValue({
        DeployRecords: [
          {
            DeployId: "d1",
            DeployTime: "2026-08-17 10:00:00",
            Status: "normal",
            RunId: "run-latest",
            BuildId: 200,
            FlowRatio: 100,
          },
        ],
      }),
      getBuildLog: overrides.getBuildLog ?? vi.fn().mockResolvedValue({
        Log: { Text: "build ok", More: false },
        RequestId: "req-build",
      }),
      getProcessLog: overrides.getProcessLog ?? vi.fn().mockResolvedValue({
        Logs: [
          "create_version_check_vpc: success",
          "create_eks_virtual_service: success",
          "check_eks_virtual_service: success",
          "s6-overlay: starting app",
        ],
        RequestId: "req-process",
      }),
    },
  };
}

describe("queryCloudRun getProcessLog schema", () => {
  it("exposes getProcessLog in the action enum (z.enum)", async () => {
    const { tools } = await createCloudRunTools();
    const actionEnum = tools.queryCloudRun.meta.inputSchema.action;
    expect(actionEnum._def.values).toContain("getProcessLog");
  });

  it("documents getDeployLog as build log and getProcessLog as runtime log", async () => {
    const { tools } = await createCloudRunTools();
    const actionDesc = tools.queryCloudRun.meta.inputSchema.action.description as string;
    expect(actionDesc).toMatch(/getDeployLog=.*构建日志/);
    expect(actionDesc).toMatch(/getProcessLog=.*运行日志/);
    expect(actionDesc).toMatch(/CODING/);
    expect(tools.queryCloudRun.meta.inputSchema.runId).toBeDefined();
    expect(tools.queryCloudRun.meta.description).toMatch(/getProcessLog/);
  });

  it("documents InitialDelaySeconds real readiness semantics", async () => {
    const { tools } = await createCloudRunTools();
    const serverConfig = tools.manageCloudRun.meta.inputSchema.serverConfig.unwrap();
    const delayField = serverConfig.shape.InitialDelaySeconds;
    // .describe() is attached to the optional wrapper
    const delayDesc = (delayField.description ?? delayField.unwrap?.()?.description) as string;
    expect(delayDesc).toMatch(/每 5s|每 5 秒/);
    expect(delayDesc).toMatch(/30/);
    expect(delayDesc).toMatch(/150/);
    expect(delayDesc).toMatch(/不是/);
  });
});

describe("queryCloudRun getProcessLog handler", () => {
  it("calls SDK getProcessLog with explicit runId", async () => {
    const manager = makeManager();
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    const res = await tools.queryCloudRun.handler({
      action: "getProcessLog",
      detailServerName: "my-svc",
      runId: "run-explicit",
    });
    const parsed = parseToolResult(res);

    expect(parsed.success).toBe(true);
    expect(parsed.data.runId).toBe("run-explicit");
    expect(parsed.data.processLogs).toHaveLength(4);
    expect(parsed.data.processLogText).toContain("create_eks_virtual_service");
    expect(manager.cloudrun.getProcessLog).toHaveBeenCalledWith({ RunId: "run-explicit" });
  });

  it("falls back to latest deploy RunId when runId is omitted", async () => {
    const manager = makeManager();
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    const res = await tools.queryCloudRun.handler({
      action: "getProcessLog",
      detailServerName: "my-svc",
    });
    const parsed = parseToolResult(res);

    expect(parsed.success).toBe(true);
    expect(parsed.data.runId).toBe("run-latest");
    expect(manager.cloudrun.getDeployRecords).toHaveBeenCalledWith({ serverName: "my-svc" });
    expect(manager.cloudrun.getProcessLog).toHaveBeenCalledWith({ RunId: "run-latest" });
  });

  it("does not call getBuildLog (CODING) for getProcessLog", async () => {
    const manager = makeManager();
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    await tools.queryCloudRun.handler({
      action: "getProcessLog",
      detailServerName: "my-svc",
      runId: "run-1",
    });

    expect(manager.cloudrun.getBuildLog).not.toHaveBeenCalled();
  });

  it("returns a clear error when RunId cannot be resolved", async () => {
    const manager = makeManager({
      getDeployRecords: vi.fn().mockResolvedValue({ DeployRecords: [] }),
    });
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    const res = await tools.queryCloudRun.handler({
      action: "getProcessLog",
      detailServerName: "empty-svc",
    });
    const parsed = parseToolResult(res);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toMatch(/RunId/);
    expect(manager.cloudrun.getProcessLog).not.toHaveBeenCalled();
  });
});
