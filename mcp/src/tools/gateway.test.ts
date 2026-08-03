import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerGatewayTools } from "./gateway.js";
import type { ExtendedMcpServer } from "../server.js";

const {
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
    mockDescribeHttpServiceRoute.mockResolvedValue({
      OriginDomain: "origin.service.tcloudbase.com",
      TotalCount: 1,
      Domains: [
        {
          Domain: "env-test.service.tcloudbase.com",
          DomainType: "HTTPSERVICE",
          IsDefault: true,
          Enable: true,
          Status: "SUCCESS",
          Routes: [
            {
              RouteId: "route-1",
              Path: "/api/hello",
              UpstreamResourceType: "WEB_SCF",
              UpstreamResourceName: "helloFn",
              EnableAuth: false,
            },
          ],
        },
        {
          Domain: "api.example.com",
          DomainType: "CUSTOM",
          IsDefault: false,
          Enable: true,
          Status: "SUCCESS",
          CertId: "cert-1",
          Routes: [],
        },
      ],
      RequestId: "req-route-list",
    });
    mockCreateHttpServiceRoute.mockResolvedValue({
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

  it("schema should expose Domain/Route actions only", () => {
    const queryActions = tools.queryGateway.meta.inputSchema.action._def.values;
    const manageActions = tools.manageGateway.meta.inputSchema.action._def.values;
    const schema = tools.manageGateway.meta.inputSchema;

    expect(queryActions).toEqual(["listRoutes", "getRoute", "listCustomDomains"]);
    expect(manageActions).toEqual([
      "createRoute",
      "updateRoute",
      "deleteRoute",
      "bindCustomDomain",
      "deleteCustomDomain",
    ]);
    expect(schema.targetType).toBeUndefined();
    expect(schema.type).toBeUndefined();
    expect(schema.upstreamResourceType.unwrap()._def.values).toEqual([
      "SCF",
      "WEB_SCF",
      "CBR",
      "STATIC_STORE",
      "LH",
    ]);
    expect(tools.queryGateway.meta.inputSchema.targetType).toBeUndefined();
  });

  it("manageGateway schema should cover function / CloudRun / static hosting upstreams", () => {
    const schema = tools.manageGateway.meta.inputSchema;
    const description = tools.manageGateway.meta.description;

    expect(description).toContain("createRoute");
    expect(description).toContain("WEB_SCF");
    expect(description).toContain("CBR");
    expect(description).toContain("STATIC_STORE");
    expect(description).toContain("云托管");
    expect(description).toContain("静态托管");
    expect(description).not.toContain('type="HTTP"');
    expect(description).not.toContain("targetType");
    expect(schema.action.description).toContain("createRoute");
    expect(schema.targetName.description).toContain("云函数");
    expect(schema.targetName.description).toContain("云托管");
    expect(schema.targetName.description).toContain("静态托管");
    expect(schema.path.description).toContain("/api/hello");
    expect(schema.upstreamResourceType.description).toContain("WEB_SCF");
    expect(schema.upstreamResourceType.description).toContain("CBR");
    expect(schema.upstreamResourceType.description).toContain("STATIC_STORE");
    expect(schema.auth.description).toContain("通常 false");
    expect(schema.enablePathTransmission.description).toContain("CBR");
    expect(schema.enablePathTransmission.description).toContain("STATIC_STORE");
    expect(schema.route.description).toContain("CBR");
    expect(schema.route.description).toContain("STATIC_STORE");
    expect(schema.route.description).toContain("staticstore");
    expect(description).toContain("listCustomDomains");
    expect(description).toContain("certificateId");
    expect(description).toContain("HTTPSERVICE");
    expect(description).toContain("tcloudbaseapp.com");
    expect(description).toContain("listRoutes");
    expect(description).toContain("不是 STATIC_STORE 上游绑定");
    expect(schema.action.description).toContain("已有自定义域名");
    expect(schema.domain.description).toContain("无需证书");
    expect(schema.domain.description).toContain("HTTPSERVICE");
    expect(schema.domain.description).toContain("listRoutes");
    expect(schema.certificateId.description).toContain("createRoute");
  });

  it("manageGateway(action=createRoute) should require upstreamResourceType", async () => {
    const result = await tools.manageGateway.handler({
      action: "createRoute",
      targetName: "my-service",
      path: "/api",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain("upstreamResourceType");
    expect(payload.message).toContain("CBR");
    expect(payload.message).toContain("STATIC_STORE");
    expect(mockCreateHttpServiceRoute).not.toHaveBeenCalled();
  });

  it("manageGateway(action=createRoute) should accept STATIC_STORE upstream", async () => {
    const result = await tools.manageGateway.handler({
      action: "createRoute",
      domain: "api.example.com",
      route: {
        path: "/app",
        serviceName: "staticstore",
        upstreamResourceType: "STATIC_STORE",
        enablePathTransmission: false,
      },
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "api.example.com",
        Routes: [
          {
            Path: "/app",
            UpstreamResourceType: "STATIC_STORE",
            UpstreamResourceName: "staticstore",
            EnableAuth: undefined,
            EnablePathTransmission: false,
          },
        ],
      },
    });
    expect(payload.success).toBe(true);
    expect(payload.data.upstreamResourceType).toBe("STATIC_STORE");
  });

  it("manageGateway(action=createRoute) should create WEB_SCF route on default domain", async () => {
    const result = await tools.manageGateway.handler({
      action: "createRoute",
      targetName: "helloFn",
      path: "api/hello",
      upstreamResourceType: "WEB_SCF",
      auth: false,
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeHttpServiceRoute).toHaveBeenCalled();
    expect(mockCreateHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "env-test.service.tcloudbase.com",
        Routes: [
          {
            Path: "/api/hello",
            UpstreamResourceType: "WEB_SCF",
            UpstreamResourceName: "helloFn",
            EnableAuth: false,
          },
        ],
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "createRoute",
        model: "httpServiceRoute",
        domain: "env-test.service.tcloudbase.com",
        path: "/api/hello",
        upstreamResourceType: "WEB_SCF",
        upstreamResourceName: "helloFn",
      },
      nextActions: [
        expect.objectContaining({
          tool: "queryGateway",
          action: "getRoute",
        }),
        expect.objectContaining({
          tool: "queryPermissions",
          action: "getResourcePermission",
        }),
        expect.objectContaining({
          tool: "managePermissions",
          action: "updateResourcePermission",
        }),
      ],
    });
    expect(payload.message).toContain("30 秒到 3 分钟");
  });

  it("manageGateway(action=createRoute) should create SCF route with default path", async () => {
    const result = await tools.manageGateway.handler({
      action: "createRoute",
      targetName: "helloFn",
      upstreamResourceType: "SCF",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "env-test.service.tcloudbase.com",
        Routes: [
          {
            Path: "/helloFn",
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
        path: "/helloFn",
        upstreamResourceType: "SCF",
      },
    });
  });

  it("manageGateway(action=createRoute) should not use OriginDomain as public domain", async () => {
    mockDescribeHttpServiceRoute.mockResolvedValue({
      OriginDomain: "origin.service.tcloudbase.com",
      TotalCount: 0,
      Domains: [],
      RequestId: "req-empty",
    });

    const result = await tools.manageGateway.handler({
      action: "createRoute",
      targetName: "helloFn",
      upstreamResourceType: "WEB_SCF",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateHttpServiceRoute).not.toHaveBeenCalled();
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("默认 HTTP 访问域名未就绪");
    expect(payload.message).toContain("HTTPSERVICE");
    expect(payload.message).not.toContain("origin.service.tcloudbase.com");
  });

  it("manageGateway(action=createRoute) should prefer the HTTPSERVICE default domain over the static hosting one", async () => {
    mockDescribeHttpServiceRoute.mockResolvedValue({
      OriginDomain: "env-test.tcbaccess-in.tencentcloudbase.com",
      TotalCount: 2,
      Domains: [
        {
          Domain: "env-test-1251119057.tcloudbaseapp.com",
          DomainType: "STATIC_STORE",
          IsDefault: true,
          Enable: true,
          Status: "SUCCESS",
          Routes: [
            {
              Path: "/",
              UpstreamResourceType: "STATIC_STORE",
              UpstreamResourceName: "staticstore",
            },
          ],
        },
        {
          Domain: "env-test-1251119057.ap-shanghai.app.tcloudbase.com",
          DomainType: "HTTPSERVICE",
          IsDefault: true,
          Enable: true,
          Status: "SUCCESS",
        },
      ],
      RequestId: "req-multi-default",
    });

    const result = await tools.manageGateway.handler({
      action: "createRoute",
      targetName: "activity_api",
      path: "/api",
      upstreamResourceType: "WEB_SCF",
      auth: false,
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeHttpServiceRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        EnvId: "env-test",
        Filters: [
          {
            Name: "DomainType",
            Values: ["HTTPSERVICE"],
          },
        ],
      }),
    );
    expect(mockCreateHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "env-test-1251119057.ap-shanghai.app.tcloudbase.com",
        Routes: [
          {
            Path: "/api",
            UpstreamResourceType: "WEB_SCF",
            UpstreamResourceName: "activity_api",
            EnableAuth: false,
          },
        ],
      },
    });
    expect(payload.data.domain).toBe(
      "env-test-1251119057.ap-shanghai.app.tcloudbase.com",
    );
    expect(payload.data.accessUrl).toBe(
      "https://env-test-1251119057.ap-shanghai.app.tcloudbase.com/api",
    );
  });

  it("manageGateway(action=createRoute) should reject static hosting default domain when HTTPSERVICE is missing", async () => {
    mockDescribeHttpServiceRoute.mockResolvedValue({
      TotalCount: 1,
      Domains: [
        {
          Domain: "env-test-1251119057.tcloudbaseapp.com",
          DomainType: "STATIC_STORE",
          IsDefault: true,
          Enable: true,
          Status: "SUCCESS",
          Routes: [],
        },
      ],
      RequestId: "req-static-only",
    });

    const result = await tools.manageGateway.handler({
      action: "createRoute",
      targetName: "activity_api",
      path: "/api",
      upstreamResourceType: "WEB_SCF",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateHttpServiceRoute).not.toHaveBeenCalled();
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("HTTPSERVICE");
    expect(payload.message).toContain("tcloudbaseapp.com");
  });

  it("manageGateway(action=updateRoute) should modify route auth", async () => {
    const result = await tools.manageGateway.handler({
      action: "updateRoute",
      domain: "api.example.com",
      targetName: "helloFn",
      path: "/api/hello",
      upstreamResourceType: "WEB_SCF",
      auth: true,
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockModifyHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "api.example.com",
        Routes: [
          {
            Path: "/api/hello",
            UpstreamResourceType: "WEB_SCF",
            UpstreamResourceName: "helloFn",
            EnableAuth: true,
          },
        ],
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "updateRoute",
        domain: "api.example.com",
        auth: true,
      },
    });
  });

  it("manageGateway(action=createRoute) should pass EnablePathTransmission when enabled", async () => {
    const result = await tools.manageGateway.handler({
      action: "createRoute",
      targetName: "helloFn",
      path: "/api",
      upstreamResourceType: "WEB_SCF",
      auth: false,
      enablePathTransmission: true,
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "env-test.service.tcloudbase.com",
        Routes: [
          {
            Path: "/api",
            UpstreamResourceType: "WEB_SCF",
            UpstreamResourceName: "helloFn",
            EnableAuth: false,
            EnablePathTransmission: true,
          },
        ],
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        path: "/api",
        enablePathTransmission: true,
      },
    });
    expect(payload.message).toContain("已开启路径透传");
  });

  it("manageGateway(action=updateRoute) should prefer route.enablePathTransmission", async () => {
    const result = await tools.manageGateway.handler({
      action: "updateRoute",
      domain: "api.example.com",
      targetName: "helloFn",
      path: "/api",
      upstreamResourceType: "SCF",
      enablePathTransmission: false,
      route: {
        path: "/api",
        serviceName: "helloFn",
        upstreamResourceType: "WEB_SCF",
        enablePathTransmission: true,
      },
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockModifyHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "api.example.com",
        Routes: [
          {
            Path: "/api",
            UpstreamResourceType: "WEB_SCF",
            UpstreamResourceName: "helloFn",
            EnableAuth: undefined,
            EnablePathTransmission: true,
          },
        ],
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        enablePathTransmission: true,
      },
    });
    expect(payload.message).toContain("路径透传=开启");
  });

  it("manageGateway schema should explain path transmission impact", () => {
    const schema = tools.manageGateway.meta.inputSchema as Record<string, any>;
    expect(schema.enablePathTransmission.description).toContain("路径透传");
    expect(schema.enablePathTransmission.description).toContain("/api/users");
    expect(schema.enablePathTransmission.description).toContain("false");
    expect(schema.enablePathTransmission.description).toContain("true");
  });

  it("manageGateway(action=deleteRoute) should delete by domain and path", async () => {
    const result = await tools.manageGateway.handler({
      action: "deleteRoute",
      domain: "env-test.service.tcloudbase.com",
      path: "/api/hello",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockDeleteHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: "env-test.service.tcloudbase.com",
      Paths: ["/api/hello"],
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "deleteRoute",
        domain: "env-test.service.tcloudbase.com",
        path: "/api/hello",
      },
    });
  });

  it("queryGateway(action=getRoute) should return urls for matching function", async () => {
    const result = await tools.queryGateway.handler({
      action: "getRoute",
      targetName: "helloFn",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Limit: 1000,
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "getRoute",
        targetName: "helloFn",
        total: 1,
        urls: ["https://env-test.service.tcloudbase.com/api/hello"],
        route: expect.objectContaining({
          UpstreamResourceName: "helloFn",
          UpstreamResourceType: "WEB_SCF",
        }),
      },
      nextActions: [
        expect.objectContaining({
          tool: "manageGateway",
          action: "createRoute",
        }),
      ],
    });
  });

  it("queryGateway(action=listRoutes) should list gateway routes", async () => {
    const result = await tools.queryGateway.handler({
      action: "listRoutes",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "listRoutes",
        routes: [expect.objectContaining({ RouteId: "route-1" })],
        total: 1,
      },
    });
  });

  it("queryGateway(action=listCustomDomains) should exclude default domain", async () => {
    const result = await tools.queryGateway.handler({
      action: "listCustomDomains",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "listCustomDomains",
        total: 1,
        domains: [expect.objectContaining({ Domain: "api.example.com" })],
      },
    });
  });

  it("manageGateway(action=createRoute) should accept top-level CBR upstreamResourceType", async () => {
    const result = await tools.manageGateway.handler({
      action: "createRoute",
      domain: "api.example.com",
      path: "/api/run",
      targetName: "my-service",
      upstreamResourceType: "CBR",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "api.example.com",
        Routes: [
          {
            Path: "/api/run",
            UpstreamResourceType: "CBR",
            UpstreamResourceName: "my-service",
            EnableAuth: undefined,
          },
        ],
      },
    });
    expect(payload.success).toBe(true);
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
