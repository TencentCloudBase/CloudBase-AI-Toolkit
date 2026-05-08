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
      env: {
        getEnvInfo: vi.fn().mockResolvedValue({
          EnvInfo: {
            Storages: [{ Bucket: "bucket-1" }],
          },
        }),
      },
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

  it("queryPermissions metadata should explain CLI role mapping", () => {
    const meta = tools.queryPermissions.meta;

    expect(meta.description).toContain("tcb role list");
    expect(meta.description).toContain("tcb role get --id|--identity|--name");
    expect(meta.description).toContain("成员列表");
    expect(meta.inputSchema.action.description).toContain("listRoles");
    expect(meta.inputSchema.action.description).toContain("tcb role get --id|--identity|--name");
    expect(meta.inputSchema.roleId.description).toContain("tcb role get --id <roleId>");
    expect(meta.inputSchema.roleIdentity.description).toContain("tcb role get --identity <roleIdentity>");
    expect(meta.inputSchema.roleName.description).toContain("tcb role get --name <roleName>");
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
        aclTag: "READONLY",
      },
    });
  });

  it("queryPermissions(action=getResourcePermission) should return a doc-id write hint for risky custom rules", async () => {
    mockDescribeResourcePermission.mockResolvedValueOnce({
      Data: {
        TotalCount: 1,
        PermissionList: [
          {
            ResourceType: "collection",
            Resource: "articles",
            Permission: "CUSTOM",
            SecurityRule:
              "{\"update\": \"auth.uid == doc.authorId\", \"delete\": \"auth.uid == doc.authorId\"}",
          },
        ],
      },
      RequestId: "req-resource-perm-risky",
    });

    const result = await tools.queryPermissions.handler({
      action: "getResourcePermission",
      resourceType: "noSqlDatabase",
      resourceId: "articles",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.data.hints).toEqual([
      expect.objectContaining({
        type: "docIdWriteRuleWarning",
        appliesTo: ["update", "delete"],
        recommendedPermission: "CUSTOM",
        recommendedSecurityRule:
          "{\"create\":\"auth.uid != null\",\"update\":\"auth.uid != null && (get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid)\",\"delete\":\"auth.uid != null && (get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid)\"}",
      }),
    ]);
  });

  it("queryPermissions(action=getResourcePermission) should fail when storage bucket does not exist", async () => {
    const result = await tools.queryPermissions.handler({
      action: "getResourcePermission",
      resourceType: "storage",
      resourceId: "missing-bucket",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeResourcePermission).not.toHaveBeenCalled();
    expect(payload).toMatchObject({
      success: false,
      message: "存储 Bucket missing-bucket 不存在",
    });
  });

  it("queryPermissions(action=getResourcePermission) should allow existing storage bucket", async () => {
    mockDescribeResourcePermission.mockResolvedValueOnce({
      Data: {
        TotalCount: 1,
        PermissionList: [
          {
            ResourceType: "storage",
            Resource: "bucket-1",
            Permission: "ADMINWRITE",
          },
        ],
      },
      RequestId: "req-storage-perm",
    });

    const result = await tools.queryPermissions.handler({
      action: "getResourcePermission",
      resourceType: "storage",
      resourceId: "bucket-1",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockDescribeResourcePermission).toHaveBeenCalledWith({
      resourceType: "storage",
      resources: ["bucket-1"],
    });
    expect(payload).toMatchObject({
      success: true,
      data: {
        resourceType: "storage",
        resourceId: "bucket-1",
      },
    });
  });

  it("queryPermissions(action=listResourcePermissions) should include resource-level hints for risky custom rules", async () => {
    mockDescribeResourcePermission.mockResolvedValueOnce({
      Data: {
        TotalCount: 2,
        PermissionList: [
          {
            ResourceType: "collection",
            Resource: "articles",
            Permission: "CUSTOM",
            SecurityRule:
              "{\"update\": \"get('database.user_roles.${auth.uid}').role == 'admin' || get('database.articles.${doc._id}').authorId == auth.uid\", \"delete\": \"get('database.user_roles.${auth.uid}').role == 'admin' || get('database.articles.${doc._id}').authorId == auth.uid\"}",
          },
          {
            ResourceType: "collection",
            Resource: "users",
            Permission: "READONLY",
          },
        ],
      },
      RequestId: "req-resource-perm-list-risky",
    });

    const result = await tools.queryPermissions.handler({
      action: "listResourcePermissions",
      resourceType: "noSqlDatabase",
      resourceIds: ["articles", "users"],
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.data.resourceHints).toEqual([
      expect.objectContaining({
        resourceId: "articles",
        permission: "CUSTOM",
        hints: expect.arrayContaining([
          expect.objectContaining({ type: "templateLiteralRuleWarning" }),
        ]),
      }),
    ]);
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

  it("managePermissions(action=updateResourcePermission) should return a doc-id write hint for risky custom rules", async () => {
    const result = await tools.managePermissions.handler({
      action: "updateResourcePermission",
      resourceType: "noSqlDatabase",
      resourceId: "articles",
      permission: "CUSTOM",
      securityRule:
        "{\"update\": \"auth.uid == doc.authorId\", \"delete\": \"auth.uid == doc.authorId\"}",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(mockModifyResourcePermission).toHaveBeenCalledWith({
      resourceType: "collection",
      resource: "articles",
      permission: "CUSTOM",
      securityRule:
        "{\"update\": \"auth.uid == doc.authorId\", \"delete\": \"auth.uid == doc.authorId\"}",
    });
    expect(payload.data.hints).toEqual([
      expect.objectContaining({
        type: "docIdWriteRuleWarning",
        appliesTo: ["update", "delete"],
        roleLookupNote: expect.stringContaining("不要把 where({ uid }) 查询得到的集合误写成"),
        recommendedClientWritePattern: expect.stringContaining("db.collection('articles').doc(id).update(...) / remove(...)"),
      }),
    ]);
    expect(payload.data.verificationHint).toContain("updated / deleted 是否大于 0");
    expect(payload.data.propagationHint).toContain("等待一小段时间");
    expect(payload.data.propagationHint).toContain("DATABASE_PERMISSION_DENIED");
  });

  it("managePermissions(action=updateResourcePermission) should return an invalid get path hint", async () => {
    const result = await tools.managePermissions.handler({
      action: "updateResourcePermission",
      resourceType: "noSqlDatabase",
      resourceId: "articles",
      permission: "CUSTOM",
      securityRule:
        "{\"update\": \"get('database.articles.' + doc._id + '.authorId') == auth.uid\"}",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.data.hints).toEqual([
      expect.objectContaining({
        type: "invalidGetPathWarning",
        recommendedPermission: "CUSTOM",
        recommendedSecurityRule:
          "{\"create\":\"auth.uid != null\",\"update\":\"auth.uid != null && (get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid)\",\"delete\":\"auth.uid != null && (get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid)\"}",
      }),
    ]);
  });

  it("managePermissions(action=updateResourcePermission) should return a template literal rule hint", async () => {
    const result = await tools.managePermissions.handler({
      action: "updateResourcePermission",
      resourceType: "noSqlDatabase",
      resourceId: "articles",
      permission: "CUSTOM",
      securityRule:
        "{\"update\": \"get('database.articles.${doc._id}').authorId == auth.uid\"}",
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.data.hints).toEqual([
      expect.objectContaining({
        type: "templateLiteralRuleWarning",
        roleLookupNote: expect.stringContaining("文档主键就是 auth.uid"),
      }),
    ]);
  });

  it("managePermissions(action=updateResourcePermission) should return a create-rule-doc warning when create references doc.*", async () => {
    const result = await tools.managePermissions.handler({
      action: "updateResourcePermission",
      resourceType: "noSqlDatabase",
      resourceId: "posts",
      permission: "CUSTOM",
      securityRule: JSON.stringify({
        read: "auth.uid != null && doc._openid == auth.openid",
        write: "auth.uid != null && auth.loginType != 'ANONYMOUS' && doc._openid == auth.openid",
      }),
    });
    const payload = JSON.parse(result.content[0].text);

    expect(payload.data.hints).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "createRuleDocWarning",
          summary: expect.stringContaining("create"),
          recommendedPermission: "CUSTOM",
          recommendedSecurityRule: expect.stringContaining("auth.loginType"),
        }),
      ]),
    );
  });
});
