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

type QueryPermissionAction = (typeof QUERY_PERMISSION_ACTIONS)[number];
type ManagePermissionAction = (typeof MANAGE_PERMISSION_ACTIONS)[number];
type LegacyResourceType = "noSqlDatabase" | "sqlDatabase" | "function" | "storage";

type ToolEnvelope = {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
};

function buildWriteVerificationHint(resourceId: string) {
  return `对于 ${resourceId} 这类有后端权限控制的集合，前端调用 .doc(id).update() / .doc(id).remove() 后，不能只看是否没有抛异常。请显式检查返回结果中的 updated / deleted 是否大于 0；如果 result.code、result.message 存在，或 updated / deleted 为 0，要把它当作真实失败并向上抛错。`;
}

function buildPermissionPropagationHint(resourceId: string) {
  return `刚更新完 ${resourceId} 的安全规则时，后端权限可能需要一小段传播时间。若紧接着的真实写操作仍返回 DATABASE_PERMISSION_DENIED，请先等待一小段时间，再用同一登录态重试同一条 .doc(id).update() / .doc(id).remove()；不要立刻连续重写规则，也不要在传播窗口里把旧拒绝直接当成规则表达式仍然错误。`;
}

type CreateRuleHint = {
  type: "createRuleDocWarning";
  severity: "warning";
  summary: string;
  detail: string;
  recommendedRulePattern: string;
  recommendedPermission?: string;
  recommendedSecurityRule?: string;
};

type PermissionHint =
  | CreateRuleHint
  | { type: "docIdWriteRuleWarning"; severity: "warning"; appliesTo: Array<"update" | "delete">; summary: string; detail: string; recommendedRulePattern: string; recommendedPermission?: string; recommendedSecurityRule?: string; recommendedClientWritePattern?: string; roleLookupNote?: string }
  | { type: "invalidGetPathWarning"; severity: "warning"; summary: string; detail: string; recommendedRulePattern: string; recommendedPermission?: string; recommendedSecurityRule?: string; recommendedClientWritePattern?: string; roleLookupNote?: string }
  | { type: "templateLiteralRuleWarning"; severity: "warning"; summary: string; detail: string; recommendedRulePattern: string; recommendedPermission?: string; recommendedSecurityRule?: string; recommendedClientWritePattern?: string; roleLookupNote?: string };

type GetPathHint = {
  type: "invalidGetPathWarning";
  severity: "warning";
  summary: string;
  detail: string;
  recommendedRulePattern: string;
  recommendedPermission?: string;
  recommendedSecurityRule?: string;
  recommendedClientWritePattern?: string;
  roleLookupNote?: string;
};

type TemplateLiteralHint = {
  type: "templateLiteralRuleWarning";
  severity: "warning";
  summary: string;
  detail: string;
  recommendedRulePattern: string;
  recommendedPermission?: string;
  recommendedSecurityRule?: string;
  recommendedClientWritePattern?: string;
  roleLookupNote?: string;
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

function extractRiskyDocFieldOperations(securityRule: string | undefined): Array<"update" | "delete"> {
  if (!securityRule) {
    return [];
  }

  const operations: Array<"update" | "delete"> = [];
  const operationPatterns: Array<["update" | "delete", RegExp]> = [
    ["update", /"update"\s*:\s*"([^"]*)"/],
    ["delete", /"delete"\s*:\s*"([^"]*)"/],
  ];

  for (const [operation, pattern] of operationPatterns) {
    const match = securityRule.match(pattern);
    const expression = match?.[1];
    if (!expression) {
      continue;
    }
    const referencesNonIdDocField = /doc\.(?!_id\b)[A-Za-z_][A-Za-z0-9_]*/.test(expression);
    const usesGetByDocId = /get\('database\.[^']+'\s*\+\s*doc\._id\)/.test(expression);
    if (referencesNonIdDocField && !usesGetByDocId) {
      operations.push(operation);
    }
  }

  return operations;
}

function buildRecommendedOwnerWriteRule(resourceId: string): string {
  return JSON.stringify({
    create: "auth.uid != null",
    update:
      "auth.uid != null && (get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid)",
    delete:
      "auth.uid != null && (get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid)",
  });
}

function buildRoleLookupNote() {
  return "如果你需要 app-level admin override（例如 CMS 中 admin 可编辑所有文章，而 editor 只能编辑自己的文章），CUSTOM 规则通常是必要的。一个已验证可用的模式是：角色集合文档主键就是 auth.uid，并在文章权限里写 get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid。若现有 schema 已经有 users / profiles / user_roles 其一，请复用已存在且能通过 _id == auth.uid 直接 get() 到的那一份；不要把 where({ uid }) 查询得到的集合误写成 get('database.users.' + auth.uid)。";
}

function buildRecommendedClientWritePattern(resourceId: string) {
  return `对于 CMS 文章这类使用 app-level admin override 的 CUSTOM 规则，前端可继续使用 db.collection('${resourceId}').doc(id).update(...) / remove(...)。关键是安全规则要采用已验证模式：get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid，并且文章文档中要真实写入 authorId。`;
}

function buildCreateRuleHint(
  securityRule: string | undefined,
  resourceId: string,
): CreateRuleHint | undefined {
  if (!securityRule) {
    return undefined;
  }

  const createMatch = securityRule.match(/"create"\s*:\s*"([^"]*)"/);
  const writeMatch = securityRule.match(/"write"\s*:\s*"([^"]*)"/);
  const createExpression = createMatch?.[1];
  const writeExpression = writeMatch?.[1];
  if (!createExpression && !writeExpression) {
    return undefined;
  }

  const referencesDoc =
    (createExpression && /doc\.[A-Za-z_]/.test(createExpression)) ||
    (writeExpression && /doc\.[A-Za-z_]/.test(writeExpression));
  if (!referencesDoc) {
    return undefined;
  }

  return {
    type: "createRuleDocWarning",
    severity: "warning",
    summary:
      "create 规则不应引用 doc.*，因为 create 时文档尚未存在。",
    detail:
      "CloudBase 的 create 规则验证的是写入数据（request.data），此时文档尚不存在，doc.* 不可用。" +
      "请将 create 规则改为仅使用 auth.* 检查（如 auth.uid != null && auth.loginType != 'ANONYMOUS'），" +
      "或在写入时将 owner 字段（如 _openid / authorId）写入 request.data，然后在 create 规则中用 request.data._openid == auth.openid 做校验。" +
      "read / update / delete 规则可以使用 doc.* 引用已有文档字段，且客户端查询条件必须是规则约束的子集（如 _openid: '{openid}'）。",
    recommendedRulePattern: "auth.uid != null && auth.loginType != 'ANONYMOUS'",
    recommendedPermission: "CUSTOM",
    recommendedSecurityRule: JSON.stringify({
      read: "auth.uid != null && auth.loginType != 'ANONYMOUS'",
      create: "auth.uid != null && auth.loginType != 'ANONYMOUS'",
      update: "auth.uid != null && auth.loginType != 'ANONYMOUS' && doc._openid == auth.openid",
      delete: "auth.uid != null && auth.loginType != 'ANONYMOUS' && doc._openid == auth.openid",
    }),
  };
}

function buildDocIdWriteRuleHint(
  securityRule: string | undefined,
  resourceId: string,
): PermissionHint | undefined {
  const appliesTo = extractRiskyDocFieldOperations(securityRule);
  if (!appliesTo.length) {
    return undefined;
  }

  return {
    type: "docIdWriteRuleWarning",
    severity: "warning",
    appliesTo,
    summary:
      "当前安全规则在 document-id 写入场景下可能被后端直接拒绝。",
    detail:
      "这类规则经常在 owner-only 集合里被写错，但对于 CMS 文章这种“admin 可编辑所有文章、editor 只能编辑自己的文章”的场景，已验证可用的做法是保留 doc.authorId，并通过独立角色集合做 admin override：get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid。不要默认改成 where(...)，也不要把同集合 owner 判断重写成 get('database.collection.' + doc._id)。",
    recommendedRulePattern: "doc.authorId == auth.uid",
    recommendedPermission: "CUSTOM",
    recommendedSecurityRule: buildRecommendedOwnerWriteRule(resourceId),
    recommendedClientWritePattern: buildRecommendedClientWritePattern(resourceId),
    roleLookupNote: buildRoleLookupNote(),
  };
}

function buildInvalidGetPathHint(
  securityRule: string | undefined,
  resourceId: string,
): GetPathHint | undefined {
  if (!securityRule) {
    return undefined;
  }

  const hasFieldEmbeddedInsideGetPath =
    /get\('database\.[^']+'\s*\+\s*[^)]*\+\s*'\.[A-Za-z_][A-Za-z0-9_]*'\)/.test(securityRule);
  if (!hasFieldEmbeddedInsideGetPath) {
    return undefined;
  }

  return {
    type: "invalidGetPathWarning",
    severity: "warning",
    summary: "get() 的 path 只应包含 collection 和 documentId，不应把字段名拼进 path 字符串。",
    detail:
      "请写成 get('database.collection.' + doc._id).fieldName，而不是 get('database.collection.' + doc._id + '.fieldName')。但在 CMS 文章权限里，不要把 get('database.collection.' + doc._id) 当成默认首选方案；更稳的已验证模式是读取单独的角色集合：get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid。",
    recommendedRulePattern: "doc.authorId == auth.uid",
    recommendedPermission: "CUSTOM",
    recommendedSecurityRule: buildRecommendedOwnerWriteRule(resourceId),
    recommendedClientWritePattern: buildRecommendedClientWritePattern(resourceId),
    roleLookupNote: buildRoleLookupNote(),
  };
}

function buildTemplateLiteralRuleHint(
  securityRule: string | undefined,
  resourceId: string,
): TemplateLiteralHint | undefined {
  if (!securityRule) {
    return undefined;
  }

  const usesTemplateLiteralPlaceholderInRule = /\$\{(?:auth\.uid|doc\._id|doc\.[A-Za-z_][A-Za-z0-9_]*)\}/.test(
    securityRule,
  );
  if (!usesTemplateLiteralPlaceholderInRule) {
    return undefined;
  }

  return {
    type: "templateLiteralRuleWarning",
    severity: "warning",
    summary: "CloudBase security rule 表达式不支持把 ${...} 当作 JS 模板字符串插值。",
    detail:
      "在 securityRule 字符串里，请使用表达式拼接，例如 get('database.user_roles.' + auth.uid).role，而不是 get('database.user_roles.${auth.uid}').role。对于 CMS 文章这类需要 app-level admin override 的规则，请优先使用已验证的 user_roles + doc.authorId 模式。",
    recommendedRulePattern: "doc.authorId == auth.uid",
    recommendedPermission: "CUSTOM",
    recommendedSecurityRule: buildRecommendedOwnerWriteRule(resourceId),
    recommendedClientWritePattern: buildRecommendedClientWritePattern(resourceId),
    roleLookupNote: buildRoleLookupNote(),
  };
}

function buildPermissionHints(securityRule: string | undefined, resourceId: string) {
  return [
    buildCreateRuleHint(securityRule, resourceId),
    buildDocIdWriteRuleHint(securityRule, resourceId),
    buildInvalidGetPathHint(securityRule, resourceId),
    buildTemplateLiteralRuleHint(securityRule, resourceId),
  ].filter(Boolean) as PermissionHint[];
}

async function ensureStorageBucketsExist(cloudbase: any, resourceIds: string[]) {
  if (!resourceIds.length) {
    return;
  }

  const envInfo = await cloudbase.env.getEnvInfo();
  const existingBuckets = new Set(
    (envInfo?.EnvInfo?.Storages ?? [])
      .map((item: { Bucket?: string }) => item?.Bucket)
      .filter((bucket: string | undefined): bucket is string => Boolean(bucket)),
  );
  const missingBuckets = resourceIds.filter((resourceId) => !existingBuckets.has(resourceId));

  if (missingBuckets.length === 0) {
    return;
  }

  if (missingBuckets.length === 1) {
    throw new Error(`存储 Bucket ${missingBuckets[0]} 不存在`);
  }

  throw new Error(`以下存储 Bucket 不存在: ${missingBuckets.join(", ")}`);
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
            if (resourceType === "storage") {
              await ensureStorageBucketsExist(cloudbase, [resourceId]);
            }
            const result = await cloudbase.permission.describeResourcePermission({
              resourceType: mapResourceType(resourceType),
              resources: [resourceId],
            });
            logCloudBaseResult(server.logger, result);
            const permissions = result.Data.PermissionList ?? [];
            const matchedPermission =
              permissions.find((item) => item.Resource === resourceId) ?? permissions[0];
            const securityRule =
              matchedPermission?.SecurityRule;
            const hints = buildPermissionHints(securityRule, resourceId);
            return buildEnvelope(
              {
                action,
                envId,
                resourceType,
                resourceId,
                aclTag: matchedPermission?.Permission,
                permissions,
                hints,
                raw: result,
              },
              "资源权限查询成功",
            );
          }
          case "listResourcePermissions": {
            if (!resourceType) {
              throw new Error("action=listResourcePermissions 时必须提供 resourceType");
            }
            if (resourceType === "storage" && resourceIds?.length) {
              await ensureStorageBucketsExist(cloudbase, resourceIds);
            }
            const result = await cloudbase.permission.describeResourcePermission({
              resourceType: mapResourceType(resourceType),
              resources: resourceIds,
            });
            logCloudBaseResult(server.logger, result);
            const permissions = result.Data.PermissionList ?? [];
            const resourceHints = permissions
              .map((item) => ({
                resourceId: item.Resource ?? "",
                permission: item.Permission,
                hints:
                  item.Permission === "CUSTOM" && item.Resource
                    ? buildPermissionHints(item.SecurityRule, item.Resource)
                    : [],
              }))
              .filter((item) => item.resourceId && item.hints.length > 0);
            return buildEnvelope(
              {
                action,
                envId,
                resourceType,
                permissions,
                resourceHints,
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
      description:
        "权限域统一写入口。支持修改资源权限、角色管理、成员与策略增删、应用用户 CRUD。`createUser` / `updateUser` 是环境侧应用用户管理能力，适合测试账号、管理员或预置用户，不应替代浏览器里的 Web SDK 注册表单；前端用户名密码注册应使用 `auth.signUp({ username, password })`，登录应使用 `auth.signInWithPassword({ username, password })`。注意：`securityRule` 的详细语义取决于 `resourceType`；`doc._openid`、`auth.openid`、查询条件子集校验，以及 `create` / `update` / `delete` JSON 模板仅适用于 `resourceType=\"noSqlDatabase\"` 的文档数据库安全规则。配置 `function` 或 `storage` 时，请参考各自官方安全规则文档，而不是复用 NoSQL 模板。",
      inputSchema: {
        action: z.enum(MANAGE_PERMISSION_ACTIONS),
        resourceType: z
          .enum(["noSqlDatabase", "sqlDatabase", "function", "storage"])
          .optional()
          .describe("目标资源类型。`securityRule` 的具体语义依赖这个值；`noSqlDatabase` 使用集合安全规则，`function` 与 `storage` 也有各自独立的安全规则语义，不要套用 NoSQL 规则语法。"),
        resourceId: z.string().optional(),
        permission: z
          .enum(["READONLY", "PRIVATE", "ADMINWRITE", "ADMINONLY", "CUSTOM"])
          .optional(),
        securityRule: z
          .string()
          .optional()
          .describe(
            "资源类型特定的规则内容，详细语义依赖 `resourceType`。当 `resourceType=\"noSqlDatabase\"` 且 `permission=\"CUSTOM\"` 时，应传文档数据库安全规则 JSON（文档型数据库规则：`https://docs.cloudbase.net/database/security-rules`）；键通常为 `read` / `create` / `update` / `delete`，值为表达式。" +
              "重要：`create` 规则验证写入数据，此时文档尚不存在，不能使用 `doc.*`；`read` / `update` / `delete` 规则可使用 `doc.*` 引用已有文档字段。" +
              "不要把 `doc._openid`、`auth.openid`、查询条件子集校验或 `create` / `update` / `delete` 模板误用于 `function`、`storage` 或 `sqlDatabase`。" +
              '如需配置 `function` 或 `storage`，请改查官方安全规则文档：云函数 `https://docs.cloudbase.net/cloud-function/security-rules`，云存储 `https://docs.cloudbase.net/storage/security-rules`。示例：{"read":"auth.uid != null","create":"auth.uid != null && auth.loginType != "ANONYMOUS"","update":"auth.uid != null && doc._openid == auth.openid","delete":"auth.uid != null && doc._openid == auth.openid"}',
          ),
        roleId: z.string().optional(),
        roleIds: z.array(z.string()).optional(),
        roleName: z.string().optional(),
        roleIdentity: z.string().optional(),
        description: z.string().optional(),
        memberUids: z.array(z.string()).optional(),
        policies: z.array(z.record(z.any())).optional(),
        uid: z.string().optional(),
        uids: z.array(z.string()).optional(),
        username: z
          .string()
          .optional()
          .describe("用户名。`action=createUser` 时必填。"),
        password: z
          .string()
          .optional()
          .describe("密码。`action=createUser` 时必填。"),
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
            const hints = permission === "CUSTOM" ? buildPermissionHints(securityRule, resourceId) : [];
            return buildEnvelope(
              {
                action,
                envId,
                resourceType,
                resourceId,
                permission,
                hints,
                verificationHint:
                  resourceType === "noSqlDatabase" && permission === "CUSTOM"
                    ? buildWriteVerificationHint(resourceId)
                    : undefined,
                propagationHint:
                  resourceType === "noSqlDatabase" && permission === "CUSTOM"
                    ? buildPermissionPropagationHint(resourceId)
                    : undefined,
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
