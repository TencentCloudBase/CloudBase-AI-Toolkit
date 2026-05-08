import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerGatewayTools } from "./gateway.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetAccessList,
  mockGetDomainList,
  mockCreateAccess,
  mockDescribeHttpServiceRoute,
  mockCreateHttpServiceRoute,
  mockModifyHttpServiceRoute,
  mockDeleteHttpServiceRoute,
  mockBindCustomDomain,
  mockDeleteCustomDomain,
  mockGetCloudBaseManager,
  mockLogCloudBaseResult,
  mockGetEnvId,
} = vi.hoisted(() => ({
  mockGetAccessList: vi.fn(),
  mockGetDomainList: vi.fn(),
  mockCreateAccess: vi.fn(),
  mockDescribeHttpServiceRoute: vi.fn(),
  mockCreateHttpServiceRoute: vi.fn(),
  mockModifyHttpServiceRoute: vi.fn(),
  mockDeleteHttpServiceRoute: vi.fn(),
  mockBindCustomDomain: vi.fn(),
  mockDeleteCustomDomain: vi.fn(),
  mockGetCloudBaseManager: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockGetEnvId: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  logCloudBaseResult: mockLogCloudBaseResult,
  getEnvId: mockGetEnvId,
}));

function createMockServer() {
  const tools: Record<
    string,
    {
      meta: any;
      handler: (args: any) => Promise<any>;
    }
  > = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    logger: vi.fn(),
    registerTool: vi.fn(
      (name: string, meta: any, handler: (args: any) => Promise<any>) => {
        tools[name] = { meta, handler };
      },
    ),
  } as unknown as ExtendedMcpServer;

  registerGatewayTools(server);

  return {
    server,
    tools,
  };
}

describe("gateway tools", () => {
  let tools: ReturnType<typeof createMockServer>["tools"];

  beforeEach(() => {
    vi.clearAllMocks();

    mockGetEnvId.mockResolvedValue("env-test");
    mockGetAccessList.mockResolvedValue({
      Total: 1,
      EnableService: true,
      APISet: [
        {
          Path: "api/hello",
        },
      ],
    });
    mockGetDomainList.mockResolvedValue({
      DefaultDomain: "env-test.app.tcloudbase.com",
      EnableService: true,
      ServiceSet: [
        {
          Domain: "api.example.com",
        },
      ],
    });
    mockCreateAccess.mockResolvedValue({
      RequestId: "req-create-access",
      APIId: "api-123",
    });
    mockDescribeHttpServiceRoute.mockResolvedValue({
      OriginDomain: "env-test.service.tcloudbase.com",
      TotalCount: 1,
      Domains: [
        {
          Domain: "env-test.service.tcloudbase.com",
          Routes: [
            {
              RouteId: "route-1",
              Path: "/api/hello",
              UpstreamResourceType: "SCF",
              UpstreamResourceName: "helloFn",
            },
          ],
        },
      ],
      RequestId: "req-route-list",
    });
    mockCreateHttpServiceRoute.mockResolvedValue({
      RouteId: "route-2",
      RequestId: "req-route-create",
    });
    mockModifyHttpServiceRoute.mockResolvedValue({
      RequestId: "req-route-update",
    });
    mockDeleteHttpServiceRoute.mockResolvedValue({
      RequestId: "req-route-delete",
    });
    mockBindCustomDomain.mockResolvedValue({
      RequestId: "req-domain-bind",
    });
    mockDeleteCustomDomain.mockResolvedValue({
      RequestId: "req-domain-delete",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      access: {
        getAccessList: mockGetAccessList,
        getDomainList: mockGetDomainList,
        createAccess: mockCreateAccess,
      },
      env: {
        describeHttpServiceRoute: mockDescribeHttpServiceRoute,
        createHttpServiceRoute: mockCreateHttpServiceRoute,
        modifyHttpServiceRoute: mockModifyHttpServiceRoute,
        deleteHttpServiceRoute: mockDeleteHttpServiceRoute,
        bindCustomDomain: mockBindCustomDomain,
        deleteCustomDomain: mockDeleteCustomDomain,
      },
    });

    ({ tools } = createMockServer());
  });

  it("manageGateway schema should explain how to expose an existing HTTP function", () => {
    const schema = tools.manageGateway.meta.inputSchema;

    expect(tools.manageGateway.meta.description).toContain("HTTP 云函数补默认域名访问");
    expect(schema.action.description).toContain("createAccess");
    expect(schema.action.description).toContain("默认域名访问入口");
    expect(schema.targetName.description).toContain("填写函数名");
    expect(schema.path.description).toContain("/api/hello");
    expect(schema.type.description).toContain("已创建的 HTTP 云函数时传 HTTP");
    expect(schema.auth.description).toContain("通常设为 false");
  });

  it("manageGateway(action=createAccess) should normalize path and return structured payload", async () => {
    const result = await tools.manageGateway.handler({
      action: "createAccess",
      targetType: "function",
      targetName: "helloFn",
      path: "api/hello",
      type: "HTTP",
      auth: false,
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateAccess).toHaveBeenCalledWith({
      name: "helloFn",
      path: "/api/hello",
      type: 6,
      auth: false,
    });
    expect(payload).toMatchObject({
      success: true,
      message:
        "已为目标 helloFn 创建网关访问路径。注意：路由配置传播通常需要等待 30 秒到 3 分钟，请勿立即访问。该操作只创建网关入口，不会自动放开函数安全规则；若需要匿名或浏览器直接访问，请继续检查函数资源权限。",
      data: {
        action: "createAccess",
        targetType: "function",
        targetName: "helloFn",
        path: "/api/hello",
      },
      nextActions: [
        expect.objectContaining({
          tool: "queryGateway",
          action: "getAccess",
          reason: "等待 30 秒到 3 分钟后再确认访问入口是否已生效",
        }),
        expect.objectContaining({
          tool: "queryPermissions",
          action: "getResourcePermission",
          reason:
            "确认函数安全规则是否允许预期访问方；网关 auth=false 不等于函数已允许匿名访问",
        }),
        expect.objectContaining({
          tool: "managePermissions",
          action: "updateResourcePermission",
          reason: "只有在确认需要匿名或浏览器直连访问时，才按实际安全要求更新函数权限",
        }),
      ],
    });
  });

  it("manageGateway(action=createAccess) should default path to targetName when omitted", async () => {
    const result = await tools.manageGateway.handler({
      action: "createAccess",
      targetType: "function",
      targetName: "helloFn",
      type: "Event",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateAccess).toHaveBeenCalledWith({
      name: "helloFn",
      path: "/helloFn",
      type: 1,
      auth: undefined,
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "createAccess",
        targetType: "function",
        targetName: "helloFn",
        path: "/helloFn",
      },
    });
  });

  it("manageGateway metadata should warn that createAccess requires explicit type", () => {
    expect(tools.manageGateway.meta.description).toContain("createAccess");
    expect(tools.manageGateway.meta.description).toContain("type");
    expect(tools.manageGateway.meta.inputSchema.action.description).toContain("显式");
    expect(tools.manageGateway.meta.inputSchema.type.description).toContain("createAccess");
    expect(tools.manageGateway.meta.inputSchema.type.description).toContain("省略会默认按 Event 路由处理");
  });

  it("manageGateway(action=createAccess) should reject missing type with a clear message", async () => {
    const result = await tools.manageGateway.handler({
      action: "createAccess",
      targetType: "function",
      targetName: "helloFn",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateAccess).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: false,
      message: expect.stringContaining("必须显式提供 type"),
    });
    expect(payload.message).toContain("FUNCTION_PARAM_INVALID");
  });

  it("queryGateway(action=getAccess) should aggregate access urls from domains", async () => {
    const result = await tools.queryGateway.handler({
      action: "getAccess",
      targetType: "function",
      targetName: "helloFn",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockGetAccessList).toHaveBeenCalledWith({ name: "helloFn" });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "getAccess",
        targetType: "function",
        targetName: "helloFn",
        total: 1,
        domains: ["env-test.app.tcloudbase.com", "api.example.com"],
        urls: [
          "https://env-test.app.tcloudbase.com/api/hello",
          "https://api.example.com/api/hello",
        ],
        enableService: true,
      },
      nextActions: [
        expect.objectContaining({
          tool: "manageGateway",
          action: "createAccess",
        }),
      ],
    });
  });

  it("queryGateway(action=listRoutes) should list gateway routes", async () => {
    const result = await tools.queryGateway.handler({
      action: "listRoutes",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "listRoutes",
        routes: [expect.objectContaining({ RouteId: "route-1" })],
        total: 1,
      },
    });
  });

  it("manageGateway(action=createRoute) should create http route", async () => {
    const result = await tools.manageGateway.handler({
      action: "createRoute",
      domain: "env-test.service.tcloudbase.com",
      route: {
        path: "/api/hello",
        serviceType: "function",
        serviceName: "helloFn",
      },
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "env-test.service.tcloudbase.com",
        Routes: [
          {
            Path: "/api/hello",
            UpstreamResourceType: "SCF",
            UpstreamResourceName: "helloFn",
            EnableAuth: undefined,
          },
        ],
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "createRoute",
      },
    });
  });

  it("manageGateway(action=bindCustomDomain) should bind custom domain", async () => {
    const result = await tools.manageGateway.handler({
      action: "bindCustomDomain",
      domain: "api.example.com",
      certificateId: "cert-1",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockBindCustomDomain).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "api.example.com",
        CertId: "cert-1",
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "bindCustomDomain",
        domain: "api.example.com",
      },
    });
  });
});
