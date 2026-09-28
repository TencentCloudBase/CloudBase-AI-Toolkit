import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerLogTools } from "./logs.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetCloudBaseManager,
  mockLogCloudBaseResult,
  mockCheckLogServiceEnabled,
  mockSearchClsLog,
  mockCreateLogService,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockCheckLogServiceEnabled: vi.fn(),
  mockSearchClsLog: vi.fn(),
  mockCreateLogService: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  logCloudBaseResult: mockLogCloudBaseResult,
}));

function createMockServer() {
  const tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }> = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    logger: vi.fn(),
    registerTool: vi.fn((name, meta, handler) => {
      tools[name] = { meta, handler };
    }),
  } as unknown as ExtendedMcpServer;

  registerLogTools(server);

  return { tools };
}

describe("log tools", () => {
  let tools: ReturnType<typeof createMockServer>["tools"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockCheckLogServiceEnabled.mockResolvedValue(true);
    mockSearchClsLog.mockResolvedValue({
      LogResults: {
        Results: [{ Message: "hello" }],
      },
      RequestId: "req-search-logs",
    });
    mockCreateLogService.mockResolvedValue({ RequestId: "req-create-log" });
    mockGetCloudBaseManager.mockResolvedValue({
      log: {
        checkLogServiceEnabled: mockCheckLogServiceEnabled,
        searchClsLog: mockSearchClsLog,
        createLogService: mockCreateLogService,
      },
    });
    ({ tools } = createMockServer());
  });

  it("queryLogs(action=checkLogService) should check availability", async () => {
    const result = await tools.queryLogs.handler({ action: "checkLogService" });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCheckLogServiceEnabled).toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "checkLogService",
        enabled: true,
      },
    });
  });

  it("queryLogs(action=searchLogs) should search cls logs", async () => {
    const result = await tools.queryLogs.handler({
      action: "searchLogs",
      queryString: "level:error",
      service: "tcb",
      startTime: "2026-04-01 00:00:00",
      endTime: "2026-04-01 23:59:59",
      limit: 10,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockSearchClsLog).toHaveBeenCalledWith({
      queryString: "level:error",
      StartTime: "2026-04-01 00:00:00",
      EndTime: "2026-04-01 23:59:59",
      Limit: 10,
      Context: undefined,
      Sort: undefined,
      service: "tcb",
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "searchLogs",
      },
    });
  });

  it("manageLogs(action=createLogService) requires confirm", async () => {
    const result = await tools.manageLogs.handler({ action: "createLogService" });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateLogService).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: false,
      errorCode: "CONFIRM_REQUIRED",
    });
  });

  it("manageLogs(action=createLogService) maps createLogService when confirmed", async () => {
    mockCheckLogServiceEnabled.mockResolvedValue(false);
    const result = await tools.manageLogs.handler({
      action: "createLogService",
      confirm: true,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateLogService).toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "createLogService",
        requestId: "req-create-log",
      },
    });
  });

  it("manageLogs(action=createLogService) short-circuits when already enabled", async () => {
    mockCheckLogServiceEnabled.mockResolvedValue(true);
    const result = await tools.manageLogs.handler({
      action: "createLogService",
      confirm: true,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateLogService).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "createLogService",
        alreadyEnabled: true,
      },
    });
  });
});
