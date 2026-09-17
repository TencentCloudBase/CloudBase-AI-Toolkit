import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { registerAppTools } from "./apps.js";
import { t } from "../i18n/index.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetCloudBaseManager,
  mockLogCloudBaseResult,
  mockDescribeAppList,
  mockDescribeAppInfo,
  mockDescribeAppVersionList,
  mockDescribeAppVersion,
  mockUploadCode,
  mockCreateApp,
  mockDescribeBuildLog,
  mockDescribeCosInfo,
  mockDeleteApp,
  mockDeleteAppVersion,
  mockIsCloudMode,
  mockGetEnvId,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockDescribeAppList: vi.fn(),
  mockDescribeAppInfo: vi.fn(),
  mockDescribeAppVersionList: vi.fn(),
  mockDescribeAppVersion: vi.fn(),
  mockUploadCode: vi.fn(),
  mockCreateApp: vi.fn(),
  mockDescribeBuildLog: vi.fn(),
  mockDescribeCosInfo: vi.fn(),
  mockDeleteApp: vi.fn(),
  mockDeleteAppVersion: vi.fn(),
  mockIsCloudMode: vi.fn(() => false),
  mockGetEnvId: vi.fn(async () => "env-test"),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: mockLogCloudBaseResult,
}));

vi.mock("../utils/cloud-mode.js", () => ({
  isCloudMode: mockIsCloudMode,
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
    mockIsCloudMode.mockReturnValue(false);
    mockGetEnvId.mockResolvedValue("env-test");
    mockDescribeAppList.mockResolvedValue({
      Total: 1,
      ServiceList: [{ ServiceName: "demo-app" }],
      RequestId: "req-app-list",
    });
    mockDescribeAppInfo.mockResolvedValue({
      ServiceName: "demo-app",
      DeployType: "static-hosting",
      Domain: "demo-app-env-test.webapps.tcloudbase.com",
      RequestId: "req-app-info",
    });
    mockDescribeAppVersionList.mockResolvedValue({
      Total: 1,
      VersionList: [{ VersionName: "v1" }],
      RequestId: "req-app-version-list",
    });
    mockDescribeAppVersion.mockResolvedValue({
      Status: "SUCCESS",
      BuildId: "build-1",
      VersionName: "v1",
      RequestId: "req-app-version",
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
    mockDeleteApp.mockResolvedValue({
      RequestId: "req-app-delete",
    });
    mockDeleteAppVersion.mockResolvedValue({
      RequestId: "req-app-delete-version",
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
        describeAppVersion: mockDescribeAppVersion,
        uploadCode: mockUploadCode,
        createApp: mockCreateApp,
        describeCosInfo: mockDescribeCosInfo,
        deleteApp: mockDeleteApp,
        deleteAppVersion: mockDeleteAppVersion,
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
      ignore: expect.arrayContaining([
        "node_modules/**",
        ".git/**",
        "**/target/**",
        "**/.next/**",
        "**/.next.bak/**",
      ]),
    });
    expect(mockCreateApp).toHaveBeenCalledWith(
      expect.objectContaining({
        deployType: "static-hosting",
        serviceName: "demo-app",
        buildType: "ZIP",
      }),
    );
    expect(mockDescribeAppInfo).toHaveBeenCalledWith({
      deployType: "static-hosting",
      serviceName: "demo-app",
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "deployApp",
        serviceName: "demo-app",
        domain: "demo-app-env-test.webapps.tcloudbase.com",
        accessUrl: "https://demo-app-env-test.webapps.tcloudbase.com",
      },
    });
  });

  it("manageApps(action=deployApp) should normalize access URL from app details", async () => {
    mockDescribeAppInfo.mockResolvedValueOnce({
      ServiceName: "demo-app",
      DeployType: "static-hosting",
      Domain: "https://demo-app-env-test.webapps.tcloudbase.com/",
      RequestId: "req-app-info",
    });

    const result = await tools.manageApps.handler({
      action: "deployApp",
      serviceName: "demo-app",
      filePath: "/tmp/demo-app",
      buildPath: "dist",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.data.domain).toBe("demo-app-env-test.webapps.tcloudbase.com");
    expect(payload.data.accessUrl).toBe("https://demo-app-env-test.webapps.tcloudbase.com");
    expect(payload.data.accessUrlSource).toBe("describeAppInfo.Domain");
    expect(payload.data.nextStep.hint).toContain("accessUrl");
  });

  it("manageApps(action=deployApp) with cosTimestamp should skip uploadCode", async () => {
    const result = await tools.manageApps.handler({
      action: "deployApp",
      serviceName: "demo-app",
      cosTimestamp: 1741234567,
      buildPath: "dist",
      framework: "static",
    });
    const payload = JSON.parse(result.content[0].text);

    // uploadCode should NOT be called when cosTimestamp is provided
    expect(mockUploadCode).not.toHaveBeenCalled();
    // ⚠️ 类型契约（F12）：传入 number，但传给 SDK 的必须是 string
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

  it("cloud mode deployApp rejects localPath", async () => {
    mockIsCloudMode.mockReturnValue(true);

    const result = await tools.manageApps.handler({
      action: "deployApp",
      serviceName: "demo-app",
      filePath: "/etc",
      buildPath: "dist",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockUploadCode).not.toHaveBeenCalled();
    expect(mockCreateApp).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: false,
      code: "CLOUD_MODE_UNSUPPORTED_ACTION",
      data: {
        code: "CLOUD_MODE_UNSUPPORTED_ACTION",
        action: "deployApp",
        reason: "localPath",
      },
    });
    expect(payload.message).toContain("localPath");
  });

  it("cloud mode deleteApp still works", async () => {
    mockIsCloudMode.mockReturnValue(true);

    const result = await tools.manageApps.handler({
      action: "deleteApp",
      serviceName: "demo-app",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDeleteApp).toHaveBeenCalledWith({
      deployType: "static-hosting",
      serviceName: "demo-app",
    });
    expect(mockUploadCode).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "deleteApp",
        serviceName: "demo-app",
      },
    });
  });

  it("cloud mode deployApp via full schema→handler path passes cosTimestamp as string (F12)", async () => {
    mockIsCloudMode.mockReturnValue(true);
    const shape = (tools.manageApps.meta as any).inputSchema;

    // 客户端按 JSON Schema 传 number（schema 宣告 string|number）
    const parsed = z.object(shape).parse({
      action: "deployApp",
      serviceName: "demo-app",
      cosTimestamp: 1741234567,
      framework: "static",
    });
    expect(parsed.cosTimestamp).toBe("1741234567");

    const result = await tools.manageApps.handler(parsed);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);

    // 硬契约：传到 SDK 的 StaticConfig.CosTimestamp 必须是 string
    const sdkArg = mockCreateApp.mock.calls.at(-1)?.[0] as any;
    expect(typeof sdkArg.staticConfig.cosTimestamp).toBe("string");
    expect(sdkArg.staticConfig.cosTimestamp).toBe("1741234567");
  });

  it("cloud mode deployApp with cosTimestamp still works", async () => {
    mockIsCloudMode.mockReturnValue(true);
    const result = await tools.manageApps.handler({
      action: "deployApp",
      serviceName: "demo-app",
      cosTimestamp: 1741234567,
      framework: "static",
      installCmd: "",
      buildCmd: "",
    });
    const payload = JSON.parse(result.content[0].text);

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
    expect(payload.success).toBe(true);
  });

  it("cloud mode deployApp with both localPath and cosTimestamp still rejects localPath", async () => {
    mockIsCloudMode.mockReturnValue(true);

    const result = await tools.manageApps.handler({
      action: "deployApp",
      serviceName: "demo-app",
      filePath: "/etc",
      cosTimestamp: 1741234567,
    });
    const payload = JSON.parse(result.content[0].text);

    // #984 语义不回退：云端模式带 localPath 一律拒绝，即使同时传了 cosTimestamp
    expect(mockUploadCode).not.toHaveBeenCalled();
    expect(mockCreateApp).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: false,
      code: "CLOUD_MODE_UNSUPPORTED_ACTION",
      data: {
        code: "CLOUD_MODE_UNSUPPORTED_ACTION",
        action: "deployApp",
        reason: "localPath",
      },
    });
  });

  it("deployApp with both filePath and cosTimestamp is rejected (strict either-or)", async () => {
    const result = await tools.manageApps.handler({
      action: "deployApp",
      serviceName: "demo-app",
      filePath: "/tmp/demo-app",
      cosTimestamp: 1741234567,
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockUploadCode).not.toHaveBeenCalled();
    expect(mockCreateApp).not.toHaveBeenCalled();
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("二选一");
  });

  it("queryApps(action=getUploadUrl) should return pre-signed upload info", async () => {
    mockDescribeCosInfo.mockResolvedValueOnce({
      UploadUrl: "https://example.com/upload-query",
      UploadHeaders: [
        { Key: "Content-Type", Value: "application/zip" },
        { Key: "Authorization", Value: "sig" },
      ],
      UnixTimestamp: 1741234567,
      RequestId: "req-cos-info-query",
    });

    const result = await tools.queryApps.handler({
      action: "getUploadUrl",
      serviceName: "demo-app",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeCosInfo).toHaveBeenCalledWith({
      deployType: "static-hosting",
      serviceName: "demo-app",
      suffix: ".zip",
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "getUploadUrl",
        serviceName: "demo-app",
        uploadUrl: "https://example.com/upload-query",
        uploadHeaders: expect.arrayContaining([
          expect.objectContaining({ Key: "Content-Type" }),
        ]),
        unixTimestamp: 1741234567,
      },
    });
    expect(payload.message).toContain("cosTimestamp");
    // 日志不得落入预签名凭据（UploadUrl / UploadHeaders 含 Authorization 签名），只允许 RequestId
    expect(mockLogCloudBaseResult).toHaveBeenCalledWith(expect.anything(), { RequestId: "req-cos-info-query" });
    const loggedPayloads = mockLogCloudBaseResult.mock.calls.map((call) => call[1]);
    for (const logged of loggedPayloads) {
      expect(JSON.stringify(logged)).not.toContain("Authorization");
      expect(JSON.stringify(logged)).not.toContain("upload-query");
    }
  });

  it("manageApps(action=getUploadUrl) should not log pre-signed credentials either", async () => {
    mockDescribeCosInfo.mockResolvedValueOnce({
      UploadUrl: "https://example.com/upload-manage",
      UploadHeaders: [{ Key: "Authorization", Value: "sig" }],
      UnixTimestamp: 1741234567,
      RequestId: "req-cos-info-manage",
    });

    await tools.manageApps.handler({
      action: "getUploadUrl",
      serviceName: "demo-app",
    });

    expect(mockLogCloudBaseResult).toHaveBeenCalledWith(expect.anything(), { RequestId: "req-cos-info-manage" });
    const loggedPayloads = mockLogCloudBaseResult.mock.calls.map((call) => call[1]);
    for (const logged of loggedPayloads) {
      expect(JSON.stringify(logged)).not.toContain("Authorization");
      expect(JSON.stringify(logged)).not.toContain("upload-manage");
    }
  });

  it("cosTimestamp schema normalizes to string and rejects invalid values", () => {
    const schema = (tools.manageApps.meta as any).inputSchema.cosTimestamp;

    // ⚠️ 类型契约（F12）：SDK 与后端要求 StaticConfig.CosTimestamp 是 **string**，
    // schema 必须把任何合法输入归一成 string，绝不能输出的 number 直达后端。
    expect(schema.parse("1741234567")).toBe("1741234567");
    expect(schema.parse(1741234567)).toBe("1741234567");
    expect(schema.parse(" 1741234567 ")).toBe("1741234567");

    // 非法值：0 / 负数 / 浮点 / 非数字 / 空串
    expect(() => schema.parse(0)).toThrow();
    expect(() => schema.parse(-1)).toThrow();
    expect(() => schema.parse(1.5)).toThrow();
    expect(() => schema.parse("abc")).toThrow();
    expect(() => schema.parse("")).toThrow();
    expect(schema.parse(undefined)).toBeUndefined();
  });

  it("buildId schema accepts string and number (shared by getAppVersion and getBuildLog)", () => {
    const schema = (tools.queryApps.meta as any).inputSchema.buildId;

    expect(schema.parse("2603252682")).toBe("2603252682");
    expect(schema.parse(2603252682)).toBe("2603252682");
    expect(schema.parse(undefined)).toBeUndefined();
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
    expect(tools.manageApps.meta.description).toBe("apps.manageDescription");
    expect(t("apps.manageDescription")).toContain("远端构建");
    expect(t("apps.manageDescription")).toContain("与 manageHosting 对比");
    expect(t("apps.schema.manageServiceName")).toContain("重新部署");
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
      buildId: "2603252682",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeBuildLog).toHaveBeenCalledWith(
      expect.objectContaining({
        Action: "DescribeCloudBaseRunBuildLog",
        Param: expect.objectContaining({
          ServiceName: "demo-app",
          // ⚠️ 类型契约（F13）：云 API 的 BuildId 是 Integer(int64)，传 string 会被后端拒
          BuildId: 2603252682,
        }),
      }),
    );
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "getBuildLog",
        serviceName: "demo-app",
        buildId: "2603252682",
        logs: expect.arrayContaining([
          expect.objectContaining({ Message: expect.any(String) }),
        ]),
      },
    });
  });

  it("queryApps(action=getBuildLog) accepts a numeric buildId and rejects non-numeric ones", async () => {
    const numericResult = await tools.queryApps.handler({
      action: "getBuildLog",
      serviceName: "demo-app",
      buildId: 2603252682,
    });
    expect(JSON.parse(numericResult.content[0].text).success).toBe(true);
    expect(mockDescribeBuildLog).toHaveBeenLastCalledWith(
      expect.objectContaining({
        Param: expect.objectContaining({ BuildId: 2603252682 }),
      }),
    );

    mockDescribeBuildLog.mockClear();
    const badResult = await tools.queryApps.handler({
      action: "getBuildLog",
      serviceName: "demo-app",
      buildId: "build-1",
    });
    const badPayload = JSON.parse(badResult.content[0].text);
    expect(badPayload.success).toBe(false);
    expect(badPayload.message).toContain("buildId");
    // 不要在本地就知道不合法时还去打云端
    expect(mockDescribeBuildLog).not.toHaveBeenCalled();
  });

  it("queryApps(action=getAppVersion) normalizes lowercase failed status", async () => {
    mockDescribeAppVersion.mockResolvedValueOnce({
      Status: "failed",
      BuildId: "build-failed",
      FailReason: "npm install failed",
      RequestId: "req-app-version-failed",
    });

    const result = await tools.queryApps.handler({
      action: "getAppVersion",
      serviceName: "demo-app",
      buildId: "build-failed",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeAppVersion).toHaveBeenCalledWith({
      deployType: "static-hosting",
      serviceName: "demo-app",
      versionName: undefined,
      buildId: "build-failed",
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "getAppVersion",
        status: "failed",
        nextStep: {
          action: "查询构建日志",
          tool: "queryApps",
          args: {
            action: "getBuildLog",
            serviceName: "demo-app",
            buildId: "build-failed",
          },
        },
      },
    });
    expect(payload.message).toContain("可查询构建日志");
  });

  it("queryApps(action=getAppVersion) treats mixed-case Failed as failed", async () => {
    mockDescribeAppVersion.mockResolvedValueOnce({
      Status: "Failed",
      BuildId: "build-mixed",
      RequestId: "req-app-version-mixed",
    });

    const result = await tools.queryApps.handler({
      action: "getAppVersion",
      serviceName: "demo-app",
      buildId: "build-mixed",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.data.nextStep?.args?.action).toBe("getBuildLog");
  });
});
