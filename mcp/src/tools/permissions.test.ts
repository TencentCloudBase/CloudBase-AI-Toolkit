import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerPermissionTools } from "./permissions.js";
import type { ExtendedMcpServer } from "../server.js";

const {
  mockGetCloudBaseManager,
  mockGetEnvId,
  mockLogCloudBaseResult,
  mockDescribeResourcePermission,
  mockDescribeRoleList,
  mockModifyResourcePermission,
  mockCreateRole,
  mockDescribeUserList,
  mockCreateUser,
} = vi.hoisted(() => ({
  mockGetCloudBaseManager: vi.fn(),
  mockGetEnvId: vi.fn(),
  mockLogCloudBaseResult: vi.fn(),
  mockDescribeResourcePermission: vi.fn(),
  mockDescribeRoleList: vi.fn(),
  mockModifyResourcePermission: vi.fn(),
  mockCreateRole: vi.fn(),
  mockDescribeUserList: vi.fn(),
  mockCreateUser: vi.fn(),
}));

vi.mock("../cloudbase-manager.js", () => ({
  getCloudBaseManager: mockGetCloudBaseManager,
  getEnvId: mockGetEnvId,
  logCloudBaseResult: mockLogCloudBaseResult,
}));

function createMockServer() {
  const tools: Record<string, { meta: any; handler: (args: any) => Promise<any> }> = {};

  const server: ExtendedMcpServer = {
    cloudBaseOptions: { envId: "env-test", region: "ap-guangzhou" },
    logger: vi.fn(),
    registerTool: vi.fn((name, meta, handler) => {
      tools[name] = { meta, handler };
    }),
  } as unknown as ExtendedMcpServer;

  registerPermissionTools(server);

  return { tools };
}

describe("permission tools", () => {
  let tools: ReturnType<typeof createMockServer>["tools"];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEnvId.mockResolvedValue("env-test");
    mockDescribeResourcePermission.mockResolvedValue({
      Data: {
        TotalCount: 1,
        PermissionList: [
          {
            ResourceType: "collection",
            Resource: "todos",
            Permission: "READONLY",
          },
        ],
      },
      RequestId: "req-resource-perm",
    });
    mockDescribeRoleList.mockResolvedValue({
      Data: {
        TotalCount: 1,
        CustomRoles: [
          {
            RoleId: "role-1",
            RoleName: "editor",
          },
        ],
      },
      RequestId: "req-role-list",
    });
    mockModifyResourcePermission.mockResolvedValue({
      Data: { Success: true },
      RequestId: "req-modify-perm",
    });
    mockCreateRole.mockResolvedValue({
      Data: {
        RoleId: "role-2",
      },
      RequestId: "req-create-role",
    });
    mockDescribeUserList.mockResolvedValue({
      Data: {
        Total: 1,
        UserList: [
          {
            Uuid: "user-1",
            Username: "alice",
          },
        ],
      },
      RequestId: "req-user-list",
    });
    mockCreateUser.mockResolvedValue({
      Data: {
        Uuid: "user-2",
      },
      RequestId: "req-create-user",
    });
    mockGetCloudBaseManager.mockResolvedValue({
      permission: {
        describeResourcePermission: mockDescribeResourcePermission,
        describeRoleList: mockDescribeRoleList,
        modifyResourcePermission: mockModifyResourcePermission,
        createRole: mockCreateRole,
      },
      user: {
        describeUserList: mockDescribeUserList,
        createUser: mockCreateUser,
      },
    });
    ({ tools } = createMockServer());
  });

  it("queryPermissions(action=listUsers) should use user service", async () => {
    const result = await tools.queryPermissions.handler({ action: "listUsers" });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeUserList).toHaveBeenCalledWith({
      pageNo: 1,
      pageSize: 20,
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "listUsers",
        users: [expect.objectContaining({ Username: "alice" })],
      },
    });
  });

  it("queryPermissions(action=getResourcePermission) should map resource type", async () => {
    const result = await tools.queryPermissions.handler({
      action: "getResourcePermission",
      resourceType: "noSqlDatabase",
      resourceId: "todos",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeResourcePermission).toHaveBeenCalledWith({
      resourceType: "collection",
      resources: ["todos"],
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "getResourcePermission",
        resourceType: "noSqlDatabase",
        resourceId: "todos",
      },
    });
  });

  it("managePermissions(action=createRole) should call permission service", async () => {
    const result = await tools.managePermissions.handler({
      action: "createRole",
      roleName: "editor",
      roleIdentity: "editor",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateRole).toHaveBeenCalledWith({
      roleName: "editor",
      roleIdentity: "editor",
      description: undefined,
      memberUids: undefined,
      policies: undefined,
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "createRole",
        roleName: "editor",
      },
    });
  });

  it("managePermissions(action=createUser) should call user service", async () => {
    const result = await tools.managePermissions.handler({
      action: "createUser",
      username: "bob",
      password: "secret123",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockCreateUser).toHaveBeenCalledWith({
      name: "bob",
      password: "secret123",
      userStatus: undefined,
      description: undefined,
      type: undefined,
      nickName: undefined,
      phone: undefined,
      email: undefined,
      avatarUrl: undefined,
      uid: undefined,
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        action: "createUser",
        username: "bob",
      },
    });
  });

  it("managePermissions should explain CUSTOM securityRule semantics", () => {
    expect(tools.managePermissions.meta.description).toContain("securityRule");
    expect(tools.managePermissions.meta.description).toContain("create");
    expect(tools.managePermissions.meta.inputSchema.permission.description).toContain("CUSTOM");
    expect(tools.managePermissions.meta.inputSchema.securityRule.description).toContain("JSON 字符串");
    expect(tools.managePermissions.meta.inputSchema.securityRule.description).toContain("request.data");
    expect(tools.managePermissions.meta.inputSchema.securityRule.description).toContain("doc._openid");
    expect(tools.managePermissions.meta.inputSchema.securityRule.description).toContain("auth.uid");
    expect(tools.managePermissions.meta.inputSchema.securityRule.description).toContain("auth.openid");
    expect(tools.managePermissions.meta.inputSchema.securityRule.description).toContain("write");
    expect(tools.managePermissions.meta.inputSchema.securityRule.description).toContain("{openid}");
  });
});
