import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExtendedMcpServer } from '../server.js';

const {
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockSendDeployNotification,
  mockDescribeHostingDomainTask,
  mockDescribeStaticStore,
  mockDescribeHttpServiceRoute,
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
  mockDescribeHttpServiceRoute: vi.fn(),
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
import { t } from '../i18n/index.js';

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
  mockDescribeHttpServiceRoute.mockResolvedValue({
    Domains: [
      {
        Domain: 'static.example.com',
        IsDefault: true,
        Routes: [
          {
            Path: '/',
            Enable: true,
            UpstreamResourceType: 'STATIC_STORE',
            UpstreamResourceName: 'staticstore',
          },
        ],
      },
    ],
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
      describeHttpServiceRoute: mockDescribeHttpServiceRoute,
    },
    commonService: vi.fn(() => ({
      call: vi.fn((callArgs: { Action: string }) => {
        const { Action } = callArgs;
        if (Action === 'DescribeStaticStore') {
          return mockDescribeStaticStore();
        }
        if (Action === 'CreateStaticStore') {
          return mockCreateStaticStore(callArgs);
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
    // 工具级 description/title 迁移为词典 key 字符串，由 server registerTool 包装层解析
    expect(tools.queryHosting.meta.description).toBe('hosting.queryDescription');
    expect(tools.queryHosting.meta.title).toBe('hosting.queryTitle');
    expect(t(tools.queryHosting.meta.inputSchema.action.description)).toContain('websiteConfig');
    expect(t(tools.queryHosting.meta.inputSchema.domains.description)).toContain('domainStatus');
    expect(tools.manageHosting.meta.description).toBe('hosting.manageDescription');
    expect(tools.manageHosting.meta.title).toBe('hosting.manageTitle');
    expect(t(tools.manageHosting.meta.inputSchema.action.description)).toContain('setWebsiteDocument');
    expect(t(tools.manageHosting.meta.inputSchema.confirm.description)).toContain('delete');
    expect(t(tools.manageHosting.meta.inputSchema.indexDocument.description)).toContain('action=setWebsiteDocument');
    expect(t(tools.manageHosting.meta.inputSchema.localPath.description)).toContain('action=upload');
  });

  it('manageHosting domainConfig schema should expose fixed CDN option values as enums', () => {
    const tools = createMockServer();
    const domainConfigSchema = tools.manageHosting.meta.inputSchema.domainConfig;

    expect(domainConfigSchema.safeParse({
      Refer: {
        Switch: 'on',
        RefererRules: [
          {
            RefererType: 'whitelist',
            Referers: ['example.com'],
            AllowEmpty: true,
          },
        ],
      },
      Cache: [{ RuleType: 'path', RuleValue: '/index.html', CacheTtl: 60 }],
      IpFilter: { Switch: 'off', FilterType: 'blacklist', Filters: ['127.0.0.1'] },
      IpFreqLimit: { Switch: 'on', Qps: 10 },
    }).success).toBe(true);

    expect(domainConfigSchema.safeParse({ Refer: { Switch: 'enabled' } }).success).toBe(false);
    expect(domainConfigSchema.safeParse({
      Refer: {
        Switch: 'on',
        RefererRules: [{ RefererType: 'allow', Referers: ['example.com'], AllowEmpty: true }],
      },
    }).success).toBe(false);
    expect(domainConfigSchema.safeParse({
      Cache: [{ RuleType: 'extension', RuleValue: 'js', CacheTtl: 60 }],
    }).success).toBe(false);
    expect(domainConfigSchema.safeParse({
      IpFilter: { Switch: 'on', FilterType: 'denylist' },
    }).success).toBe(false);
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
      staticDomainRouteEnabled: true,
      accessUrlReachable: true,
    });
  });

  it('queryHosting(action=websiteConfig) should show the shared bucket name when hosting uses ExternalStorage', async () => {
    // 共享桶托管环境 StaticStorages[0].Bucket 为空，应展示 ExternalStorage.BucketName（与 CLI hosting detail 一致）
    mockGetEnvInfo.mockResolvedValueOnce({
      EnvInfo: {
        StaticStorages: [
          {
            StaticDomain: 'static.example.com',
            Bucket: '',
            ExternalStorage: { Enabled: true, BucketName: 'shared-hosting-1259548930', BasePath: 'env-test-static' },
          },
        ],
      },
    });
    const tools = createMockServer();

    const payload = JSON.parse((await tools.queryHosting.handler({ action: 'websiteConfig' })).content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.websiteConfig.Bucket).toBe('shared-hosting-1259548930');
  });

  it('queryHosting(action=websiteConfig) should flag disabled default static-domain gateway route', async () => {
    mockDescribeHttpServiceRoute.mockResolvedValueOnce({
      Domains: [
        {
          Domain: 'static.example.com',
          IsDefault: true,
          Routes: [
            {
              Path: '/',
              Enable: false,
              UpstreamResourceType: 'STATIC_STORE',
              UpstreamResourceName: 'staticstore',
            },
          ],
        },
      ],
    });

    const tools = createMockServer();
    const payload = JSON.parse((await tools.queryHosting.handler({ action: 'websiteConfig' })).content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.websiteConfig).toMatchObject({
      CdnDomain: 'static.example.com',
      staticDomainRouteEnabled: false,
      accessUrlReachable: false,
      routeDisabled: true,
      disabledAccessUrls: ['https://static.example.com/'],
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
    expect(payload.data.accessUrlReachable).toBe(true);
    expect(payload.data.staticDomainRouteEnabled).toBe(true);
    expect(payload.data.nextActions[0]).toMatchObject({
      tool: 'queryHosting',
      action: 'findFiles',
    });
    expect(mockSendDeployNotification).toHaveBeenCalled();
  });

  it('manageHosting(action=upload) should keep the static hosting domain + cloudPath when other apps share the same STATIC_STORE', async () => {
    // tcb app deploy 部署的 CloudApp 与静态托管挂在同一个 STATIC_STORE 上，
    // 各自的 webapps 子域名 IsDefault 同为 true 且排在默认托管域名之前；
    // 它们服务的是各自的目录，不能拿来拼本次上传的 cloudPath
    mockDescribeHttpServiceRoute.mockResolvedValue({
      Domains: [
        {
          Domain: 'demo-app.webapps.tcloudbase.com',
          IsDefault: true,
          Routes: [
            {
              Path: '/',
              Enable: true,
              UpstreamResourceType: 'STATIC_STORE',
              UpstreamResourceName: 'staticstore',
            },
          ],
        },
        {
          Domain: 'static.example.com',
          IsDefault: true,
          Routes: [
            {
              Path: '/',
              Enable: true,
              UpstreamResourceType: 'STATIC_STORE',
              UpstreamResourceName: 'staticstore',
            },
          ],
        },
      ],
    });

    const tools = createMockServer();
    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'upload',
      localPath: '/tmp/site-dist',
      cloudPath: 'site',
    })).content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.accessUrl).toBe('https://static.example.com/site/');
    expect(payload.data.accessUrlSource).toBe('hosting.staticDomain');
    expect(payload.data.accessUrlReachable).toBe(true);
    // 选中的地址排在首位，其他候选域名仍然保留
    expect(payload.data.accessUrls[0]).toBe('https://static.example.com/site/');
    expect(payload.data.accessUrls).toEqual(
      expect.arrayContaining(['https://demo-app.webapps.tcloudbase.com/']),
    );
  });

  it('manageHosting(action=upload) should omit disabled default-domain accessUrl and prefer enabled Sites domain', async () => {
    mockDescribeHttpServiceRoute.mockResolvedValue({
      Domains: [
        {
          Domain: 'static.example.com',
          IsDefault: true,
          Routes: [
            {
              Path: '/',
              Enable: false,
              UpstreamResourceType: 'STATIC_STORE',
              UpstreamResourceName: 'staticstore',
            },
          ],
        },
        {
          Domain: 'demo-app.webapps.tcloudbase.com',
          IsDefault: true,
          Routes: [
            {
              Path: '/',
              Enable: true,
              UpstreamResourceType: 'STATIC_STORE',
              UpstreamResourceName: 'staticstore',
            },
          ],
        },
      ],
    });

    const tools = createMockServer();
    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'upload',
      localPath: '/tmp/site-dist',
      cloudPath: 'site',
    })).content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.accessUrl).toBe('https://demo-app.webapps.tcloudbase.com/');
    expect(payload.data.accessUrlReachable).toBe(true);
    expect(payload.data.staticDomainRouteEnabled).toBe(false);
    expect(payload.data.routeDisabled).toBe(true);
    expect(payload.data.disabledAccessUrls).toEqual(
      expect.arrayContaining(['https://static.example.com/site/']),
    );
    expect(payload.message).toContain('GATEWAY_ROUTE_DISABLED');
  });

  it('manageHosting(action=upload) should return no reachable accessUrl when only disabled routes exist', async () => {
    mockDescribeHttpServiceRoute.mockResolvedValue({
      Domains: [
        {
          Domain: 'static.example.com',
          IsDefault: true,
          Routes: [
            {
              Path: '/',
              Enable: false,
              UpstreamResourceType: 'STATIC_STORE',
              UpstreamResourceName: 'staticstore',
            },
          ],
        },
      ],
    });

    const tools = createMockServer();
    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'upload',
      localPath: '/tmp/site-dist',
      cloudPath: 'site',
    })).content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.accessUrl).toBeUndefined();
    expect(payload.data.accessUrls).toEqual([]);
    expect(payload.data.accessUrlReachable).toBe(false);
    expect(payload.data.routeDisabled).toBe(true);
    expect(payload.data.disabledAccessUrls).toContain(
      'https://static.example.com/site/',
    );
  });

  it('manageHosting(action=upload) should fail fast when current env lacks static hosting storage config', async () => {
    mockDescribeStaticStore.mockResolvedValueOnce({
      Data: [],
    });

    const tools = createMockServer();
    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'upload',
      localPath: '/tmp/site-dist',
      cloudPath: '/todo',
      ignore: ['node_modules', '.DS_Store', '*.map'],
    })).content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.errorCode).toBe('HOSTING_UPLOAD_FAILED');
    expect(payload.message).toContain('当前环境 env-test 未发现静态托管资源配置');
    expect(payload.message).toContain('auth(action="set_env"');
    expect(mockUploadFiles).not.toHaveBeenCalled();
  });

  it('manageHosting(action=upload) should treat shared-bucket store (empty Bucket + ExternalStorage.Enabled) as valid', async () => {
    // 共享桶托管环境：DescribeStaticStore 的 Bucket 为空，真实桶名在 ExternalStorage 里，
    // Enabled=true 时应视为有效配置继续上传，而不是报「未发现静态托管资源配置」。
    mockDescribeStaticStore.mockResolvedValueOnce({
      Data: [
        {
          Status: 'online',
          CdnDomain: 'shared-static.example.com',
          Bucket: '',
          ExternalStorage: {
            Enabled: true,
            BucketName: 'shared-hosting-1259548930',
            Region: 'ap-shanghai',
            BasePath: 'env-test-static',
          },
        },
      ],
    });

    const tools = createMockServer();
    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'upload',
      localPath: '/tmp/site-dist',
      cloudPath: 'site',
    })).content[0].text);

    expect(payload.success).toBe(true);
    expect(mockUploadFiles).toHaveBeenCalled();
  });

  it('manageHosting(action=upload) should succeed and return CdnDomain-based accessUrl for Mini Program env where getEnvInfo StaticStorages is empty', async () => {
    // Mini Program-sourced environments don't populate StaticStorages in
    // DescribeEnvs, but DescribeStaticStore returns the real bucket + CdnDomain.
    mockDescribeStaticStore.mockResolvedValueOnce({
      Data: [
        {
          Status: 'online',
          CdnDomain: 'miniprogram-static.example.com',
          Bucket: 'hosting-bucket-mp',
        },
      ],
    });
    // getEnvInfo returns no StaticStorages (simulates Mini Program env)
    mockGetEnvInfo.mockResolvedValueOnce({
      EnvInfo: {
        StaticStorages: undefined,
      },
    });

    const tools = createMockServer();
    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'upload',
      localPath: '/tmp/site-dist',
      cloudPath: 'site',
    })).content[0].text);

    expect(payload.success).toBe(true);
    expect(mockUploadFiles).toHaveBeenCalled();
    expect(payload.data.accessUrl).toBe('https://miniprogram-static.example.com/site/');
    expect(payload.data.staticDomain).toBe('miniprogram-static.example.com');
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

  it('manageHosting(action=delete) should rewrite DescribeStaticStore rate-limit errors with actionable guidance', async () => {
    const tools = createMockServer();
    mockDeleteFiles.mockRejectedValueOnce(
      new Error(
        '[DescribeStaticStore] Your current request times equals to `23` in a second, which exceeds the frequency limit `20` for a second. Please reduce the frequency of calls.',
      ),
    );

    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'delete',
      cloudPath: 'site/index.html',
      confirm: true,
    })).content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain('DescribeStaticStore');
    expect(payload.message).toContain('QPS 限制');
    expect(payload.message).toContain('等待 1-2 秒后重试');
    expect(payload.message).toContain('isDir=true');
  });

  it('manageHosting(action=upload) should replace hosting-not-ready errors with status guidance', async () => {
    const tools = createMockServer();
    mockUploadFiles.mockRejectedValueOnce(new Error('静态网站服务【处理中】，无法进行此操作！'));

    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'upload',
      localPath: '/tmp/dist',
      cloudPath: 'app',
    })).content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain('静态网站服务【处理中】');
    expect(payload.message).toContain('queryHosting(action="status")');
    // 状态类错误不应再附带与上传内容有关的建议
    expect(payload.message).not.toContain('构建产物完整性');
  });

  it('manageHosting(action=upload) should point hosting-not-enabled errors at enableService', async () => {
    const tools = createMockServer();
    mockUploadFiles.mockRejectedValueOnce(
      new Error('您还没有开启静态网站服务，请先到云开发控制台开启静态网站服务！'),
    );

    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'upload',
      localPath: '/tmp/dist',
      cloudPath: 'app',
    })).content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain('manageHosting(action="enableService")');
    expect(payload.message).not.toContain('构建产物完整性');
  });

  it('manageHosting(action=delete) should forward non-rate-limit errors unchanged', async () => {
    const tools = createMockServer();
    mockDeleteFiles.mockRejectedValueOnce(new Error('[DeleteFile] file not found'));

    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'delete',
      cloudPath: 'site/missing.html',
      confirm: true,
    })).content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain('file not found');
    expect(payload.message).not.toContain('QPS 限制');
  });

  it('manageHosting(action=delete) should treat SDK Error array as failure with actionable guidance', async () => {
    const tools = createMockServer();
    mockDeleteFiles.mockResolvedValueOnce({
      Deleted: [],
      Error: [new Error('Access Denied')],
    });
    mockFindFiles.mockResolvedValueOnce([]);

    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'delete',
      cloudPath: 'site/index.html',
      confirm: true,
    })).content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain('文件可能未完全删除');
    expect(payload.message).toContain('queryHosting(action="findFiles"');
    expect(payload.data.error).toContain('删除请求未生效');
  });

  it('manageHosting(action=delete) should surface post-validation failure when file still exists', async () => {
    const tools = createMockServer();
    mockDeleteFiles.mockResolvedValueOnce({ Deleted: [{ Key: 'site/index.html' }], Error: [] });
    mockFindFiles.mockResolvedValueOnce([{ Key: 'site/index.html', Size: 100 }]);

    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'delete',
      cloudPath: 'site/index.html',
      confirm: true,
    })).content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.data.error).toContain('文件仍在静态托管中');
    expect(payload.message).toContain('文件可能未完全删除');
  });

  it('manageHosting(action=delete) ignores same-prefix siblings when verifying a single file', async () => {
    const tools = createMockServer();
    mockDeleteFiles.mockResolvedValueOnce({ Deleted: [{ Key: 'site/index.html' }], Error: [] });
    // findFiles 是 prefix 语义：删 site/index.html 时 site/index.html.bak 也会命中
    mockFindFiles.mockResolvedValueOnce([
      { Key: 'site/index.html.bak', Size: 100 },
    ]);

    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'delete',
      cloudPath: 'site/index.html',
      confirm: true,
    })).content[0].text);

    // 目标文件确实已删（只剩同前缀的兄弟文件），不应误报「未验证」
    expect(payload.success).toBe(true);
    expect(payload.data.verified).toBe(true);
    expect(payload.data.error).toBeUndefined();
  });

  it('manageHosting(action=delete) detects a surviving file in a COS-style Contents response', async () => {
    const tools = createMockServer();
    mockDeleteFiles.mockResolvedValueOnce({ Deleted: [{ Key: 'site/index.html' }], Error: [] });
    // findFiles 实际返回 COS 风格对象（列表在 Contents 内）——旧实现只判 Array.isArray，会静默放行
    mockFindFiles.mockResolvedValueOnce({
      Contents: [{ Key: 'site/index.html', Size: 100 }],
      IsTruncated: false,
    });

    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'delete',
      cloudPath: 'site/index.html',
      confirm: true,
    })).content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.data.verified).toBe(false);
  });

  it('manageHosting(action=delete) tolerates leading-slash differences when verifying', async () => {
    const tools = createMockServer();
    mockDeleteFiles.mockResolvedValueOnce({ Deleted: [{ Key: 'site/index.html' }], Error: [] });
    mockFindFiles.mockResolvedValueOnce([{ Key: '/site/index.html', Size: 100 }]);

    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'delete',
      cloudPath: 'site/index.html',
      confirm: true,
    })).content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.data.verified).toBe(false);
  });

  it('manageHosting(action=delete) should strip leading slash from cloudPath for delete and verification', async () => {
    const tools = createMockServer();
    mockDeleteFiles.mockResolvedValueOnce({ Deleted: [], Error: [] });
    // 模拟目录内容仍在（COS 真实对象 key 不带前导斜杠）
    mockFindFiles.mockResolvedValueOnce([{ Key: 'dir/f.txt', Size: 100 }]);

    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'delete',
      cloudPath: '/dir',
      isDir: true,
      confirm: true,
    })).content[0].text);

    // 去掉前导斜杠后再传给 SDK：否则 isDir=true 走严格前缀匹配，
    // `/dir/` 匹配不到 `dir/f.txt`，目录删除会静默 no-op（Deleted:0）。
    expect(mockDeleteFiles).toHaveBeenCalledWith({ cloudPath: 'dir', isDir: true });
    // 回查也必须用规范化后的前缀，否则带斜杠命中 0 条会把
    // 「没删到」误判成「删干净了 verified:true」。
    expect(mockFindFiles).toHaveBeenCalledWith({ prefix: 'dir', maxKeys: 100 });
    // 目录内容仍在 ⇒ 验证失败，而非误报 verified:true
    expect(payload.success).toBe(false);
    expect(payload.data.verified).toBe(false);
  });

  it('manageHosting(action=delete) should emit the normalized path inside the unverified self-check command', async () => {
    const tools = createMockServer();
    mockDeleteFiles.mockResolvedValueOnce({ Deleted: [], Error: [] });
    mockFindFiles.mockResolvedValueOnce([{ Key: 'dir/f.txt', Size: 100 }]);

    const payload = JSON.parse((await tools.manageHosting.handler({
      action: 'delete',
      cloudPath: '/dir',
      isDir: true,
      confirm: true,
    })).content[0].text);

    // deleteUnverified 文案里的 {cloudPath} 会被拼成给 agent 自查用的
    // queryHosting(action="findFiles", prefix="{cloudPath}")。若插入原始输入，
    // agent 会照抄一条带前导斜杠的命令 ⇒ COS 侧严格前缀匹配 0 命中 ⇒
    // 把「一个都没删掉」误读成「目录已空」。这里必须插入规范化后的路径。
    expect(payload.message).toBe(t('hosting.deleteUnverified', { cloudPath: 'dir' }));
    expect(payload.message).toContain('prefix="dir"');
    expect(payload.message).not.toContain('prefix="/dir"');
    // 回执里对用户原始输入的追溯不受影响
    expect(payload.data.cloudPath).toBe('/dir');
  });

  it('queryHosting(action=findFiles) should strip leading slashes from prefix', async () => {
    const tools = createMockServer();
    mockFindFiles.mockResolvedValueOnce({
      Contents: [{ Key: 'assets/logo.png', Size: 10, LastModified: '2026-08-28T00:00:00.000Z' }],
      IsTruncated: false,
    });

    const payload = JSON.parse((await tools.queryHosting.handler({
      action: 'findFiles',
      prefix: '/assets/',
    })).content[0].text);

    // agent 依据 URL 形态（/assets/logo.png）推前缀时极自然带前导斜杠；
    // 原样透传给 COS 会 0 命中，读侧被误读成「目录是空的」。
    expect(mockFindFiles.mock.calls[0][0].prefix).toBe('assets/');
    expect(mockFindFiles).toHaveBeenCalledWith(
      expect.objectContaining({ prefix: 'assets/' }),
    );
    expect(payload.success).toBe(true);
    expect(payload.data.prefix).toBe('assets/');
    expect(payload.data.files).toHaveLength(1);
  });

  it('manageHosting description (dictionary zh text) should warn about DescribeStaticStore rate-limit and bulk-delete pacing', () => {
    const tools = createMockServer();
    // meta.description 是词典 key；内容校验针对 zh 词典解析结果
    expect(tools.manageHosting.meta.description).toBe('hosting.manageDescription');
    const description = t('hosting.manageDescription');
    expect(description).toContain('DescribeStaticStore');
    expect(description).toContain('20 次/秒 QPS 限制');
    expect(description).toContain('isDir=true');
    expect(description).toContain('frequency limit');
  });

  it('queryHosting(action=findFiles) should enrich DescribeStaticStore rate-limit errors with pacing guidance', async () => {
    const tools = createMockServer();
    mockFindFiles.mockRejectedValueOnce(
      new Error(
        '[DescribeStaticStore] Your current request times equals to `23` in a second, which exceeds the frequency limit `20` for a second. Please reduce the frequency of calls.',
      ),
    );

    const payload = JSON.parse((await tools.queryHosting.handler({
      action: 'findFiles',
      prefix: 'site/',
    })).content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain('DescribeStaticStore');
    expect(payload.message).toContain('QPS 限制');
    expect(payload.message).toContain('等待 1-2 秒后重试');
  });

  it('queryHosting(action=findFiles) should forward non-rate-limit errors unchanged', async () => {
    const tools = createMockServer();
    mockFindFiles.mockRejectedValueOnce(new Error('[FindFile] access denied'));

    const payload = JSON.parse((await tools.queryHosting.handler({
      action: 'findFiles',
      prefix: 'site/',
    })).content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain('access denied');
    expect(payload.message).not.toContain('QPS 限制');
  });

  it('queryHosting(action=findFiles) should map COS-style Contents into the files array', async () => {
    const tools = createMockServer();
    mockFindFiles.mockResolvedValueOnce({
      Contents: [
        { Key: 'site/index.html', Size: 10, LastModified: '2026-08-28T00:00:00.000Z' },
        { Key: 'site/app.js', Size: 20, LastModified: '2026-08-28T00:00:01.000Z' },
      ],
      IsTruncated: true,
      NextMarker: 'site/app.js',
    });

    const payload = JSON.parse((await tools.queryHosting.handler({
      action: 'findFiles',
      prefix: 'site/',
    })).content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.files).toHaveLength(2);
    expect(payload.data.files[0]).toMatchObject({ key: 'site/index.html', size: 10 });
    expect(payload.data.files[1].key).toBe('site/app.js');
    expect(payload.message).toContain('共 2 个');
    // 分页信息透传：findFiles 的 marker 是 COS 游标，保持原样不做 offset 解析
    expect(payload.data.isTruncated).toBe(true);
    expect(payload.data.nextMarker).toBe('site/app.js');
    expect(payload.message).toContain('nextMarker');
    // 原始返回保持兼容
    expect(payload.data.result).toMatchObject({ IsTruncated: true });
  });

  it('queryHosting(action=findFiles) should support the lowercase contents variant', async () => {
    const tools = createMockServer();
    mockFindFiles.mockResolvedValueOnce({
      contents: [{ Key: 'site/index.html', Size: 10, LastModified: '2026-08-28T00:00:00.000Z' }],
    });

    const payload = JSON.parse((await tools.queryHosting.handler({
      action: 'findFiles',
      prefix: 'site/',
    })).content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.files).toHaveLength(1);
    expect(payload.data.files[0].key).toBe('site/index.html');
  });

  it('queryHosting(action=listFiles) should keep numeric-offset marker pagination', async () => {
    const tools = createMockServer();
    mockListFiles.mockResolvedValue([
      { Key: 'a.txt' },
      { Key: 'b.txt' },
      { Key: 'c.txt' },
    ]);

    const firstPage = JSON.parse((await tools.queryHosting.handler({
      action: 'listFiles',
      maxKeys: 2,
    })).content[0].text);

    expect(firstPage.data.files.map((file: { key: string }) => file.key)).toEqual(['a.txt', 'b.txt']);
    expect(firstPage.data.totalCount).toBe(3);
    // listFiles 的 marker 是自实现的数字 offset 字符串，不能被 COS 游标逻辑覆盖
    expect(firstPage.data.nextMarker).toBe('2');

    const secondPage = JSON.parse((await tools.queryHosting.handler({
      action: 'listFiles',
      maxKeys: 2,
      marker: '2',
    })).content[0].text);

    expect(secondPage.data.files.map((file: { key: string }) => file.key)).toEqual(['c.txt']);
    expect(secondPage.data.nextMarker).toBeUndefined();
    expect(secondPage.data.isTruncated).toBe(false);
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

  it('manageHosting(action=enableService) without externalStorage should send only EnvId to CreateStaticStore', async () => {
    const tools = createMockServer();
    await tools.manageHosting.handler({ action: 'enableService' });

    const callArgs = mockCreateStaticStore.mock.calls[0][0];
    expect(callArgs.Action).toBe('CreateStaticStore');
    expect(callArgs.Param.EnvId).toBeTruthy();
    expect(callArgs.Param.ExternalStorage).toBeUndefined();
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
    // 报错必须闭环：给出云端部署替代链路（getUploadUrl → PUT zip → deployApp），
    // 避免 agent 撞墙后靠摸索才找到 manageApps（曾浪费一整轮调用的 UX 缺口）。
    expect(uploadPayload.message).toContain('getUploadUrl');
    expect(uploadPayload.message).toContain('deployApp');
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

  it('manageHosting description should switch to the cloud variant when registered in cloud mode', () => {
    process.env.CLOUDBASE_MCP_CLOUD_MODE = 'true';
    const tools = createMockServer();

    // 注册期（isCloudMode 已确定）切换描述 key：cloud mode 下 agent 在 tools/list
    // 阶段就看到 upload/download 不可用 + manageApps 云端部署链路，零浪费调用。
    expect(tools.manageHosting.meta.description).toBe('hosting.manageDescriptionCloud');
    const description = t('hosting.manageDescriptionCloud');
    expect(description).toContain('upload / downloadFile / downloadDirectory');
    expect(description).toContain('getUploadUrl');
    expect(description).toContain('deployApp');
    expect(description).toContain('cosTimestamp');
    // 可用 action 仍需列全，避免 agent 误以为整个工具不可用
    expect(description).toContain('delete');
    expect(description).toContain('setWebsiteDocument');
    expect(description).toContain('queryHosting');
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
