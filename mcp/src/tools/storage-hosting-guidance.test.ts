import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";
import { t, type MessageKey } from "../i18n/index.js";

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

vi.mock("../utils/cloud-mode.js", () => ({
  isCloudMode: () => process.env.CLOUDBASE_MCP_CLOUD_MODE === 'true' || process.env.MCP_CLOUD_MODE === 'true',
  enableCloudMode: () => {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = 'true';
  },
  getCloudModeStatus: () => ({
    enabled: process.env.CLOUDBASE_MCP_CLOUD_MODE === 'true' || process.env.MCP_CLOUD_MODE === 'true',
    source: process.env.CLOUDBASE_MCP_CLOUD_MODE === 'true'
      ? 'CLOUDBASE_MCP_CLOUD_MODE'
      : process.env.MCP_CLOUD_MODE === 'true'
        ? 'MCP_CLOUD_MODE'
        : null,
  }),
  shouldRegisterTool: () => true,
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

    // description 已迁移为词典 key 字符串，真实 server 由 registerTool 包装层解析；
    // 这里的 mock registerTool 不走包装层，断言前需自行 t() 解析。
    expect(t(tools.manageHosting.meta.description as MessageKey)).toContain("action=upload");
    expect(t(tools.manageHosting.meta.description as MessageKey)).toContain("queryHosting");
    expect(tools.manageHosting.meta.inputSchema.cloudPath.description).toContain("静态托管中的目标路径");
    expect(tools.manageHosting.meta.inputSchema.action.description).toContain("upload=上传本地构建产物到静态托管");
    expect(t(tools.manageStorage.meta.description as MessageKey)).toContain("仅用于 COS/Storage 对象");
    expect(t(tools.manageStorage.meta.description as MessageKey)).toContain("不用于静态网站托管");
    expect(t(tools.manageStorage.meta.description as MessageKey)).toContain("公有读");
    expect(t(tools.queryStorage.meta.description as MessageKey)).toContain("公有读");
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
