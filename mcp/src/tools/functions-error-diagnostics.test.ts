import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  CLS_MISMATCH_ERROR_CODE,
  extractRequestIdFromMessage,
  registerFunctionTools,
} from "./functions.js";
import { functionUpdatingRuntime } from "./function-updating.js";
import type { ExtendedMcpServer } from "../server.js";

const { mockGetCloudBaseManager, mockGetEnvId, mockLogCloudBaseResult, mockGetFunctionDetail } =
  vi.hoisted(() => ({
    mockGetCloudBaseManager: vi.fn(),
    mockGetEnvId: vi.fn(),
    mockLogCloudBaseResult: vi.fn(),
    mockGetFunctionDetail: vi.fn(),
  }));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: mockLogCloudBaseResult,
  probeCamCapabilityForLogin: vi.fn(async () => "capable"),
  extractRequestId: (value: unknown) => {
    const obj = value as { RequestId?: string; requestId?: string } | null;
    return obj?.RequestId ?? obj?.requestId;
  },
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
    cloudBaseOptions: { envId: "env-test", region: "ap-shanghai" },
    logger: vi.fn(),
    registerTool: vi.fn((name: string, meta: any, handler: (args: any) => Promise<any>) => {
      tools[name] = { meta, handler };
    }),
  } as unknown as ExtendedMcpServer;
  registerFunctionTools(server);
  return tools;
}

describe("extractRequestIdFromMessage", () => {
  it("pulls the request id out of an SDK error string", () => {
    expect(
      extractRequestIdFromMessage(
        "[GetFunction] [code=ResourceNotFound.Function,msg=未找到指定的Function,reqId=44ed3fc1-448b-4bd8-80fd-c4c29b66cf2c]",
      ),
    ).toBe("44ed3fc1-448b-4bd8-80fd-c4c29b66cf2c");
  });

  it("returns undefined when the message carries no request id", () => {
    expect(extractRequestIdFromMessage("Function not found")).toBeUndefined();
  });
});

describe("error envelope diagnostics", () => {
  let tools: ReturnType<typeof createMockServer>;
  const originalSleep = functionUpdatingRuntime.sleep;

  beforeEach(() => {
    vi.clearAllMocks();
    functionUpdatingRuntime.sleep = async () => undefined;
    mockGetEnvId.mockResolvedValue("env-test");
    mockGetCloudBaseManager.mockResolvedValue({
      functions: { getFunctionDetail: mockGetFunctionDetail },
    });
    tools = createMockServer();
  });

  afterEach(() => {
    functionUpdatingRuntime.sleep = originalSleep;
  });

  it("attaches two diagnosis paths and the request id for a CLS mismatch", async () => {
    mockGetFunctionDetail.mockRejectedValue(
      new Error(
        "[scf/UpdateFunctionConfiguration] [code=InvalidParameter.Cls,msg=ClsLogSetId & ClsTopicId not matched,reqId=a5a3aa4a-ed16-4f5f-b9af-b8fd271dc92b]",
      ),
    );

    const result = await tools.manageFunctions.handler({
      action: "updateFunctionConfig",
      functionName: "notification-get-list",
      envVariables: { OVERVIEW_DIAG_AUDIENCE: "trial" },
      confirm: true,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.message).toContain(CLS_MISMATCH_ERROR_CODE);
    expect(payload.requestId).toBe("a5a3aa4a-ed16-4f5f-b9af-b8fd271dc92b");
    expect(payload.nextActions).toHaveLength(2);
    expect(payload.nextActions[0].tool).toBe("queryFunctions");
    expect(payload.nextActions[0].action).toBe("getFunctionDetail");
    expect(payload.nextActions[1].tool).toBe("queryEnv");
    expect(payload.nextActions[1].action).toBe("info");
  });

  it("prefers a structured RequestId on the error object over the message", async () => {
    const error = Object.assign(new Error("something failed"), {
      RequestId: "11111111-2222-3333-4444-555555555555",
    });
    mockGetFunctionDetail.mockRejectedValue(error);

    const result = await tools.manageFunctions.handler({
      action: "updateFunctionConfig",
      functionName: "notification-get-list",
      confirm: true,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.requestId).toBe("11111111-2222-3333-4444-555555555555");
  });

  it("does not add diagnosis paths for unrelated errors", async () => {
    mockGetFunctionDetail.mockRejectedValue(new Error("Function not found"));

    const result = await tools.manageFunctions.handler({
      action: "updateFunctionConfig",
      functionName: "notification-get-list",
      confirm: true,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.nextActions).toBeUndefined();
  });
});
