import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerPermissionTools } from "./permissions.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockDescribeResourcePermission,
  mockGetEnvInfo,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockDescribeResourcePermission: vi.fn(),
  mockGetEnvInfo: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: vi.fn(),
}));

function createMockServer() {
  const tools: Record<string, { handler: (args: any) => Promise<any> }> = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    logger: vi.fn(),
    registerTool: vi.fn((name, _meta, handler) => {
      tools[name] = { handler };
    }),
  } as unknown as ExtendedMcpServer;

  registerPermissionTools(server);
  return tools;
}

describe("queryPermissions storage not found", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnvId.mockResolvedValue("env-test");
    mockGetEnvInfo.mockResolvedValue({
      EnvInfo: {
        Storages: [{ Bucket: "existing-bucket" }],
        StaticStorages: [{ Bucket: "hosting-bucket" }],
      },
    });
    mockDescribeResourcePermission.mockResolvedValue({
      Data: {
        TotalCount: 1,
        PermissionList: [
          {
            ResourceType: "storage",
            Resource: "nonexistent-bucket",
            Permission: "ADMINWRITE",
          },
        ],
      },
      RequestId: "req-resource-perm",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      env: {
        getEnvInfo: mockGetEnvInfo,
      },
      permission: {
        describeResourcePermission: mockDescribeResourcePermission,
      },
      user: {},
    });
  });

  it("returns an error envelope when a storage bucket does not exist in the bound env", async () => {
    const tools = createMockServer();
    const result = await tools.queryPermissions.handler({
      action: "getResourcePermission",
      resourceType: "storage",
      resourceId: "nonexistent-bucket",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockGetEnvInfo).toHaveBeenCalledTimes(1);
    expect(mockDescribeResourcePermission).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: false,
      error: 'Storage bucket "nonexistent-bucket" does not exist in env "env-test"',
      message: 'Storage bucket "nonexistent-bucket" does not exist in env "env-test"',
    });
  });
});
