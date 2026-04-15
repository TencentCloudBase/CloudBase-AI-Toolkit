import fs from "fs";
import { describe, expect, it, vi } from "vitest";
import { registerHostingTools } from "./hosting.js";
import { registerStorageTools } from "./storage.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockLogCloudBaseResult,
  mockSendDeployNotification,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
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
  it("should clearly separate static hosting uploads from cloud storage uploads", () => {
    const tools = createMockServer();

    expect(tools.uploadFiles.meta.description).toContain("仅用于 Web 站点部署");
    expect(tools.uploadFiles.meta.description).toContain("manageStorage");
    expect(tools.uploadFiles.meta.description).toContain("通常不需要调用此工具");
    expect(tools.uploadFiles.meta.inputSchema.cloudPath.description).toContain("云存储对象路径请改用 manageStorage");
    expect(tools.manageStorage.meta.description).toContain("仅用于 COS/Storage 对象");
    expect(tools.manageStorage.meta.description).toContain("不用于静态网站托管");
  });

  it("should document normalized relative cloudPath requirements for hosting paths", () => {
    const tools = createMockServer();

    expect(tools.uploadFiles.meta.inputSchema.cloudPath.description).toContain("不要带前导 /");
    expect(tools.uploadFiles.meta.inputSchema.cloudPath.description).toContain("/vite-demo");
    expect(tools.uploadFiles.meta.inputSchema.files.description).toContain("不要带前导 /");
    expect(tools.deleteFiles.meta.inputSchema.cloudPath.description).toContain("不要带前导 /");
  });

  it("should normalize directory upload cloudPath before calling hosting sdk", async () => {
    const tools = createMockServer();
    const uploadFiles = vi.fn().mockResolvedValue({ RequestId: "req-upload" });
    const deleteFiles = vi.fn().mockResolvedValue({ RequestId: "req-delete" });

    mockGetCloudBaseManager.mockResolvedValue({
      hosting: {
        uploadFiles,
        deleteFiles,
      },
      env: {
        getEnvInfo: vi.fn().mockResolvedValue({
          EnvInfo: {
            StaticStorages: [{ StaticDomain: "demo.hosting.com" }],
          },
        }),
      },
    });
    mockGetEnvId.mockResolvedValue("env-test");
    mockSendDeployNotification.mockResolvedValue(undefined);

    const statSpy = vi.spyOn(fs, "statSync").mockImplementation((inputPath: fs.PathLike) => {
      if (String(inputPath) === "/tmp/dist") {
        return { isDirectory: () => true, isFile: () => false } as fs.Stats;
      }
      throw new Error("ENOENT");
    });

    const uploadResult = await tools.uploadFiles.handler({
      localPath: "/tmp/dist",
      cloudPath: "/vite-demo",
    });
    const uploadPayload = JSON.parse(uploadResult.content[0].text);

    expect(uploadFiles).toHaveBeenCalledWith({
      localPath: "/tmp/dist",
      cloudPath: "vite-demo/",
      files: [],
      ignore: undefined,
    });
    expect(uploadPayload.accessUrl).toBe("https://demo.hosting.com/vite-demo/");

    await tools.deleteFiles.handler({ cloudPath: "/vite-demo", isDir: true });

    expect(deleteFiles).toHaveBeenCalledWith({
      cloudPath: "vite-demo/",
      isDir: true,
    });

    statSpy.mockRestore();
  });
});
