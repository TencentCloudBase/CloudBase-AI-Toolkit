import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyFunctionConfigUpdate,
  buildFunctionConfigUpdateParams,
  inspectFunctionUpdateOutcome,
  registerFunctionTools,
} from "./functions.js";
import { functionUpdatingRuntime } from "./function-updating.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockLogCloudBaseResult,
  mockScfRequest,
  mockSdkUpdateFunctionConfig,
  mockGetFunctionDetail,
  mockUpdateFunctionCode,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockScfRequest: vi.fn(),
  mockSdkUpdateFunctionConfig: vi.fn(),
  mockGetFunctionDetail: vi.fn(),
  mockUpdateFunctionCode: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: mockLogCloudBaseResult,
  probeCamCapabilityForLogin: vi.fn(async () => "capable"),
}));

vi.mock("../utils/cloud-mode.js", () => ({
  isCloudMode: () => false,
}));

vi.mock("../utils/logger.js", () => ({
  debug: vi.fn(),
}));

function createMockServer() {
  const tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }> = {};
  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "wandefu-care-test-d5dugnf92c5e56", region: "ap-shanghai" },
    logger: vi.fn(),
    registerTool: vi.fn((name: string, meta: any, handler: (args: any) => Promise<any>) => {
      tools[name] = { meta, handler };
    }),
  } as unknown as ExtendedMcpServer;
  registerFunctionTools(server);
  return tools;
}

describe("buildFunctionConfigUpdateParams", () => {
  it("never puts CLS or Role into the request body", () => {
    const params = buildFunctionConfigUpdateParams({
      envId: "env-test",
      functionName: "notification-get-list",
      envVariables: { OVERVIEW_DIAG_AUDIENCE: "trial", LEGACY_FLAG: "1" },
      timeout: 10,
      vpc: { vpcId: "vpc-123", subnetId: "subnet-456" },
    });

    expect(params).toEqual({
      EnvId: "env-test",
      Namespace: "env-test",
      FunctionName: "notification-get-list",
      Environment: {
        Variables: [
          { Key: "OVERVIEW_DIAG_AUDIENCE", Value: "trial" },
          { Key: "LEGACY_FLAG", Value: "1" },
        ],
      },
      Timeout: 10,
      VpcConfig: { VpcId: "vpc-123", SubnetId: "subnet-456" },
    });

    for (const key of Object.keys(params)) {
      expect(key.toLowerCase()).not.toContain("cls");
      expect(key).not.toBe("Role");
    }
  });

  it("omits Environment / VpcConfig when nothing was supplied, so SCF keeps current values", () => {
    const params = buildFunctionConfigUpdateParams({
      envId: "env-test",
      functionName: "fn",
      envVariables: {},
    });

    expect(params).not.toHaveProperty("Environment");
    expect(params).not.toHaveProperty("VpcConfig");
    expect(params).not.toHaveProperty("Timeout");
  });
});

describe("applyFunctionConfigUpdate", () => {
  it("prefers the SCF service so the SDK cannot inject CLS ids", async () => {
    mockScfRequest.mockResolvedValue({ RequestId: "req-1" });
    const manager = {
      functions: {
        scfService: { request: mockScfRequest },
        updateFunctionConfig: mockSdkUpdateFunctionConfig,
      },
    };

    const params = buildFunctionConfigUpdateParams({
      envId: "env-test",
      functionName: "fn",
      envVariables: { A: "1" },
    });
    await applyFunctionConfigUpdate(manager, params);

    expect(mockScfRequest).toHaveBeenCalledWith("UpdateFunctionConfiguration", params);
    expect(mockSdkUpdateFunctionConfig).not.toHaveBeenCalled();
  });

  it("falls back to the manager SDK when scfService is unavailable", async () => {
    mockSdkUpdateFunctionConfig.mockResolvedValue({ RequestId: "req-2" });
    const manager = {
      functions: { updateFunctionConfig: mockSdkUpdateFunctionConfig },
    };

    await applyFunctionConfigUpdate(
      manager,
      buildFunctionConfigUpdateParams({
        envId: "env-test",
        functionName: "fn",
        envVariables: { A: "1" },
        timeout: 10,
      }),
    );

    expect(mockSdkUpdateFunctionConfig).toHaveBeenCalledWith({
      name: "fn",
      envVariables: { A: "1" },
      timeout: 10,
      vpc: undefined,
    });
  });
});

describe("inspectFunctionUpdateOutcome", () => {
  it("reports UpdateFailed together with StatusReasons", async () => {
    const outcome = await inspectFunctionUpdateOutcome(
      async () => ({
        Status: "UpdateFailed",
        StatusReasons: [
          {
            ErrorCode: "InvalidParameter.Cls",
            ErrorMessage: "ClsLogSetId & ClsTopicId not matched",
          },
        ],
      }),
      { initialDelayMs: 0 },
    );

    expect(outcome.state).toBe("failed");
    if (outcome.state === "failed") {
      expect(outcome.status).toBe("UpdateFailed");
      expect(outcome.reasons[0].ErrorCode).toBe("InvalidParameter.Cls");
    }
  });

  it("keeps polling while the function is Updating, then reports Active as ok", async () => {
    const getDetail = vi
      .fn()
      .mockResolvedValueOnce({ Status: "Updating" })
      .mockResolvedValueOnce({ Status: "Active" });

    const outcome = await inspectFunctionUpdateOutcome(
      getDetail as any,
      { initialDelayMs: 0, intervalMs: 0, maxAttempts: 5, sleep: async () => undefined },
    );

    expect(outcome).toEqual({ state: "ok", status: "Active" });
    expect(getDetail).toHaveBeenCalledTimes(2);
  });

  it("returns pending instead of claiming success when the change never settles", async () => {
    const outcome = await inspectFunctionUpdateOutcome(
      async () => ({ Status: "Updating" }),
      { initialDelayMs: 0, intervalMs: 0, maxAttempts: 3, sleep: async () => undefined },
    );

    expect(outcome).toEqual({ state: "pending", status: "Updating" });
  });
});

describe("manageFunctions updateFunctionConfig", () => {
  let tools: ReturnType<typeof createMockServer>;
  const originalSleep = functionUpdatingRuntime.sleep;

  beforeEach(() => {
    vi.clearAllMocks();
    functionUpdatingRuntime.sleep = async () => undefined;
    mockGetEnvId.mockResolvedValue("wandefu-care-test-d5dugnf92c5e56");
    mockScfRequest.mockResolvedValue({ RequestId: "req-update" });
    mockGetCloudBaseManager.mockResolvedValue({
      functions: {
        scfService: { request: mockScfRequest },
        getFunctionDetail: mockGetFunctionDetail,
        updateFunctionConfig: mockSdkUpdateFunctionConfig,
        updateFunctionCode: mockUpdateFunctionCode,
      },
    });
    tools = createMockServer();
  });

  afterEach(() => {
    functionUpdatingRuntime.sleep = originalSleep;
  });

  it("merges existing variables and sends them without touching log binding", async () => {
    mockGetFunctionDetail
      .mockResolvedValueOnce({
        Status: "Active",
        Timeout: 10,
        Environment: {
          Variables: [
            { Key: "EXISTING", Value: "keep-me" },
            { Key: "OVERVIEW_DIAG_AUDIENCE", Value: "old" },
          ],
        },
        VpcConfig: {},
      })
      .mockResolvedValue({ Status: "Active", StatusReasons: [] });

    const result = await tools.manageFunctions.handler({
      action: "updateFunctionConfig",
      functionName: "notification-get-list",
      envVariables: { OVERVIEW_DIAG_AUDIENCE: "trial" },
      confirm: true,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);

    expect(mockScfRequest).toHaveBeenCalledTimes(1);
    const [action, body] = mockScfRequest.mock.calls[0];
    expect(action).toBe("UpdateFunctionConfiguration");
    expect(body).not.toHaveProperty("ClsLogsetId");
    expect(body).not.toHaveProperty("ClsTopicId");
    expect(body).not.toHaveProperty("Role");
    expect(body.Environment.Variables).toEqual([
      { Key: "EXISTING", Value: "keep-me" },
      { Key: "OVERVIEW_DIAG_AUDIENCE", Value: "trial" },
    ]);
    expect(mockSdkUpdateFunctionConfig).not.toHaveBeenCalled();
  });

  it("surfaces UpdateFailed with SCF StatusReasons instead of reporting success", async () => {
    mockGetFunctionDetail
      .mockResolvedValueOnce({
        Status: "Active",
        Timeout: 10,
        Environment: { Variables: [] },
        VpcConfig: {},
      })
      .mockResolvedValue({
        Status: "UpdateFailed",
        StatusReasons: [
          {
            ErrorCode: "InvalidParameter.Cls",
            ErrorMessage: "ClsLogSetId & ClsTopicId not matched",
          },
        ],
      });

    const result = await tools.manageFunctions.handler({
      action: "updateFunctionConfig",
      functionName: "notification-get-list",
      envVariables: { OVERVIEW_DIAG_AUDIENCE: "trial" },
      confirm: true,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("UpdateFailed");
    expect(payload.message).toContain("InvalidParameter.Cls");
    expect(payload.message).toContain("ClsLogSetId & ClsTopicId not matched");
  });

  it("warns that dryRun and wait do not apply to config updates", async () => {
    mockGetFunctionDetail
      .mockResolvedValueOnce({
        Status: "Active",
        Timeout: 10,
        Environment: { Variables: [] },
        VpcConfig: {},
      })
      .mockResolvedValue({ Status: "Active", StatusReasons: [] });

    const result = await tools.manageFunctions.handler({
      action: "updateFunctionConfig",
      functionName: "notification-get-list",
      envVariables: { OVERVIEW_DIAG_AUDIENCE: "trial" },
      confirm: true,
      dryRun: true,
      wait: true,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.warnings).toEqual([
      expect.stringContaining("dryRun"),
      expect.stringContaining("wait"),
    ]);
    expect(mockScfRequest).toHaveBeenCalledTimes(1);
  });

  it("surfaces UpdateFailed after a code update too", async () => {
    mockUpdateFunctionCode.mockResolvedValue({ RequestId: "req-code" });
    mockGetFunctionDetail
      .mockResolvedValueOnce({
        Status: "Active",
        Timeout: 10,
        Environment: { Variables: [] },
        VpcConfig: {},
      })
      .mockResolvedValue({
        Status: "UpdateFailed",
        StatusReasons: [
          {
            ErrorCode: "InvalidParameter.Cls",
            ErrorMessage: "ClsLogSetId & ClsTopicId not matched",
          },
        ],
      });

    const result = await tools.manageFunctions.handler({
      action: "updateFunctionCode",
      functionName: "notification-get-list",
      functionRootPath: "/tmp/functions",
      confirm: true,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("代码更新失败");
    expect(payload.message).toContain("InvalidParameter.Cls");
  });
});
