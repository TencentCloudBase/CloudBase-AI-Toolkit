import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerAppTools } from "./apps.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetCloudBaseManager,
  mockLogCloudBaseResult,
  mockDescribeAppList,
  mockDescribeAppInfo,
  mockDescribeAppVersionList,
  mockUploadCode,
  mockCreateApp,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockDescribeAppList: vi.fn(),
  mockDescribeAppInfo: vi.fn(),
  mockDescribeAppVersionList: vi.fn(),
  mockUploadCode: vi.fn(),
  mockCreateApp: vi.fn(),
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

  registerAppTools(server);

  return { tools };
}

describe("app tools", () => {
  let tools: ReturnType<typeof createMockServer>["tools"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockDescribeAppList.mockResolvedValue({
      Total: 1,
      ServiceList: [{ ServiceName: "demo-app" }],
      RequestId: "req-app-list",
    });
    mockDescribeAppInfo.mockResolvedValue({
      ServiceName: "demo-app",
      DeployType: "static-hosting",
      RequestId: "req-app-info",
    });
    mockDescribeAppVersionList.mockResolvedValue({
      Total: 1,
      VersionList: [{ VersionName: "v1" }],
      RequestId: "req-app-version-list",
    });
    mockUploadCode.mockResolvedValue({
      cosTimestamp: "1740000000",
      unixTimestamp: "1740000000",
    });
    mockCreateApp.mockResolvedValue({
      ServiceName: "demo-app",
      BuildId: "build-1",
      VersionName: "v1",
      RequestId: "req-app-create",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      cloudAppService: {
        describeAppList: mockDescribeAppList,
        describeAppInfo: mockDescribeAppInfo,
        describeAppVersionList: mockDescribeAppVersionList,
        uploadCode: mockUploadCode,
        createApp: mockCreateApp,
      },
    });
    ({ tools } = createMockServer());
  });

  it("queryApps(action=listApps) should list apps", async () => {
    const result = await tools.queryApps.handler({ action: "listApps" });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeAppList).toHaveBeenCalledWith({
      deployType: "static-hosting",
      pageNo: 1,
      pageSize: 20,
      searchKey: undefined,
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "listApps",
        apps: [expect.objectContaining({ ServiceName: "demo-app" })],
      },
    });
  });

  it("manageApps(action=deployApp) should upload and create app", async () => {
    const result = await tools.manageApps.handler({
      action: "deployApp",
      serviceName: "demo-app",
      filePath: "/tmp/demo-app",
      appPath: "/demo-app",
      buildPath: "dist",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockUploadCode).toHaveBeenCalledWith({
      deployType: "static-hosting",
      serviceName: "demo-app",
      localPath: "/tmp/demo-app",
      ignore: undefined,
    });
    expect(mockCreateApp).toHaveBeenCalledWith(
      expect.objectContaining({
        deployType: "static-hosting",
        serviceName: "demo-app",
        buildType: "ZIP",
      }),
    );
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "deployApp",
        serviceName: "demo-app",
      },
    });
  });

  it("manageApps schema should clarify redeploy flow and framework values", () => {
    expect(tools.manageApps.meta.description).toContain("复用同一个 serviceName");
    expect(tools.manageApps.meta.inputSchema.serviceName.description).toContain("重新部署");
    expect(tools.manageApps.meta.inputSchema.framework.safeParse("static").success).toBe(true);
    expect(tools.manageApps.meta.inputSchema.framework.safeParse("html").success).toBe(false);
  });

  it("manageApps(action=deployApp) should require filePath", async () => {
    const result = await tools.manageApps.handler({
      action: "deployApp",
      serviceName: "demo-app",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      message: "action=deployApp 时必须提供 filePath",
    });
  });
});
