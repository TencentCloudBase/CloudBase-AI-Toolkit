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
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockUploadDirectory: vi.fn(),
  mockUploadFile: vi.fn(),
  mockGetTemporaryUrl: vi.fn(),
  mockDescribeEnvsCall: vi.fn(),
  mockCommonService: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
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

  mockGetEnvId.mockResolvedValue("env-test");
  mockUploadDirectory.mockResolvedValue(undefined);
  mockUploadFile.mockResolvedValue(undefined);
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
});
