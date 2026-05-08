import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockUploadDirectory,
  mockUploadFile,
  mockGetTemporaryUrl,
  mockDescribeEnvsCall,
  mockCommonService,
  mockHostingUploadFiles,
  mockHostingFindFiles,
  mockGetEnvInfo,
  mockSendDeployNotification,
  mockFetch,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockUploadDirectory: vi.fn(),
  mockUploadFile: vi.fn(),
  mockGetTemporaryUrl: vi.fn(),
  mockDescribeEnvsCall: vi.fn(),
  mockCommonService: vi.fn(),
  mockHostingUploadFiles: vi.fn(),
  mockHostingFindFiles: vi.fn(),
  mockGetEnvInfo: vi.fn(),
  mockSendDeployNotification: vi.fn(),
  mockFetch: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: vi.fn(),
}));

vi.mock("../utils/notification.js", () => ({
  sendDeployNotification: mockSendDeployNotification,
}));

import { registerHostingTools } from "./hosting.js";
import { registerStorageTools } from "./storage.js";

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFetch);

  mockGetEnvId.mockResolvedValue("env-test");
  mockUploadDirectory.mockResolvedValue(undefined);
  mockUploadFile.mockResolvedValue(undefined);
  mockHostingUploadFiles.mockResolvedValue({ RequestId: "req-upload" });
  mockHostingFindFiles.mockResolvedValue({
    files: [
      { Key: "vite-test/index.html" },
      { Key: "vite-test/assets/index.js" },
    ],
  });
  mockGetEnvInfo.mockResolvedValue({
    EnvInfo: {
      StaticStorages: [{ StaticDomain: "env-test.tcloudbaseapp.com" }],
    },
  });
  mockSendDeployNotification.mockResolvedValue(undefined);
  mockFetch
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      url: "https://env-test.tcloudbaseapp.com/vite-test",
      headers: {
        get: (name: string) => (name === "content-type" ? "text/html; charset=utf-8" : null),
      },
      text: async () => '<!doctype html><html><body><script src="/vite-test/assets/index.js"></script></body></html>',
    })
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      url: "https://env-test.tcloudbaseapp.com/vite-test/assets/index.js",
      headers: {
        get: (name: string) => (name === "content-type" ? "application/javascript" : null),
      },
      text: async () => "console.log('ok')",
    });
  mockGetTemporaryUrl.mockResolvedValue([
    {
      url: "https://signed.example.com/tmp-url",
      fileId: "cloud://env-test.bucket/aicoding/helloworld.txt",
    },
  ]);
  mockDescribeEnvsCall.mockResolvedValue({
    EnvList: [
      {
        EnvId: "env-test",
        Storages: [
          {
            Region: "ap-guangzhou",
            Bucket: "env-test-1250000000",
            CdnDomain: "env-test-1250000000.tcb.qcloud.la",
            AppId: "1250000000",
          },
        ],
      },
    ],
  });
  mockCommonService.mockReturnValue({
    call: mockDescribeEnvsCall,
  });
  mockGetCloudBaseManager.mockResolvedValue({
    storage: {
      uploadDirectory: mockUploadDirectory,
      uploadFile: mockUploadFile,
      getTemporaryUrl: mockGetTemporaryUrl,
      downloadDirectory: vi.fn(),
      downloadFile: vi.fn(),
      deleteDirectory: vi.fn(),
      deleteFile: vi.fn(),
      listDirectoryFiles: vi.fn(),
      getFileInfo: vi.fn(),
    },
    hosting: {
      uploadFiles: mockHostingUploadFiles,
      findFiles: mockHostingFindFiles,
      deleteFiles: vi.fn(),
    },
    env: {
      getEnvInfo: mockGetEnvInfo,
    },
    commonService: mockCommonService,
  });
});

describe("storage and hosting tool guidance", () => {
  it("should clearly separate static hosting uploads from cloud storage uploads", () => {
    const tools = createMockServer();

    expect(tools.uploadFiles.meta.description).toContain("仅用于 Web 站点部署");
    expect(tools.uploadFiles.meta.description).toContain("manageStorage");
    expect(tools.uploadFiles.meta.description).toContain("通常不需要调用此工具");
    expect(tools.uploadFiles.meta.inputSchema.cloudPath.description).toContain("云存储对象路径请改用 manageStorage");
    expect(tools.manageStorage.meta.description).toContain("仅用于 COS/Storage 对象");
    expect(tools.manageStorage.meta.description).toContain("不用于静态网站托管");
    expect(tools.manageStorage.meta.description).toContain("公有读");
    expect(tools.queryStorage.meta.description).toContain("公有读");
  });

  it("manageStorage(upload) should expose a permanent publicUrl derived from DescribeEnvs", async () => {
    const tools = createMockServer();

    const result = await tools.manageStorage.handler({
      action: "upload",
      localPath: "/tmp/helloworld.txt",
      cloudPath: "/aicoding/helloworld.txt",
      isDirectory: false,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.data.temporaryUrl).toBe("https://signed.example.com/tmp-url");
    expect(payload.data.storageCdnDomain).toBe("env-test-1250000000.tcb.qcloud.la");
    expect(payload.data.publicUrl).toBe("https://env-test-1250000000.tcb.qcloud.la/aicoding/helloworld.txt");
    expect(mockCommonService).toHaveBeenCalledWith("tcb", "2018-06-08");
    expect(mockDescribeEnvsCall).toHaveBeenCalledWith({
      Action: "DescribeEnvs",
      Param: {
        EnvId: "env-test",
      },
    });
  });

  it("queryStorage(url) should expose a permanent publicUrl derived from DescribeEnvs", async () => {
    const tools = createMockServer();

    const result = await tools.queryStorage.handler({
      action: "url",
      cloudPath: "/aicoding/helloworld.txt",
      maxAge: 3600,
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.data.temporaryUrl).toBe("https://signed.example.com/tmp-url");
    expect(payload.data.storageCdnDomain).toBe("env-test-1250000000.tcb.qcloud.la");
    expect(payload.data.publicUrl).toBe("https://env-test-1250000000.tcb.qcloud.la/aicoding/helloworld.txt");
    expect(payload.data.note).toContain("temporaryUrl 是临时签名链接");
    expect(payload.data.note).toContain("公有读");
  });

  it("uploadFiles should return structured access verification for subdirectory deploys", async () => {
    const tools = createMockServer();

    const result = await tools.uploadFiles.handler({
      localPath: "/tmp/dist",
      cloudPath: "vite-test",
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(true);
    expect(payload.data.accessUrl).toBe("https://env-test.tcloudbaseapp.com/vite-test/");
    expect(payload.data.deploymentPath).toBe("/vite-test/");
    expect(payload.verification.hostedFiles.checked).toBe(true);
    expect(payload.verification.hostedFiles.entryFound).toBe(true);
    expect(payload.verification.hostedFiles.expectedEntryPath).toBe("vite-test/index.html");
    expect(payload.verification.access.pageAccessible).toBe(true);
    expect(payload.verification.access.scriptAccessible).toBe(true);
    expect(payload.verification.access.checks[0].url).toBe("https://env-test.tcloudbaseapp.com/vite-test");
    expect(payload.verification.access.checks[1].url).toBe("https://env-test.tcloudbaseapp.com/vite-test/assets/index.js");
    expect(payload.message).toContain("首个 script 资源可访问");
    expect(mockHostingUploadFiles).toHaveBeenCalledWith({
      localPath: "/tmp/dist",
      cloudPath: "vite-test",
      files: [],
      ignore: undefined,
    });
    expect(mockHostingFindFiles).toHaveBeenCalledWith({
      prefix: "vite-test/",
      maxKeys: 20,
    });
  });
});
