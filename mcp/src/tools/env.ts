import { AuthSupervisor } from "@cloudbase/toolbox";
import { z } from "zod";
import {
  buildAuthConfigSummary,
  buildDeviceAuthChallengePayload,
  buildVerificationUriComplete,
  ensureLogin,
  getAuthConfigValidationError,
  getAuthProgressState,
  logout,
  peekLoginState,
  rejectAuthProgressState,
  resolveAuthOptions,
  resolveAuthProgressState,
  setPendingAuthProgressState,
  type AuthOptions,
  type DeviceFlowAuthInfo,
} from "../auth.js";
import {
  envManager,
  getCachedEnvId,
  getCloudBaseManager,
  listAvailableEnvCandidates,
  logCloudBaseResult,
  resetCloudBaseManagerCache,
  type EnvCandidate,
} from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { debug } from "../utils/logger.js";
import {
  buildAuthNextStep,
  buildJsonToolResult,
  toolPayloadErrorToResult,
} from "../utils/tool-result.js";
import {
  checkAndCreateFreeEnv,
  checkAndInitTcbService,
  type EnvSetupContext,
} from "./env-setup.js";

/**
 * Simplify environment list data by keeping only essential fields for AI assistant
 * This reduces token consumption when returning environment lists via MCP tools
 * @param envList - Full environment list from API
 * @returns Simplified environment list with only essential fields
 */
export function simplifyEnvList(envList: any[]): any[] {
  if (!Array.isArray(envList)) {
    return envList;
  }

  return envList.map((env: any) => {
    // Only keep essential fields that are useful for AI assistant
    const simplified: any = {};
    
    if (env.EnvId !== undefined) simplified.EnvId = env.EnvId;
    if (env.Alias !== undefined) simplified.Alias = env.Alias;
    if (env.Status !== undefined) simplified.Status = env.Status;
    if (env.EnvType !== undefined) simplified.EnvType = env.EnvType;
    if (env.Region !== undefined) simplified.Region = env.Region;
    if (env.PackageId !== undefined) simplified.PackageId = env.PackageId;
    if (env.PackageName !== undefined) simplified.PackageName = env.PackageName;
    if (env.IsDefault !== undefined) simplified.IsDefault = env.IsDefault;
    
    return simplified;
  });
}

const DEFAULT_ENV_CANDIDATE_LIMIT = 20;
const DEFAULT_ENV_FIELDS = [
  "EnvId",
  "Alias",
  "Status",
  "EnvType",
  "Region",
  "PackageId",
  "PackageName",
  "IsDefault",
] as const;

type EnvFieldName = (typeof DEFAULT_ENV_FIELDS)[number];

function selectEnvFields(env: Record<string, any>, fields?: EnvFieldName[]) {
  const selectedFields = fields && fields.length > 0 ? fields : DEFAULT_ENV_FIELDS;
  const simplified: Record<string, any> = {};

  for (const field of selectedFields) {
    if (env[field] !== undefined) {
      simplified[field] = env[field];
    }
  }

  return simplified;
}

function filterEnvList(
  envList: Record<string, any>[],
  filters: { alias?: string; aliasExact?: boolean; envId?: string },
) {
  const alias = filters.alias?.trim().toLowerCase();
  const aliasExact = filters.aliasExact === true;
  const envId = filters.envId?.trim().toLowerCase();

  return envList.filter((env) => {
    const normalizedAlias = String(env.Alias ?? "").toLowerCase();
    const matchesAlias = alias
      ? aliasExact
        ? normalizedAlias === alias
        : normalizedAlias.includes(alias)
      : true;
    const matchesEnvId = envId
      ? String(env.EnvId ?? "").toLowerCase() === envId
      : true;

    return matchesAlias && matchesEnvId;
  });
}

function paginateEnvList(envList: Record<string, any>[], offset?: number, limit?: number) {
  const safeOffset = Math.max(0, Math.floor(offset ?? 0));
  const safeLimit = limit === undefined ? undefined : Math.max(1, Math.floor(limit));
  const items =
    safeLimit === undefined
      ? envList.slice(safeOffset)
      : envList.slice(safeOffset, safeOffset + safeLimit);

  return {
    total: envList.length,
    offset: safeOffset,
    limit: safeLimit ?? envList.length,
    items,
  };
}

function buildEnvCandidatePayload(
  envCandidates: EnvCandidate[],
  limit = DEFAULT_ENV_CANDIDATE_LIMIT,
) {
  const env_candidates = envCandidates.slice(0, limit);

  return {
    env_candidates,
    env_candidates_summary: {
      total: envCandidates.length,
      returned: env_candidates.length,
      truncated: envCandidates.length > env_candidates.length,
    },
  };
}

function buildLocalDevDomainHint() {
  return {
    format: "host:port",
    useActualOrigin: true,
    requiredValue: "当前浏览器实际访问 origin 对应的 host:port",
    deriveFrom: ["浏览器地址栏中的当前 origin", "本地 dev server 实际启动输出"],
    note:
      "如果你的前端运行在自定义域名或本地开发端口上，请把当前浏览器实际访问地址对应的 host:port 加入安全域名。不要依赖一组固定默认端口，也不要假设已有 localhost/127.0.0.1 条目已经覆盖当前运行端口。",
  };
}

function summarizeConfiguredLocalDevEntries(
  domains: Array<{ Domain?: unknown }>,
) {
  const localEntries = domains
    .map((domain) => String(domain?.Domain ?? "").trim())
    .filter((domain) => domain.startsWith("127.0.0.1:") || domain.startsWith("localhost:"));

  return {
    hasAnyConfiguredLocalEntry: localEntries.length > 0,
    configuredEntries: localEntries,
  };
}

function simplifyEnvDomains(domains: unknown) {
  if (!Array.isArray(domains)) {
    return domains;
  }

  return domains.map((domain) => {
    if (!domain || typeof domain !== "object") {
      return domain;
    }

    const source = domain as Record<string, unknown>;
    return {
      ...(source.Id !== undefined ? { Id: source.Id } : {}),
      ...(source.Domain !== undefined ? { Domain: source.Domain } : {}),
      ...(source.CreateTime !== undefined ? { CreateTime: source.CreateTime } : {}),
      ...(source.UpdateTime !== undefined ? { UpdateTime: source.UpdateTime } : {}),
      ...(source.Status !== undefined ? { Status: source.Status } : {}),
      ...(source.Type !== undefined ? { Type: source.Type } : {}),
    };
  });
}

function buildEnvDomainManagementResult(params: {
  action: "create" | "delete";
  domains: string[];
  result: unknown;
}) {
  const { action, domains, result } = params;
  const rawResult =
    result && typeof result === "object" && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : { result };

  if (action === "create") {
    return {
      ...rawResult,
      ok: true,
      code: "DOMAIN_UPDATE_PENDING",
      operation: action,
      targetDomains: domains,
      asyncState: "PENDING",
      message:
        '安全域名已提交添加请求。该变更通常需要约 10 分钟传播，请继续轮询 envQuery(action="domains")，直到目标域名状态为 ENABLE。',
      propagation: {
        requiresPolling: true,
        pollTool: "envQuery",
        pollAction: "domains",
        pollIntervalSuggestionSeconds: 10,
        timeoutSuggestionSeconds: 600,
        successCondition:
          '目标域名出现在 envQuery(action="domains") 返回中，且 Status 为 ENABLE。',
      },
      next_step: {
        tool: "envQuery",
        action: "domains",
        suggested_args: {
          action: "domains",
        },
      },
    };
  }

  return {
    ...rawResult,
    ok: true,
    code: "DOMAIN_DELETE_PENDING",
    operation: action,
    targetDomains: domains,
    asyncState: "PENDING",
    message:
      '安全域名已提交删除请求。该变更可能需要数分钟传播，请继续轮询 envQuery(action="domains")，直到目标域名不再出现。',
    propagation: {
      requiresPolling: true,
      pollTool: "envQuery",
      pollAction: "domains",
      pollIntervalSuggestionSeconds: 10,
      timeoutSuggestionSeconds: 600,
      successCondition:
        '目标域名不再出现在 envQuery(action="domains") 返回中。',
    },
    next_step: {
      tool: "envQuery",
      action: "domains",
      suggested_args: {
        action: "domains",
      },
    },
  };
}

function formatDeviceAuthHint(deviceAuthInfo?: DeviceFlowAuthInfo): string {
  if (!deviceAuthInfo) {
    return "";
  }

  const verificationUriComplete = buildVerificationUriComplete(deviceAuthInfo);
  const lines = [
    "",
    "### Device Flow 授权信息",
    `- user_code: ${deviceAuthInfo.user_code}`,
  ];

  if (deviceAuthInfo.verification_uri) {
    lines.push(`- verification_uri: ${deviceAuthInfo.verification_uri}`);
  }
  if (verificationUriComplete) {
    lines.push(`- verification_uri_complete: ${verificationUriComplete}`);
  }
  lines.push(`- expires_in: ${deviceAuthInfo.expires_in}s`);
  lines.push(
    "",
    "请优先向用户展示完整的 `verification_uri_complete`，不要截断或改写 URL。",
  );
  return lines.join("\n");
}

function emitDeviceAuthNotice(server: ExtendedMcpServer, deviceAuthInfo: DeviceFlowAuthInfo): void {
  // Temporarily disabled: avoid sending logging notifications for device auth
}

async function fetchAvailableEnvCandidates(
  cloudBaseOptions: any,
  server: ExtendedMcpServer,
): Promise<EnvCandidate[]> {
  try {
    return await listAvailableEnvCandidates({
      cloudBaseOptions,
    });
  } catch {
    return [];
  }
}

type AuthAction =
  | "status"
  | "start_auth"
  | "set_env"
  | "logout"
  | "get_temp_credentials";

const CODEBUDDY_AUTH_ACTIONS = ["status", "set_env"] as const;
const DEFAULT_AUTH_ACTIONS = [
  "status",
  "start_auth",
  "set_env",
  "logout",
  "get_temp_credentials",
] as const;

function maskSensitiveValue(value: string): string {
  if (value.length <= 4) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 2)}******${value.slice(-2)}`;
}

function isTemporaryCredentialLoginState(loginState: Record<string, unknown>): boolean {
  const refreshToken = normalizeOptionalToolString(loginState.refreshToken);
  const token = normalizeOptionalToolString(loginState.token);
  const accessTokenExpired =
    typeof loginState.accessTokenExpired === "number" ||
    typeof loginState.accessTokenExpired === "string";

  return Boolean(token && (refreshToken || accessTokenExpired));
}

function getCurrentIde(server: ExtendedMcpServer): string {
  return server.ide || process.env.INTEGRATION_IDE || "";
}

function isCodeBuddyIde(server: ExtendedMcpServer): boolean {
  return getCurrentIde(server) === "CodeBuddy";
}

function getSupportedAuthActions(server: ExtendedMcpServer): readonly AuthAction[] {
  return isCodeBuddyIde(server) ? CODEBUDDY_AUTH_ACTIONS : DEFAULT_AUTH_ACTIONS;
}

function buildAuthRequiredNextStep(server: ExtendedMcpServer) {
  if (isCodeBuddyIde(server)) {
    return buildAuthNextStep("status", {
      suggestedArgs: { action: "status" },
    });
  }

  return buildAuthNextStep("start_auth", {
    suggestedArgs: { action: "start_auth", authMode: "device" },
  });
}

function buildSetEnvNextStep(envCandidates: EnvCandidate[]) {
  const singleEnvId = envCandidates.length === 1 ? envCandidates[0].envId : undefined;
  return buildAuthNextStep("set_env", {
    requiredParams: singleEnvId ? undefined : ["envId"],
    suggestedArgs: singleEnvId
      ? { action: "set_env", envId: singleEnvId }
      : { action: "set_env" },
  });
}

type AuthEnvSetupStatus =
  | "NOT_NEEDED"
  | "AUTO_BOUND"
  | "AUTO_CREATED"
  | "SELECTION_REQUIRED"
  | "ACTION_REQUIRED";

type AuthEnvSetupFailure = {
  reason: string;
  error_code: string;
  message: string;
  help_url?: string;
  need_real_name_auth?: boolean;
  need_cam_auth?: boolean;
};

type AuthEnvPreparationResult = {
  currentEnvId: string | null;
  envStatus: "READY" | "MULTIPLE" | "NONE";
  envCandidates: EnvCandidate[];
  envSetupStatus: AuthEnvSetupStatus;
  envSetupActions: string[];
  envSetupFailure?: AuthEnvSetupFailure;
  message: string;
  nextStep: ReturnType<typeof buildAuthNextStep>;
};

function dedupeActions(actions: string[]) {
  return actions.filter((action, index) => actions.indexOf(action) === index);
}

function buildAuthEnvSetupFailure(params: {
  reason: string;
  errorCode: string;
  message: string;
  helpUrl?: string;
  needRealNameAuth?: boolean;
  needCamAuth?: boolean;
}): AuthEnvSetupFailure {
  return {
    reason: params.reason,
    error_code: params.errorCode,
    message: params.message,
    help_url: params.helpUrl,
    need_real_name_auth: params.needRealNameAuth,
    need_cam_auth: params.needCamAuth,
  };
}

function buildAuthEnvSetupPayload(preparation: AuthEnvPreparationResult) {
  return {
    current_env_id: preparation.currentEnvId,
    env_status: preparation.envStatus,
    env_setup_status: preparation.envSetupStatus,
    env_setup_actions: preparation.envSetupActions,
    ...(preparation.envSetupFailure
      ? {
          env_setup_failure: preparation.envSetupFailure,
        }
      : {}),
    ...buildEnvCandidatePayload(preparation.envCandidates),
  };
}

async function prepareAuthEnvironment(params: {
  server: ExtendedMcpServer;
  cloudBaseOptions: any;
  loginState: any;
}): Promise<AuthEnvPreparationResult> {
  const { server, cloudBaseOptions, loginState } = params;
  const currentEnvId =
    getCachedEnvId() ||
    process.env.CLOUDBASE_ENV_ID ||
    (typeof loginState?.envId === "string" && loginState.envId.length > 0
      ? loginState.envId
      : null);

  if (currentEnvId) {
    return {
      currentEnvId,
      envStatus: "READY",
      envCandidates: [],
      envSetupStatus: "NOT_NEEDED",
      envSetupActions: [],
      message: `当前已登录，环境: ${currentEnvId}`,
      nextStep: buildAuthNextStep("status", {
        suggestedArgs: { action: "status" },
      }),
    };
  }

  const envSetupActions = ["list_envs"];
  const envCandidates = await fetchAvailableEnvCandidates(cloudBaseOptions, server);

  if (envCandidates.length === 1) {
    const singleEnvId = envCandidates[0].envId;
    await envManager.setEnvId(singleEnvId);
    return {
      currentEnvId: singleEnvId,
      envStatus: "READY",
      envCandidates,
      envSetupStatus: "AUTO_BOUND",
      envSetupActions: dedupeActions(envSetupActions),
      message: `当前已登录，已自动绑定唯一环境: ${singleEnvId}`,
      nextStep: buildAuthNextStep("status", {
        suggestedArgs: { action: "status" },
      }),
    };
  }

  if (envCandidates.length > 1) {
    return {
      currentEnvId: null,
      envStatus: "MULTIPLE",
      envCandidates,
      envSetupStatus: "SELECTION_REQUIRED",
      envSetupActions: dedupeActions(envSetupActions),
      message: "当前已登录，但存在多个可用环境，请先选择环境。",
      nextStep: buildSetEnvNextStep(envCandidates),
    };
  }

  let setupContext: EnvSetupContext = {};
  const manager = await getCloudBaseManager({
    requireEnvId: false,
    cloudBaseOptions: cloudBaseOptions
      ? {
          ...cloudBaseOptions,
          envId: undefined,
        }
      : undefined,
    mcpServer: server,
  });

  setupContext = await checkAndInitTcbService(manager, setupContext);
  if (setupContext.checkTcbServiceAttempted) {
    envSetupActions.push("check_tcb_service");
  }
  if (setupContext.initTcbAttempted) {
    envSetupActions.push("init_tcb");
  }

  if (setupContext.initTcbError || !setupContext.tcbServiceInitialized) {
    const failure = setupContext.initTcbError
      ? buildAuthEnvSetupFailure({
          reason: "tcb_init_failed",
          errorCode: setupContext.initTcbError.code || "TCB_INIT_FAILED",
          message: setupContext.initTcbError.message,
          helpUrl: setupContext.initTcbError.helpUrl,
          needRealNameAuth: setupContext.initTcbError.needRealNameAuth,
          needCamAuth: setupContext.initTcbError.needCamAuth,
        })
      : buildAuthEnvSetupFailure({
          reason: "tcb_init_failed",
          errorCode: "TCB_INIT_FAILED",
          message: "CloudBase 服务初始化失败，请稍后重试。",
          helpUrl: "https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp",
        });

    return {
      currentEnvId: null,
      envStatus: "NONE",
      envCandidates: [],
      envSetupStatus: "ACTION_REQUIRED",
      envSetupActions: dedupeActions(envSetupActions),
      envSetupFailure: failure,
      message: failure.message,
      nextStep: buildAuthNextStep("status", {
        suggestedArgs: { action: "status" },
      }),
    };
  }

  const createResult = await checkAndCreateFreeEnv(manager, setupContext);
  setupContext = createResult.context;
  if (setupContext.promotionalActivitiesChecked) {
    envSetupActions.push("check_promotional_activity");
  }
  if (setupContext.createFreeEnvAttempted) {
    envSetupActions.push("create_free_env");
  }

  if (createResult.success && createResult.envId) {
    await envManager.setEnvId(createResult.envId);
    return {
      currentEnvId: createResult.envId,
      envStatus: "READY",
      envCandidates: [],
      envSetupStatus: "AUTO_CREATED",
      envSetupActions: dedupeActions(envSetupActions),
      message: `当前已登录，已自动创建并绑定环境: ${createResult.envId}`,
      nextStep: buildAuthNextStep("status", {
        suggestedArgs: { action: "status" },
      }),
    };
  }

  const createFailure = setupContext.createEnvError
    ? buildAuthEnvSetupFailure({
        reason: "env_creation_failed",
        errorCode: setupContext.createEnvError.code || "ENV_CREATION_FAILED",
        message: setupContext.createEnvError.message,
        helpUrl: setupContext.createEnvError.helpUrl,
      })
    : buildAuthEnvSetupFailure({
        reason: "env_creation_failed",
        errorCode: "ENV_CREATION_FAILED",
        message: "环境创建失败，请稍后重试或手动创建环境。",
        helpUrl: "https://buy.cloud.tencent.com/lowcode?buyType=tcb&channel=mcp",
      });

  return {
    currentEnvId: null,
    envStatus: "NONE",
    envCandidates: [],
    envSetupStatus: "ACTION_REQUIRED",
    envSetupActions: dedupeActions(envSetupActions),
    envSetupFailure: createFailure,
    message: createFailure.message,
    nextStep: buildAuthNextStep("status", {
      suggestedArgs: { action: "status" },
    }),
  };
}

function buildEnvQueryListResult(params: {
  result: any;
  cloudBaseOptions: any;
  hasEnvId: boolean;
    filters: {
      alias?: string;
      aliasExact?: boolean;
      envId?: string;
      limit?: number;
      offset?: number;
      fields?: EnvFieldName[];
  };
}) {
  const envList = Array.isArray(params.result?.EnvList) ? params.result.EnvList : [];
  const shouldRestrictToCurrentEnv =
    params.hasEnvId && !params.filters.alias && !params.filters.envId;
  const baseList = shouldRestrictToCurrentEnv
    ? envList.filter((env: any) => env.EnvId === params.cloudBaseOptions?.envId)
    : envList;
  const filteredList = filterEnvList(baseList, {
    alias: params.filters.alias,
    aliasExact: params.filters.aliasExact,
    envId: params.filters.envId,
  });
  const paginated = paginateEnvList(filteredList, params.filters.offset, params.filters.limit);
  const exactEnvIdSummaryHint = params.filters.envId
    ? {
        tool: "envQuery",
        action: "info",
        reason:
          "action=list with envId only returns a concise summary. Use action=info to fetch detailed environment information such as full resource metadata and additional environment details.",
      }
    : undefined;

  return {
    EnvList: paginated.items.map((env) => selectEnvFields(env, params.filters.fields)),
    TotalCount: paginated.total,
    Offset: paginated.offset,
    Limit: paginated.limit,
    HasMore: paginated.offset + paginated.items.length < paginated.total,
    AppliedFilters: {
      alias: params.filters.alias ?? null,
      aliasExact: params.filters.aliasExact ?? null,
      envId: params.filters.envId ?? null,
      fields: params.filters.fields ?? [...DEFAULT_ENV_FIELDS],
      currentEnvOnly: shouldRestrictToCurrentEnv,
    },
    ...(exactEnvIdSummaryHint
      ? {
          RecommendedNextAction: exactEnvIdSummaryHint,
        }
      : {}),
  };
}

async function enrichEnvInfoWithBilling(params: {
  manager: any;
  result: any;
  envId?: string;
  logger?: any;
}) {
  const targetEnvId =
    params.envId ||
    params.result?.EnvInfo?.EnvId;

  if (!targetEnvId || !params.result?.EnvInfo) {
    return params.result;
  }

  try {
    const billingResult = await params.manager.commonService("tcb", "2018-06-08").call({
      Action: "DescribeBillingInfo",
      Param: {
        EnvId: targetEnvId,
      },
    });
    logCloudBaseResult(params.logger, billingResult);

    const billingList =
      billingResult?.EnvBillingInfoList ||
      billingResult?.Response?.EnvBillingInfoList ||
      billingResult?.Data?.EnvBillingInfoList ||
      [];

    const matchedBillingInfo = Array.isArray(billingList)
      ? billingList.find((item: any) => item?.EnvId === targetEnvId) ?? billingList[0]
      : undefined;

    if (!matchedBillingInfo) {
      return params.result;
    }

    return {
      ...params.result,
      EnvInfo: {
        ...params.result.EnvInfo,
        BillingInfo: matchedBillingInfo,
      },
    };
  } catch (billingError) {
    debug("DescribeBillingInfo enrichment failed, continuing without billing info", {
      error: billingError,
      envId: targetEnvId,
    });
    return params.result;
  }
}

function normalizeOptionalToolString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/**
 * Build enhanced error message for envQuery tool errors
 * Provides actionable guidance based on error patterns
 */
function buildEnvQueryErrorMessage(error: unknown, action: string): string {
  const baseMessage = error instanceof Error ? error.message : String(error);

  // Check for common error patterns and provide specific guidance
  const hasInvalidParameterError = /400|invalid parameter|invalid argument|parameter value/i.test(baseMessage);
  const hasAuthError = /未登录|auth required|unauthorized|authentication|credential|token|secret/i.test(baseMessage);
  const hasNetworkError = /ECONNRESET|socket hang up|ETIMEDOUT|ENOTFOUND|timeout/i.test(baseMessage);
  const hasPermissionError = /permission|denied|forbidden|无权|拒绝/i.test(baseMessage);
  const hasEnvNotFoundError = /env|environment|环境.*不存在|not found/i.test(baseMessage);

  const suggestions: string[] = [];

  if (hasInvalidParameterError) {
    suggestions.push("参数错误：可能是认证信息无效或已过期，请尝试以下步骤：");
    suggestions.push("1. 先调用 auth(action=\"status\") 检查当前登录状态");
    suggestions.push("2. 如果未登录，调用 auth(action=\"start_auth\", authMode=\"device\") 完成登录");
    suggestions.push("3. 登录完成后再次调用 envQuery(action=\"list\")");
  }

  if (hasAuthError) {
    suggestions.push("认证错误：当前未登录或认证已过期。");
    suggestions.push("建议先执行 auth(action=\"status\") 查看状态，然后按提示完成登录。");
  }

  if (hasPermissionError) {
    suggestions.push("权限错误：当前账号可能没有访问该资源的权限。");
    suggestions.push("请确认：1) 已选择正确的环境 2) 账号有对应权限");
  }

  if (hasEnvNotFoundError) {
    suggestions.push("环境错误：指定的环境不存在或无法访问。");
    suggestions.push("请使用 envQuery(action=\"list\") 查看可用的环境列表。");
  }

  if (hasNetworkError) {
    suggestions.push("网络错误：请检查网络连接，稍后重试。");
  }

  // If no specific pattern matched, provide general guidance
  if (suggestions.length === 0) {
    suggestions.push("查询环境信息时出错，建议：");
    suggestions.push("1. 先调用 auth(action=\"status\") 确认登录状态");
    suggestions.push("2. 如未登录，执行 auth(action=\"start_auth\") 完成认证");
    suggestions.push("3. 确认环境 ID 正确且可访问");
  }

  return `[envQuery/${action}] 调用失败: ${baseMessage}\n\n解决建议：\n${suggestions.join("\n")}`;
}

function normalizeOptionalToolBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function resolveToolAuthOptions(
  server: ExtendedMcpServer,
  overrides?: AuthOptions,
) {
  return resolveAuthOptions({
    ...overrides,
    serverAuthOptions: server.authOptions,
  });
}

export function registerEnvTools(server: ExtendedMcpServer) {
  // 获取 cloudBaseOptions，如果没有则为 undefined
  const cloudBaseOptions = server.cloudBaseOptions;

  const getManager = () => getCloudBaseManager({ cloudBaseOptions, mcpServer: server });
  const getManagerForEnvQuery = (targetEnvId?: string, requireEnvId = true) =>
    getCloudBaseManager({
      cloudBaseOptions:
        targetEnvId && targetEnvId !== cloudBaseOptions?.envId
          ? {
              ...cloudBaseOptions,
              envId: targetEnvId,
            }
          : cloudBaseOptions,
      requireEnvId,
      mcpServer: server,
    });

  const hasEnvId = typeof cloudBaseOptions?.envId === 'string' && cloudBaseOptions?.envId.length > 0;
  const supportedAuthActions = getSupportedAuthActions(server);
  const authActionEnum = [...supportedAuthActions] as [AuthAction, ...AuthAction[]];

  // auth - CloudBase (云开发) 开发阶段登录与环境绑定
  server.registerTool?.(
    "auth",
    {
      title: "CloudBase 开发阶段登录与环境",
      description:
        "CloudBase（腾讯云开发）开发阶段登录与环境绑定。登录后即可访问云资源；环境(env)是云函数、数据库、静态托管等资源的隔离单元，绑定环境后其他 MCP 工具才能操作该环境。支持：查询状态、发起登录、绑定环境(set_env)、退出登录。",
      inputSchema: {
        action: z
          .enum(authActionEnum)
          .optional()
          .describe(
            "动作：status=查询状态，start_auth=发起登录，set_env=绑定环境(传envId)，logout=退出登录",
          ),
        ...(supportedAuthActions.includes("start_auth")
          ? {
              authMode: z
                .enum(["device", "web"])
                .optional()
                .describe("认证模式：device=设备码授权，web=浏览器回调授权"),
              oauthEndpoint: z
                .string()
                .optional()
                .describe("高级可选：自定义 device-code 登录 endpoint。配置后 oauthCustom 默认按 true 处理"),
              clientId: z
                .string()
                .optional()
                .describe("高级可选：自定义 device-code 登录 client_id，不传则使用默认值"),
              oauthCustom: z
                .boolean()
                .optional()
                .describe("高级可选：自定义 endpoint 返回格式开关。未配置 endpoint 时默认 false；配置 endpoint 后默认 true，且不能设为 false"),
            }
          : {}),
        envId: z
          .string()
          .optional()
          .describe("环境ID(CloudBase 环境唯一标识)，绑定后工具将操作该环境。action=set_env 时必填"),
        ...(supportedAuthActions.includes("logout")
          ? {
              confirm: z
                .literal("yes")
                .optional()
                .describe("action=logout 时确认操作，传 yes"),
            }
          : {}),
        ...(supportedAuthActions.includes("get_temp_credentials")
          ? {
              reveal: z
                .boolean()
                .optional()
                .describe("action=get_temp_credentials 时可选。true=返回明文临时密钥；默认 false 仅返回脱敏结果"),
            }
          : {}),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
        category: "env",
      },
    },
    async (rawArgs: {
      action?: AuthAction;
      authMode?: unknown;
      oauthEndpoint?: unknown;
      clientId?: unknown;
      oauthCustom?: unknown;
      envId?: string;
      confirm?: unknown;
      reveal?: unknown;
    }) => {
      const action = rawArgs.action ?? "status";
      const authMode =
        rawArgs.authMode === "device" || rawArgs.authMode === "web"
          ? rawArgs.authMode
          : undefined;
      const oauthEndpoint = normalizeOptionalToolString(rawArgs.oauthEndpoint);
      const clientId = normalizeOptionalToolString(rawArgs.clientId);
      const oauthCustom = normalizeOptionalToolBoolean(rawArgs.oauthCustom);
      const envId = rawArgs.envId;
      const confirm = rawArgs.confirm === "yes" ? "yes" : undefined;
      const reveal = normalizeOptionalToolBoolean(rawArgs.reveal) === true;
      const resolvedAuthOptions = resolveToolAuthOptions(server, {
        authMode,
        oauthEndpoint,
        clientId,
        oauthCustom,
      });
      const authConfigSummary = buildAuthConfigSummary(resolvedAuthOptions);
      let deviceAuthInfo: DeviceFlowAuthInfo | undefined;
      const onDeviceCode = (info: DeviceFlowAuthInfo) => {
        deviceAuthInfo = info;
        setPendingAuthProgressState(info, "device");
        // emitDeviceAuthNotice(server, info);
      };
      const authChallenge = () => buildDeviceAuthChallengePayload(deviceAuthInfo);

      try {
        if (!supportedAuthActions.includes(action)) {
          return buildJsonToolResult({
            ok: false,
            code: "NOT_SUPPORTED",
            message: `当前 IDE 不支持 auth(action="${action}")。`,
            next_step: buildAuthNextStep("status", {
              suggestedArgs: { action: "status" },
            }),
          });
        }

        if (action === "status") {
          const loginState = await peekLoginState();
          const authFlowState = await getAuthProgressState();

          const authStatus = loginState
            ? "READY"
            : authFlowState.status === "PENDING"
              ? "PENDING"
              : "REQUIRED";
          let envPreparation:
            | AuthEnvPreparationResult
            | undefined;
          const message =
            authStatus === "READY"
              ? undefined
              : authStatus === "PENDING"
                ? "设备码授权进行中，请完成浏览器授权后再次调用 auth(action=\"status\")"
                : isCodeBuddyIde(server)
                  ? "当前未登录。CodeBuddy 暂不支持在 tool 内发起认证，请在外部完成认证后再次调用 auth(action=\"status\")。"
                  : "当前未登录，请先执行 auth(action=\"start_auth\")";

          if (authStatus === "READY" && loginState) {
            envPreparation = await prepareAuthEnvironment({
              server,
              cloudBaseOptions,
              loginState,
            });
          }

          return buildJsonToolResult({
            ok: true,
            code: "STATUS",
            auth_status: authStatus,
            auth_config: authConfigSummary,
            ...(envPreparation
              ? buildAuthEnvSetupPayload(envPreparation)
              : {
                  env_status: "NONE",
                  current_env_id: null,
                  ...buildEnvCandidatePayload([]),
                }),
            auth_challenge:
              authFlowState.status === "PENDING"
                ? buildDeviceAuthChallengePayload(authFlowState.authChallenge)
                : undefined,
            message,
            next_step:
              authStatus === "REQUIRED"
                ? buildAuthRequiredNextStep(server)
                : authStatus === "PENDING"
                  ? buildAuthNextStep("status", {
                      suggestedArgs: { action: "status" },
                    })
                  : envPreparation?.nextStep,
          });
        }

        if (action === "start_auth") {
          const region = server.cloudBaseOptions?.region || process.env.TCB_REGION;
          const auth = AuthSupervisor.getInstance({});
          const authFlowState = await getAuthProgressState();

          if (authFlowState.status === "PENDING" && authFlowState.authChallenge) {
            return buildJsonToolResult({
              ok: true,
              code: "AUTH_PENDING",
              message:
                "设备码授权进行中，请在浏览器中打开 verification_uri 并输入 user_code 完成授权。",
              auth_challenge: buildDeviceAuthChallengePayload(
                authFlowState.authChallenge,
              ),
              next_step: buildAuthNextStep("status", {
                suggestedArgs: { action: "status" },
              }),
            });
          }

          // 1. 如果已经有登录态，直接返回 AUTH_READY
          try {
            const existingLoginState = await peekLoginState();
            if (existingLoginState) {
              const envPreparation = await prepareAuthEnvironment({
                server,
                cloudBaseOptions,
                loginState: existingLoginState,
              });
              return buildJsonToolResult({
                ok: true,
                code: "AUTH_READY",
                message: envPreparation.message,
                auth_challenge: authChallenge(),
                ...buildAuthEnvSetupPayload(envPreparation),
                next_step: envPreparation.nextStep,
              });
            }
          } catch {
            // 忽略 getLoginState 错误，继续尝试发起登录
          }

          const validationError = getAuthConfigValidationError(resolvedAuthOptions);
          if (validationError) {
            return buildJsonToolResult({
              ok: false,
              code: "INVALID_ARGS",
              message: validationError,
              auth_config: authConfigSummary,
              next_step: buildAuthNextStep("start_auth", {
                suggestedArgs: { action: "start_auth", authMode: "device" },
              }),
            });
          }

          // 2. 设备码模式：监听到 device code 即返回 AUTH_PENDING，后续由 toolbox 异步轮询并更新本地 credential
          const effectiveMode = resolvedAuthOptions.authMode;

          if (effectiveMode === "device") {
            let resolveCode: (() => void) | undefined;
            let rejectCode: ((reason?: unknown) => void) | undefined;
            const codeReady = new Promise<void>((resolve, reject) => {
              resolveCode = resolve;
              rejectCode = reject;
            });

            const deviceOnCode = (info: DeviceFlowAuthInfo) => {
              onDeviceCode(info);
              if (resolveCode) {
                resolveCode();
              }
            };

            try {
              // 启动 Device Flow，全流程由 toolbox 负责轮询和写入 credential，这里不等待完成
              auth
                .loginByWebAuth({
                  flow: "device",
                  ...(resolvedAuthOptions.clientId
                    ? { client_id: resolvedAuthOptions.clientId }
                    : {}),
                  ...(resolvedAuthOptions.oauthEndpoint
                    ? { getOAuthEndpoint: () => resolvedAuthOptions.oauthEndpoint! }
                    : {}),
                  ...(resolvedAuthOptions.oauthCustom
                    ? { custom: true }
                    : {}),
                  onDeviceCode: deviceOnCode,
                })
                .then(() => {
                  resolveAuthProgressState();
                })
                .catch((err: unknown) => {
                  rejectAuthProgressState(err);
                  // 如果在拿到 device code 之前就失败，则唤醒当前调用并返回错误
                  if (!deviceAuthInfo && rejectCode) {
                    rejectCode(err);
                  }
                });
            } catch (err) {
              if (rejectCode) {
                rejectCode(err);
              }
            }

            try {
              await codeReady;
            } catch (err) {
              const message =
                err instanceof Error ? err.message : String(err ?? "unknown error");
              return buildJsonToolResult({
                ok: false,
                code: "AUTH_REQUIRED",
                message: `设备码登录初始化失败: ${message}`,
                next_step: buildAuthNextStep("start_auth", {
                  suggestedArgs: { action: "start_auth", authMode: "device" },
                }),
              });
            }

            if (!deviceAuthInfo) {
              return buildJsonToolResult({
                ok: false,
                code: "AUTH_REQUIRED",
                message: "未获取到设备码信息，请重试设备码登录",
                next_step: buildAuthNextStep("start_auth", {
                  suggestedArgs: { action: "start_auth", authMode: "device" },
                }),
              });
            }

            const envCandidates = await fetchAvailableEnvCandidates(cloudBaseOptions, server);
            return buildJsonToolResult({
              ok: true,
              code: "AUTH_PENDING",
              message:
                "已发起设备码登录，请在浏览器中打开 verification_uri 并输入 user_code 完成授权。授权完成后请再次调用 auth(action=\"status\")。",
              auth_challenge: authChallenge(),
              ...buildEnvCandidatePayload(envCandidates),
              next_step: buildAuthNextStep("status", {
                suggestedArgs: { action: "status" },
              }),
            });
          }

          // 3. 非 Device Flow（显式 web 模式）仍然使用 getLoginState 阻塞等待
          const loginState = await ensureLogin({
            region,
            authMode: effectiveMode,
            clientId: resolvedAuthOptions.clientId,
            oauthEndpoint: resolvedAuthOptions.oauthEndpoint,
            oauthCustom: resolvedAuthOptions.oauthCustom,
          });

          if (!loginState) {
            return buildJsonToolResult({
              ok: false,
              code: "AUTH_REQUIRED",
              message: "未获取到登录态，请先完成认证",
              next_step: buildAuthNextStep("start_auth", {
                suggestedArgs: { action: "start_auth", authMode: effectiveMode },
              }),
            });
          }

          const envPreparation = await prepareAuthEnvironment({
            server,
            cloudBaseOptions,
            loginState,
          });
          return buildJsonToolResult({
            ok: true,
            code: "AUTH_READY",
            message: envPreparation.message,
            auth_challenge: authChallenge(),
            ...buildAuthEnvSetupPayload(envPreparation),
            next_step: envPreparation.nextStep,
          });
        }

        if (action === "set_env") {
          const loginState = await peekLoginState();
          if (!loginState) {
            return buildJsonToolResult({
              ok: false,
              code: "AUTH_REQUIRED",
              message: isCodeBuddyIde(server)
                ? "当前未登录。CodeBuddy 暂不支持在 tool 内发起认证，请在外部完成认证后再次调用 auth(action=\"status\")。"
                : "当前未登录，请先执行 auth(action=\"start_auth\")。",
              next_step: buildAuthRequiredNextStep(server),
            });
          }

          const envCandidates = await fetchAvailableEnvCandidates(cloudBaseOptions, server);
          if (!envId) {
            return buildJsonToolResult({
              ok: false,
              code: "INVALID_ARGS",
              message: "action=set_env 时必须提供 envId",
              ...buildEnvCandidatePayload(envCandidates),
              next_step: buildSetEnvNextStep(envCandidates),
            });
          }

          const target = envCandidates.find((item) => item.envId === envId);
          if (envCandidates.length > 0 && !target) {
            return buildJsonToolResult({
              ok: false,
              code: "INVALID_ARGS",
              message: `未找到环境: ${envId}`,
              ...buildEnvCandidatePayload(envCandidates),
              next_step: buildSetEnvNextStep(envCandidates),
            });
          }
          await envManager.setEnvId(envId);
          return buildJsonToolResult({
            ok: true,
            code: "ENV_READY",
            message: `环境设置成功，当前环境: ${envId}`,
            current_env_id: envId,
          });
        }

        if (action === "logout") {
          if (confirm !== "yes") {
            return buildJsonToolResult({
              ok: false,
              code: "INVALID_ARGS",
              message: "action=logout 时必须传 confirm=\"yes\"",
              next_step: buildAuthNextStep("logout", {
                suggestedArgs: { action: "logout", confirm: "yes" },
              }),
            });
          }

          await logout();
          resetCloudBaseManagerCache();
          return buildJsonToolResult({
            ok: true,
            code: "LOGGED_OUT",
            message: "✅ 已退出登录",
          });
        }

        if (action === "get_temp_credentials") {
          const loginState = (await peekLoginState()) as Record<string, unknown> | null;
          if (!loginState) {
            return buildJsonToolResult({
              ok: false,
              code: "AUTH_REQUIRED",
              message: "当前未登录，请先完成管理端认证后再获取临时密钥。",
              next_step: buildAuthRequiredNextStep(server),
            });
          }

          if (confirm !== "yes") {
            return buildJsonToolResult({
              ok: false,
              code: "INVALID_ARGS",
              message:
                "action=get_temp_credentials 时必须显式传 confirm=\"yes\"，以确认你要导出当前管理端临时密钥。",
              next_step: buildAuthNextStep("get_temp_credentials", {
                suggestedArgs: { action: "get_temp_credentials", confirm: "yes" },
              }),
            });
          }

          if (!isTemporaryCredentialLoginState(loginState)) {
            return buildJsonToolResult({
              ok: false,
              code: "UNSUPPORTED_CREDENTIAL_TYPE",
              message:
                "当前登录态不是可导出的临时密钥。仅支持通过 Web / device 登录得到的临时密钥，永久密钥登录不允许导出。",
            });
          }

          const secretId = normalizeOptionalToolString(loginState.secretId);
          const secretKey = normalizeOptionalToolString(loginState.secretKey);
          const token = normalizeOptionalToolString(loginState.token);
          if (!secretId || !secretKey || !token) {
            return buildJsonToolResult({
              ok: false,
              code: "INTERNAL_ERROR",
              message: "当前登录态缺少完整的临时密钥字段，请重新登录后再试。",
            });
          }

          return buildJsonToolResult({
            ok: true,
            code: "TEMP_CREDENTIALS_READY",
            message: reveal
              ? "当前管理端临时密钥已准备好，请注意避免泄露。"
              : "当前管理端临时密钥已准备好，默认仅返回脱敏结果。",
            env_id: normalizeOptionalToolString(loginState.envId) ?? null,
            credentials: {
              secretId: reveal ? secretId : maskSensitiveValue(secretId),
              secretKey: reveal ? secretKey : maskSensitiveValue(secretKey),
              token: reveal ? token : maskSensitiveValue(token),
              masked: !reveal,
            },
          });
        }

        return buildJsonToolResult({
          ok: false,
          code: "NOT_SUPPORTED",
          message: `不支持的 auth action: ${action}`,
          next_step: buildAuthNextStep("status", {
            suggestedArgs: { action: "status" },
          }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return buildJsonToolResult({
          ok: false,
          code: "INTERNAL_ERROR",
          message: `auth 执行失败: ${message}`,
          auth_challenge: authChallenge(),
          next_step: buildAuthNextStep("status", {
            suggestedArgs: { action: "status" },
          }),
        });
      }
    },
  );

  // envQuery - 环境查询（合并 listEnvs + getEnvInfo + getEnvAuthDomains + getWebsiteConfig）
  server.registerTool?.(
    "envQuery",
    {
      title: "环境查询",
      description:
        "查询云开发环境相关信息，支持查询环境列表、当前环境信息、安全域名和静态网站托管配置。（原工具名：listEnvs/getEnvInfo/getEnvAuthDomains/getWebsiteConfig，为兼容旧AI规则可继续使用这些名称）当 action=list 时，标准返回字段为 EnvId、Alias、Status、EnvType、Region、PackageId、PackageName、IsDefault，并支持通过 fields 白名单裁剪这些字段；aliasExact=true 时会按别名精确筛选，避免把前缀相近的环境误当作候选；即使传入 envId，action=list 也只返回摘要，不会返回完整资源明细或 expiry。如需查询某个已知环境的详细信息，请使用 action=info。action=info 会在可用时补充 BillingInfo（如 ExpireTime、PayMode、IsAutoRenew 等计费字段）。",
      inputSchema: {
        action: z
          .enum(["list", "info", "domains", "hosting"])
          .describe(
            "查询类型：list=环境列表/摘要筛选（即使传 envId 也只返回 EnvId、Alias、Status、EnvType、Region、PackageId、PackageName、IsDefault，不支持 expiry），info=当前环境详细信息（详情中可查看更完整资源字段），domains=安全域名列表，hosting=静态网站托管配置",
          ),
        alias: z.string().optional().describe("按环境别名筛选。action=list 时可选"),
        aliasExact: z.boolean().optional().describe("按环境别名精确筛选。action=list 时可选；与 alias 配合使用"),
        envId: z.string().optional().describe("按环境 ID 精确筛选。action=list 时可选；注意 list + envId 仍只返回摘要，如需该环境详情请改用 action=info"),
        limit: z.number().int().positive().optional().describe("返回数量上限。action=list 时可选"),
        offset: z.number().int().min(0).optional().describe("分页偏移。action=list 时可选"),
        fields: z
          .array(z.enum(DEFAULT_ENV_FIELDS))
          .optional()
          .describe("返回字段白名单。仅支持 EnvId、Alias、Status、EnvType、Region、PackageId、PackageName、IsDefault。action=list 时可选"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "env",
      },
    },
    async ({
      action,
      alias,
      aliasExact,
      envId,
      limit,
      offset,
      fields,
    }: {
      action: "list" | "info" | "domains" | "hosting";
      alias?: string;
      aliasExact?: boolean;
      envId?: string;
      limit?: number;
      offset?: number;
      fields?: EnvFieldName[];
    }) => {
      try {
        let result;

        switch (action) {
          case "list":
            try {
              const cloudbaseList = await getCloudBaseManager({
                cloudBaseOptions,
                requireEnvId: true,
                mcpServer: server, // Pass server for IDE detection
              });
              // Use commonService to call DescribeEnvs with filter parameters
              // Filter parameters match the reference conditions provided by user
              result = await cloudbaseList.commonService("tcb", "2018-06-08").call({
                Action: "DescribeEnvs",
                Param: {
                  EnvTypes: ["weda", "baas"], // Include weda and baas (normal) environments
                  IsVisible: false, // Filter out invisible environments
                  Channels: ["dcloud", "iotenable", "tem", "scene_module"], // Filter special channels
                },
              });
              logCloudBaseResult(server.logger, result);
              // Transform response format to match original listEnvs() format
              if (result && result.EnvList) {
                result = { EnvList: result.EnvList };
              } else if (result && result.Data && result.Data.EnvList) {
                result = { EnvList: result.Data.EnvList };
              } else {
                // Fallback to original method if format is unexpected
                debug("Unexpected response format, falling back to listEnvs()");
                result = await cloudbaseList.env.listEnvs();
                logCloudBaseResult(server.logger, result);
              }
            } catch (error) {
              debug("获取环境列表时出错，尝试降级到 listEnvs():", error instanceof Error ? error : new Error(String(error)));
              // Fallback to original method on error
              try {
                const cloudbaseList = await getCloudBaseManager({
                  cloudBaseOptions,
                  requireEnvId: true,
                  mcpServer: server, // Pass server for IDE detection
                });
                result = await cloudbaseList.env.listEnvs();
                logCloudBaseResult(server.logger, result);
              } catch (fallbackError) {
                const toolPayloadResult = toolPayloadErrorToResult(fallbackError);
                if (toolPayloadResult) {
                  return toolPayloadResult;
                }
                debug("降级到 listEnvs() 也失败:", fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)));
                const enhancedMessage = buildEnvQueryErrorMessage(fallbackError, "list");
                return {
                  content: [
                    {
                      type: "text",
                      text: enhancedMessage,
                    },
                  ],
                };
              }
            }
            result = buildEnvQueryListResult({
              result,
              cloudBaseOptions,
              hasEnvId,
              filters: {
                alias,
                aliasExact,
                envId,
                limit,
                offset,
                fields,
              },
            });
            break;

          case "info":
            const cloudbaseInfo = await getManagerForEnvQuery(envId);
            result = await cloudbaseInfo.env.getEnvInfo();
            logCloudBaseResult(server.logger, result);
            result = await enrichEnvInfoWithBilling({
              manager: cloudbaseInfo,
              result,
              envId,
              logger: server.logger,
            });
            break;

          case "domains":
            const cloudbaseDomains = await getManager();
            result = await cloudbaseDomains.env.getEnvAuthDomains();
            logCloudBaseResult(server.logger, result);
            if (result && typeof result === "object" && !Array.isArray(result)) {
              const domainsResult = result as unknown as Record<string, unknown>;
              const localDevHint = buildLocalDevDomainHint();
              const simplifiedDomains = simplifyEnvDomains(domainsResult.Domains);
              const localDevSummary = summarizeConfiguredLocalDevEntries(
                Array.isArray(simplifiedDomains)
                  ? (simplifiedDomains as Array<{ Domain?: unknown }>)
                  : [],
              );
              result = {
                ...domainsResult,
                Domains: simplifiedDomains,
                localDevHint,
                localDevStatus: {
                  requiresExactCurrentOrigin: true,
                  browserUploadReady: false,
                  coverageConfirmed: false,
                  doNotAssumeConfiguredEntriesAreSufficient: true,
                  canAutoDetermineCurrentOrigin: false,
                  hasAnyConfiguredLocalEntry: localDevSummary.hasAnyConfiguredLocalEntry,
                  configuredEntries: localDevSummary.configuredEntries,
                  note:
                    "此查询不会自动知道你当前浏览器实际使用的自定义域名或本地端口。即使已经存在一些 localhost/127.0.0.1 条目，也不能据此认定浏览器上传已就绪。若浏览器 Web 应用需要直接上传文件到 CloudBase，请先确认并添加当前访问地址对应的 host:port，再依赖 app.uploadFile()。",
                },
                next_step_template: {
                  tool: "envDomainManagement",
                  action: "create",
                  domains: ["<actual-browser-host>:<actual-browser-port>"],
                  note:
                    "请把占位符替换为当前浏览器实际访问 origin 对应的 host:port，再执行添加。",
                },
              };
            }
            break;

          case "hosting": {
            const cloudbaseHosting = await getManager();
            const websiteConfig = await cloudbaseHosting.hosting.getWebsiteConfig();
            logCloudBaseResult(server.logger, websiteConfig);
            const hostingResult = {
              ...(websiteConfig as Record<string, unknown>),
              CdnDomain: (websiteConfig as Record<string, unknown>).CdnDomain ?? null,
              Bucket: (websiteConfig as Record<string, unknown>).Bucket ?? null,
            };

            try {
              const envInfo = await cloudbaseHosting.env.getEnvInfo() as {
                EnvInfo?: {
                  StaticStorages?: Array<{ StaticDomain?: string; Bucket?: string }>;
                };
              };
              logCloudBaseResult(server.logger, envInfo);

              hostingResult.CdnDomain = envInfo.EnvInfo?.StaticStorages?.[0]?.StaticDomain ?? hostingResult.CdnDomain;
              hostingResult.Bucket = envInfo.EnvInfo?.StaticStorages?.[0]?.Bucket ?? hostingResult.Bucket;
            } catch (hostingInfoError) {
              debug("Failed to enrich hosting envQuery result with env info", {
                error: hostingInfoError,
              });
            }

            result = hostingResult;
            break;
          }

          default:
            throw new Error(`不支持的查询类型: ${action}`);
        }

        const responseText = JSON.stringify(result, null, 2);

        return {
          content: [
            {
              type: "text",
              text: responseText,
            },
          ],
        };
      } catch (error) {
        const toolPayloadResult = toolPayloadErrorToResult(error);
        if (toolPayloadResult) {
          return toolPayloadResult;
        }
        const enhancedMessage = buildEnvQueryErrorMessage(error, action);
        return {
          content: [
            {
              type: "text",
              text: enhancedMessage,
            },
          ],
        };
      }
    },
  );

  // envDomainManagement - 环境域名管理（合并 createEnvDomain + deleteEnvDomain）
  server.registerTool?.(
    "envDomainManagement",
    {
      title: "环境域名管理（安全域名 / CORS 白名单）",
      description:
        "管理云开发环境的安全域名（安全域名 / CORS 白名单），支持添加和删除操作。（原工具名：createEnvDomain/deleteEnvDomain，为兼容旧AI规则可继续使用这些名称）当浏览器 Web 应用需要从本地 Vite / dev server 直接访问 CloudBase 资源时，应先用 envQuery(action=domains) 检查当前实际浏览器 origin 对应的 host:port 是否已在白名单中，再按该实际值添加。新增或删除后通常需要继续轮询 envQuery(action=domains) 确认状态收敛；安全域名一般约 10 分钟生效。⚠️ 重要：此工具仅用于 CORS/请求来源验证，不涉及 SSL 证书。如需绑定自定义域名供公网 HTTPS 访问，请使用 manageGateway(action=\"bindCustomDomain\")。",
      inputSchema: {
        action: z
          .enum(["create", "delete"])
          .describe("操作类型：create=添加安全域名，delete=删除安全域名"),
        domains: z.array(z.string()).describe("安全域名数组（格式：host:port，例如 localhost:5173 或 127.0.0.1:4173）。注意：不是自定义域名，不需要证书。"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false, // 注意：delete操作虽然是破坏性的，但这里采用较宽松的标注
        idempotentHint: false,
        openWorldHint: true,
        category: "env",
      },
    },
    async ({
      action,
      domains,
    }: {
      action: "create" | "delete";
      domains: string[];
    }) => {
      try {
        const cloudbase = await getManager();
        let result;

        switch (action) {
          case "create":
            result = await cloudbase.env.createEnvDomain(domains);
            logCloudBaseResult(server.logger, result);
            break;

          case "delete":
            result = await cloudbase.env.deleteEnvDomain(domains);
            logCloudBaseResult(server.logger, result);
            break;

          default:
            throw new Error(`不支持的操作类型: ${action}`);
        }

        return buildJsonToolResult(
          buildEnvDomainManagementResult({
            action,
            domains,
            result,
          }),
        );
      } catch (error) {
        const toolPayloadResult = toolPayloadErrorToResult(error);
        if (toolPayloadResult) {
          return toolPayloadResult;
        }
        return {
          content: [
            {
              type: "text",
              text: `域名管理操作失败: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    },
  );
}
