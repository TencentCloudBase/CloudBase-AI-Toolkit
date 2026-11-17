import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerFunctionTools } from "./functions.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetCloudBaseManager,
  mockGetFunctionDetail,
  mockCreateFunctionTriggers,
  mockDeleteFunctionTrigger,
  mockGetEnvId,
  mockIsCloudMode,
  mockProbeCamCapabilityForLogin,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetFunctionDetail: vi.fn(),
  mockCreateFunctionTriggers: vi.fn(),
  mockDeleteFunctionTrigger: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockIsCloudMode: vi.fn(),
  mockProbeCamCapabilityForLogin: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: vi.fn(),
  probeCamCapabilityForLogin: mockProbeCamCapabilityForLogin,
  extractRequestId: (value: any) => value?.RequestId ?? value?.requestId,
}));

vi.mock("../utils/cloud-mode.js", () => ({ isCloudMode: mockIsCloudMode }));
vi.mock("../utils/logger.js", () => ({ debug: vi.fn(), warn: vi.fn() }));

function createMockServer() {
  const tools: Record<string, { handler: (args: any) => Promise<any> }> = {};
  const server = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    logger: vi.fn(),
    registerTool: vi.fn((name: string, _meta: any, handler: (args: any) => Promise<any>) => {
      tools[name] = { handler };
    }),
  } as unknown as ExtendedMcpServer;
  registerFunctionTools(server);
  return tools;
}

const CRON = "0 10 * * * * *";

async function call(args: Record<string, unknown>) {
  const tools = createMockServer();
  const result = await tools.manageFunctions.handler(args);
  return JSON.parse(result.content[0].text);
}

describe("createFunctionTrigger replace-all guard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsCloudMode.mockReturnValue(false);
    mockGetEnvId.mockResolvedValue("env-test");
    mockProbeCamCapabilityForLogin.mockResolvedValue("capable");
    mockCreateFunctionTriggers.mockResolvedValue({ RequestId: "req-create-trigger" });
    mockDeleteFunctionTrigger.mockResolvedValue({ RequestId: "req-delete-trigger" });
    mockGetCloudBaseManager.mockResolvedValue({
      functions: {
        getFunctionDetail: mockGetFunctionDetail,
        createFunctionTriggers: mockCreateFunctionTriggers,
        deleteFunctionTrigger: mockDeleteFunctionTrigger,
      },
    });
  });

  it("refuses a partial create and leaves the backend untouched", async () => {
    mockGetFunctionDetail.mockResolvedValue({
      Triggers: [
        { TriggerName: "hourlySync", Type: "timer", TriggerDesc: CRON },
      ],
    });

    const parsed = await call({
      action: "createFunctionTrigger",
      functionName: "demoFn",
      triggers: [{ name: "tempDiag", type: "timer", config: CRON }],
      dryRun: false,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.errorCode).toBe("TRIGGER_REPLACE_BLOCKED");
    expect(parsed.data.willRemove).toEqual(["hourlySync"]);
    expect(parsed.data.next_step).toEqual({
      tool: "queryFunctions",
      action: "listFunctionTriggers",
    });
    expect(mockCreateFunctionTriggers).not.toHaveBeenCalled();
  });

  it("executes when replaceAll is explicit and reports the diff", async () => {
    mockGetFunctionDetail
      .mockResolvedValueOnce({
        Triggers: [{ TriggerName: "hourlySync", Type: "timer" }],
      })
      .mockResolvedValueOnce({
        Triggers: [{ TriggerName: "tempDiag", Type: "timer" }],
      });

    const parsed = await call({
      action: "createFunctionTrigger",
      functionName: "demoFn",
      triggers: [{ name: "tempDiag", type: "timer", config: CRON }],
      dryRun: false,
      replaceAll: true,
    });

    expect(mockCreateFunctionTriggers).toHaveBeenCalledTimes(1);
    expect(parsed.success).toBe(true);
    expect(parsed.data.removed).toEqual(["hourlySync"]);
    expect(parsed.data.added).toEqual(["tempDiag"]);
    expect(parsed.data.triggersAfter).toEqual(["tempDiag"]);
  });

  it("stops when the current trigger list cannot be read", async () => {
    mockGetFunctionDetail.mockRejectedValue(new Error("temporarily unavailable"));

    const parsed = await call({
      action: "createFunctionTrigger",
      functionName: "demoFn",
      triggers: [{ name: "tempDiag", type: "timer", config: CRON }],
      dryRun: false,
    });

    expect(parsed.success).toBe(false);
    expect(parsed.errorCode).toBe("TRIGGER_LIST_UNAVAILABLE");
    expect(mockCreateFunctionTriggers).not.toHaveBeenCalled();
  });

  it("dryRun reports the triggers a real run would delete, without calling the backend", async () => {
    mockGetFunctionDetail.mockResolvedValue({
      Triggers: [{ TriggerName: "hourlySync", Type: "timer" }],
    });

    const parsed = await call({
      action: "createFunctionTrigger",
      functionName: "demoFn",
      triggers: [{ name: "tempDiag", type: "timer", config: CRON }],
      dryRun: true,
    });

    expect(parsed.success).toBe(true);
    expect(parsed.data.executed).toBe(false);
    expect(parsed.data.willRemove).toEqual(["hourlySync"]);
    expect(parsed.message).toContain("hourlySync");
    expect(mockCreateFunctionTriggers).not.toHaveBeenCalled();
  });
});

describe("manageFunctions trigger schema", () => {
  it("declares replaceAll so the guard is discoverable to clients", () => {
    const metas: Record<string, any> = {};
    const server = {
      cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
      logger: vi.fn(),
      registerTool: vi.fn((name: string, meta: any) => {
        metas[name] = meta;
      }),
    } as unknown as ExtendedMcpServer;
    registerFunctionTools(server);
    const schema = metas.manageFunctions?.inputSchema;
    const field =
      schema?.replaceAll ??
      schema?.shape?.replaceAll ??
      schema?.properties?.replaceAll;
    expect(field).toBeDefined();
  });
});
