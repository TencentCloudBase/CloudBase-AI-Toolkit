import { z } from "zod";
import { getCloudBaseManager, getEnvId, logCloudBaseResult } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";

const QUERY_PERMISSION_ACTIONS = [
  "getResourcePermission",
  "listResourcePermissions",
  "listRoles",
  "getRole",
  "listUsers",
  "getUser",
] as const;

const MANAGE_PERMISSION_ACTIONS = [
  "updateResourcePermission",
  "createRole",
  "updateRole",
  "deleteRoles",
  "addRoleMembers",
  "removeRoleMembers",
  "addRolePolicies",
  "removeRolePolicies",
  "createUser",
  "updateUser",
  "deleteUsers",
] as const;

const MANAGE_PERMISSIONS_DESCRIPTION =
  "权限域统一写入口。支持修改资源权限、角色管理、成员与策略增删、应用用户 CRUD。数据库权限改成 CUSTOM 时，请同时提供 securityRule，并区分 create 与 read/update/delete 的校验语义：create 校验写入数据，read/update/delete 校验 doc 查询子集。";

const CUSTOM_SECURITY_RULE_DESCRIPTION =
  "仅在 permission=CUSTOM 时提供，值必须是安全规则 JSON 字符串。常见场景可从这个模板起步： {\"read\":\"doc._openid == auth.openid || doc._openid == auth.uid\",\"write\":\"auth != null && auth.loginType != 'ANONYMOUS'\",\"update\":\"doc._openid == auth.openid || doc._openid == auth.uid\",\"delete\":\"false\"}。其中 owner 判断要同时兼容 `auth.openid`（微信登录）和 `auth.uid`（非微信登录）；如果需求是“登录用户可创建、创建者可修改”，优先把通用创建门槛放在 write，再用 update/delete 细化覆盖。重要：如果必须单独写 create，create 校验写入数据而不是现有文档，不要在 create 规则里依赖 doc.*；需要校验写入字段时请使用 request.data.xxx。read/update/delete 才使用 doc.*。如果规则引用了 doc._openid 或 doc.uid，客户端查询/更新条件也必须包含对应字段，例如 _openid: \"{openid}\" 或 uid: \"{uid}\"，否则会因规则子集校验被拒绝。";

type QueryPermissionAction = (typeof QUERY_PERMISSION_ACTIONS)[number];
type ManagePermissionAction = (typeof MANAGE_PERMISSION_ACTIONS)[number];
type LegacyResourceType = "noSqlDatabase" | "sqlDatabase" | "function" | "storage";

type ToolEnvelope = {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
};

function buildEnvelope(data: Record<string, unknown>, message: string): ToolEnvelope {
  return {
    success: true,
    data,
    message,
  };
}

function buildErrorEnvelope(error: unknown): ToolEnvelope {
  return {
    success: false,
    data: {},
    message: error instanceof Error ? error.message : String(error),
  };
}

function mapResourceType(resourceType: LegacyResourceType) {
  const resourceTypeMap = {
    noSqlDatabase: "collection",
    sqlDatabase: "table",
    function: "function",
    storage: "storage",
  } as const;

  return resourceTypeMap[resourceType];
}

function normalizeRecordArray(value: unknown, label: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(`${label} 必须是数组`);
  }
  return value as Array<Record<string, unknown>>;
}

export function registerPermissionTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  const withEnvelope = async (handler: () => Promise<ToolEnvelope>) => {
    try {
      return jsonContent(await handler());
    } catch (error) {
      return jsonContent(buildErrorEnvelope(error));
    }
  };

  server.registerTool?.(
    "queryPermissions",
    {
      title: "查询权限与用户配置",
      description:
        "权限域统一只读入口。支持查询资源权限、角色列表/详情、应用用户列表/详情。",
      inputSchema: {
        action: z.enum(QUERY_PERMISSION_ACTIONS),
        resourceType: z
          .enum(["noSqlDatabase", "sqlDatabase", "function", "storage"])
          .optional(),
        resourceId: z.string().optional(),
        resourceIds: z.array(z.string()).optional(),
        roleId: z.string().optional(),
        roleIdentity: z.string().optional(),
        roleName: z.string().optional(),
        uid: z.string().optional(),
        username: z.string().optional(),
        pageNo: z.number().optional(),
        pageSize: z.number().optional(),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "permissions",
      },
    },
    async ({
      action,
      resourceType,
      resourceId,
      resourceIds,
      roleId,
      roleIdentity,
      roleName,
      uid,
      username,
      pageNo,
      pageSize,
    }: {
      action: QueryPermissionAction;
      resourceType?: LegacyResourceType;
      resourceId?: string;
      resourceIds?: string[];
      roleId?: string;
      roleIdentity?: string;
      roleName?: string;
      uid?: string;
      username?: string;
      pageNo?: number;
      pageSize?: number;
    }) =>
      withEnvelope(async () => {
        const envId = await getEnvId(cloudBaseOptions);
        const cloudbase = await getManager();

        switch (action) {
          case "getResourcePermission": {
            if (!resourceType || !resourceId) {
              throw new Error("action=getResourcePermission 时必须提供 resourceType 和 resourceId");
            }
            const result = await cloudbase.permission.describeResourcePermission({
              resourceType: mapResourceType(resourceType),
              resources: [resourceId],
            });
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                resourceType,
                resourceId,
                permissions: result.Data.PermissionList ?? [],
                raw: result,
              },
              "资源权限查询成功",
            );
          }
          case "listResourcePermissions": {
            if (!resourceType) {
              throw new Error("action=listResourcePermissions 时必须提供 resourceType");
            }
            const result = await cloudbase.permission.describeResourcePermission({
              resourceType: mapResourceType(resourceType),
              resources: resourceIds,
            });
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                resourceType,
                permissions: result.Data.PermissionList ?? [],
                total: result.Data.TotalCount ?? 0,
                raw: result,
              },
              "资源权限列表查询成功",
            );
          }
          case "listRoles": {
            const result = await cloudbase.permission.describeRoleList({
              pageNumber: pageNo ?? 1,
              pageSize: pageSize ?? 20,
              loadDetails: true,
            });
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                systemRoles: result.Data.SystemRoles ?? [],
                customRoles: result.Data.CustomRoles ?? [],
                total: result.Data.TotalCount ?? 0,
                raw: result,
              },
              "角色列表查询成功",
            );
          }
          case "getRole": {
            const result = await cloudbase.permission.describeRoleList({
              roleId,
              roleIdentity,
              roleName,
              pageNumber: 1,
              pageSize: 20,
              loadDetails: true,
            });
            logCloudBaseResult(server.logger, result);
            const roles = [
              ...(result.Data.SystemRoles ?? []),
              ...(result.Data.CustomRoles ?? []),
            ];
            const role =
              roles.find(
                (item) =>
                  (roleId && item.RoleId === roleId) ||
                  (roleIdentity && item.RoleIdentity === roleIdentity) ||
                  (roleName && item.RoleName === roleName),
              ) ?? null;
            return buildEnvelope(
              {
                action,
                envId,
                role,
                raw: result,
              },
              "角色详情查询成功",
            );
          }
          case "listUsers": {
            const result = await cloudbase.user.describeUserList({
              pageNo: pageNo ?? 1,
              pageSize: pageSize ?? 20,
              name: username,
            });
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                users: result.Data.UserList ?? [],
                total: result.Data.Total ?? 0,
                raw: result,
              },
              "应用用户列表查询成功",
            );
          }
          case "getUser": {
            if (!uid && !username) {
              throw new Error("action=getUser 时必须提供 uid 或 username");
            }
            const result = await cloudbase.user.describeUserList({
              pageNo: 1,
              pageSize: 20,
              name: username,
            });
            logCloudBaseResult(server.logger, result);
            const user =
              (result.Data.UserList ?? []).find(
                (item) => (uid && item.Uid === uid) || (username && item.Name === username),
              ) ?? null;
            return buildEnvelope(
              {
                action,
                envId,
                user,
                raw: result,
              },
              "应用用户详情查询成功",
            );
          }
        }
      }),
  );

  server.registerTool?.(
    "managePermissions",
    {
      title: "管理权限与用户配置",
      description: MANAGE_PERMISSIONS_DESCRIPTION,
      inputSchema: {
        action: z.enum(MANAGE_PERMISSION_ACTIONS),
        resourceType: z
          .enum(["noSqlDatabase", "sqlDatabase", "function", "storage"])
          .optional(),
        resourceId: z.string().optional(),
        permission: z
          .enum(["READONLY", "PRIVATE", "ADMINWRITE", "ADMINONLY", "CUSTOM"])
          .optional()
          .describe("资源权限级别。优先使用 READONLY、PRIVATE、ADMINWRITE、ADMINONLY；只有需要细粒度数据库规则时才使用 CUSTOM，并同时提供 securityRule。"),
        securityRule: z.string().optional().describe(CUSTOM_SECURITY_RULE_DESCRIPTION),
        roleId: z.string().optional(),
        roleIds: z.array(z.string()).optional(),
        roleName: z.string().optional(),
        roleIdentity: z.string().optional(),
        description: z.string().optional(),
        memberUids: z.array(z.string()).optional(),
        policies: z.array(z.record(z.any())).optional(),
        uid: z.string().optional(),
        uids: z.array(z.string()).optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        userStatus: z.enum(["ACTIVE", "BLOCKED"]).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: "permissions",
      },
    },
    async ({
      action,
      resourceType,
      resourceId,
      permission,
      securityRule,
      roleId,
      roleIds,
      roleName,
      roleIdentity,
      description,
      memberUids,
      policies,
      uid,
      uids,
      username,
      password,
      userStatus,
    }: {
      action: ManagePermissionAction;
      resourceType?: LegacyResourceType;
      resourceId?: string;
      permission?: "READONLY" | "PRIVATE" | "ADMINWRITE" | "ADMINONLY" | "CUSTOM";
      securityRule?: string;
      roleId?: string;
      roleIds?: string[];
      roleName?: string;
      roleIdentity?: string;
      description?: string;
      memberUids?: string[];
      policies?: Array<Record<string, unknown>>;
      uid?: string;
      uids?: string[];
      username?: string;
      password?: string;
      userStatus?: "ACTIVE" | "BLOCKED";
    }) =>
      withEnvelope(async () => {
        const envId = await getEnvId(cloudBaseOptions);
        const cloudbase = await getManager();
        const normalizedPolicies = normalizeRecordArray(policies, "policies");

        switch (action) {
          case "updateResourcePermission": {
            if (!resourceType || !resourceId || !permission) {
              throw new Error("action=updateResourcePermission 时必须提供 resourceType、resourceId 和 permission");
            }
            const result = await cloudbase.permission.modifyResourcePermission({
              resourceType: mapResourceType(resourceType),
              resource: resourceId,
              permission,
              securityRule,
            });
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                resourceType,
                resourceId,
                permission,
                raw: result,
              },
              "资源权限更新成功",
            );
          }
          case "createRole": {
            if (!roleName || !roleIdentity) {
              throw new Error("action=createRole 时必须提供 roleName 和 roleIdentity");
            }
            const result = await cloudbase.permission.createRole({
              roleName,
              roleIdentity,
              description,
              memberUids,
              policies: normalizedPolicies as any,
            });
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                roleName,
                raw: result,
              },
              "角色创建成功",
            );
          }
          case "updateRole":
          case "addRoleMembers":
          case "removeRoleMembers":
          case "addRolePolicies":
          case "removeRolePolicies": {
            if (!roleId) {
              throw new Error(`action=${action} 时必须提供 roleId`);
            }
            const result = await cloudbase.permission.modifyRole({
              roleId,
              ...(action === "updateRole"
                ? {
                    roleName,
                    description,
                    addMemberUids: memberUids,
                    addPolicies: normalizedPolicies as any,
                  }
                : {}),
              ...(action === "addRoleMembers" ? { addMemberUids: memberUids } : {}),
              ...(action === "removeRoleMembers" ? { removeMemberUids: memberUids } : {}),
              ...(action === "addRolePolicies" ? { addPolicies: normalizedPolicies as any } : {}),
              ...(action === "removeRolePolicies"
                ? { removePolicies: normalizedPolicies as any }
                : {}),
            });
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                roleId,
                raw: result,
              },
              "角色更新成功",
            );
          }
          case "deleteRoles": {
            if (!roleIds?.length) {
              throw new Error("action=deleteRoles 时必须提供 roleIds");
            }
            const result = await cloudbase.permission.deleteRoles({
              roleIds,
            });
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                roleIds,
                raw: result,
              },
              "角色删除成功",
            );
          }
          case "createUser": {
            if (!username || !password) {
              throw new Error("action=createUser 时必须提供 username 和 password");
            }
            const result = await cloudbase.user.createUser({
              name: username,
              password,
              userStatus,
              description,
            });
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                username,
                raw: result,
              },
              "应用用户创建成功",
            );
          }
          case "updateUser": {
            if (!uid) {
              throw new Error("action=updateUser 时必须提供 uid");
            }
            const result = await cloudbase.user.modifyUser({
              uid,
              name: username,
              password,
              userStatus,
              description,
            });
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                uid,
                raw: result,
              },
              "应用用户更新成功",
            );
          }
          case "deleteUsers": {
            if (!uids?.length) {
              throw new Error("action=deleteUsers 时必须提供 uids");
            }
            const result = await cloudbase.user.deleteUsers({
              uids,
            });
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                uids,
                raw: result,
              },
              "应用用户删除成功",
            );
          }
        }
      }),
  );
}
