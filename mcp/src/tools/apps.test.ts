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
  mockDescribeBuildLog,
  mockDescribeCosInfo,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockDescribeAppList: vi.fn(),
  mockDescribeAppInfo: vi.fn(),
  mockDescribeAppVersionList: vi.fn(),
  mockUploadCode: vi.fn(),
  mockCreateApp: vi.fn(),
  mockDescribeBuildLog: vi.fn(),
  mockDescribeCosInfo: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  logCloudBaseResult: mockLogCloudBaseResult,
}));

vi.mock("../utils/cloud-mode.js", () => ({
  isCloudMode: () => false,
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
    mockDescribeBuildLog.mockResolvedValue({
      Response: {
        Total: 2,
        LogList: [
          { Message: "开始构建", Time: "2026-06-03 12:00:00", Level: "INFO" },
          { Message: "部署完成", Time: "2026-06-03 12:01:00", Level: "INFO" },
        ],
        RequestId: "req-build-log",
      },
    });
    mockDescribeCosInfo.mockResolvedValue({
      UploadUrl: "https://example.com/upload",
      UploadHeaders: [{ Key: "Content-Type", Value: "application/zip" }],
      UnixTimestamp: "1741234567",
      RequestId: "req-cos-info",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      cloudAppService: {
        describeAppList: mockDescribeAppList,
        describeAppInfo: mockDescribeAppInfo,
        describeAppVersionList: mockDescribeAppVersionList,
        uploadCode: mockUploadCode,
        createApp: mockCreateApp,
        describeCosInfo: mockDescribeCosInfo,
      },
      commonService: () => ({
        call: mockDescribeBuildLog,
      }),
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

  it("manageApps(action=deployApp) with cosTimestamp should skip uploadCode", async () => {
    const result = await tools.manageApps.handler({
      action: "deployApp",
      serviceName: "demo-app",
      cosTimestamp: "1741234567",
      buildPath: "dist",
      framework: "static",
    });
    const payload = JSON.parse(result.content[0].text);

    // uploadCode should NOT be called when cosTimestamp is provided
    expect(mockUploadCode).not.toHaveBeenCalled();
    expect(mockCreateApp).toHaveBeenCalledWith(
      expect.objectContaining({
        deployType: "static-hosting",
        serviceName: "demo-app",
        buildType: "ZIP",
        staticConfig: expect.objectContaining({
          cosTimestamp: "1741234567",
        }),
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

  it("manageApps(action=getUploadUrl) should return pre-signed URL", async () => {
    const result = await tools.manageApps.handler({
      action: "getUploadUrl",
      serviceName: "demo-app",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeCosInfo).toHaveBeenCalledWith({
      deployType: "static-hosting",
      serviceName: "demo-app",
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "getUploadUrl",
        serviceName: "demo-app",
        uploadUrl: "https://example.com/upload",
        cosTimestamp: "1741234567",
        method: "PUT",
        nextAction: {
          action: "上传代码到预签名 URL",
        },
      },
    });
  });

  it("manageApps schema should clarify redeploy flow and framework values", () => {
    expect(tools.manageApps.meta.description).toContain("远端构建");
    expect(tools.manageApps.meta.description).toContain("与 manageHosting 对比");
    expect(tools.manageApps.meta.inputSchema.serviceName.description).toContain("重新部署");
    expect(tools.manageApps.meta.inputSchema.framework.safeParse("static").success).toBe(true);
    expect(tools.manageApps.meta.inputSchema.framework.safeParse("html").success).toBe(false);
  });

  it("manageApps(action=deployApp) should require filePath or cosTimestamp", async () => {
    const result = await tools.manageApps.handler({
      action: "deployApp",
      serviceName: "demo-app",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: false,
      message: expect.stringContaining("filePath"),
    });
  });

  it("queryApps(action=getBuildLog) should return build logs", async () => {
    const result = await tools.queryApps.handler({
      action: "getBuildLog",
      serviceName: "demo-app",
      buildId: "build-1",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeBuildLog).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "DescribeCloudBaseRunBuildLog",
        Param: expect.objectContaining({
          ServiceName: "demo-app",
          BuildId: "build-1",
        }),
      }),
    );
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "getBuildLog",
        serviceName: "demo-app",
        buildId: "build-1",
        logs: expect.arrayContaining([
          expect.objectContaining({ Message: expect.any(String) }),
        ]),
      },
    });
  });
});
