import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerHostingTools } from "./hosting.js";
import { registerStorageTools } from "./storage.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockHostingUploadFiles,
  mockGetEnvInfo,
  mockLogCloudBaseResult,
  mockSendDeployNotification,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockHostingUploadFiles: vi.fn(),
  mockGetEnvInfo: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockSendDeployNotification: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: mockLogCloudBaseResult,
}));

vi.mock("../utils/notification.js", () => ({
  sendDeployNotification: mockSendDeployNotification,
}));

function createMockServer() {
  const tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }> = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    ide: "TestIDE",
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    } as any,
    server: {
      sendLoggingMessage: vi.fn(),
    },
    registerTool: vi.fn((name: string, meta: any, handler: (args: any) => Promise<any>) => {
      tools[name] = { meta, handler };
    }),
  } as unknown as ExtendedMcpServer;

  registerHostingTools(server);
  registerStorageTools(server);

  return tools;
}

describe("storage and hosting tool guidance", () => {
  let tools: ReturnType<typeof createMockServer>;
  let tempDir: string;

  beforeEach(() => {
    vi.resetAllMocks();
    mockGetEnvId.mockResolvedValue("env-test");
    mockHostingUploadFiles.mockResolvedValue({
      files: [{ options: { Key: "index.html" } }],
    });
    mockGetEnvInfo.mockResolvedValue({
      EnvInfo: {
        StaticStorages: [{ StaticDomain: "env-test.tcloudbase.com" }],
      },
    });
    mockGetCloudBaseManager.mockResolvedValue({
      hosting: {
        uploadFiles: mockHostingUploadFiles,
      },
      env: {
        getEnvInfo: mockGetEnvInfo,
      },
    });
    mockSendDeployNotification.mockResolvedValue(undefined);

    tools = createMockServer();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "upload-files-"));
    fs.writeFileSync(path.join(tempDir, "index.html"), "<h1>Hello World</h1>");
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("should clearly separate static hosting uploads from cloud storage uploads", () => {
    expect(tools.uploadFiles.meta.description).toContain("仅用于 Web 站点部署");
    expect(tools.uploadFiles.meta.description).toContain("manageStorage");
    expect(tools.uploadFiles.meta.description).toContain("通常不需要调用此工具");
    expect(tools.uploadFiles.meta.description).toContain("deploymentStatus");
    expect(tools.uploadFiles.meta.description).toContain("findFiles");
    expect(tools.uploadFiles.meta.inputSchema.cloudPath.description).toContain("站点根目录（/）时请传空字符串或省略此参数");
    expect(tools.uploadFiles.meta.inputSchema.cloudPath.description).toContain("云存储对象路径请改用 manageStorage");
    expect(tools.manageStorage.meta.description).toContain("仅用于 COS/Storage 对象");
    expect(tools.manageStorage.meta.description).toContain("不用于静态网站托管");
  });

  it("treats slash-only cloudPath as root and reports deployment status for directory uploads", async () => {
    const result = await tools.uploadFiles.handler({
      localPath: tempDir,
      cloudPath: "/",
    });

    const [uploadArgs] = mockHostingUploadFiles.mock.calls[0] ?? [];
    expect(uploadArgs.localPath).toBe(tempDir);
    expect(uploadArgs.cloudPath).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(uploadArgs, "files")).toBe(false);

    const payload = JSON.parse(result.content[0].text);
    expect(payload.accessUrl).toBe("https://env-test.tcloudbase.com/");
    expect(payload.message).toContain("部署成功");
    expect(payload.deploymentStatus).toMatchObject({
      filesUploaded: 1,
      targetPath: "/",
      staticDomain: "env-test.tcloudbase.com",
      isReady: true,
    });
    expect(mockSendDeployNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        projectId: "env-test",
        url: "https://env-test.tcloudbase.com/",
      }),
    );
  });
});
