import { AuthSupervisor } from "@cloudbase/toolbox";
import { z } from "zod";
import {
  buildAuthConfigSummary,
  buildDeviceAuthChallengePayload,
  buildVerificationUriComplete,
  ensureLogin,
  getAuthConfigValidationError,
  getAuthProgressState,
  getCloudBaseApiKeyFromEnv,
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
import type { CreateEnvParams } from "@cloudbase/manager-node/types/interfaces/tcb.interface.js";

/**
 * Resources accepted by CreateEnv. Matches Cloud API / Manager SDK contract.
 * `postgresql` enables CloudBase PostgreSQL (PG mode) when supported by the package.
 */
export const CREATE_ENV_RESOURCE_VALUES = [
  "flexdb",
  "storage",
  "function",
  "postgresql",
] as const;

export type CreateEnvResource = (typeof CREATE_ENV_RESOURCE_VALUES)[number];

/** Default Resources when callers omit the field (schema promises "all four"). */
export const DEFAULT_CREATE_ENV_RESOURCES: CreateEnvResource[] = [
  ...CREATE_ENV_RESOURCE_VALUES,
];

export function resolveCreateEnvResources(
  resources: readonly string[] | undefined,
): CreateEnvResource[] {
  if (Array.isArray(resources) && resources.length > 0) {
    return [...resources] as CreateEnvResource[];
  }
  return [...DEFAULT_CREATE_ENV_RESOURCES];
}

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
        '安全域名已提交添加请求。该变更通常需要数分钟传播（平台侧）；请每 10 秒轮询 queryEnv(action="domains") 直到 Status 为 ENABLE，勿一次 sleep 满 10 分钟。',
      propagation: {
        requiresPolling: true,
        pollTool: "queryEnv",
        pollAction: "domains",
        pollIntervalSuggestionSeconds: 10,
        timeoutSuggestionSeconds: 300,
        successCondition:
          '目标域名出现在 queryEnv(action="domains") 返回中，且 Status 为 ENABLE。',
      },
      next_step: {
        tool: "queryEnv",
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
      '安全域名已提交删除请求。该变更通常需要数分钟传播；请每 10 秒轮询 queryEnv(action="domains") 直到目标域名不再出现，勿一次 sleep 满数分钟。',
    propagation: {
      requiresPolling: true,
      pollTool: "queryEnv",
      pollAction: "domains",
      pollIntervalSuggestionSeconds: 10,
      timeoutSuggestionSeconds: 300,
      successCondition:
        '目标域名不再出现在 queryEnv(action="domains") 返回中。',
    },
    next_step: {
      tool: "queryEnv",
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
  | "get_temp_credentials"
  | "login_by_api_key";

const CODEBUDDY_AUTH_ACTIONS = ["status", "set_env", "login_by_api_key"] as const;
const DEFAULT_AUTH_ACTIONS = [
  "status",
  "start_auth",
  "set_env",
  "logout",
  "get_temp_credentials",
  "login_by_api_key",
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

  // Surface the user-facing notice emitted at checkAndCreateFreeEnv entry.
  // Informational only — no confirm required. Prepend to the final message so
  // the user knows an automatic free-env creation was attempted.
  const userNotice = createResult.userNotice?.trim() || "";

  if (createResult.success && createResult.envId) {
    await envManager.setEnvId(createResult.envId);
    const successMessage = `当前已登录，已自动创建并绑定环境: ${createResult.envId}`;
    return {
      currentEnvId: createResult.envId,
      envStatus: "READY",
      envCandidates: [],
      envSetupStatus: "AUTO_CREATED",
      envSetupActions: dedupeActions(envSetupActions),
      message: userNotice ? `${userNotice}\n${successMessage}` : successMessage,
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

  const failureMessage = userNotice
    ? `${userNotice}\n${createFailure.message}`
    : createFailure.message;

  return {
    currentEnvId: null,
    envStatus: "NONE",
    envCandidates: [],
    envSetupStatus: "ACTION_REQUIRED",
    envSetupActions: dedupeActions(envSetupActions),
    envSetupFailure: createFailure,
    message: failureMessage,
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
        tool: "queryEnv",
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

/**
 * Derive a RuntimeMode hint from the EnvInfo payload so the AI agent can
 * immediately tell which CloudBase data backends are actually present in
 * this environment.
 *
 * Reality model (revised after observing a real PG environment): a single
 * CloudBase environment can have any combination of:
 * - PostgreSQL (CloudBase PG / pgstore): signaled by `EnvInfo.PostgreSQL[]`
 *   non-empty and/or `EnvInfo.Meta` containing `postgresql=enable`.
 * - NoSQL document database (flexdb): signaled ONLY by a usable entry in
 *   `EnvInfo.Databases[]`. The usable signal is a non-empty `InstanceId`
 *   (FlexDB Tag, typically `tnt-...` — same value `getDatabaseInstanceId`
 *   / ListTables `Tag` consume) with `Status` missing or `RUNNING`.
 *   Cloud storage (`EnvInfo.Storages[]` / CreateEnv `storage`) is unrelated
 *   and must never flip `RuntimeBackends.nosql`.
 * - MySQL: signaled by a non-empty `EnvInfo.MysqlInstances[]` (or similar
 *   field, name varies). In a pure PG environment this is absent.
 *
 * In particular: a CloudBase PG environment commonly STILL has flexdb
 * provisioned in parallel (`Databases[].InstanceId = tnt-...`). NoSQL is
 * therefore "co-present" — its collection APIs and NoSQL `securityRule`s
 * remain valid for collections that already live there. The thing that is
 * NOT a substitute for the new PG surface is using NoSQL collections to
 * model a brand-new business table that the task explicitly puts in PG.
 *
 * What this enrichment does:
 * - Adds `EnvInfo.RuntimeMode = "postgresql" | "nosql"` based on whether
 *   PG is present. This is the recommended primary backend for new
 *   business data when set to "postgresql".
 * - Adds `EnvInfo.RuntimeBackends`, a structured snapshot of which
 *   backends are actually available (postgresql / nosql / mysql), so the
 *   agent does not have to re-read `Databases`/`PostgreSQL`.
 * - Adds `EnvInfo.RuntimeModeHints` summarizing which API/tool to prefer
 *   for new code, including an explicit `MysqlNotAvailable` line when
 *   MySQL is absent — that one IS a hard "do not use" signal.
 */
/** Exported for unit tests / live-fixture checks against FlexDB InstanceId. */
export function isUsableNoSqlDatabaseEntry(db: unknown): boolean {
  if (!db || typeof db !== "object") {
    return false;
  }
  const entry = db as { InstanceId?: unknown; Status?: unknown };
  const instanceId =
    typeof entry.InstanceId === "string" ? entry.InstanceId.trim() : "";
  // Empty InstanceId means no flexdb tenant — same failure mode as
  // getDatabaseInstanceId() throwing "无法获取数据库实例ID".
  if (!instanceId) {
    return false;
  }
  // Some API versions omit Status; when present, only RUNNING counts as usable.
  if (entry.Status != null && String(entry.Status).toUpperCase() !== "RUNNING") {
    return false;
  }
  return true;
}

async function enrichEnvInfoWithRuntimeMode(result: any, manager?: any) {
  const envInfo = result?.EnvInfo;
  if (!envInfo || typeof envInfo !== "object") {
    return result;
  }

  const pgList = Array.isArray(envInfo.PostgreSQL) ? envInfo.PostgreSQL : [];
  const metaList = Array.isArray(envInfo.Meta) ? envInfo.Meta : [];
  const metaPostgresEnabled = metaList.some(
    (item: any) =>
      item &&
      typeof item.Key === "string" &&
      /^postgre[_]?sql$/i.test(item.Key) &&
      String(item.Value).toLowerCase() === "enable",
  );
  const hasPostgresql = pgList.length > 0 || metaPostgresEnabled;

  // NoSQL = flexdb tenant id on Databases[].InstanceId (typically tnt-...).
  // Aligns with getDatabaseInstanceId() / ListTables Tag. Storage is unrelated.
  const databasesList = Array.isArray(envInfo.Databases)
    ? envInfo.Databases
    : [];
  const hasNoSql = databasesList.some(isUsableNoSqlDatabaseEntry);

  // MySQL field name has been seen as MysqlInstances / MySQLInstances /
  // MySQL across API versions; check any of them.
  const mysqlList = (() => {
    for (const k of ["MysqlInstances", "MySQLInstances", "MySQL"]) {
      const v = (envInfo as any)[k];
      if (Array.isArray(v) && v.length > 0) return v;
    }
    return [];
  })();
  let hasMysql = mysqlList.length > 0;

  // Fallback: if MySQL not detected from DescribeEnvInfo fields, probe via
  // DescribeMySQLClusterDetail (dedicated MySQL API). This covers cases where
  // the SDK strips MySQL fields from the DescribeEnvInfo response.
  if (!hasMysql && manager?.commonService) {
    try {
      const probeResult = await manager
        .commonService("tcb", "2018-06-08")
        .call({
          Action: "DescribeMySQLClusterDetail",
          Param: { EnvId: envInfo.EnvId },
        });
      const clusterId =
        probeResult?.DbClusterId ||
        probeResult?.Response?.DbClusterId ||
        probeResult?.Data?.DbClusterId;
      if (clusterId) {
        hasMysql = true;
      }
    } catch {
      // Probe failure means MySQL is not provisioned — keep hasMysql = false
    }
  }

  // Primary mode: prefer PG when it is provisioned, otherwise fall back to
  // legacy NoSQL labeling. This drives "what skill to read first / what API
  // to reach for when starting new business code".
  const runtimeMode: "postgresql" | "nosql" = hasPostgresql
    ? "postgresql"
    : "nosql";

  const hints = hasPostgresql
    ? {
        PrimaryBackend:
          "PostgreSQL (CloudBase PG) is provisioned — prefer it for any NEW business data the task introduces.",
        BusinessDataAPI:
          "For NEW business data on PG: use CloudBase JS SDK v3 `app.rdb()` (Supabase-style chained query). Existing NoSQL collections in this env keep working through `app.database()`; do not migrate them unless the task asks.",
        Permissions:
          "PG table permissions use Row-Level Security. Run `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` and `CREATE POLICY` via `managePgDatabase(action=\"execute\", confirm=true)`. `managePermissions(resourceType=\"noSqlDatabase\", securityRule=...)` only governs NoSQL collection rules and has NO effect on PG tables — keep using it for the NoSQL collections that already exist here.",
        Storage:
          "PG-mode browser uploads should use `app.storage.from().upload(<bucket>/<key>, file)` against an explicitly-created `pgstore` bucket (same model as Supabase Storage; the v3 SDK does not auto-create one). `EnvInfo.Storages[]` here is the legacy NoSQL bucket — it is still usable for the legacy `app.uploadFile()` flow but is NOT a valid pgstore target.",
        CoexistingNoSQL: hasNoSql
          ? "This env also has a usable NoSQL (flexdb) InstanceId in EnvInfo.Databases[] (FlexDB Tag, typically tnt-...). Existing collections and `managePermissions(resourceType=\"noSqlDatabase\")` rules remain valid for that data."
          : "No usable NoSQL (flexdb) InstanceId in EnvInfo.Databases[] — do not assume app.database() / NoSQL MCP tools work. Cloud storage does not imply flexdb.",
        MysqlNotAvailable: hasMysql
          ? "MySQL instance(s) detected — see EnvInfo.MysqlInstances."
          : "No MySQL instance is provisioned for this env. Do NOT use `manageMysqlDatabase` / `queryMysqlDatabase` (those are MySQL-specific) and do NOT read the `relational-database-mcp-cloudbase` skill — that family targets MySQL, not CloudBase PG.",
        RecommendedSkills:
          "Read `postgresql-development-cloudbase` first for new PG code. `cloudbase-document-database-web-sdk` is still applicable for existing NoSQL collections in this env. Skip `relational-database-mcp-cloudbase` (MySQL-only) entirely.",
      }
    : {
        PrimaryBackend:
          "PostgreSQL is NOT provisioned in this env — this is a legacy NoSQL CloudBase backend.",
        BusinessDataAPI:
          "Use `app.database()` collections via `@cloudbase/js-sdk` for browser business data. Do not switch to `app.rdb()` here — PG is not available.",
        Permissions:
          "Use `managePermissions(resourceType=\"noSqlDatabase\", securityRule=...)` for collection rules. PG-only RLS guidance (e.g. `auth.uid()` SQL policies) does not apply here.",
        Storage:
          "Browser uploads use `app.uploadFile()` against the bucket exposed in `EnvInfo.Storages[].Bucket`.",
        MysqlNotAvailable: hasMysql
          ? "MySQL instance(s) detected — see EnvInfo.MysqlInstances."
          : "No MySQL instance in this env. `manageMysqlDatabase` / `queryMysqlDatabase` and the `relational-database-mcp-cloudbase` skill are not applicable.",
        RecommendedSkills:
          "Read `cloudbase-document-database-web-sdk` (and `cloud-storage-web` for uploads). `postgresql-development-cloudbase` and `relational-database-mcp-cloudbase` are not applicable to this env.",
      };

  return {
    ...result,
    EnvInfo: {
      ...envInfo,
      RuntimeMode: runtimeMode,
      RuntimeBackends: {
        postgresql: hasPostgresql,
        nosql: hasNoSql,
        mysql: hasMysql,
      },
      RuntimeModeHints: hints,
    },
  };
}

/**
 * 补充 SDK getEnvInfo() 遗漏的字段。
 *
 * @cloudbase/manager-node 的 getEnvInfo() 从 DescribeEnvInfo CAPI 响应的
 * EnvBaseInfo 中手写白名单映射时，漏掉了 PostgreSQL、Meta、StaticStorages 等字段。
 * 这导致 enrichEnvInfoWithRuntimeMode 无法正确判断环境是否支持 PostgreSQL。
 *
 * 此函数通过 commonService 额外调用 DescribeEnvInfo CAPI，从原始响应中提取
 * 缺失字段补到 EnvInfo 上。
 */
async function enrichEnvInfoWithMissingFields(
  manager: any,
  result: any,
  envId: string,
): Promise<any> {
  const envInfo = result?.EnvInfo;
  if (!envInfo || typeof envInfo !== "object") {
    return result;
  }

  // 如果 PostgreSQL 字段已存在且非空，说明 SDK 已经透传了，不需要补充
  if (
    Array.isArray(envInfo.PostgreSQL) &&
    envInfo.PostgreSQL.length > 0 &&
    Array.isArray(envInfo.Meta)
  ) {
    return result;
  }

  try {
    const capiResult = await manager.commonService("tcb", "2018-06-08").call({
      Action: "DescribeEnvInfo",
      Param: { EnvId: envId },
    });

    const envBaseInfo =
      capiResult?.EnvInfo?.EnvBaseInfo ||
      capiResult?.Response?.EnvInfo?.EnvBaseInfo;

    if (!envBaseInfo || typeof envBaseInfo !== "object") {
      return result;
    }

    return {
      ...result,
      EnvInfo: {
        ...envInfo,
        // 补充 PostgreSQL 字段（SDK 白名单映射遗漏）
        ...(Array.isArray(envBaseInfo.PostgreSQL) && {
          PostgreSQL: envBaseInfo.PostgreSQL,
        }),
        // 补充 Meta 字段（SDK 白名单映射遗漏）
        ...(Array.isArray(envBaseInfo.Meta) && {
          Meta: envBaseInfo.Meta,
        }),
        // 补充 StaticStorages 字段（SDK 白名单映射遗漏）
        ...(Array.isArray(envBaseInfo.StaticStorages) && {
          StaticStorages: envBaseInfo.StaticStorages,
        }),
      },
    };
  } catch {
    // CAPI 调用失败不影响已有数据，静默忽略
    return result;
  }
}

function normalizeOptionalToolString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/**
 * Build enhanced error message for queryEnv tool errors
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
    suggestions.push("3. 登录完成后再次调用 queryEnv(action=\"list\")");
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
    suggestions.push("请使用 queryEnv(action=\"list\") 查看可用的环境列表。");
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

  return `[queryEnv/${action}] 调用失败: ${baseMessage}\n\n解决建议：\n${suggestions.join("\n")}`;
}

function normalizeOptionalToolBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

/**
 * 解析用于询价的 region。与 cloudbase-manager.ts 一致：
 * cloudBaseOptions.region → TCB_REGION → 'ap-shanghai'。
 */
function resolvePricingRegion(cloudBaseOptions: any): string {
  return (
    (typeof cloudBaseOptions?.region === "string" && cloudBaseOptions.region) ||
    process.env.TCB_REGION ||
    "ap-shanghai"
  );
}

/**
 * 从 describeBaasPackageList 查询某个 packageId 的人类可读套餐名。
 * 失败时返回 undefined，调用方降级为只显示 packageId。
 */
async function fetchPackageTitle(
  manager: any,
  packageId: string,
): Promise<string | undefined> {
  try {
    const result = await manager.env.describeBaasPackageList({
      TargetAction: "new",
      Source: "qcloud",
    });
    const packageList = result?.PackageList || [];
    const matched = packageList.find(
      (item: any) =>
        item?.BillTags === packageId || item?.PackageName === packageId,
    );
    if (matched) {
      return (
        matched.PackageTitle || matched.PackageName || matched.BillTags
      );
    }
    return undefined;
  } catch (error) {
    debug("fetchPackageTitle failed", { packageId, error });
    return undefined;
  }
}

/**
 * 查询环境的当前计费/套餐信息（PackageName、PackageId、Region、到期时间、PayMode）。
 * 失败时返回 undefined。
 */
async function fetchEnvBillingSummary(
  manager: any,
  envId: string,
): Promise<{
  packageName?: string;
  packageId?: string;
  region?: string;
  expireTime?: string;
  payMode?: string;
  isAutoRenew?: boolean;
} | undefined> {
  try {
    // describeBillingInfo 返回 EnvBillingInfoList；从中挑出 envId 对应项
    const billingResult = await manager.env.describeBillingInfo({ EnvId: envId });
    const billingList =
      billingResult?.EnvBillingInfoList ||
      billingResult?.Response?.EnvBillingInfoList ||
      billingResult?.Data?.EnvBillingInfoList ||
      [];
    const matched = Array.isArray(billingList)
      ? billingList.find((item: any) => item?.EnvId === envId) ?? billingList[0]
      : undefined;
    if (!matched) {
      return undefined;
    }
    return {
      packageName: matched.PackageName,
      packageId: matched.PackageId,
      region: matched.Region,
      expireTime: matched.ExpireTime,
      payMode: matched.PayMode,
      isAutoRenew: matched.IsAutoRenew,
    };
  } catch (error) {
    debug("fetchEnvBillingSummary failed", { envId, error });
    return undefined;
  }
}

/**
 * 询价新购价格。失败时返回 { error }。
 */
async function calculateCreatePrice(
  manager: any,
  params: { packageId: string; region: string; period: number },
): Promise<{ priceResult?: any; error?: string }> {
  try {
    const priceResult = await manager.env.calculatePackageCreatePrice({
      packageId: params.packageId,
      region: params.region,
      period: params.period,
    });
    return { priceResult };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debug("calculatePackageCreatePrice failed", { params, error });
    return { error: message };
  }
}

/**
 * 询价续费价格。失败时返回 { error }。
 */
async function calculateRenewPrice(
  manager: any,
  envId: string,
  period: number,
): Promise<{ priceResult?: any; error?: string }> {
  try {
    const priceResult = await manager.env.calculatePackageRenewPrice({
      envId,
      period,
    });
    return { priceResult };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debug("calculatePackageRenewPrice failed", { envId, period, error });
    return { error: message };
  }
}

/**
 * 询价变配价格（含退款）。失败时返回 { error }。
 */
async function calculateModifyPrice(
  manager: any,
  envId: string,
  newPackageId: string,
): Promise<{ priceResult?: any; error?: string }> {
  try {
    const priceResult = await manager.env.calculatePackageModifyPrice({
      envId,
      newPackageId,
    });
    return { priceResult };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    debug("calculatePackageModifyPrice failed", { envId, newPackageId, error });
    return { error: message };
  }
}

/**
 * 把 PriceResult 格式化为人类可读的价格摘要。
 * 返回 { summary, detail }：summary 是一行短语，detail 是多行明细。
 */
function formatPriceSection(priceResult: any): {
  summary: string;
  detail: string;
} {
  if (!priceResult || typeof priceResult !== "object") {
    return { summary: "询价返回为空", detail: "" };
  }

  const currency = priceResult.Currency === "USD" ? "$" : "￥";
  const realTotalCost = Number(priceResult.RealTotalCost);
  const totalCost = Number(priceResult.TotalCost);
  const unitPrice = Number(priceResult.Price);
  const timeSpan = priceResult.TimeSpan;
  const TimeUnit = priceResult.TimeUnit || "";
  const refund = priceResult.Refund ? Number(priceResult.Refund) : undefined;

  const lines: string[] = [];
  let summary = "";

  if (Number.isFinite(realTotalCost) && realTotalCost > 0) {
    summary = `预计实付 ${currency}${realTotalCost}`;
    lines.push(`- 实付总价: ${currency}${realTotalCost}`);
  } else if (Number.isFinite(totalCost) && totalCost > 0) {
    summary = `预计费用 ${currency}${totalCost}`;
    lines.push(`- 总价: ${currency}${totalCost}`);
  }

  if (Number.isFinite(totalCost) && totalCost > 0 && totalCost !== realTotalCost) {
    lines.push(`- 原价: ${currency}${totalCost}`);
  }

  if (Number.isFinite(unitPrice) && unitPrice > 0) {
    lines.push(`- 单价: ${currency}${unitPrice}`);
  }

  if (timeSpan !== undefined && TimeUnit) {
    lines.push(`- 时长: ${timeSpan} ${TimeUnit}`);
  }

  if (refund !== undefined && Number.isFinite(refund) && refund > 0) {
    lines.push(`- 退款: ${currency}${refund}（变配降级时退回差价）`);
    if (summary) {
      summary += `，退款 ${currency}${refund}`;
    } else {
      summary = `退款 ${currency}${refund}`;
    }
  }

  if (priceResult.Formula && typeof priceResult.Formula === "string") {
    lines.push(`- 计价公式: ${priceResult.Formula}`);
  }

  return {
    summary: summary || "询价返回缺少总价字段",
    detail: lines.join("\n"),
  };
}

/**
 * 构建释放方式说明。manageEnv 当前未提供 destroy action，
 * 指向控制台让用户手动销毁。
 */
function buildReleaseMethodHint(): {
  method: string;
  consoleUrl: string;
  note: string;
} {
  return {
    method: "手动销毁",
    consoleUrl: "https://console.cloud.tencent.com/tcb",
    note: '环境创建后可随时销毁以停止计费。当前 manageEnv 未提供 destroy action，请前往控制台手动销毁，或调用 manageEnv(action="listPackages") 查看其他套餐。',
  };
}

/**
 * manageEnv 涉及计费的官方文档链接。来源：腾讯云开发 CloudBase 公开文档。
 * 任何 confirm 消息展示这些链接前不需要再次校验 URL 真实性。
 */
const MANAGE_ENV_DOC_LINKS = {
  // 包年包月套餐说明（个人版 / 标准版 / 企业版 / 企业高级版）
  package:
    "https://cloud.tencent.com/document/product/876/39093",
  // 计费能力项说明
  billingItems:
    "https://cloud.tencent.com/document/product/876/120713",
  // 资源点价格文档
  resourcePointPrice:
    "https://cloud.tencent.com/document/product/876/127357",
  // 预付费计费与到期释放（费用中心通用）
  prepayExpiry:
    "https://cloud.tencent.com/document/product/555/9618",
} as const;

/**
 * 把文档链接渲染为多行 markdown 列表文本。
 * filter 不传时全部展示。
 */
function renderDocLinksBlock(
  filter?: ReadonlyArray<keyof typeof MANAGE_ENV_DOC_LINKS>,
): string {
  const labels: Record<keyof typeof MANAGE_ENV_DOC_LINKS, string> = {
    package: "包年包月套餐说明",
    billingItems: "计费能力项说明",
    resourcePointPrice: "资源点价格文档",
    prepayExpiry: "预付费计费与到期释放（费用中心通用）",
  };
  const entries = (filter ?? (Object.keys(MANAGE_ENV_DOC_LINKS) as Array<keyof typeof MANAGE_ENV_DOC_LINKS>))
    .map((k) => `- [${labels[k]}](${MANAGE_ENV_DOC_LINKS[k]})`)
    .join("\n");
  return `参考文档：\n${entries}`;
}

/**
 * 资源清单详细描述（对应控制台购买页"资源清单"段）。
 */
function buildResourceListText(): string {
  return "资源清单：\n- 云开发环境 ×1（含 云数据库 / 云函数 / 云存储 / 静态托管 / 身份认证 等基础资源）";
}

/**
 * 计费项披露（对应控制台购买页"计费项"段）。
 * 此处为静态披露，调用方在 confirm 消息中拼接即可。
 */
function buildBillingItemsText(): string {
  return "计费项：\n- 数据库容量/调用 · 云函数调用/资源/流量 · 存储读写/CDN · 网关/认证/API 调用 · QPS 超限按量 · 日志";
}

/**
 * 计费方式披露（对应控制台购买页"计费方式"段）。
 * 针对用户传入的 packageId 判断套餐类型：
 * - 含 free/activity/trial/试用 等关键字视为免费体验版
 * - 其余视为付费套餐
 */
function buildBillingModeText(packageId: string | undefined): string {
  const id = (packageId || "").toLowerCase();
  const isFree =
    id.includes("free") ||
    id.includes("activity") ||
    id.includes("trial") ||
    id.includes("试用") ||
    id.includes("体验");
  if (isFree) {
    return (
      "计费方式：\n- 免费体验版（每月赠送约 3000 资源点 ≈ 3 元，0 元开通）\n" +
      "- 付费套餐：个人版 / 标准版 / 企业版 / 企业高级版"
    );
  }
  return (
    "计费方式：\n- 付费套餐：个人版 / 标准版 / 企业版 / 企业高级版\n" +
    "- 免费体验版通过 auth 工具自动创建；本次 manageEnv(create) 不会创建免费版"
  );
}

/**
 * 资源释放方式详细说明（对应控制台购买页"资源释放方式"段）。
 * - 免费版：1 个月有效期 + 免费续期 + 停服(保留数据) + 1~7天回收站 + 释放(数据不可恢复)
 * - 付费版：到期未续费 → 停服(保留数据) + 1~7天可回收站找回 + 释放(数据不可恢复)
 * 任何时候都可在控制台主动销毁、关闭按量、退订加购资源。
 */
function buildReleaseMethodDetailText(packageId: string | undefined): string {
  const id = (packageId || "").toLowerCase();
  const isFree =
    id.includes("free") ||
    id.includes("activity") ||
    id.includes("trial") ||
    id.includes("试用") ||
    id.includes("体验");
  const lines: string[] = ["资源释放方式：\n- 可随时在控制台销毁环境、关闭按量、退订加购资源"];
  if (isFree) {
    lines.push(
      "- 免费体验版：有效期 1 个月，到期可免费续期 1 个月；未续期则停服(保留数据)→1~7天回收站→释放(数据不可恢复)",
    );
  } else {
    lines.push(
      "- 付费套餐到期未续费：停服(保留数据)→1~7天可回收站找回→释放(数据不可恢复)",
    );
    lines.push("- 主动销毁：随时生效；销毁前请确保已迁移或备份数据");
  }
  return lines.join("\n");
}

/**
 * 预计费用披露段：把询价结果 + 周期说明 + 超额按量说明组合成人类可读文本。
 */
function buildPricingDisclosureText(
  packageId: string | undefined,
  priceSection: { summary: string; detail: string } | null,
  priceError: string | undefined,
  period: number,
): string {
  const id = (packageId || "").toLowerCase();
  const isFree =
    id.includes("free") ||
    id.includes("activity") ||
    id.includes("trial") ||
    id.includes("试用") ||
    id.includes("体验");
  const lines: string[] = ["预计费用："];

  if (isFree) {
    lines.push(
      `- 免费体验版：本次开通 0 元；超免费额度后需升级为付费套餐（免费版不支持开按量）`,
    );
    lines.push("- 实际单价以资源点价格文档为准（3000 资源点 ≈ 3 元）");
  } else {
    lines.push(
      `- 付费套餐：${priceSection?.summary ?? (priceError ? `⚠️ 询价失败（${priceError}），请前往控制台确认` : "询价返回为空")}`,
    );
    if (priceSection?.detail) {
      lines.push(priceSection.detail);
    }
    if (priceError && priceSection) {
      lines.push(`- ⚠️ 部分明细缺失：${priceError}`);
    }
    lines.push(`- 计费周期：约 ${period} 个月（包年包月），到期可续费或变配`);
    lines.push("- 超额可另开按量（次日结算），详细计费项以官方文档为准");
  }
  return lines.join("\n");
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

  // Default: env-scoped tools need a bound envId (domains / domain management use SDK this.envId).
  // manageEnv create/listPackages are account-level — use requireEnvId: false there only.
  const getManager = (options?: { requireEnvId?: boolean }) =>
    getCloudBaseManager({
      cloudBaseOptions,
      requireEnvId: options?.requireEnvId ?? true,
      mcpServer: server,
    });
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
  // 微信 IDE 使用票据认证，不需要登录工具
  if (server.ide !== 'wxide') {
  server.registerTool?.(
    "auth",
    {
      title: "CloudBase 开发阶段登录与环境",
      description:
        "CloudBase（腾讯云开发）开发阶段登录与环境绑定。登录后即可访问云资源；环境(env)是云函数、数据库、静态托管等资源的隔离单元，绑定环境后其他 MCP 工具才能操作该环境。支持：查询状态、发起登录、API Key登录、绑定环境(set_env)、退出登录。",
      inputSchema: {
        action: z
          .enum(authActionEnum)
          .optional()
          .describe(
            "动作：status=查询状态，start_auth=发起登录，login_by_api_key=API Key登录，set_env=绑定环境(传envId)，logout=退出登录",
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
        ...(supportedAuthActions.includes("login_by_api_key")
          ? {
              apiKey: z
                .string()
                .optional()
                .describe("CloudBase API Key，action=login_by_api_key 时必填"),
              apiKeyEnvId: z
                .string()
                .optional()
                .describe("CloudBase 环境ID(EnvId)，action=login_by_api_key 时必填，用于指定 API Key 所属环境"),
            }
          : {}),
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
      apiKey?: unknown;
      apiKeyEnvId?: unknown;
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

          // Detect API Key mode (CLOUDBASE_API_KEY preferred, CLOUDBASE_APIKEY fallback)
          const apiKeyFromEnv = getCloudBaseApiKeyFromEnv();
          const isApiKeyMode = !!(apiKeyFromEnv && process.env.CLOUDBASE_ENV_ID);

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
            ...(isApiKeyMode ? { auth_mode: "api_key" } : {}),
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
          // API Key mode: exchange for temporary credentials
          const apiKeyFromEnv = getCloudBaseApiKeyFromEnv();
          if (apiKeyFromEnv && process.env.CLOUDBASE_ENV_ID) {
            try {
              const existingLoginState = await peekLoginState();
              if (existingLoginState) {
                return buildJsonToolResult({
                  ok: true,
                  code: "AUTH_READY",
                  message: "当前使用 API Key 认证模式，已自动完成登录，无需手动授权。",
                  auth_mode: "api_key",
                  envId: process.env.CLOUDBASE_ENV_ID,
                });
              }
            } catch (e) {
              // peekLoginState threw; log and fall through to diagnostic
              debug("start_auth: peekLoginState threw", { error: e instanceof Error ? e.message : String(e) });
            }

            // API Key exchange failed: return diagnostic details
            let diagMessage = "当前配置了 API Key 认证模式，但换取临时密钥失败。";
            const endpoint = process.env.CLOUDBASE_API_ENDPOINT || `https://${process.env.CLOUDBASE_ENV_ID}.ap-shanghai.tcb-api.tencentcloudapi.com`;
            diagMessage += `\n\n诊断信息：`;
            diagMessage += `\n- CLOUDBASE_ENV_ID: ${process.env.CLOUDBASE_ENV_ID}`;
            diagMessage += `\n- CLOUDBASE_API_KEY: ${apiKeyFromEnv.slice(0, 20)}...（已截断）`;
            diagMessage += `\n- Endpoint: ${endpoint}`;
            diagMessage += `\n\n可能原因：`;
            diagMessage += `\n1. API Key 已过期或被删除`;
            diagMessage += `\n2. Endpoint 不可达（网络/DNS 问题）`;
            diagMessage += `\n3. CLOUDBASE_ENV_ID 与 API Key 所属环境不匹配`;
            diagMessage += `\n\n建议：检查 MCP 配置中的 CLOUDBASE_API_KEY（或兼容的 CLOUDBASE_APIKEY）和 CLOUDBASE_ENV_ID 环境变量是否正确。`;

            return buildJsonToolResult({
              ok: false,
              code: "API_KEY_AUTH_FAILED",
              message: diagMessage,
              auth_mode: "api_key",
              envId: process.env.CLOUDBASE_ENV_ID,
              endpoint,
            });
          }

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

        if (action === "login_by_api_key") {
          const toolApiKey = normalizeOptionalToolString(rawArgs.apiKey);
          const toolApiKeyEnvId = normalizeOptionalToolString(rawArgs.apiKeyEnvId);

          if (!toolApiKey || !toolApiKeyEnvId) {
            return buildJsonToolResult({
              ok: false,
              code: "INVALID_ARGS",
              message: "action=login_by_api_key 时必须同时提供 apiKey 和 envId。",
              next_step: buildAuthNextStep("login_by_api_key", {
                suggestedArgs: { action: "login_by_api_key", apiKey: "<your-api-key>", envId: "<your-env-id>" },
              }),
            });
          }

          // 写入 process.env（与 cli.ts 处理 --api-key/--env-id 的逻辑一致）
          process.env.CLOUDBASE_API_KEY = toolApiKey;
          process.env.CLOUDBASE_ENV_ID = toolApiKeyEnvId;

          try {
            const loginState = await peekLoginState();
            if (loginState) {
              const envPreparation = await prepareAuthEnvironment({
                server,
                cloudBaseOptions,
                loginState,
              });
              return buildJsonToolResult({
                ok: true,
                code: "AUTH_READY",
                message: "API Key 认证成功，已获取临时密钥。",
                auth_mode: "api_key",
                ...buildAuthEnvSetupPayload(envPreparation),
                next_step: envPreparation.nextStep,
              });
            }

            // API Key 换取失败：清理 env vars 并返回诊断信息
            delete process.env.CLOUDBASE_API_KEY;
            delete process.env.CLOUDBASE_ENV_ID;

            let diagMessage = "API Key 换取临时密钥失败。";
            diagMessage += `\n\n诊断信息：`;
            diagMessage += `\n- CLOUDBASE_ENV_ID: ${toolApiKeyEnvId}`;
            diagMessage += `\n- CLOUDBASE_API_KEY: ${toolApiKey.slice(0, 20)}...（已截断）`;
            diagMessage += `\n\n可能原因：`;
            diagMessage += `\n1. API Key 已过期或被删除`;
            diagMessage += `\n2. CLOUDBASE_ENV_ID 与 API Key 所属环境不匹配`;
            diagMessage += `\n3. 网络连接问题`;
            diagMessage += `\n\n建议：请检查 API Key 和环境 ID 是否正确。`;

            return buildJsonToolResult({
              ok: false,
              code: "API_KEY_AUTH_FAILED",
              message: diagMessage,
              auth_mode: "api_key",
              envId: toolApiKeyEnvId,
              next_step: buildAuthNextStep("login_by_api_key", {
                suggestedArgs: { action: "login_by_api_key", apiKey: "<your-api-key>", envId: "<your-env-id>" },
              }),
            });
          } catch (error) {
            // 异常时清理 env vars
            delete process.env.CLOUDBASE_API_KEY;
            delete process.env.CLOUDBASE_ENV_ID;

            const message = error instanceof Error ? error.message : String(error);
            return buildJsonToolResult({
              ok: false,
              code: "API_KEY_AUTH_FAILED",
              message: `API Key 认证异常: ${message}`,
              auth_mode: "api_key",
              next_step: buildAuthNextStep("login_by_api_key", {
                suggestedArgs: { action: "login_by_api_key", apiKey: "<your-api-key>", envId: "<your-env-id>" },
              }),
            });
          }
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
          // Disallow logout in API Key mode
          if (getCloudBaseApiKeyFromEnv() && process.env.CLOUDBASE_ENV_ID) {
            return buildJsonToolResult({
              ok: false,
              code: "LOGOUT_NOT_ALLOWED",
              message: "当前使用 API Key 认证模式，不支持退出登录。如需切换认证方式，请移除 CLOUDBASE_API_KEY（或兼容的 CLOUDBASE_APIKEY）环境变量后重启。",
              auth_mode: "api_key",
            });
          }

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
  } // end: wxide guard for auth tool

  // queryEnv - 环境查询（合并 listEnvs + getEnvInfo + getEnvAuthDomains）
  const queryEnvHandler: (args: any) => Promise<any> = async ({
    action,
    alias,
    aliasExact,
    envId,
    limit,
    offset,
    fields,
  }: {
      action: "list" | "info" | "domains";
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

              // 当环境变量设置了 CLOUDBASE_ENV_ID 时（如 API Key 模式），
              // 避免调用 DescribeEnvs（临时密钥可能不支持该接口），
              // 改为通过 DescribeEnvInfo 获取单环境信息
              // 注意：requestFn 模式（如微信 IDE）使用 DescribeEnvs，不走此分支
              const envIdFromEnv = !cloudBaseOptions?.requestFn && process.env.CLOUDBASE_ENV_ID;
              if (envIdFromEnv) {
                try {
                  const envInfo = await cloudbaseList.env.describeEnvInfo({ EnvId: envIdFromEnv });
                  logCloudBaseResult(server.logger, envInfo);
                  // DescribeEnvInfo 返回结构: { EnvInfo: { EnvBaseInfo: { EnvId, Alias, ... }, BillingInfo, ... } }
                  // 需要提取 EnvBaseInfo 作为扁平 env 对象以匹配 DescribeEnvs 返回格式
                  const baseInfo = envInfo?.EnvInfo?.EnvBaseInfo;
                  if (baseInfo) {
                    result = { EnvList: [baseInfo] };
                  } else if (envInfo?.EnvInfo) {
                    // 兼容: 如果没有 EnvBaseInfo 但有 EnvInfo，尝试直接使用
                    result = { EnvList: [{ EnvId: envIdFromEnv, ...envInfo.EnvInfo }] };
                  } else {
                    result = { EnvList: [{ EnvId: envIdFromEnv }] };
                  }
                } catch (envInfoError) {
                  debug("DescribeEnvInfo 失败，返回基础环境信息:", envInfoError instanceof Error ? envInfoError : new Error(String(envInfoError)));
                  result = { EnvList: [{ EnvId: envIdFromEnv }] };
                }
              } else {
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
            // 补充 SDK getEnvInfo() 遗漏的字段（PostgreSQL、Meta 等）
            // @cloudbase/manager-node 的 getEnvInfo() 手写白名单映射时漏掉了这些字段
            if (envId) {
              result = await enrichEnvInfoWithMissingFields(cloudbaseInfo, result, envId);
            }
            result = await enrichEnvInfoWithRuntimeMode(result, cloudbaseInfo);
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
    };

  // Register primary tool name (queryEnv)
  const queryEnvToolSchema = {
    title: "CloudBase 环境查询",
    description:
      "查询 CloudBase 环境相关信息，支持查询环境列表、指定环境详情和安全域名。（曾用名：envQuery、listEnvs、getEnvInfo、getEnvAuthDomains）当 action=list 时，会按 DescribeEnvs 语义做列表/筛选，标准返回字段为 EnvId、Alias、Status、EnvType、Region、PackageId、PackageName、IsDefault，并支持通过 fields 白名单裁剪这些字段；aliasExact=true 时会按别名精确筛选，避免把前缀相近的环境误当作候选；即使传入 envId，action=list 也只返回摘要，不会返回完整资源明细或 expiry。如需查询某个已知 EnvId 对应环境的详细信息（包括资源字段和计费信息），必须使用 action=info 并传入目标环境的 envId 参数。action=info 会在可用时补充 BillingInfo（如 ExpireTime、PayMode、IsAutoRenew 等计费字段）。\n\n🔍 action=info 还会派生三个用于后端选型的字段：\n- `EnvInfo.RuntimeMode`：'postgresql' 或 'nosql'，表示新业务建议默认使用的后端（PG 已开通时为 postgresql，否则为 nosql）。\n- `EnvInfo.RuntimeBackends`：`{postgresql, nosql, mysql}` 三个布尔值，描述当前环境实际并存的后端。\n- `EnvInfo.RuntimeModeHints`：每个后端对应的 API/工具/skill 提示。\n\nAI 在写业务/权限/存储代码前必须先看这三项：PG 模式下新业务推荐 `app.rdb()` + RLS（`managePgDatabase action=execute` 跑 `CREATE POLICY`）+ pgstore；已存在的 NoSQL 集合 / 旧 storage / `managePermissions(resourceType=\"noSqlDatabase\")` 在 PG 环境下仍然有效。真正不适用的是 MySQL：当 `RuntimeBackends.mysql === false` 时，`manageMysqlDatabase` / `queryMysqlDatabase` / `relational-database-mcp-cloudbase` skill 都不该使用。",
    inputSchema: {
      action: z
        .enum(["list", "info", "domains"])
        .describe(
          "查询类型：list=环境列表/摘要筛选（按 DescribeEnvs 语义筛选，支持通过 envId 筛选，返回 EnvId、Alias、Status、EnvType、Region、PackageId、PackageName、IsDefault，不支持 expiry），info=指定环境的详细信息（必须传入 envId，返回资源字段和计费信息），domains=安全域名列表",
        ),
      alias: z.string().optional().describe("按环境别名筛选。action=list 时可选"),
      aliasExact: z.boolean().optional().describe("按环境别名精确筛选。action=list 时可选；与 alias 配合使用"),
      envId: z.string().optional().describe("按环境 ID 筛选。action=list 时可选（仅按 DescribeEnvs 语义做筛选，仍返回摘要）；action=info 时必填（返回该环境的详细信息，包含资源字段和计费信息）。如果任务已经给出了明确的 EnvId 并要求查询详情，请直接使用 action=info + envId，而不是 action=list"),
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
  };
  server.registerTool?.("queryEnv", queryEnvToolSchema, queryEnvHandler);
  // 向后兼容：envQuery 作为 queryEnv 的别名注册
  server.registerTool?.("envQuery", queryEnvToolSchema, queryEnvHandler);

  // envDomainManagement - 环境域名管理（合并 createEnvDomain + deleteEnvDomain）
  // 微信 IDE 场景不需要域名管理
  if (server.ide !== 'wxide') {
  server.registerTool?.(
    "envDomainManagement",
    {
      title: "CloudBase 环境域名管理（安全域名 / CORS 白名单）",
      description:
        "管理 CloudBase 环境的安全域名（安全域名 / CORS 白名单），支持添加和删除操作。（原工具名：createEnvDomain/deleteEnvDomain，为兼容旧AI规则可继续使用这些名称）当浏览器 Web 应用需要从本地 Vite / dev server 直接访问 CloudBase 资源时，应先用 queryEnv(action=domains) 检查当前实际浏览器 origin 对应的 host:port 是否已在白名单中，再按该实际值添加。新增或删除后请每约 10 秒轮询 queryEnv(action=domains) 确认状态收敛，勿一次 sleep 满 10 分钟；多数环境数分钟内可收敛。⚠️ 重要：此工具仅用于 CORS/请求来源验证，不涉及 SSL 证书。自定义域名公网 HTTPS：先 queryGateway(listCustomDomains)；已有域名则 manageGateway(createRoute) 显式传 domain（无需证书）；仅首次绑定新域名才用 bindCustomDomain（需 certificateId）。",
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
  } // end: wxide guard for envDomainManagement

  // manageEnv - 环境管理（创建、销毁、变更套餐、续费、查询套餐）
  server.registerTool?.(
    "manageEnv",
    {
      title: "CloudBase 环境管理（创建/变配/续费）",
      description:
        "管理 CloudBase 环境，支持：listPackages=查询可选套餐列表，create=创建新环境（需确认），modifyPlan=变更套餐（升降配，需确认），renew=续费环境（需确认）。\n\n⚠️ 所有涉及费用的操作（create/modifyPlan/renew），执行前必须展示配置摘要并等待用户通过 confirm=\"yes\" 确认。",
      inputSchema: {
        action: z
          .enum(["listPackages", "create", "modifyPlan", "renew"])
          .describe(
            "操作类型：listPackages=查询可选套餐，create=创建环境，modifyPlan=变更套餐，renew=续费",
          ),
        alias: z
          .string()
          .optional()
          .describe("环境别名（action=create 时必填）。要求：小写字母/数字/减号，不能以减号开头或结尾，最长 20 位"),
        packageId: z
          .string()
          .optional()
          .describe("套餐 ID（action=create/modifyPlan 时必填）。可选值如 baas_personal(个人版)、baas_pf_standard(标准版)、baas_pf_enterprise(企业版)"),
        resources: z
          .array(z.enum(CREATE_ENV_RESOURCE_VALUES))
          .optional()
          .describe(
            "启用的资源类型（action=create 时可选）。省略时默认全部四项：flexdb(文档数据库)、storage(存储)、function(云函数)、postgresql(PostgreSQL)。CreateEnv 要求 Resources 非空，MCP 会始终下发该字段。",
          ),
        duration: z
          .number()
          .int()
          .min(1)
          .max(36)
          .optional()
          .describe("购买或续费时长（月），action=create/renew 时可选，默认 1"),
        envId: z
          .string()
          .optional()
          .describe("环境 ID（action=modifyPlan/renew 时必填）"),
        confirm: z
          .literal("yes")
          .optional()
          .describe("确认操作。所有付费操作（create/modifyPlan/renew）必须传 \"yes\" 确认"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: "env",
      },
    },
    async (rawArgs: {
      action?: string;
      alias?: string;
      packageId?: string;
      resources?: string[];
      duration?: number;
      envId?: string;
      confirm?: string;
    }) => {
      const action = rawArgs.action ?? "";
      const alias = normalizeOptionalToolString(rawArgs.alias);
      const packageId = normalizeOptionalToolString(rawArgs.packageId);
      const resolvedResources = resolveCreateEnvResources(rawArgs.resources);
      const duration = rawArgs.duration ?? 1;
      const envId = normalizeOptionalToolString(rawArgs.envId);
      const confirmed = rawArgs.confirm === "yes";

      try {
        const cloudbase = await getManager({ requireEnvId: false });

        switch (action) {
          case "listPackages": {
            // Query packages for new purchase. Source aligns with billing-side Baas package APIs.
            const result = await cloudbase.env.describeBaasPackageList({
              TargetAction: "new",
              Source: "qcloud",
            });
            logCloudBaseResult(server.logger, result);
            return buildJsonToolResult({
              ok: true,
              code: "PACKAGE_LIST",
              message: "成功获取可选套餐列表。",
              packages: result.PackageList || result,
            });
          }

          case "create": {
            // CreateEnv (Manager SDK / Cloud API) accepts Alias, PackageId, Resources, Period, etc.
            // It does NOT accept Region — region is determined by account/package, not this call.
            if (!confirmed) {
              // 查询套餐名和预计费用（失败降级，不阻塞 confirm 流程）
              const packageTitle = packageId
                ? await fetchPackageTitle(cloudbase, packageId)
                : undefined;
              const pricingRegion = resolvePricingRegion(cloudBaseOptions);
              const priceProbe = packageId
                ? await calculateCreatePrice(cloudbase, {
                    packageId,
                    region: pricingRegion,
                    period: duration,
                  })
                : { error: "缺少 packageId，无法询价" };
              const priceSection = priceProbe.priceResult
                ? formatPriceSection(priceProbe.priceResult)
                : null;
              const releaseMethod = buildReleaseMethodHint();

              // 组合多段披露文案（对照控制台购买页确认对话框）
              const messageLines: string[] = [];
              messageLines.push("即将为你开通云开发环境");
              messageLines.push("本操作会创建腾讯云开发环境资源。");
              messageLines.push(
                "为付费套餐后才会产生费用；免费体验版不会立即扣费（每月赠送约 3000 资源点 ≈ 3 元）。",
              );
              messageLines.push("请核对以下配置信息后传入 confirm=\"yes\"：");
              messageLines.push(`- 别名: ${alias ?? "(未提供)"}`);
              messageLines.push(
                `- 套餐: ${packageId ?? "(未提供)"}` +
                  (packageTitle ? `（${packageTitle}）` : ""),
              );
              messageLines.push(`- 资源类型: ${resolvedResources.join(", ")}`);
              messageLines.push(`- 时长: ${duration} 个月`);
              messageLines.push(
                "- 说明: CreateEnv 不接受 Region 入参，环境地域由账号与套餐侧决定。",
              );
              messageLines.push("");

              // 资源清单 / 计费项 / 计费方式
              messageLines.push(buildResourceListText());
              messageLines.push(buildBillingItemsText());
              messageLines.push(buildBillingModeText(packageId));
              messageLines.push("");

              // 预计费用
              messageLines.push(
                buildPricingDisclosureText(
                  packageId,
                  priceSection,
                  priceProbe.error,
                  duration,
                ),
              );
              messageLines.push("");

              // 资源释放方式
              messageLines.push(buildReleaseMethodDetailText(packageId));
              messageLines.push("");

              // 文档链接
              messageLines.push(
                renderDocLinksBlock([
                  "package",
                  "billingItems",
                  "resourcePointPrice",
                  "prepayExpiry",
                ]),
              );
              messageLines.push("");

              // 已知晓声明
              messageLines.push("☐ 我已知晓将创建付费资源及计费规则，确认按上述配置开通。");
              messageLines.push(
                `（如需取消或修改，请勿传 confirm="yes"，改传其他参数重试）`,
              );

              return buildJsonToolResult({
                ok: false,
                code: "CONFIRM_REQUIRED",
                message: messageLines.join("\n"),
                package_info: packageTitle
                  ? { packageId, packageTitle }
                  : packageId
                    ? { packageId, packageTitle: null }
                    : undefined,
                pricing: priceSection
                  ? {
                      summary: priceSection.summary,
                      currency: priceProbe.priceResult?.Currency,
                      realTotalCost: priceProbe.priceResult?.RealTotalCost,
                      totalCost: priceProbe.priceResult?.TotalCost,
                      timeSpan: priceProbe.priceResult?.TimeSpan,
                      timeUnit: priceProbe.priceResult?.TimeUnit,
                      inquiryRegion: pricingRegion,
                    }
                  : priceProbe.error
                    ? { inquiryFailed: true, error: priceProbe.error }
                    : undefined,
                release_method: {
                  ...releaseMethod,
                  detail: buildReleaseMethodDetailText(packageId),
                  docLinks: [
                    MANAGE_ENV_DOC_LINKS.package,
                    MANAGE_ENV_DOC_LINKS.prepayExpiry,
                  ],
                },
                doc_links: MANAGE_ENV_DOC_LINKS,
                confirmation_acknowledgement: {
                  text: "我已知晓将创建付费资源及计费规则",
                  required: true,
                },
                next_step: {
                  tool: "manageEnv",
                  action: "create",
                  requiredParams: ["alias", "packageId", "confirm"],
                },
              });
            }

            if (!alias) {
              throw new Error("创建环境时 alias（环境别名）为必填参数");
            }
            if (!packageId) {
              throw new Error("创建环境时 packageId（套餐 ID）为必填参数");
            }

            const createParams: CreateEnvParams = {
              Alias: alias,
              PackageId: packageId,
              Resources: resolvedResources,
              Period: duration,
            };

            const result = await cloudbase.env.createEnv(createParams);
            logCloudBaseResult(server.logger, result);
            return buildJsonToolResult({
              ok: true,
              code: "ENV_CREATED",
              message: `环境创建成功！新环境 ID: ${result.EnvId}。环境初始化可能需要几分钟，请通过 queryEnv(action="info", envId="${result.EnvId}") 轮询直到 Status 为正常。`,
              envId: result.EnvId,
              resources: resolvedResources,
            });
          }

          case "modifyPlan": {
            // 变更套餐需要 confirm
            if (!confirmed) {
              if (!envId || !packageId) {
                throw new Error("变更套餐时 envId 和 packageId 为必填参数");
              }
              // 查询当前套餐名 + 新套餐名 + 询价（失败降级）
              const [currentBilling, newPackageTitle] = await Promise.all([
                fetchEnvBillingSummary(cloudbase, envId),
                fetchPackageTitle(cloudbase, packageId),
              ]);
              const priceProbe = await calculateModifyPrice(
                cloudbase,
                envId,
                packageId,
              );
              const priceSection = priceProbe.priceResult
                ? formatPriceSection(priceProbe.priceResult)
                : null;
              const releaseMethod = buildReleaseMethodHint();

              const messageLines: string[] = [];
              messageLines.push(
                `变更环境 ${envId} 的套餐需要您确认。变配后不会立即重新计费，但会触发差价结算或退款。`,
              );
              messageLines.push("请核对后传入 confirm=\"yes\"：");
              messageLines.push(
                `- 当前套餐: ${currentBilling?.packageName ?? currentBilling?.packageId ?? "(未知)"}` +
                  (currentBilling?.packageId && currentBilling.packageName
                    ? `（${currentBilling.packageId}）`
                    : ""),
              );
              if (currentBilling?.expireTime) {
                messageLines.push(`- 当前到期时间: ${currentBilling.expireTime}`);
              }
              messageLines.push(
                `- 新套餐: ${packageId}` +
                  (newPackageTitle ? `（${newPackageTitle}）` : ""),
              );
              messageLines.push("");
              if (priceSection) {
                messageLines.push(
                  `预计费用变化：${priceSection.summary}（差价/退款以账单为准）`,
                );
                if (priceSection.detail) {
                  messageLines.push(priceSection.detail);
                }
              } else if (priceProbe.error) {
                messageLines.push(
                  `预计费用变化：⚠️ 询价失败（${priceProbe.error}），请前往控制台确认价格`,
                );
              } else {
                messageLines.push(
                  "预计费用变化：询价返回为空，请前往控制台确认价格",
                );
              }
              messageLines.push("");

              // 资源释放方式（变配不影响存续，但与到期/销毁规则相同）
              messageLines.push(buildReleaseMethodDetailText(packageId));
              messageLines.push("");

              // 文档链接（变配与套餐/计费/到期都相关）
              messageLines.push(
                renderDocLinksBlock(["package", "prepayExpiry"]),
              );
              messageLines.push("");

              messageLines.push("☐ 我已知晓变配将触发差价结算或退款，确认按上述配置变更。");
              messageLines.push(
                `（如需取消或修改，请勿传 confirm="yes"）`,
              );

              return buildJsonToolResult({
                ok: false,
                code: "CONFIRM_REQUIRED",
                message: messageLines.join("\n"),
                env_id: envId,
                current_package: currentBilling
                  ? {
                      packageId: currentBilling.packageId,
                      packageName: currentBilling.packageName,
                      expireTime: currentBilling.expireTime,
                      payMode: currentBilling.payMode,
                    }
                  : undefined,
                new_package: {
                  packageId,
                  packageTitle: newPackageTitle ?? null,
                },
                pricing: priceSection
                  ? {
                      summary: priceSection.summary,
                      currency: priceProbe.priceResult?.Currency,
                      realTotalCost: priceProbe.priceResult?.RealTotalCost,
                      totalCost: priceProbe.priceResult?.TotalCost,
                      refund: priceProbe.priceResult?.Refund,
                    }
                  : priceProbe.error
                    ? { inquiryFailed: true, error: priceProbe.error }
                    : undefined,
                release_method: {
                  ...releaseMethod,
                  detail: buildReleaseMethodDetailText(packageId),
                  docLinks: [MANAGE_ENV_DOC_LINKS.prepayExpiry],
                },
                doc_links: {
                  package: MANAGE_ENV_DOC_LINKS.package,
                  prepayExpiry: MANAGE_ENV_DOC_LINKS.prepayExpiry,
                },
                confirmation_acknowledgement: {
                  text: "我已知晓变配将触发差价结算或退款",
                  required: true,
                },
                next_step: {
                  tool: "manageEnv",
                  action: "modifyPlan",
                  requiredParams: ["envId", "packageId", "confirm"],
                },
              });
            }

            if (!envId) {
              throw new Error("变更套餐时 envId 为必填参数");
            }
            if (!packageId) {
              throw new Error("变更套餐时 packageId 为必填参数");
            }

            const result = await cloudbase.env.modifyEnvPlan({ EnvId: envId, PackageId: packageId });
            logCloudBaseResult(server.logger, result);
            return buildJsonToolResult({
              ok: true,
              code: "PLAN_MODIFIED",
              message: `环境 ${envId} 的套餐已成功变更为 ${packageId}。`,
              envId,
              packageId,
            });
          }

          case "renew": {
            // 续费需要 confirm
            if (!confirmed) {
              if (!envId) {
                throw new Error("续费环境时 envId 为必填参数");
              }
              // 查询当前套餐名 + 到期时间 + 询价（失败降级）
              const [currentBilling, priceProbe] = await Promise.all([
                fetchEnvBillingSummary(cloudbase, envId),
                calculateRenewPrice(cloudbase, envId, duration),
              ]);
              const priceSection = priceProbe.priceResult
                ? formatPriceSection(priceProbe.priceResult)
                : null;
              const releaseMethod = buildReleaseMethodHint();
              const currentPackageId = currentBilling?.packageId;

              const messageLines: string[] = [];
              messageLines.push(
                `续费环境 ${envId} 需要您确认。续费按当前套餐类型计算，延长到期时间。`,
              );
              messageLines.push("请核对后传入 confirm=\"yes\"：");
              messageLines.push(
                `- 当前套餐: ${currentBilling?.packageName ?? currentBilling?.packageId ?? "(未知)"}` +
                  (currentBilling?.packageId && currentBilling.packageName
                    ? `（${currentBilling.packageId}）`
                    : ""),
              );
              if (currentBilling?.expireTime) {
                messageLines.push(`- 当前到期时间: ${currentBilling.expireTime}`);
              }
              messageLines.push(`- 续费时长: ${duration} 个月`);
              messageLines.push("");
              if (priceSection) {
                messageLines.push(`预计费用：${priceSection.summary}`);
                if (priceSection.detail) {
                  messageLines.push(priceSection.detail);
                }
              } else if (priceProbe.error) {
                messageLines.push(
                  `预计费用：⚠️ 询价失败（${priceProbe.error}），请前往控制台确认价格`,
                );
              } else {
                messageLines.push(
                  "预计费用：询价返回为空，请前往控制台确认价格",
                );
              }
              messageLines.push("");

              // 资源释放方式
              messageLines.push(buildReleaseMethodDetailText(currentPackageId));
              messageLines.push("");

              // 文档链接（续费主要看预付费与到期释放）
              messageLines.push(renderDocLinksBlock(["prepayExpiry"]));
              messageLines.push("");

              messageLines.push("☐ 我已知晓续费将延长当前套餐的到期时间，确认按上述配置续费。");
              messageLines.push(
                `（如需取消或修改，请勿传 confirm="yes"）`,
              );

              return buildJsonToolResult({
                ok: false,
                code: "CONFIRM_REQUIRED",
                message: messageLines.join("\n"),
                env_id: envId,
                current_package: currentBilling
                  ? {
                      packageId: currentBilling.packageId,
                      packageName: currentBilling.packageName,
                      expireTime: currentBilling.expireTime,
                      payMode: currentBilling.payMode,
                      isAutoRenew: currentBilling.isAutoRenew,
                    }
                  : undefined,
                pricing: priceSection
                  ? {
                      summary: priceSection.summary,
                      currency: priceProbe.priceResult?.Currency,
                      realTotalCost: priceProbe.priceResult?.RealTotalCost,
                      totalCost: priceProbe.priceResult?.TotalCost,
                      timeSpan: priceProbe.priceResult?.TimeSpan,
                      timeUnit: priceProbe.priceResult?.TimeUnit,
                    }
                  : priceProbe.error
                    ? { inquiryFailed: true, error: priceProbe.error }
                    : undefined,
                release_method: {
                  ...releaseMethod,
                  detail: buildReleaseMethodDetailText(currentPackageId),
                  docLinks: [MANAGE_ENV_DOC_LINKS.prepayExpiry],
                },
                doc_links: {
                  prepayExpiry: MANAGE_ENV_DOC_LINKS.prepayExpiry,
                },
                confirmation_acknowledgement: {
                  text: "我已知晓续费将延长当前套餐的到期时间",
                  required: true,
                },
                next_step: {
                  tool: "manageEnv",
                  action: "renew",
                  requiredParams: ["envId", "confirm"],
                },
              });
            }

            if (!envId) {
              throw new Error("续费环境时 envId 为必填参数");
            }

            const result = await cloudbase.env.renewEnv({ EnvId: envId, Period: duration });
            logCloudBaseResult(server.logger, result);
            return buildJsonToolResult({
              ok: true,
              code: "ENV_RENEWED",
              message: `环境 ${envId} 已成功续费 ${duration} 个月。`,
              envId,
            });
          }

          default:
            return buildJsonToolResult({
              ok: false,
              code: "INVALID_ACTION",
              message: `不支持的操作: ${action}。支持的操作: listPackages, create, destroy, modifyPlan, renew。`,
            });
        }
      } catch (error) {
        const toolPayloadResult = toolPayloadErrorToResult(error);
        if (toolPayloadResult) {
          return toolPayloadResult;
        }
        const errorMessage = error instanceof Error ? error.message : String(error);
        if (action === "listPackages" && /billTags/i.test(errorMessage)) {
          return buildJsonToolResult({
            ok: false,
            code: "PACKAGE_LIST_FAILED",
            message: `查询套餐列表失败（计费标签 BillTags）：${errorMessage}。可改用控制台查看套餐，或直接使用已知 packageId（如 baas_personal）调用 manageEnv(action="create")。`,
          });
        }
        return {
          content: [
            {
              type: "text",
              text: `环境管理操作失败: ${errorMessage}`,
            },
          ],
        };
      }
    },
  );
}
