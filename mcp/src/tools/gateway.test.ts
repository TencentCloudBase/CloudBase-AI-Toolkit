import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerGatewayTools } from "./gateway.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetAccessList,
  mockGetDomainList,
  mockCreateAccess,
  mockGetCloudBaseManager,
  mockLogCloudBaseResult,
} = vi.hoisted(() => ({
  mockGetAccessList: vi.fn(),
  mockGetDomainList: vi.fn(),
  mockCreateAccess: vi.fn(),
  mockGetCloudBaseManager: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  logCloudBaseResult: mockLogCloudBaseResult,
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
    mockGetCloudBaseManager.mockResolvedValue({
      access: {
        getAccessList: mockGetAccessList,
        getDomainList: mockGetDomainList,
        createAccess: mockCreateAccess,
      },
    });

    ({ tools } = createMockServer());
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
});
