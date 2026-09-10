import { z } from "zod";
import { getCloudBaseManager, getEnvId, logCloudBaseResult } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";
import { t } from "../i18n/index.js";

const QUERY_PERMISSION_ACTIONS = [
  "getResourcePermission",
  "listResourcePermissions",
  "listRoles",
  "getRole",
  "listUsers",
  "getUser",
  // Align with CLI `tcb policy list/get` (OPA gateway authz)
  "listPolicy",
  "getPolicy",
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
  // Align with CLI `tcb policy set` (OPA Rego; disables legacy gateway auth)
  "setPolicy",
] as const;

/** Keys accepted by Manager SDK describeEnvAuthzConfig / modifyEnvAuthzConfig. */
const AUTHZ_USER_REGO_KEY = "authz.user.rego" as const;
const AUTHZ_PLATFORM_EXTENSION_REGO_KEY = "authz.platform.extension.rego" as const;
type AuthzConfigKey = typeof AUTHZ_USER_REGO_KEY | typeof AUTHZ_PLATFORM_EXTENSION_REGO_KEY;

/** CLI `tcb policy list --resource-type` only documents `policy`. */
const POLICY_LIST_RESOURCE_TYPES = ["policy"] as const;

type QueryPermissionAction = (typeof QUERY_PERMISSION_ACTIONS)[number];
type ManagePermissionAction = (typeof MANAGE_PERMISSION_ACTIONS)[number];
type LegacyResourceType = "noSqlDatabase" | "sqlDatabase" | "function" | "storage";

type ToolEnvelope = {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
};

function buildWriteVerificationHint(resourceId: string) {
  return t("permissions.writeVerificationHint", { resourceId });
}

function buildPermissionPropagationHint(resourceId: string) {
  return t("permissions.permissionPropagationHint", { resourceId });
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

/**
 * Platform ModifyResourcePermission / DescribeResourcePermission reject PG envs.
 * CLI migrated `tcb permission` → `tcb policy` (OPA Rego via
 * permission.modifyEnvAuthzConfig / describeEnvAuthzConfig).
 */
function isPostgresqlPermissionApiUnsupported(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /does not support PostgreSQL type environments/i.test(message);
}

function looksLikeUserRego(value: string): boolean {
  return /^\s*package\s+authz\.user\b/m.test(value);
}

/**
 * Validate user Rego before setPolicy / modifyEnvAuthzConfig.
 * Aligns with CLI docs (must start with `package authz.user`) and CLI non-empty check.
 * Does not run a full OPA compiler; backend still owns deep syntax validation.
 */
export function validateUserRegoContent(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(t("permissions.validateRegoEmpty"));
  }
  const trimmed = value.trim();
  if (!looksLikeUserRego(trimmed)) {
    throw new Error(t("permissions.validateRegoPackage"));
  }
  const open = (trimmed.match(/\{/g) || []).length;
  const close = (trimmed.match(/\}/g) || []).length;
  if (open !== close) {
    throw new Error(
      t("permissions.validateRegoBraces", { open, close }),
    );
  }
  return trimmed;
}

function resolveAuthzConfigKey(extension?: boolean): AuthzConfigKey {
  return extension ? AUTHZ_PLATFORM_EXTENSION_REGO_KEY : AUTHZ_USER_REGO_KEY;
}

/** Detect legacy function securityRule shapes that mean "public invoke". */
function isPublicFunctionInvokeRule(securityRule: string | undefined): boolean {
  if (!securityRule || securityRule.trim() === "") {
    return false;
  }
  const trimmed = securityRule.trim();
  if (trimmed === "true") {
    return true;
  }
  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (parsed === true || parsed === "true") {
      return true;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return false;
    }
    const obj = parsed as Record<string, unknown>;
    if (obj.invoke === true || obj.invoke === "true") {
      return true;
    }
    for (const value of Object.values(obj)) {
      if (
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        ((value as { invoke?: unknown }).invoke === true ||
          (value as { invoke?: unknown }).invoke === "true")
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Build a CLI-aligned user Rego that opens cloud-function access for
 * anonymous + unauthenticated callers (tcb policy set example + HTTP no-token).
 */
function buildPublicFunctionsUserRego(resourceId: string): string {
  const comment =
    resourceId && resourceId !== "*"
      ? `# Public HTTP/API access for function ${resourceId} (aligned with tcb policy set)`
      : `# Public HTTP/API access for cloud functions (aligned with tcb policy set)`;
  return [
    "package authz.user",
    "",
    "default allow := false",
    "",
    comment,
    "allow if {",
    '  input.cloudbase.resource_type == "functions"',
    '  input.subject.auth_type in {"anonymous", "unauthenticated"}',
    "}",
    "",
  ].join("\n");
}

function resolveFunctionAuthzRegoInput(
  securityRule: string | undefined,
  resourceId: string,
): string {
  if (securityRule && looksLikeUserRego(securityRule)) {
    return securityRule;
  }
  if (isPublicFunctionInvokeRule(securityRule)) {
    return buildPublicFunctionsUserRego(resourceId);
  }
  throw new Error(t("permissions.regoInputRequired"));
}

async function describeEnvAuthzConfigByKey(
  cloudbase: any,
  key: AuthzConfigKey = AUTHZ_USER_REGO_KEY,
): Promise<{ key: AuthzConfigKey; value: string; raw: unknown }> {
  if (!cloudbase?.permission?.describeEnvAuthzConfig) {
    throw new Error(t("permissions.managerNoDescribeEnvAuthz"));
  }
  const result = await cloudbase.permission.describeEnvAuthzConfig({ key });
  const value =
    typeof result?.Item?.Value === "string"
      ? result.Item.Value
      : typeof result?.Value === "string"
        ? result.Value
        : "";
  return { key, value, raw: result };
}

async function describeEnvAuthzUserRego(
  cloudbase: any,
): Promise<{ value: string; raw: unknown }> {
  const result = await describeEnvAuthzConfigByKey(cloudbase, AUTHZ_USER_REGO_KEY);
  return { value: result.value, raw: result.raw };
}

async function modifyEnvAuthzUserRego(
  cloudbase: any,
  value: string,
): Promise<unknown> {
  if (!cloudbase?.permission?.modifyEnvAuthzConfig) {
    throw new Error(t("permissions.managerNoModifyEnvAuthz"));
  }
  const validated = validateUserRegoContent(value);
  return cloudbase.permission.modifyEnvAuthzConfig({
    key: AUTHZ_USER_REGO_KEY,
    value: validated,
  });
}

async function describeResourcePolicyListAligned(
  cloudbase: any,
  policyResourceType?: (typeof POLICY_LIST_RESOURCE_TYPES)[number],
): Promise<unknown> {
  if (!cloudbase?.permission?.describeResourcePolicyList) {
    throw new Error(t("permissions.managerNoDescribeResourcePolicyList"));
  }
  return cloudbase.permission.describeResourcePolicyList(
    policyResourceType ? { resourceType: policyResourceType } : undefined,
  );
}

async function describeResourcePermissionWithFunctionPgFallback(options: {
  cloudbase: any;
  envId: string;
  resourceType: LegacyResourceType;
  resources?: string[];
}): Promise<{
  Data: {
    TotalCount: number;
    PermissionList: Array<{
      ResourceType: string;
      Resource: string;
      Permission: string;
      SecurityRule?: string;
    }>;
  };
  RequestId?: string;
  fallback?: "describeEnvAuthzConfig";
  raw?: unknown;
}> {
  const { cloudbase, envId, resourceType, resources } = options;
  try {
    const result = await cloudbase.permission.describeResourcePermission({
      resourceType: mapResourceType(resourceType),
      resources,
    });
    return result;
  } catch (error) {
    if (resourceType !== "function" || !isPostgresqlPermissionApiUnsupported(error)) {
      throw error;
    }
    const fallback = await describeEnvAuthzUserRego(cloudbase);
    const targets =
      resources && resources.length > 0 ? resources : ["*"];
    const permissionList = targets.map((resourceId) => ({
      ResourceType: "function",
      Resource: resourceId,
      Permission: "CUSTOM" as const,
      SecurityRule: fallback.value || "",
    }));
    return {
      Data: {
        TotalCount: permissionList.length,
        PermissionList: permissionList,
      },
      RequestId: (fallback.raw as { RequestId?: string } | undefined)?.RequestId,
      fallback: "describeEnvAuthzConfig",
      raw: fallback.raw,
    };
  }
}

async function modifyFunctionPermissionWithPgFallback(options: {
  cloudbase: any;
  envId: string;
  resourceId: string;
  permission: "READONLY" | "PRIVATE" | "ADMINWRITE" | "ADMINONLY" | "CUSTOM";
  securityRule?: string;
}): Promise<{ result: unknown; fallback?: "modifyEnvAuthzConfig"; rego?: string }> {
  const { cloudbase, resourceId, permission, securityRule } = options;
  try {
    const result = await cloudbase.permission.modifyResourcePermission({
      resourceType: "function",
      resource: resourceId,
      permission,
      securityRule,
    });
    return { result };
  } catch (error) {
    if (!isPostgresqlPermissionApiUnsupported(error)) {
      throw error;
    }
    if (permission !== "CUSTOM") {
      throw new Error(
        t("permissions.pgModifyUnsupported", {
          message: error instanceof Error ? error.message : String(error),
        }),
      );
    }
    const rego = resolveFunctionAuthzRegoInput(securityRule, resourceId);
    const result = await modifyEnvAuthzUserRego(cloudbase, rego);
    return { result, fallback: "modifyEnvAuthzConfig", rego };
  }
}

function normalizeRecordArray(value: unknown, label: string) {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error(t("permissions.mustBeArray", { label }));
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
  return t("permissions.roleLookupNote");
}

function buildRecommendedClientWritePattern(resourceId: string) {
  return t("permissions.recommendedClientWritePattern", { resourceId });
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
    summary: t("permissions.createRuleSummary"),
    detail: t("permissions.createRuleDetail"),
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
    summary: t("permissions.docIdWriteSummary"),
    detail: t("permissions.docIdWriteDetail"),
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
    summary: t("permissions.invalidGetPathSummary"),
    detail: t("permissions.invalidGetPathDetail"),
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
    summary: t("permissions.templateLiteralSummary"),
    detail: t("permissions.templateLiteralDetail"),
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
    throw new Error(t("permissions.bucketMissing", { bucket: missingBuckets[0] }));
  }

  throw new Error(t("permissions.bucketsMissing", { buckets: missingBuckets.join(", ") }));
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
      title: "permissions.queryTitle",
      description: "permissions.queryDescription",
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
        extension: z
          .boolean()
          .optional()
          .describe(
            "仅 action=getPolicy。true=读取平台为该环境单独配置的策略（authz.platform.extension.rego），默认 false=用户策略（authz.user.rego），对齐 CLI `tcb policy get --extension`。",
          ),
        policyResourceType: z
          .enum(POLICY_LIST_RESOURCE_TYPES)
          .optional()
          .describe(
            "仅 action=listPolicy。按资源类型过滤，当前仅支持 `policy`，对齐 CLI `tcb policy list --resource-type policy`。",
          ),
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
      extension,
      policyResourceType,
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
      extension?: boolean;
      policyResourceType?: (typeof POLICY_LIST_RESOURCE_TYPES)[number];
    }) =>
      withEnvelope(async () => {
        const envId = await getEnvId(cloudBaseOptions);
        const cloudbase = await getManager();

        switch (action) {
          case "getResourcePermission": {
            if (!resourceType || !resourceId) {
              throw new Error(t("permissions.getResourcePermissionParamsRequired"));
            }
            if (resourceType === "storage") {
              await ensureStorageBucketsExist(cloudbase, [resourceId]);
            }
            const result = await describeResourcePermissionWithFunctionPgFallback({
              cloudbase,
              envId,
              resourceType,
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
                ...(result.fallback ? { fallback: result.fallback } : {}),
                raw: result.raw ?? result,
              },
              result.fallback
                ? t("permissions.getResourcePermissionFallbackSuccess")
                : t("permissions.getResourcePermissionSuccess"),
            );
          }
          case "listResourcePermissions": {
            if (!resourceType) {
              throw new Error(
                t("permissions.paramRequired", { action, param: "resourceType" }),
              );
            }
            if (resourceType === "storage" && resourceIds?.length) {
              await ensureStorageBucketsExist(cloudbase, resourceIds);
            }
            const result = await describeResourcePermissionWithFunctionPgFallback({
              cloudbase,
              envId,
              resourceType,
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
                ...(result.fallback ? { fallback: result.fallback } : {}),
                raw: result.raw ?? result,
              },
              result.fallback
                ? t("permissions.listResourcePermissionsFallbackSuccess")
                : t("permissions.listResourcePermissionsSuccess"),
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
              t("permissions.listRolesSuccess"),
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
              t("permissions.getRoleSuccess"),
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
              t("permissions.listUsersSuccess"),
            );
          }
          case "getUser": {
            if (!uid && !username) {
              throw new Error(t("permissions.getUserParamsRequired"));
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
              t("permissions.getUserSuccess"),
            );
          }
          case "listPolicy": {
            const result = await describeResourcePolicyListAligned(
              cloudbase,
              policyResourceType,
            );
            logCloudBaseResult(server.logger, result);
            const data = (result as { Data?: { PolicyList?: unknown[]; Total?: string | number } })
              ?.Data;
            const policyList = data?.PolicyList ?? [];
            const total = data?.Total ?? policyList.length;
            return buildEnvelope(
              {
                action,
                envId,
                policyResourceType: policyResourceType ?? null,
                policies: policyList,
                total,
                note:
                  t("permissions.listPolicyNote"),
                raw: result,
              },
              t("permissions.listPolicySuccess"),
            );
          }
          case "getPolicy": {
            const key = resolveAuthzConfigKey(extension);
            const result = await describeEnvAuthzConfigByKey(cloudbase, key);
            logCloudBaseResult(server.logger, result.raw);
            return buildEnvelope(
              {
                action,
                envId,
                key: result.key,
                extension: Boolean(extension),
                rego: result.value,
                raw: result.raw,
              },
              extension
                ? t("permissions.getPolicyExtensionSuccess")
                : t("permissions.getPolicySuccess"),
            );
          }
        }
      }),
  );

  server.registerTool?.(
    "managePermissions",
    {
      title: "permissions.manageTitle",
      description: "permissions.manageDescription",
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
        roleIdentity: z.string().optional().describe("角色标识符（字母/数字/_-:@.），action=createRole 时必填，用于程序化引用角色"),
        description: z.string().optional(),
        memberUids: z.array(z.string()).optional(),
        policies: z.array(z.record(z.any())).optional(),
        policyIds: z.array(z.string()).optional().describe("策略 ID 列表（当前不支持直接按 ID 绑定，请改传 policies 详情对象）"),
        uid: z.string().optional(),
        uids: z.array(z.string()).optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        userStatus: z.enum(["ACTIVE", "BLOCKED"]).optional(),
        regoContent: z
          .string()
          .optional()
          .describe(
            "仅 action=setPolicy。用户 OPA Rego 全文，必须以 `package authz.user` 开头，对齐 CLI `tcb policy set <regoContent>`。",
          ),
        confirm: z
          .boolean()
          .optional()
          .describe(
            "仅 action=setPolicy。设置 Rego 后会立即禁用旧网关鉴权，必须显式传 confirm=true（对齐 CLI 确认提示）。",
          ),
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
      policyIds,
      uid,
      uids,
      username,
      password,
      userStatus,
      regoContent,
      confirm,
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
      policyIds?: string[];
      uid?: string;
      uids?: string[];
      username?: string;
      password?: string;
      userStatus?: "ACTIVE" | "BLOCKED";
      regoContent?: string;
      confirm?: boolean;
    }) =>
      withEnvelope(async () => {
        const envId = await getEnvId(cloudBaseOptions);
        const cloudbase = await getManager();
        const normalizedPolicies = normalizeRecordArray(policies, "policies");

        switch (action) {
          case "updateResourcePermission": {
            if (!resourceType || !resourceId || !permission) {
              throw new Error(t("permissions.updateResourcePermissionParamsRequired"));
            }
            let result: unknown;
            let fallback: "modifyEnvAuthzConfig" | undefined;
            let appliedRego: string | undefined;
            if (resourceType === "function") {
              const updated = await modifyFunctionPermissionWithPgFallback({
                cloudbase,
                envId,
                resourceId,
                permission,
                securityRule,
              });
              result = updated.result;
              fallback = updated.fallback;
              appliedRego = updated.rego;
            } else {
              result = await cloudbase.permission.modifyResourcePermission({
                resourceType: mapResourceType(resourceType),
                resource: resourceId,
                permission,
                securityRule,
              });
            }
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
                ...(fallback ? { fallback } : {}),
                ...(appliedRego ? { rego: appliedRego } : {}),
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
              fallback
                ? t("permissions.updateResourcePermissionFallbackSuccess")
                : t("permissions.updateResourcePermissionSuccess"),
            );
          }
          case "createRole": {
            if (!roleName || !roleIdentity) {
              throw new Error(t("permissions.createRoleParamsRequired"));
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
              t("permissions.createRoleSuccess"),
            );
          }
          case "updateRole":
          case "addRoleMembers":
          case "removeRoleMembers":
          case "addRolePolicies":
          case "removeRolePolicies": {
            if (!roleId) {
              throw new Error(
                t("permissions.paramRequired", { action, param: "roleId" }),
              );
            }

            if (action === "addRolePolicies" || action === "removeRolePolicies") {
              if (policyIds?.length) {
                throw new Error(
                  t("permissions.policyIdsUnsupported", { action }),
                );
              }
              if (!normalizedPolicies?.length) {
                throw new Error(
                  t("permissions.policiesRequired", { action }),
                );
              }
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
              t("permissions.updateRoleSuccess"),
            );
          }
          case "deleteRoles": {
            if (!roleIds?.length) {
              throw new Error(
                t("permissions.paramRequired", { action, param: "roleIds" }),
              );
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
              t("permissions.deleteRolesSuccess"),
            );
          }
          case "createUser": {
            if (!username || !password) {
              throw new Error(t("permissions.createUserParamsRequired"));
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
              t("permissions.createUserSuccess"),
            );
          }
          case "updateUser": {
            if (!uid) {
              throw new Error(
                t("permissions.paramRequired", { action, param: "uid" }),
              );
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
              t("permissions.updateUserSuccess"),
            );
          }
          case "deleteUsers": {
            if (!uids?.length) {
              throw new Error(
                t("permissions.paramRequired", { action, param: "uids" }),
              );
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
              t("permissions.deleteUsersSuccess"),
            );
          }
          case "setPolicy": {
            if (confirm !== true) {
              throw new Error(t("permissions.setPolicyConfirmRequired"));
            }
            const validated = validateUserRegoContent(regoContent ?? "");
            const result = await modifyEnvAuthzUserRego(cloudbase, validated);
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                key: AUTHZ_USER_REGO_KEY,
                rego: validated,
                sideEffect: t("permissions.setPolicySideEffect"),
                nextSteps: [
                  'queryPermissions(action="getPolicy")',
                  'queryPermissions(action="listPolicy")',
                ],
                raw: result,
              },
              t("permissions.setPolicySuccess"),
            );
          }
        }
      }),
  );
}
