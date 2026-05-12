import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtendedMcpServer } from '../server.js';

const {
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockSendDeployNotification,
  mockDescribeHostingDomainTask,
  mockDescribeStaticStore,
  mockCreateStaticStore,
  mockGetWebsiteConfig,
  mockFindFiles,
  mockListFiles,
  mockCheckResource,
  mockUploadFiles,
  mockDeleteFiles,
  mockSetWebsiteDocument,
  mockCreateHostingDomain,
  mockDeleteHostingDomain,
  mockModifyHostingDomain,
  mockDownloadFile,
  mockDownloadDirectory,
  mockGetEnvInfo,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockSendDeployNotification: vi.fn(),
  mockDescribeHostingDomainTask: vi.fn(),
  mockDescribeStaticStore: vi.fn(),
  mockCreateStaticStore: vi.fn(),
  mockGetWebsiteConfig: vi.fn(),
  mockFindFiles: vi.fn(),
  mockListFiles: vi.fn(),
  mockCheckResource: vi.fn(),
  mockUploadFiles: vi.fn(),
  mockDeleteFiles: vi.fn(),
  mockSetWebsiteDocument: vi.fn(),
  mockCreateHostingDomain: vi.fn(),
  mockDeleteHostingDomain: vi.fn(),
  mockModifyHostingDomain: vi.fn(),
  mockDownloadFile: vi.fn(),
  mockDownloadDirectory: vi.fn(),
  mockGetEnvInfo: vi.fn(),
}));

vi.mock('../cloudbase-manager.js', () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: vi.fn(),
}));

vi.mock('../utils/notification.js', () => ({
  sendDeployNotification: mockSendDeployNotification,
}));

vi.mock('../utils/cloud-mode.js', () => ({
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

import { registerHostingTools } from './hosting.js';

function createMockServer() {
  const tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }> = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: 'env-test', region: 'ap-guangzhou' },
    ide: 'TestIDE',
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

  return tools;
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CLOUDBASE_MCP_CLOUD_MODE;
  delete process.env.MCP_CLOUD_MODE;

  mockGetEnvId.mockResolvedValue('env-test');
  mockGetWebsiteConfig.mockResolvedValue({
    IndexDocument: 'index.html',
    ErrorDocument: '404.html',
    RoutingRules: [],
  });
  mockDescribeStaticStore.mockResolvedValue({
    Data: [
      {
        Status: 'online',
        CdnDomain: 'static.example.com',
        Bucket: 'hosting-bucket',
        Id: 1,
      },
    ],
    RequestId: 'req-status',
  });
  mockFindFiles.mockResolvedValue({ Files: [{ Key: 'site/index.html' }] });
  mockListFiles.mockResolvedValue([{ Key: 'site/index.html' }, { Key: 'site/app.js' }]);
  mockCheckResource.mockResolvedValue({
    Domains: [{ Domain: 'www.example.com', Status: 'online' }],
    RecordCount: 1,
  });
  mockUploadFiles.mockResolvedValue({ RequestId: 'req-upload' });
  mockDeleteFiles.mockResolvedValue({ Deleted: [{ Key: 'site/index.html' }], Error: [] });
  mockSetWebsiteDocument.mockResolvedValue({ RequestId: 'req-set-website' });
  mockCreateStaticStore.mockResolvedValue({ Result: 'succ', RequestId: 'req-enable-hosting' });
  mockCreateHostingDomain.mockResolvedValue({ RequestId: 'req-bind-domain' });
  mockDeleteHostingDomain.mockResolvedValue({ RequestId: 'req-unbind-domain' });
  mockModifyHostingDomain.mockResolvedValue({ RequestId: 'req-update-domain' });
  mockDownloadFile.mockResolvedValue('/tmp/site/index.html');
  mockDownloadDirectory.mockResolvedValue(undefined);
  mockGetEnvInfo.mockResolvedValue({
    EnvInfo: {
      StaticStorages: [
        {
          StaticDomain: 'static.example.com',
          Bucket: 'hosting-bucket',
        },
      ],
    },
  });
  mockDescribeHostingDomainTask.mockResolvedValue({
    Status: 'processing',
  });

  mockGetCloudBaseManager.mockResolvedValue({
    hosting: {
      getWebsiteConfig: mockGetWebsiteConfig,
      findFiles: mockFindFiles,
      listFiles: mockListFiles,
      tcbCheckResource: mockCheckResource,
      uploadFiles: mockUploadFiles,
      deleteFiles: mockDeleteFiles,
      setWebsiteDocument: mockSetWebsiteDocument,
      CreateHostingDomain: mockCreateHostingDomain,
      deleteHostingDomain: mockDeleteHostingDomain,
      tcbModifyAttribute: mockModifyHostingDomain,
      downloadFile: mockDownloadFile,
      downloadDirectory: mockDownloadDirectory,
    },
    env: {
      getEnvInfo: mockGetEnvInfo,
    },
    commonService: vi.fn(() => ({
      call: vi.fn(({ Action }: { Action: string }) => {
        if (Action === 'DescribeStaticStore') {
          return mockDescribeStaticStore();
        }
        if (Action === 'CreateStaticStore') {
          return mockCreateStaticStore();
        }
        if (Action === 'DescribeHostingDomainTask') {
          return mockDescribeHostingDomainTask();
        }
        throw new Error(`Unexpected Action: ${Action}`);
      }),
    })),
  });
});

afterEach(() => {
  delete process.env.CLOUDBASE_MCP_CLOUD_MODE;
  delete process.env.MCP_CLOUD_MODE;
});

describe('hosting tools', () => {
  it('should register only queryHosting and manageHosting with AI-friendly descriptions', () => {
    const tools = createMockServer();

    expect(Object.keys(tools).sort()).toEqual(['manageHosting', 'queryHosting']);
    expect(tools.queryHosting.meta.description).toContain('只读');
    expect(tools.queryHosting.meta.inputSchema.action.description).toContain('websiteConfig');
    expect(tools.queryHosting.meta.inputSchema.domains.description).toContain('domainStatus');
    expect(tools.manageHosting.meta.description).toContain('若任务只是查看配置、文件或域名状态，请改用 queryHosting');
    expect(tools.manageHosting.meta.inputSchema.action.description).toContain('setWebsiteDocument');
    expect(tools.manageHosting.meta.inputSchema.confirm.description).toContain('delete');
    expect(tools.manageHosting.meta.inputSchema.indexDocument.description).toContain('action=setWebsiteDocument');
    expect(tools.manageHosting.meta.inputSchema.localPath.description).toContain('action=upload');
  });

  it('queryHosting(action=websiteConfig) should enrich config with StaticStorages info', async () => {
    const tools = createMockServer();

    const payload = JSON.parse((await tools.queryHosting.handler({ action: 'websiteConfig' })).content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.websiteConfig).toMatchObject({
      IndexDocument: 'index.html',
      ErrorDocument: '404.html',
      CdnDomain: 'static.example.com',
      Bucket: 'hosting-bucket',
    });
  });

  it('queryHosting(action=status) should call DescribeStaticStore and return hosting state', async () => {
    const tools = createMockServer();
    const payload = JSON.parse((await tools.queryHosting.handler({ action: 'status' })).content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.enabled).toBe(true);
    expect(payload.data.current).toMatchObject({
      Status: 'online',
      CdnDomain: 'static.example.com',
    });
    expect(mockDescribeStaticStore).toHaveBeenCalled();
  });

  it('queryHosting(action=domainStatus) should return polling guidance for missing domains', async () => {
    mockCheckResource.mockResolvedValueOnce({
      Domains: [{ Domain: 'www.example.com', Status: 'online' }],
      RecordCount: 1,
    });

    const tools = createMockServer();
    const payload = JSON.parse((await tools.queryHosting.handler({
      action: 'domainStatus',
      domains: ['www.example.com', 'cdn.example.com'],
    })).content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.matchedDomains).toEqual(['www.example.com']);
    expect(payload.data.missingDomains).toEqual(['cdn.example.com']);
    expect(payload.data.propagation.pollTool).toBe('queryHosting');
    expect(payload.data.nextActions[0]).toMatchObject({
      tool: 'queryHosting',
      action: 'domainStatus',
    });
  });

  it('manageHosting(action=upload) should upload and return access URL plus next action', async () => {
    const tools = createMockServer();
    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'upload',
      localPath: '/tmp/site-dist',
      cloudPath: 'site',
    })).content[0].text);

    expect(payload.success).toBe(true);
    expect(mockUploadFiles).toHaveBeenCalledWith({
      localPath: '/tmp/site-dist',
      cloudPath: 'site',
      files: [],
      ignore: undefined,
    });
    expect(payload.data.accessUrl).toBe('https://static.example.com/site/');
    expect(payload.data.nextActions[0]).toMatchObject({
      tool: 'queryHosting',
      action: 'findFiles',
    });
    expect(mockSendDeployNotification).toHaveBeenCalled();
  });

  it('manageHosting(action=delete) should require explicit confirm=true', async () => {
    const tools = createMockServer();
    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'delete',
      cloudPath: 'site/index.html',
    })).content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain('confirm=true');
    expect(mockDeleteFiles).not.toHaveBeenCalled();
  });

  it('manageHosting(action=setWebsiteDocument) should forward document settings and routing rules', async () => {
    const tools = createMockServer();
    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'setWebsiteDocument',
      indexDocument: 'index.html',
      errorDocument: '404.html',
      routingRules: [{ httpErrorCodeReturnedEquals: '404', replaceKeyWith: 'index.html' }],
    })).content[0].text);

    expect(payload.success).toBe(true);
    expect(mockSetWebsiteDocument).toHaveBeenCalledWith({
      indexDocument: 'index.html',
      errorDocument: '404.html',
      routingRules: [{ httpErrorCodeReturnedEquals: '404', replaceKeyWith: 'index.html' }],
    });
    expect(payload.data.nextActions[0]).toMatchObject({ action: 'websiteConfig' });
  });

  it('manageHosting(action=enableService) should call CreateStaticStore and return status follow-up guidance', async () => {
    const tools = createMockServer();
    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'enableService',
    })).content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.asyncState).toBe('PENDING');
    expect(payload.data.result).toMatchObject({ RequestId: 'req-enable-hosting' });
    expect(payload.data.nextActions[0]).toMatchObject({
      tool: 'queryHosting',
      action: 'status',
    });
    expect(mockCreateStaticStore).toHaveBeenCalled();
  });

  it('manageHosting(action=bindDomain) should return structured polling guidance', async () => {
    const tools = createMockServer();
    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'bindDomain',
      domain: 'www.example.com',
      certId: 'cert-123',
    })).content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.asyncState).toBe('PENDING');
    expect(payload.data.targetDomains).toEqual(['www.example.com']);
    expect(payload.data.propagation.pollTool).toBe('queryHosting');
    expect(payload.data.nextActions[0]).toMatchObject({
      tool: 'queryHosting',
      action: 'domainStatus',
    });
  });

  it('manageHosting should block local-file actions in cloud mode', async () => {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = 'true';
    const tools = createMockServer();

    const uploadPayload = JSON.parse((await tools.manageHosting.handler({
      action: 'upload',
      localPath: '/tmp/site-dist',
      cloudPath: 'site',
    })).content[0].text);
    const downloadPayload = JSON.parse((await tools.manageHosting.handler({
      action: 'downloadFile',
      cloudPath: 'site/index.html',
      localPath: '/tmp/site/index.html',
    })).content[0].text);

    expect(uploadPayload.success).toBe(false);
    expect(uploadPayload.message).toContain('cloud mode');
    expect(downloadPayload.success).toBe(false);
    expect(downloadPayload.message).toContain('cloud mode');
    expect(mockUploadFiles).not.toHaveBeenCalled();
    expect(mockDownloadFile).not.toHaveBeenCalled();
  });

  it('manageHosting should keep remote-only actions available in cloud mode', async () => {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = 'true';
    const tools = createMockServer();

    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'enableService',
    })).content[0].text);

    expect(payload.success).toBe(true);
    expect(mockCreateStaticStore).toHaveBeenCalled();
  });

  it('manageHosting(action=downloadFile/downloadDirectory) should call the hosting SDK with local paths', async () => {
    const tools = createMockServer();

    const filePayload = JSON.parse((await tools.manageHosting.handler({
      action: 'downloadFile',
      cloudPath: 'site/index.html',
      localPath: '/tmp/site/index.html',
    })).content[0].text);
    const dirPayload = JSON.parse((await tools.manageHosting.handler({
      action: 'downloadDirectory',
      cloudPath: 'site',
      localPath: '/tmp/site',
    })).content[0].text);

    expect(filePayload.success).toBe(true);
    expect(dirPayload.success).toBe(true);
    expect(mockDownloadFile).toHaveBeenCalledWith({
      cloudPath: 'site/index.html',
      localPath: '/tmp/site/index.html',
    });
    expect(mockDownloadDirectory).toHaveBeenCalledWith({
      cloudPath: 'site',
      localPath: '/tmp/site',
    });
  });
});
