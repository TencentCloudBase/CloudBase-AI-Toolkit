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

const CODING_BUILD_LOG_ERROR =
  "[DescribeCloudRunBuildLog] User not created or may not qcloud user, please login CODING and try again.";

describe("buildGetDeployLogCodingFallback next_step action union", () => {
  it("with runId: next_step and nextActions only use getProcessLog (never getDeployLog)", async () => {
    const { buildGetDeployLogCodingFallback } = await import("./cloudrun.js");
    const result = buildGetDeployLogCodingFallback({
      serverName: "svc-a",
      runId: "run-1",
      reason: "coding",
    });

    expect(result.data.next_step.action).toBe("getProcessLog");
    expect(result.data.next_step.suggested_args.action).toBe("getProcessLog");
    expect(result.nextActions.map((a) => a.action)).toEqual(["getProcessLog"]);
    expect(result.nextActions[0]).toMatchObject({
      tool: "queryCloudRun",
      action: "getProcessLog",
      args: {
        action: "getProcessLog",
        detailServerName: "svc-a",
        runId: "run-1",
      },
    });
  });

  it("without runId: next_step is getDeployRecords and nextActions stay on follow-up union", async () => {
    const { buildGetDeployLogCodingFallback } = await import("./cloudrun.js");
    const result = buildGetDeployLogCodingFallback({
      serverName: "svc-b",
      reason: "image_no_build",
    });

    expect(result.data.next_step.action).toBe("getDeployRecords");
    expect(result.data.next_step.suggested_args.action).toBe("getDeployRecords");
    expect(result.nextActions.map((a) => a.action)).toEqual([
      "getDeployRecords",
      "getProcessLog",
    ]);
    for (const next of result.nextActions) {
      expect(next.args.action).toBe(next.action);
    }
  });
});

describe("queryCloudRun getDeployLog CODING fallback", () => {
  it("rewrites CODING getBuildLog failures to getProcessLog nextActions", async () => {
    const manager = makeManager({
      getBuildLog: vi.fn().mockRejectedValue(new Error(CODING_BUILD_LOG_ERROR)),
    });
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    const res = await tools.queryCloudRun.handler({
      action: "getDeployLog",
      detailServerName: "my-svc",
    });
    const parsed = parseToolResult(res);
    const payloadText = JSON.stringify(parsed);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe("CODING_BUILD_LOG_UNAVAILABLE");
    expect(parsed.message).toMatch(/getProcessLog/);
    expect(parsed.message).toMatch(/my-svc/);
    expect(parsed.message).toMatch(/run-latest/);
    expect(parsed.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: "queryCloudRun",
          action: "getProcessLog",
          args: expect.objectContaining({
            action: "getProcessLog",
            detailServerName: "my-svc",
            runId: "run-latest",
          }),
        }),
      ]),
    );
    expect(parsed.data.next_step.action).toBe("getProcessLog");
    expect(payloadText).toMatch(/getProcessLog/);
    expect(payloadText).not.toBe(JSON.stringify({ success: false, error: CODING_BUILD_LOG_ERROR }));
    expect(manager.cloudrun.getBuildLog).toHaveBeenCalled();
    expect(manager.cloudrun.getProcessLog).not.toHaveBeenCalled();
  });

  it("skips getBuildLog when latest BuildId is 0 (image deploy)", async () => {
    const manager = makeManager({
      getDeployRecords: vi.fn().mockResolvedValue({
        DeployRecords: [
          {
            DeployId: "d-image",
            Status: "normal",
            RunId: "run-image",
            BuildId: 0,
          },
        ],
      }),
    });
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    const res = await tools.queryCloudRun.handler({
      action: "getDeployLog",
      detailServerName: "image-svc",
    });
    const parsed = parseToolResult(res);

    expect(parsed.success).toBe(false);
    expect(parsed.error).toBe("NO_CODING_BUILD_FOR_IMAGE_DEPLOY");
    expect(parsed.nextActions[0].action).toBe("getProcessLog");
    expect(parsed.nextActions[0].args.runId).toBe("run-image");
    expect(manager.cloudrun.getBuildLog).not.toHaveBeenCalled();
  });

  it("does not rewrite unrelated getBuildLog errors", async () => {
    const manager = makeManager({
      getBuildLog: vi.fn().mockRejectedValue(new Error("network timeout")),
    });
    mockGetCloudBaseManager.mockReturnValue(manager);
    const { tools } = await createCloudRunTools();

    await expect(
      tools.queryCloudRun.handler({
        action: "getDeployLog",
        detailServerName: "my-svc",
      }),
    ).rejects.toThrow("network timeout");
  });
});
