import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerLogTools } from "./logs.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetCloudBaseManager,
  mockLogCloudBaseResult,
  mockCheckLogServiceEnabled,
  mockSearchClsLog,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockCheckLogServiceEnabled: vi.fn(),
  mockSearchClsLog: vi.fn(),
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
    mockGetCloudBaseManager.mockResolvedValue({
      log: {
        checkLogServiceEnabled: mockCheckLogServiceEnabled,
        searchClsLog: mockSearchClsLog,
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

  it("searchClsLog tool should be registered and search cls logs", async () => {
    expect(tools.searchClsLog).toBeDefined();
    expect(tools.searchClsLog.meta.title).toBe("搜索 CLS 日志");
    expect(tools.searchClsLog.meta.annotations.readOnlyHint).toBe(true);

    const result = await tools.searchClsLog.handler({
      queryString: "level:error",
      service: "tcbr",
      startTime: "2026-04-01 00:00:00",
      endTime: "2026-04-01 23:59:59",
      limit: 5,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockSearchClsLog).toHaveBeenCalledWith({
      queryString: "level:error",
      StartTime: "2026-04-01 00:00:00",
      EndTime: "2026-04-01 23:59:59",
      Limit: 5,
      Context: undefined,
      Sort: undefined,
      service: "tcbr",
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        queryString: "level:error",
      },
    });
  });

  it("searchClsLog should error when queryString is missing", async () => {
    const result = await tools.searchClsLog.handler({});
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      message: expect.stringContaining("queryString"),
    });
  });
});
