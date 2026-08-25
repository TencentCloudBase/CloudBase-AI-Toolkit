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
  mockVerifyHttpServiceRoute,
  mockDescribeCertificates,
  mockGetCloudBaseManager,
  mockLogCloudBaseResult,
  mockGetEnvId,
  mockCommonServiceCall,
  mockSwitchAuth,
} = vi.hoisted(() => ({
  mockDescribeHttpServiceRoute: vi.fn(),
  mockCreateHttpServiceRoute: vi.fn(),
  mockModifyHttpServiceRoute: vi.fn(),
  mockDeleteHttpServiceRoute: vi.fn(),
  mockBindCustomDomain: vi.fn(),
  mockDeleteCustomDomain: vi.fn(),
  mockVerifyHttpServiceRoute: vi.fn(),
  mockDescribeCertificates: vi.fn(),
  mockGetCloudBaseManager: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockCommonServiceCall: vi.fn(),
  mockSwitchAuth: vi.fn(),
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
    mockVerifyHttpServiceRoute.mockResolvedValue({
      Passed: true,
      RequestId: "req-verify-pass",
    });
    mockDescribeCertificates.mockResolvedValue({
      Certificates: [],
    });
    mockCommonServiceCall.mockResolvedValue({
      EnableService: true,
      EnableAuth: false,
    });
    mockSwitchAuth.mockResolvedValue({
      RequestId: "req-switch-auth",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        describeHttpServiceRoute: mockDescribeHttpServiceRoute,
        createHttpServiceRoute: mockCreateHttpServiceRoute,
        modifyHttpServiceRoute: mockModifyHttpServiceRoute,
        deleteHttpServiceRoute: mockDeleteHttpServiceRoute,
        bindCustomDomain: mockBindCustomDomain,
        deleteCustomDomain: mockDeleteCustomDomain,
        verifyHttpServiceRoute: mockVerifyHttpServiceRoute,
        describeCertificates: mockDescribeCertificates,
      },
      commonService: vi.fn(() => ({
        call: mockCommonServiceCall,
      })),
      access: {
        switchAuth: mockSwitchAuth,
      },
    });

    ({ tools } = createMockServer());
  });

  it("schema should expose Domain/Route actions only", () => {
    const queryActions = tools.queryGateway.meta.inputSchema.action._def.values;
    const manageActions = tools.manageGateway.meta.inputSchema.action._def.values;
    const schema = tools.manageGateway.meta.inputSchema;

    expect(queryActions).toEqual([
      "listRoutes",
      "getRoute",
      "listCustomDomains",
      "getPrivilege",
    ]);
    expect(manageActions).toEqual([
      "createRoute",
      "updateRoute",
      "deleteRoute",
      "enableRoute",
      "disableRoute",
      "bindCustomDomain",
      "deleteCustomDomain",
      "enableService",
      "authSwitch",
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
    expect(description).toContain("VerifyHTTPServiceRoute");
    expect(schema.certificateId.description).toContain("createRoute");
    expect(schema.certificateId.description).toContain("describeCertificates");
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
    expect(payload.message).toContain("数秒到约 30 秒");
    expect(payload.message).toContain("勿盲等 60 秒以上");
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

  it("manageGateway(action=createRoute) normalizes lowercase success domain status", async () => {
    mockDescribeHttpServiceRoute.mockResolvedValue({
      OriginDomain: "env-test.tcbaccess-in.tencentcloudbase.com",
      TotalCount: 1,
      Domains: [
        {
          Domain: "env-test-1251119057.ap-shanghai.app.tcloudbase.com",
          DomainType: "HTTPSERVICE",
          IsDefault: true,
          Enable: true,
          Status: "success",
        },
      ],
      RequestId: "req-lowercase-success",
    });

    const result = await tools.manageGateway.handler({
      action: "createRoute",
      targetName: "helloFn",
      path: "/hello",
      upstreamResourceType: "WEB_SCF",
      auth: false,
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateHttpServiceRoute).toHaveBeenCalledWith(
      expect.objectContaining({
        Domain: expect.objectContaining({
          Domain: "env-test-1251119057.ap-shanghai.app.tcloudbase.com",
        }),
      }),
    );
    expect(payload.success).toBe(true);
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

  it("manageGateway(action=updateRoute) should pass Route.Enable=false and omit reachable accessUrl", async () => {
    const result = await tools.manageGateway.handler({
      action: "updateRoute",
      domain: "static.example.com",
      targetName: "staticstore",
      path: "/",
      upstreamResourceType: "STATIC_STORE",
      enable: false,
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockModifyHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "static.example.com",
        Routes: [
          {
            Path: "/",
            UpstreamResourceType: "STATIC_STORE",
            UpstreamResourceName: "staticstore",
            EnableAuth: undefined,
            Enable: false,
          },
        ],
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "updateRoute",
        enable: false,
        accessUrlReachable: false,
        routeDisabled: true,
      },
    });
    expect(payload.data.accessUrl).toBeUndefined();
    expect(payload.message).toContain("Enable=false");
  });

  it("manageGateway(action=disableRoute) should lookup existing route and set Enable=false", async () => {
    mockDescribeHttpServiceRoute.mockResolvedValueOnce({
      OriginDomain: "origin.service.tcloudbase.com",
      TotalCount: 1,
      Domains: [
        {
          Domain: "env-test-appid.tcloudbaseapp.com",
          DomainType: "STATIC_STORE",
          IsDefault: true,
          Enable: true,
          Status: "SUCCESS",
          Routes: [
            {
              RouteId: "route-static",
              Path: "/",
              UpstreamResourceType: "STATIC_STORE",
              UpstreamResourceName: "staticstore",
              EnableAuth: false,
              Enable: true,
            },
          ],
        },
      ],
      RequestId: "req-static-list",
    });

    const result = await tools.manageGateway.handler({
      action: "disableRoute",
      domain: "env-test-appid.tcloudbaseapp.com",
      path: "/",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeHttpServiceRoute).toHaveBeenCalled();
    expect(mockModifyHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "env-test-appid.tcloudbaseapp.com",
        Routes: [
          {
            Path: "/",
            UpstreamResourceType: "STATIC_STORE",
            UpstreamResourceName: "staticstore",
            Enable: false,
            EnableAuth: false,
          },
        ],
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "disableRoute",
        enable: false,
        domain: "env-test-appid.tcloudbaseapp.com",
        path: "/",
        upstreamResourceType: "STATIC_STORE",
      },
    });
    expect(payload.message).toContain("禁用");
    expect(payload.message).toContain("ModifyHTTPServiceRoute");
  });

  it("manageGateway(action=enableRoute) should set Enable=true on matched route", async () => {
    const result = await tools.manageGateway.handler({
      action: "enableRoute",
      path: "/api/hello",
      targetName: "helloFn",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockModifyHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "env-test.service.tcloudbase.com",
        Routes: [
          {
            Path: "/api/hello",
            UpstreamResourceType: "WEB_SCF",
            UpstreamResourceName: "helloFn",
            Enable: true,
            EnableAuth: false,
          },
        ],
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "enableRoute",
        enable: true,
        path: "/api/hello",
      },
    });
  });

  it("manageGateway(action=disableRoute) should fail when path is missing", async () => {
    const result = await tools.manageGateway.handler({
      action: "disableRoute",
      domain: "env-test-appid.tcloudbaseapp.com",
    });

    const payload = JSON.parse(result.content[0].text);
    expect(payload.success).toBe(false);
    expect(payload.message).toContain("path");
    expect(mockModifyHttpServiceRoute).not.toHaveBeenCalled();
  });

  it("manageGateway schema should document enableRoute/disableRoute", async () => {
    const schema = tools.manageGateway.meta.inputSchema;
    const description = tools.manageGateway.meta.description;

    expect(description).toContain("enableRoute");
    expect(description).toContain("disableRoute");
    expect(description).toContain("ModifyHTTPServiceRoute");
    expect(description).toContain("tcloudbaseapp.com");
    expect(schema.action.description).toContain("disableRoute");
    expect(schema.route.description).toContain("enable:false");
    expect(schema.enable.description).toContain("Routes[].Enable");
    expect(schema.action._def.values).toContain("enableRoute");
    expect(schema.action._def.values).toContain("disableRoute");
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

    expect(mockVerifyHttpServiceRoute).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: expect.objectContaining({
        Domain: "api.example.com",
        CertId: "cert-1",
        AccessType: "DIRECT",
      }),
    });
    expect(mockBindCustomDomain).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "api.example.com",
        CertId: "cert-1",
        AccessType: "DIRECT",
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "bindCustomDomain",
        domain: "api.example.com",
        accessType: "DIRECT",
      },
    });
  });

  it("manageGateway(action=bindCustomDomain) should fail on ownership verify without binding", async () => {
    mockVerifyHttpServiceRoute.mockResolvedValue({
      Passed: false,
      RequestId: "req-verify-fail",
      Ownership: {
        Status: "FAIL",
        Code: "OWNERSHIP_FAILED",
        Message: "domain ownership not verified",
        OwnershipVerification: {
          DnsVerification: [
            {
              Subdomain: "_cloudbase-challenge.api.example.com",
              RecordType: "TXT",
              RecordValue: "verify-token-abc",
            },
          ],
        },
      },
      Cert: { Status: "SKIPPED" },
      Quota: { Status: "PASS" },
    });

    const result = await tools.manageGateway.handler({
      action: "bindCustomDomain",
      domain: "api.example.com",
      certificateId: "cert-1",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain("预检未通过");
    expect(payload.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "ownership",
          status: "FAIL",
          code: "OWNERSHIP_FAILED",
          dnsRecords: [
            {
              subdomain: "_cloudbase-challenge.api.example.com",
              recordType: "TXT",
              recordValue: "verify-token-abc",
            },
          ],
        }),
      ]),
    );
    expect(mockBindCustomDomain).not.toHaveBeenCalled();
    expect(mockDescribeCertificates).not.toHaveBeenCalled();
  });

  it("manageGateway(action=bindCustomDomain) should auto-select single certificate when certificateId omitted", async () => {
    mockDescribeCertificates.mockResolvedValue({
      Certificates: [
        {
          CertificateId: "cert-auto-1",
          Domain: "api.example.com",
          CertEndTime: "2027-01-01",
        },
      ],
    });

    const result = await tools.manageGateway.handler({
      action: "bindCustomDomain",
      domain: "api.example.com",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeCertificates).toHaveBeenCalledWith({
      SearchKey: "api.example.com",
    });
    expect(mockBindCustomDomain).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "api.example.com",
        CertId: "cert-auto-1",
        AccessType: "DIRECT",
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        certificateId: "cert-auto-1",
      },
    });
  });

  it("manageGateway(action=bindCustomDomain) should return certificate selection guidance when multiple match", async () => {
    mockDescribeCertificates.mockResolvedValue({
      Certificates: [
        {
          CertificateId: "cert-a",
          Domain: "api.example.com",
          Alias: "a",
          CertEndTime: "2027-01-01",
        },
        {
          CertificateId: "cert-b",
          Domain: "*.example.com",
          Alias: "b",
          CertEndTime: "2027-06-01",
        },
      ],
    });

    const result = await tools.manageGateway.handler({
      action: "bindCustomDomain",
      domain: "api.example.com",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain("匹配证书");
    expect(payload.message).toContain("certificateId");
    expect(payload.data.certificates).toHaveLength(2);
    expect(payload.nextActions?.length).toBeGreaterThanOrEqual(2);
    expect(mockBindCustomDomain).not.toHaveBeenCalled();
  });

  it("manageGateway(action=createRoute) should fail on verify without creating route", async () => {
    mockVerifyHttpServiceRoute.mockResolvedValue({
      Passed: false,
      RequestId: "req-route-verify-fail",
      Ownership: {
        Status: "FAIL",
        Code: "OWNERSHIP_FAILED",
        Message: "ownership fail",
        OwnershipVerification: {
          DnsVerification: [
            {
              Subdomain: "_cb.api.example.com",
              RecordType: "TXT",
              RecordValue: "token-xyz",
            },
          ],
        },
      },
      RouteConflict: { Status: "PASS" },
    });

    const result = await tools.manageGateway.handler({
      action: "createRoute",
      domain: "api.example.com",
      targetName: "helloFn",
      path: "/api/hello",
      upstreamResourceType: "WEB_SCF",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain("预检未通过");
    expect(payload.data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: "ownership",
          dnsRecords: [
            {
              subdomain: "_cb.api.example.com",
              recordType: "TXT",
              recordValue: "token-xyz",
            },
          ],
        }),
      ]),
    );
    expect(mockCreateHttpServiceRoute).not.toHaveBeenCalled();
  });

  it("manageGateway(action=bindCustomDomain) should pass accessType and enable", async () => {
    const result = await tools.manageGateway.handler({
      action: "bindCustomDomain",
      domain: "api.example.com",
      certificateId: "cert-1",
      accessType: "CDN",
      enable: false,
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockBindCustomDomain).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "api.example.com",
        CertId: "cert-1",
        AccessType: "CDN",
        Enable: false,
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "bindCustomDomain",
        accessType: "CDN",
        enable: false,
      },
    });
  });

  it("manageGateway(action=bindCustomDomain) should pass customCname for CUSTOM access", async () => {
    const result = await tools.manageGateway.handler({
      action: "bindCustomDomain",
      domain: "api.example.com",
      certificateId: "cert-1",
      accessType: "CUSTOM",
      customCname: "origin.example.com",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockBindCustomDomain).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: {
        Domain: "api.example.com",
        CertId: "cert-1",
        AccessType: "CUSTOM",
        CustomCname: "origin.example.com",
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "bindCustomDomain",
        accessType: "CUSTOM",
        customCname: "origin.example.com",
      },
    });
  });

  it("manageGateway(action=bindCustomDomain) should require customCname for CUSTOM access", async () => {
    const result = await tools.manageGateway.handler({
      action: "bindCustomDomain",
      domain: "api.example.com",
      certificateId: "cert-1",
      accessType: "CUSTOM",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain("customCname");
    expect(mockBindCustomDomain).not.toHaveBeenCalled();
  });

  it("manageGateway(action=bindCustomDomain) should reject customCname without CUSTOM access", async () => {
    const result = await tools.manageGateway.handler({
      action: "bindCustomDomain",
      domain: "api.example.com",
      certificateId: "cert-1",
      customCname: "origin.example.com",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain("customCname");
    expect(mockBindCustomDomain).not.toHaveBeenCalled();
  });

  it("manageGateway(action=deleteCustomDomain) should guide deleting routes first", async () => {
    mockDeleteCustomDomain.mockRejectedValue(
      new Error(
        "Domain api.example.com has 2 route binding(s) (/a, /b). Please delete the routes before deleting the domain.",
      ),
    );

    const result = await tools.manageGateway.handler({
      action: "deleteCustomDomain",
      domain: "api.example.com",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain("先删除路由");
    expect(payload.nextActions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tool: "manageGateway",
          action: "deleteRoute",
        }),
      ]),
    );
  });

  it("manageGateway(action=deleteCustomDomain) should delete custom domain", async () => {
    const result = await tools.manageGateway.handler({
      action: "deleteCustomDomain",
      domain: "api.example.com",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockDeleteCustomDomain).toHaveBeenCalledWith({
      EnvId: "env-test",
      Domain: "api.example.com",
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "deleteCustomDomain",
        domain: "api.example.com",
      },
    });
  });

  it("queryGateway(action=getPrivilege) should return service and auth status", async () => {
    mockCommonServiceCall.mockResolvedValue({
      EnableService: false,
      EnableAuth: true,
    });

    const result = await tools.queryGateway.handler({
      action: "getPrivilege",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCommonServiceCall).toHaveBeenCalledWith({
      Action: "DescribeCloudBaseGWPrivilege",
      Param: { ServiceId: "env-test" },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "getPrivilege",
        enableService: false,
        enableAuth: true,
      },
    });
    expect(payload.message).toContain("未开启");
    expect(payload.nextActions).toEqual([
      expect.objectContaining({
        tool: "manageGateway",
        action: "enableService",
      }),
    ]);
  });

  it("queryGateway(action=getPrivilege) should report unknown status when API returns missing fields", async () => {
    mockCommonServiceCall.mockResolvedValue({});

    const result = await tools.queryGateway.handler({
      action: "getPrivilege",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.enableService).toBe(false);
    expect(payload.data.enableAuth).toBe(false);
    expect(payload.message).toContain("未知");
  });

  it("queryGateway(action=getPrivilege) should not suggest enable when service is on", async () => {
    mockCommonServiceCall.mockResolvedValue({
      EnableService: true,
      EnableAuth: false,
    });

    const result = await tools.queryGateway.handler({
      action: "getPrivilege",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.data.enableService).toBe(true);
    expect(payload.message).toContain("已开启");
    expect(payload.nextActions).toBeUndefined();
  });

  it("manageGateway(action=enableService) should turn on the gateway service", async () => {
    const result = await tools.manageGateway.handler({
      action: "enableService",
      enable: true,
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockSwitchAuth).toHaveBeenCalledWith(true);
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "enableService",
        enable: true,
      },
    });
    expect(payload.message).toContain("开启成功");
    expect(payload.nextActions).toEqual([
      expect.objectContaining({
        tool: "queryGateway",
        action: "getPrivilege",
      }),
    ]);
  });

  it("manageGateway(action=enableService) should require enable parameter", async () => {
    const result = await tools.manageGateway.handler({
      action: "enableService",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain("enable");
    expect(mockSwitchAuth).not.toHaveBeenCalled();
  });

  it("manageGateway(action=authSwitch) should switch auth via ModifyCloudBaseGWPrivilege", async () => {
    const result = await tools.manageGateway.handler({
      action: "authSwitch",
      enable: true,
    });

    const payload = JSON.parse(result.content[0].text);

    expect(mockCommonServiceCall).toHaveBeenCalledWith({
      Action: "ModifyCloudBaseGWPrivilege",
      Param: {
        ServiceId: "env-test",
        EnableService: true,
        Options: [{ Key: "authswitch", Value: "true" }],
      },
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "authSwitch",
        enable: true,
      },
    });
    expect(payload.message).toContain("鉴权开启成功");
  });

  it("manageGateway(action=authSwitch) should require enable parameter", async () => {
    const result = await tools.manageGateway.handler({
      action: "authSwitch",
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(false);
    expect(payload.message).toContain("enable");
    expect(mockCommonServiceCall).not.toHaveBeenCalled();
  });

  it("manageGateway(action=createRoute) should warn when gateway service is off", async () => {
    mockCommonServiceCall.mockResolvedValue({
      EnableService: false,
      EnableAuth: false,
    });

    const result = await tools.manageGateway.handler({
      action: "createRoute",
      targetName: "helloFn",
      path: "api/hello",
      upstreamResourceType: "WEB_SCF",
      auth: false,
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.message).toContain("HTTP 网关总开关未开启");
    expect(payload.message).toContain("HTTPSERVICE_NONACTIVATED");
    expect(payload.nextActions[0]).toEqual(
      expect.objectContaining({
        tool: "manageGateway",
        action: "enableService",
      }),
    );
  });

  it("manageGateway(action=createRoute) should not warn when gateway service is on", async () => {
    mockCommonServiceCall.mockResolvedValue({
      EnableService: true,
      EnableAuth: false,
    });

    const result = await tools.manageGateway.handler({
      action: "createRoute",
      targetName: "helloFn",
      path: "api/hello",
      upstreamResourceType: "WEB_SCF",
      auth: false,
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.message).not.toContain("总开关未开启");
    expect(payload.message).not.toContain("HTTPSERVICE_NONACTIVATED");
  });

  it("manageGateway(action=createRoute) should not fail when privilege probe errors", async () => {
    mockCommonServiceCall.mockRejectedValue(new Error("probe failed"));

    const result = await tools.manageGateway.handler({
      action: "createRoute",
      targetName: "helloFn",
      path: "api/hello",
      upstreamResourceType: "WEB_SCF",
      auth: false,
    });

    const payload = JSON.parse(result.content[0].text);

    expect(payload.success).toBe(true);
    expect(payload.message).toContain("无法确认 HTTP 网关开关状态");
    expect(mockCreateHttpServiceRoute).toHaveBeenCalled();
  });
});
