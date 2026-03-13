import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtendedMcpServer } from "../server.js";
import { registerGatewayTools } from "./gateway.js";

const {
  mockCreateAccess,
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockLogCloudBaseResult,
} = vi.hoisted(() => ({
  mockCreateAccess: vi.fn(),
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: mockLogCloudBaseResult,
}));

function createMockServer(overrides?: { region?: string }) {
  const tools: Record<
    string,
    {
      meta: any;
      handler: (args: any) => Promise<any>;
    }
  > = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: {
      envId: "env-test",
      region: overrides && "region" in overrides ? overrides.region : "ap-guangzhou",
    },
    logger: vi.fn(),
    registerTool: vi.fn(
      (name: string, meta: any, handler: (args: any) => Promise<any>) => {
        tools[name] = { meta, handler };
      },
    ),
  } as unknown as ExtendedMcpServer;

  registerGatewayTools(server);

  return { tools };
}

describe("gateway tools", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateAccess.mockResolvedValue({ APIId: "api-123" });
    mockGetCloudBaseManager.mockResolvedValue({
      access: {
        createAccess: mockCreateAccess,
      },
    });
    mockGetEnvId.mockResolvedValue("env-test");
  });

  it("should expose createFunctionHTTPAccess tool", () => {
    const { tools } = createMockServer();
    expect(typeof tools.createFunctionHTTPAccess?.handler).toBe("function");
  });

  it("should normalize path and return invoke guidance", async () => {
    const { tools } = createMockServer();

    const result = await tools.createFunctionHTTPAccess.handler({
      name: "demo",
      path: "api/hello",
      type: "HTTP",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateAccess).toHaveBeenCalledWith({
      name: "demo",
      path: "/api/hello",
      type: 6,
    });
    expect(payload).toMatchObject({
      ok: true,
      code: "HTTP_ACCESS_CREATED",
      function_name: "demo",
      function_type: "HTTP",
      env_id: "env-test",
      region: "ap-guangzhou",
      path: "/api/hello",
      invoke_url: "https://env-test.ap-guangzhou.app.tcloudbase.com/api/hello",
    });
    expect(payload.next_steps[0]).toContain("https://env-test.ap-guangzhou.app.tcloudbase.com/api/hello");
  });

  it("should explain missing region when invoke url cannot be generated", async () => {
    const { tools } = createMockServer({ region: undefined });

    const result = await tools.createFunctionHTTPAccess.handler({
      name: "demo",
      path: "/ready",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.invoke_url).toBeNull();
    expect(payload.next_steps[0]).toContain("Region is unavailable");
  });
});
