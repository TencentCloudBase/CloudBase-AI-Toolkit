/**
 * CloudBase MCP 结构化错误码登记表 —— 唯一真源。
 *
 * 新增码必须在这里登记；CI 的 check:error-codes 会拦未登记的裸字面量。
 * 存量码保持原字面量不改；category 用于遥测聚合与分类，note 写清判据。
 * STATUS_CODES 是成功 / 中间态，不是错误码，不计入失败统计。
 * 云 API 透传码标 origin: cloud_api，原样保留、豁免命名规则。
 *
 * 7 类判据：invalid_argument 改参数可重试；not_found 资源不存在；
 * permission 凭据或授权不足；precondition 环境或资源状态不满足；
 * action_required 需使用者确认 / 换凭据 / 开服务；unavailable 外部依赖或配额超时；
 * internal 服务端执行失败。
 */

export const ERROR_CATEGORIES = [
  "invalid_argument",
  "not_found",
  "permission",
  "precondition",
  "action_required",
  "unavailable",
  "internal",
] as const;

export type ErrorCategory = (typeof ERROR_CATEGORIES)[number];
export type ErrorOrigin = "self" | "cloud_api";

export type ErrorEntry = {
  category: ErrorCategory;
  origin: ErrorOrigin;
  since: "legacy" | "next";
  note: string;
};

export const ERROR_CODES = {
  "ACTION_NOT_GRANTED": { category: "permission", origin: "self", since: "next", note: "凭据/权限 · 凭据或授权不足，改参数无效" },
  "API_KEY_AUTH_FAILED": { category: "permission", origin: "self", since: "legacy", note: "环境/登录 · 凭据或授权不足，改参数无效" },
  "AUTH_FAIL": { category: "permission", origin: "self", since: "legacy", note: "其他 / 环境/登录 · 凭据或授权不足，改参数无效" },
  "AUTH_REQUIRED": { category: "action_required", origin: "self", since: "legacy", note: "其他 / 环境/登录 · 需要使用者确认、换凭据或开通服务" },
  "AuthFailure.TokenFailure": { category: "permission", origin: "cloud_api", since: "legacy", note: "云 API · 凭据或授权不足，改参数无效" },
  "BUCKET_REQUIRED": { category: "invalid_argument", origin: "self", since: "legacy", note: "存储 · 参数或输入不符合要求，改参数可重试" },
  "BUILD_FAILED": { category: "internal", origin: "self", since: "legacy", note: "部署 · 服务端执行失败" },
  "BUILD_OUTPUT_NOT_FOUND": { category: "not_found", origin: "self", since: "legacy", note: "部署 · 目标资源不存在" },
  "CLOUD_MODE_ACTION_UNAVAILABLE": { category: "precondition", origin: "self", since: "legacy", note: "存储 · 环境或资源状态不满足" },
  "CLOUD_MODE_UNSUPPORTED_ACTION": { category: "precondition", origin: "self", since: "legacy", note: "应用 · 环境或资源状态不满足" },
  "CLOUD_REGISTRY_CREDENTIAL_INVALID": { category: "permission", origin: "self", since: "legacy", note: "部署 · 凭据或授权不足，改参数无效" },
  "CLOUD_REGISTRY_CREDENTIAL_MISSING": { category: "permission", origin: "self", since: "legacy", note: "部署 · 凭据或授权不足，改参数无效" },
  "CONFIG_INVALID": { category: "invalid_argument", origin: "self", since: "legacy", note: "部署 · 参数或输入不符合要求，改参数可重试" },
  "CONFIG_NOT_FOUND": { category: "not_found", origin: "self", since: "legacy", note: "部署 · 目标资源不存在" },
  "CONFIRM_REQUIRED": { category: "action_required", origin: "self", since: "legacy", note: "MySQL / PG / 函数/日志 / 消息推送 / 环境/登录 / 部署 · 需要使用者确认、换凭据或开通服务" },
  "CREDENTIAL_EXPIRED": { category: "action_required", origin: "self", since: "legacy", note: "PG · 需要使用者确认、换凭据或开通服务" },
  "CREDENTIAL_SCOPE_LIMITED": { category: "permission", origin: "self", since: "legacy", note: "环境/登录 · 凭据或授权不足，改参数无效" },
  "DDL_USE_APPLY_MIGRATION": { category: "invalid_argument", origin: "self", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "DEPENDENCY_NOT_INSTALLED": { category: "precondition", origin: "self", since: "legacy", note: "部署 · 环境或资源状态不满足" },
  "DEPLOY_FAILED": { category: "internal", origin: "self", since: "legacy", note: "部署 · 服务端执行失败" },
  "DEPLOY_TASK_EXPIRED": { category: "internal", origin: "self", since: "legacy", note: "部署 · 服务端执行失败" },
  "DEPLOY_TASK_NOT_FOUND": { category: "not_found", origin: "self", since: "legacy", note: "部署 · 目标资源不存在" },
  "DESTRUCTIVE_CONFIRM_REQUIRED": { category: "action_required", origin: "self", since: "legacy", note: "部署 · 需要使用者确认、换凭据或开通服务" },
  "DOMAINS_REQUIRED": { category: "invalid_argument", origin: "self", since: "legacy", note: "环境/登录 · 参数或输入不符合要求，改参数可重试" },
  "ENV_REQUIRED": { category: "action_required", origin: "self", since: "legacy", note: "环境/登录 · 需要使用者确认、换凭据或开通服务" },
  "ENV_UNRESOLVED": { category: "action_required", origin: "self", since: "legacy", note: "部署 · 需要使用者确认、换凭据或开通服务" },
  "EXCEED_REQUEST_LIMIT": { category: "unavailable", origin: "cloud_api", since: "legacy", note: "云 API · 外部依赖、网络、配额或超时" },
  "FUNCTION_LOG_QUERY_FAILED": { category: "internal", origin: "self", since: "legacy", note: "函数/日志 · 服务端执行失败" },
  "FUNCTION_NOT_FOUND": { category: "not_found", origin: "self", since: "legacy", note: "消息推送 · 目标资源不存在" },
  "FUNCTION_UPDATING": { category: "precondition", origin: "self", since: "legacy", note: "部署 · 环境或资源状态不满足" },
  "FUNCTION_UPLOAD_TARGET_NOT_FOUND": { category: "not_found", origin: "self", since: "legacy", note: "函数/日志 · 目标资源不存在" },
  "FailedOperation.DataSourceNotExist": { category: "not_found", origin: "cloud_api", since: "legacy", note: "MySQL · 目标资源不存在" },
  "FailedOperation.InstanceStatusConflict": { category: "precondition", origin: "cloud_api", since: "legacy", note: "PG · 环境或资源状态不满足" },
  "FailedOperation.OperationTimeout": { category: "unavailable", origin: "cloud_api", since: "legacy", note: "PG · 外部依赖、网络、配额或超时" },
  "FailedOperation.PGConnectError": { category: "unavailable", origin: "cloud_api", since: "legacy", note: "PG · 外部依赖、网络、配额或超时" },
  "FailedOperation.PGExecuteSqlError": { category: "invalid_argument", origin: "cloud_api", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "FailedOperation.PGResultTooLarge": { category: "invalid_argument", origin: "cloud_api", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "INTERNAL_ERROR": { category: "internal", origin: "self", since: "legacy", note: "环境/登录 · 服务端执行失败" },
  "INVALID_ACTION": { category: "invalid_argument", origin: "self", since: "legacy", note: "环境/登录 · 参数或输入不符合要求，改参数可重试" },
  "INVALID_ARGS": { category: "invalid_argument", origin: "self", since: "legacy", note: "环境/登录 · 参数或输入不符合要求，改参数可重试" },
  "INVALID_CONCURRENCY": { category: "invalid_argument", origin: "self", since: "legacy", note: "部署 · 参数或输入不符合要求，改参数可重试" },
  "INVALID_EVENT_TYPE": { category: "invalid_argument", origin: "self", since: "legacy", note: "消息推送 · 参数或输入不符合要求，改参数可重试" },
  "INVALID_MSG_TYPE": { category: "invalid_argument", origin: "self", since: "legacy", note: "消息推送 · 参数或输入不符合要求，改参数可重试" },
  "InsufficientBalance": { category: "precondition", origin: "cloud_api", since: "legacy", note: "云 API · 环境或资源状态不满足" },
  "InternalError.GetRoleError": { category: "permission", origin: "cloud_api", since: "legacy", note: "其他 / 环境/登录 · 凭据或授权不足，改参数无效" },
  "InvalidParameter.Cls": { category: "invalid_argument", origin: "cloud_api", since: "legacy", note: "函数/日志 · 参数或输入不符合要求，改参数可重试" },
  "LOCAL_ENDPOINT_UNAVAILABLE": { category: "unavailable", origin: "self", since: "legacy", note: "环境/登录 · 外部依赖、网络、配额或超时" },
  "LOCAL_MIGRATION_FETCH_EMPTY_QUERY": { category: "internal", origin: "self", since: "legacy", note: "PG · 服务端执行失败" },
  "LOCAL_MIGRATION_FETCH_INVALID_NAME": { category: "invalid_argument", origin: "self", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "LOCAL_MIGRATION_FETCH_INVALID_VERSION": { category: "invalid_argument", origin: "self", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "LOCAL_MIGRATION_FILE_MISMATCH": { category: "invalid_argument", origin: "self", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "LOCAL_MIGRATION_FILE_WRITE_FAILED": { category: "internal", origin: "self", since: "legacy", note: "PG · 服务端执行失败" },
  "LOGOUT_NOT_ALLOWED": { category: "permission", origin: "self", since: "legacy", note: "环境/登录 · 凭据或授权不足，改参数无效" },
  "LOG_SERVICE_NOT_ENABLED": { category: "action_required", origin: "self", since: "legacy", note: "函数/日志 · 需要使用者确认、换凭据或开通服务" },
  "MIGRATION_API_ERROR": { category: "internal", origin: "self", since: "legacy", note: "PG · 服务端执行失败" },
  "MIGRATION_NAME_INVALID": { category: "invalid_argument", origin: "self", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "MIGRATION_NAME_REQUIRED": { category: "invalid_argument", origin: "self", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "MIGRATION_NOT_APPLIED": { category: "precondition", origin: "self", since: "legacy", note: "PG · 环境或资源状态不满足" },
  "MIGRATION_NOT_EXECUTABLE": { category: "precondition", origin: "self", since: "legacy", note: "PG · 环境或资源状态不满足" },
  "MIGRATION_TASK_FAILED": { category: "internal", origin: "self", since: "legacy", note: "PG · 服务端执行失败" },
  "MIGRATION_TASK_PENDING": { category: "unavailable", origin: "self", since: "legacy", note: "PG · 外部依赖、网络、配额或超时" },
  "MIGRATION_TASK_TIMEOUT": { category: "unavailable", origin: "self", since: "legacy", note: "PG · 外部依赖、网络、配额或超时" },
  "MIGRATION_VERIFICATION_FAILED": { category: "internal", origin: "self", since: "legacy", note: "PG · 服务端执行失败" },
  "MIGRATION_VERSION_INVALID": { category: "invalid_argument", origin: "self", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "MIGRATION_VERSION_REQUIRED": { category: "invalid_argument", origin: "self", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "MISSING_VPC_FOR_DB_ENV": { category: "precondition", origin: "self", since: "legacy", note: "云托管 · 环境或资源状态不满足" },
  "MSG_PUSH_TRANSPORT_UNAVAILABLE": { category: "unavailable", origin: "self", since: "legacy", note: "消息推送 · 外部依赖、网络、配额或超时" },
  "MYSQL_DESTROY_REJECTED": { category: "precondition", origin: "self", since: "legacy", note: "MySQL · 环境或资源状态不满足" },
  "MYSQL_INSTANCE_ID_REQUIRED": { category: "invalid_argument", origin: "self", since: "legacy", note: "MySQL · 参数或输入不符合要求，改参数可重试" },
  "MYSQL_NOT_AVAILABLE": { category: "precondition", origin: "self", since: "legacy", note: "MySQL · 环境或资源状态不满足" },
  "MYSQL_NOT_CREATED": { category: "precondition", origin: "self", since: "legacy", note: "MySQL · 环境或资源状态不满足" },
  "MYSQL_NOT_READY": { category: "precondition", origin: "self", since: "legacy", note: "MySQL · 环境或资源状态不满足" },
  "MYSQL_PROVISION_FAILED": { category: "internal", origin: "self", since: "legacy", note: "MySQL · 服务端执行失败" },
  "MYSQL_TASK_FAILED": { category: "internal", origin: "self", since: "legacy", note: "MySQL · 服务端执行失败" },
  "NOT_SUPPORTED": { category: "precondition", origin: "self", since: "legacy", note: "环境/登录 · 环境或资源状态不满足" },
  "OBJECT_NOT_FOUND": { category: "not_found", origin: "self", since: "legacy", note: "PG · 目标资源不存在" },
  "PACKAGE_LIST_FAILED": { category: "internal", origin: "self", since: "legacy", note: "环境/登录 · 服务端执行失败" },
  "PG_NOT_PROVISIONED": { category: "precondition", origin: "self", since: "legacy", note: "PG · 环境或资源状态不满足" },
  "PG_NOT_READY": { category: "precondition", origin: "self", since: "legacy", note: "PG · 环境或资源状态不满足" },
  "PG_REALTIME_FAILED": { category: "internal", origin: "self", since: "legacy", note: "PG · 服务端执行失败" },
  "PG_ROLE_NOT_AVAILABLE": { category: "precondition", origin: "self", since: "legacy", note: "PG · 环境或资源状态不满足" },
  "PG_SQL_EXEC_FAILED": { category: "internal", origin: "self", since: "legacy", note: "PG · 服务端执行失败" },
  "QBASE_ERROR": { category: "internal", origin: "self", since: "legacy", note: "消息推送 · 服务端执行失败" },
  "READ_ONLY_SQL_REQUIRED": { category: "invalid_argument", origin: "self", since: "legacy", note: "MySQL / PG · 参数或输入不符合要求，改参数可重试" },
  "REALTIME_CONFIRM_REQUIRED": { category: "action_required", origin: "self", since: "legacy", note: "PG · 需要使用者确认、换凭据或开通服务" },
  "REPAIR_REASON_REQUIRED": { category: "invalid_argument", origin: "self", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "REPAIR_STATUS_REQUIRED": { category: "invalid_argument", origin: "self", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "ResourceNotFound.RoleNotFound": { category: "not_found", origin: "cloud_api", since: "legacy", note: "PG · 目标资源不存在" },
  "SCHEMA_INITIALIZATION_FAILED": { category: "internal", origin: "self", since: "legacy", note: "MySQL · 服务端执行失败" },
  "SCHEMA_QUALIFIED_NAME_REQUIRED": { category: "invalid_argument", origin: "self", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "SIGNED_URL_NOT_DEFAULT": { category: "precondition", origin: "self", since: "legacy", note: "存储 · 环境或资源状态不满足" },
  "SQL_REQUIRED": { category: "invalid_argument", origin: "self", since: "legacy", note: "MySQL / PG · 参数或输入不符合要求，改参数可重试" },
  "STATEMENTS_REQUIRED": { category: "invalid_argument", origin: "self", since: "legacy", note: "MySQL · 参数或输入不符合要求，改参数可重试" },
  "STORAGE_NOT_SUPPORTED": { category: "precondition", origin: "self", since: "legacy", note: "存储 · 环境或资源状态不满足" },
  "TASK_ID_REQUIRED": { category: "invalid_argument", origin: "self", since: "legacy", note: "PG · 参数或输入不符合要求，改参数可重试" },
  "TOOL_UNAVAILABLE_IN_WXIDE": { category: "precondition", origin: "self", since: "legacy", note: "环境/登录 · 环境或资源状态不满足" },
  "TRIGGER_LIST_UNAVAILABLE": { category: "unavailable", origin: "self", since: "legacy", note: "函数/日志 · 外部依赖、网络、配额或超时" },
  "TRIGGER_REPLACE_BLOCKED": { category: "precondition", origin: "self", since: "legacy", note: "函数/日志 · 环境或资源状态不满足" },
  "UNKNOWN": { category: "internal", origin: "self", since: "legacy", note: "重复错误护栏 · 服务端执行失败" },
  "UNSUPPORTED_ACTION": { category: "invalid_argument", origin: "self", since: "legacy", note: "MySQL / PG / 函数/日志 / 存储 · 参数或输入不符合要求，改参数可重试" },
  "UNSUPPORTED_CREDENTIAL_TYPE": { category: "permission", origin: "self", since: "legacy", note: "环境/登录 · 凭据或授权不足，改参数无效" },
  "VERSION_CONFLICT": { category: "precondition", origin: "self", since: "legacy", note: "消息推送 · 环境或资源状态不满足" },
} as const satisfies Record<string, ErrorEntry>;

/** 成功 / 中间态取值，不计入失败统计。 */
export const STATUS_CODES = {
  "AUTH_PENDING": { note: "其他 / 环境/登录 · 成功或中间态" },
  "AUTH_READY": { note: "环境/登录 · 成功或中间态" },
  "CONTAINER_MODE_ACTIVE": { note: "消息推送 · 成功或中间态" },
  "DOMAIN_DELETE_PENDING": { note: "环境/登录 · 成功或中间态" },
  "DOMAIN_UPDATE_PENDING": { note: "环境/登录 · 成功或中间态" },
  "ENV_CREATED": { note: "环境/登录 · 成功或中间态" },
  "ENV_READY": { note: "环境/登录 · 成功或中间态" },
  "ENV_RENEWED": { note: "环境/登录 · 成功或中间态" },
  "LOGGED_OUT": { note: "环境/登录 · 成功或中间态" },
  "NO_CHANGE": { note: "消息推送 · 成功或中间态" },
  "PACKAGE_LIST": { note: "环境/登录 · 成功或中间态" },
  "PLAN_MODIFIED": { note: "环境/登录 · 成功或中间态" },
  "REALTIME_NO_CHANGES": { note: "PG · 成功或中间态" },
  "STATUS": { note: "环境/登录 · 成功或中间态" },
  "TEMP_CREDENTIALS_READY": { note: "环境/登录 · 成功或中间态" },
} as const satisfies Record<string, { note: string }>;

export function getErrorCategory(code: string): ErrorCategory | undefined {
  if (!Object.hasOwn(ERROR_CODES, code)) return undefined;
  return (ERROR_CODES as Record<string, ErrorEntry>)[code]?.category;
}

export function isActionRequired(code: string): boolean {
  return getErrorCategory(code) === "action_required";
}

export const ALL_ERROR_CODES: readonly string[] = Object.keys(ERROR_CODES);
