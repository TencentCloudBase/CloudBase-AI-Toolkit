/**
 * 测试 FunctionDeployOverrides 和 requestFn 注入功能
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createCloudBaseMcpServer } from "../server.js";

// Mock cloudbase-manager
vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: vi.fn(),
  getEnvId: vi.fn().mockResolvedValue("test-env"),
  logCloudBaseResult: vi.fn(),
  envManager: { getCachedEnvId: vi.fn().mockReturnValue("test-env") },
  listAvailableEnvCandidates: vi.fn().mockResolvedValue([{ envId: "test-env" }]),
  createCloudBaseManagerWithOptions: vi.fn(),
  resetCloudBaseManagerCache: vi.fn(),
}));

// Mock auth
vi.mock("../auth.js", () => ({
  getLoginState: vi.fn(),
  peekLoginState: vi.fn().mockResolvedValue(null),
  getAuthProgressState: vi.fn().mockReturnValue({ state: "IDLE" }),
  buildDeviceAuthChallengePayload: vi.fn(),
  logout: vi.fn(),
}));

// Mock telemetry
vi.mock("../utils/tool-wrapper.js", () => ({
  wrapServerWithTelemetry: vi.fn(),
}));

vi.mock("../utils/cloud-mode.js", () => ({
  isCloudMode: vi.fn().mockReturnValue(false),
  enableCloudMode: vi.fn(),
  getCloudModeStatus: vi.fn(),
  shouldRegisterTool: vi.fn().mockReturnValue(true),
}));

describe("FunctionDeployOverrides", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createFunction 有 override 时应调用 override 而不走默认逻辑", async () => {
    const mockOverride = vi.fn().mockResolvedValue({ deployed: true });

    const server = await createCloudBaseMcpServer({
      pluginsEnabled: ["functions"],
      cloudBaseOptions: { envId: "test-env", requestFn: vi.fn() },
      pluginOptions: {
        functions: { createFunction: mockOverride },
      },
      enableTelemetry: false,
    });

    const manageFunctionsTool = server.toolDefs.find(
      (t) => t.name === "manageFunctions"
    );
    expect(manageFunctionsTool).toBeDefined();

    const result = await manageFunctionsTool!.handler({
      action: "createFunction",
      func: { name: "myFunction" },
      functionRootPath: "/path/to/functions/myFunction",
    });

    expect(mockOverride).toHaveBeenCalledTimes(1);
    expect(mockOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "myFunction",
        functionRootPath: "/path/to/functions/myFunction",
      })
    );
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.message).toContain("override");
  });

  it("updateFunctionCode 有 override 时应调用 override", async () => {
    const mockOverride = vi.fn().mockResolvedValue({ updated: true });

    const server = await createCloudBaseMcpServer({
      pluginsEnabled: ["functions"],
      cloudBaseOptions: { envId: "test-env", requestFn: vi.fn() },
      pluginOptions: {
        functions: { updateFunctionCode: mockOverride },
      },
      enableTelemetry: false,
    });

    const tool = server.toolDefs.find((t) => t.name === "manageFunctions")!;
    await tool.handler({
      action: "updateFunctionCode",
      functionName: "myFunction",
      functionRootPath: "/path/to/functions/myFunction",
    });

    expect(mockOverride).toHaveBeenCalledWith(
      expect.objectContaining({
        functionName: "myFunction",
        functionRootPath: "/path/to/functions/myFunction",
      })
    );
  });

  it("incrementalDeployFunction 无 override 时应返回错误", async () => {
    const server = await createCloudBaseMcpServer({
      pluginsEnabled: ["functions"],
      cloudBaseOptions: { envId: "test-env", requestFn: vi.fn() },
      enableTelemetry: false,
    });

    const tool = server.toolDefs.find((t) => t.name === "manageFunctions")!;
    const result = await tool.handler({
      action: "incrementalDeployFunction",
      functionName: "myFunction",
      functionRootPath: "/path/to/functions/myFunction",
      incrementalFile: "index.js",
    });

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.message).toContain("incrementalDeployFunction");
  });

  it("incrementalDeployFunction 有 override 时应成功调用", async () => {
    const mockOverride = vi.fn().mockResolvedValue({ incremental: true });

    const server = await createCloudBaseMcpServer({
      pluginsEnabled: ["functions"],
      cloudBaseOptions: { envId: "test-env", requestFn: vi.fn() },
      pluginOptions: {
        functions: { incrementalDeployFunction: mockOverride },
      },
      enableTelemetry: false,
    });

    const tool = server.toolDefs.find((t) => t.name === "manageFunctions")!;
    const result = await tool.handler({
      action: "incrementalDeployFunction",
      functionName: "myFunction",
      functionRootPath: "/path/to/functions/myFunction",
      incrementalFile: "index.js",
    });

    expect(mockOverride).toHaveBeenCalledWith({
      functionName: "myFunction",
      functionRootPath: "/path/to/functions/myFunction",
      incrementalFile: "index.js",
    });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
  });

  it("server.toolDefs 应包含所有注册的工具", async () => {
    const server = await createCloudBaseMcpServer({
      pluginsEnabled: ["functions"],
      cloudBaseOptions: { envId: "test-env", requestFn: vi.fn() },
      enableTelemetry: false,
    });

    expect(server.toolDefs.length).toBeGreaterThan(0);
    const names = server.toolDefs.map((t) => t.name);
    expect(names).toContain("manageFunctions");
    expect(names).toContain("queryFunctions");
  });

  it("requestFn 应被 getCloudBaseManager 识别为有效凭据来源", async () => {
    const { getCloudBaseManager } = await import("../cloudbase-manager.js");
    const mockManager = {
      functions: { getFunctionList: vi.fn().mockResolvedValue({ Functions: [], TotalCount: 0 }) },
      commonService: vi.fn(),
    };
    vi.mocked(getCloudBaseManager).mockResolvedValue(mockManager as any);

    const mockRequestFn = vi.fn().mockResolvedValue({ Functions: [], TotalCount: 0 });

    const server = await createCloudBaseMcpServer({
      pluginsEnabled: ["functions"],
      cloudBaseOptions: { envId: "test-env", requestFn: mockRequestFn },
      enableTelemetry: false,
    });

    const tool = server.toolDefs.find((t) => t.name === "queryFunctions")!;
    await tool.handler({ action: "listFunctions", envId: "test-env" });

    // getCloudBaseManager 应被调用，带上包含 requestFn 的 cloudBaseOptions
    expect(getCloudBaseManager).toHaveBeenCalledWith(
      expect.objectContaining({
        cloudBaseOptions: expect.objectContaining({
          requestFn: mockRequestFn,
        }),
      })
    );
  });
});
