import { AuthSupervisor } from "@cloudbase/toolbox";
import { z } from "zod";
import {
  buildAuthConfigSummary,
  buildDeviceAuthChallengePayload,
  buildDeviceLoginOptions,
  buildVerificationUriComplete,
  ensureLogin,
  ensureSlottedCredential,
  getAuthConfigValidationError,
  getAuthProgressState,
  getCloudBaseApiKeyFromEnv,
  listUsableCredentialSites,
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
  probeApiKeyCamCapability,
  resetCloudBaseManagerCache,
  resolveEnvCandidateByEnvId,
  type EnvCandidate,
} from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";
import { debug } from "../utils/logger.js";
import {
  getSite,
  normalizeSite,
  resolveApiKeyExchangeRegion,
  resolveSiteAndRegion,
  TCB_QUERY_REGIONS,
} from "../utils/site-map.js";
import { readProjectEnvId, writeProjectConfig } from "../utils/project-config.js";
import { normalizeLang, t, type Lang } from "../i18n/index.js";
import {
  buildAuthNextStep,
  buildJsonToolResult,
  toolPayloadErrorToResult,
} from "../utils/tool-result.js";
import {
  flattenHttpServiceRoutes,
  isDomainPathReachableViaGateway,
} from "../utils/gateway-access-urls.js";
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
 * Resource-usage modules aligned with tcb CLI `USAGE_MODULES`
 * (`tcb env usage` / `tcb env info --type`).
 */
export const ENV_USAGE_MODULE_VALUES = [
  "FLEXDB",
  "TDSQL",
  "SCF",
  "EKS",
  "COS",
  "AI",
  "HOSTING",
  "Auth",
  "APIInvocation",
  "HTTPInvocation",
  "VM",
  "Workflow",
  "Other",
] as const;

export type EnvUsageModule = (typeof ENV_USAGE_MODULE_VALUES)[number];

const ENV_USAGE_MODULE_SET = new Set<string>(ENV_USAGE_MODULE_VALUES);

const ENV_USAGE_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function resolveEnvUsageModules(
  type: readonly string[] | undefined,
): EnvUsageModule[] {
  if (!Array.isArray(type) || type.length === 0) {
    return [...ENV_USAGE_MODULE_VALUES];
  }
  const normalized = type
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  const invalid = normalized.filter((item) => !ENV_USAGE_MODULE_SET.has(item));
  if (invalid.length > 0) {
    throw new Error(
      t("env.usage.invalidModules", {
        invalid: invalid.join(", "),
        allowed: ENV_USAGE_MODULE_VALUES.join(", "),
      }),
    );
  }
  return normalized as EnvUsageModule[];
}

export function extractAccountCircleDate(
  rawTime: unknown,
): string | undefined {
  if (typeof rawTime !== "string" || rawTime.trim().length === 0) {
    return undefined;
  }
  const datePart = rawTime.trim().split(/\s+/)[0];
  return ENV_USAGE_DATE_RE.test(datePart) ? datePart : undefined;
}

function normalizeUsageDateInput(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : undefined;
}

export function resolveEnvUsageDateRange(options: {
  startDate?: string;
  endDate?: string;
  accountCircle?: { StartTime?: string; EndTime?: string } | null;
}): { startDate: string; endDate: string; dateSource: "params" | "accountCircle" } {
  const startFromParams = normalizeUsageDateInput(options.startDate);
  const endFromParams = normalizeUsageDateInput(options.endDate);

  if (startFromParams || endFromParams) {
    if (!startFromParams || !endFromParams) {
      throw new Error(t("env.usage.datePairRequired"));
    }
    if (!ENV_USAGE_DATE_RE.test(startFromParams) || !ENV_USAGE_DATE_RE.test(endFromParams)) {
      throw new Error(t("env.usage.dateFormatInvalid"));
    }
    if (startFromParams > endFromParams) {
      throw new Error(t("env.usage.dateOrderInvalid"));
    }
    return {
      startDate: startFromParams,
      endDate: endFromParams,
      dateSource: "params",
    };
  }

  const startDate = extractAccountCircleDate(options.accountCircle?.StartTime);
  const endDate = extractAccountCircleDate(options.accountCircle?.EndTime);
  if (!startDate || !endDate) {
    throw new Error(t("env.usage.dateRangeUnresolvable"));
  }
  return { startDate, endDate, dateSource: "accountCircle" };
}

/**
 * Monitor metric names for queryEnv(action=metrics).
 * Subset of TCB DescribeCurveData MetricName from the CloudBase monitor catalog
 * (gateway/env QPS, functions, NoSQL, MySQL, CloudRun).
 */
export const ENV_METRIC_NAME_VALUES = [
  "GatewayTraceEnvQPS",
  "EnvQPSAll",
  "FunctionInvocation",
  "FunctionError",
  "FunctionTimeout",
  "FunctionThrottle",
  "FunctionDuration",
  "FunctionConcurrentExecutions",
  "DbRead",
  "DbWrite",
  "DbSizepkg",
  "MysqlCpuUsageRate",
  "MysqlMemoryUse",
  "MysqlStorageUsage",
  "MysqlQps",
  "MysqlSlowQueries",
  "MysqlDbConnections",
  "TkeCpuUsedService",
  "TkeMemUsedService",
  "TkeQPSService",
  "TkeHttpErrorService",
  "TkeInvokeNumService",
] as const;

export type EnvMetricName = (typeof ENV_METRIC_NAME_VALUES)[number];

export const ENV_METRIC_PERIOD_VALUES = [300, 3600, 86400] as const;

export type EnvMetricPeriod = (typeof ENV_METRIC_PERIOD_VALUES)[number];

/** Console default ResourceID for environment-level gateway QPS. */
export const GATEWAY_ENV_QPS_DEFAULT_RESOURCE_ID = "all|:|all|:|all|:|all";

const ENV_METRIC_NAME_SET = new Set<string>(ENV_METRIC_NAME_VALUES);
const ENV_METRIC_PERIOD_SET = new Set<number>(ENV_METRIC_PERIOD_VALUES);
const ENV_METRICS_REQUIRING_RESOURCE_ID = new Set<string>([
  "TkeCpuUsedService",
  "TkeMemUsedService",
  "TkeQPSService",
  "TkeHttpErrorService",
  "TkeInvokeNumService",
]);
const ENV_METRIC_TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;
const ENV_METRIC_MIN_RANGE_MS = 5 * 60 * 1000;

function padMetricTimeUnit(value: number): string {
  return value.toString().padStart(2, "0");
}

export function formatEnvMetricTime(date: Date): string {
  return `${date.getFullYear()}-${padMetricTimeUnit(date.getMonth() + 1)}-${padMetricTimeUnit(date.getDate())} ${padMetricTimeUnit(date.getHours())}:${padMetricTimeUnit(date.getMinutes())}:${padMetricTimeUnit(date.getSeconds())}`;
}

export function resolveEnvMetricName(metricName: unknown): EnvMetricName {
  const normalized =
    typeof metricName === "string" && metricName.trim().length > 0
      ? metricName.trim()
      : undefined;
  if (!normalized) {
    throw new Error(
      t("env.metrics.nameRequired", { allowed: ENV_METRIC_NAME_VALUES.join(", ") }),
    );
  }
  if (!ENV_METRIC_NAME_SET.has(normalized)) {
    throw new Error(
      t("env.metrics.nameInvalid", {
        metricName: normalized,
        allowed: ENV_METRIC_NAME_VALUES.join(", "),
      }),
    );
  }
  return normalized as EnvMetricName;
}

export function resolveEnvMetricPeriod(period: unknown): EnvMetricPeriod | undefined {
  if (period === undefined || period === null || period === "") {
    return undefined;
  }
  const numericPeriod =
    typeof period === "number"
      ? period
      : typeof period === "string" && /^\d+$/.test(period.trim())
        ? Number(period.trim())
        : Number.NaN;
  if (!ENV_METRIC_PERIOD_SET.has(numericPeriod)) {
    throw new Error(t("env.metrics.periodInvalid", { period: String(period) }));
  }
  return numericPeriod as EnvMetricPeriod;
}

export function resolveEnvMetricTimeRange(options: {
  startTime?: string;
  endTime?: string;
  now?: Date;
}): { startTime: string; endTime: string; timeSource: "params" | "defaultLast24h" } {
  const startFromParams =
    typeof options.startTime === "string" && options.startTime.trim().length > 0
      ? options.startTime.trim()
      : undefined;
  const endFromParams =
    typeof options.endTime === "string" && options.endTime.trim().length > 0
      ? options.endTime.trim()
      : undefined;

  if (startFromParams || endFromParams) {
    if (!startFromParams || !endFromParams) {
      throw new Error(t("env.metrics.timePairRequired"));
    }
    if (!ENV_METRIC_TIME_RE.test(startFromParams) || !ENV_METRIC_TIME_RE.test(endFromParams)) {
      throw new Error(t("env.metrics.timeFormatInvalid"));
    }
    const startMs = Date.parse(startFromParams.replace(" ", "T"));
    const endMs = Date.parse(endFromParams.replace(" ", "T"));
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      throw new Error(t("env.metrics.timeUnparsable"));
    }
    if (endMs - startMs < ENV_METRIC_MIN_RANGE_MS) {
      throw new Error(t("env.metrics.timeRangeTooShort"));
    }
    return {
      startTime: startFromParams,
      endTime: endFromParams,
      timeSource: "params",
    };
  }

  const now = options.now ?? new Date();
  const start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  return {
    startTime: formatEnvMetricTime(start),
    endTime: formatEnvMetricTime(now),
    timeSource: "defaultLast24h",
  };
}

export function resolveEnvMetricResourceId(
  metricName: EnvMetricName,
  resourceID?: string,
): string | undefined {
  const normalized =
    typeof resourceID === "string" && resourceID.trim().length > 0
      ? resourceID.trim()
      : undefined;
  if (normalized) {
    return normalized;
  }
  if (metricName === "GatewayTraceEnvQPS") {
    return GATEWAY_ENV_QPS_DEFAULT_RESOURCE_ID;
  }
  if (ENV_METRICS_REQUIRING_RESOURCE_ID.has(metricName)) {
    throw new Error(t("env.metrics.resourceIdRequired", { metricName }));
  }
  return undefined;
}

export function summarizeEnvMetricCurve(curve: {
  Values?: unknown;
  NewValues?: unknown;
  Time?: unknown;
}): {
  sampleCount: number;
  max: number | null;
  min: number | null;
  avg: number | null;
  latest: number | null;
  peakTimestamp: number | null;
  allZero: boolean;
} {
  const newValues = Array.isArray(curve.NewValues) ? curve.NewValues : [];
  const values = Array.isArray(curve.Values) ? curve.Values : [];
  const times = Array.isArray(curve.Time) ? curve.Time : [];
  const series = (newValues.length > 0 ? newValues : values).filter(
    (item): item is number => typeof item === "number" && Number.isFinite(item),
  );

  if (series.length === 0) {
    return {
      sampleCount: 0,
      max: null,
      min: null,
      avg: null,
      latest: null,
      peakTimestamp: null,
      allZero: true,
    };
  }

  let max = series[0];
  let min = series[0];
  let sum = 0;
  let peakIndex = 0;
  for (let i = 0; i < series.length; i++) {
    const value = series[i];
    sum += value;
    if (value > max) {
      max = value;
      peakIndex = i;
    }
    if (value < min) {
      min = value;
    }
  }

  return {
    sampleCount: series.length,
    max,
    min,
    avg: sum / series.length,
    latest: series[series.length - 1],
    peakTimestamp: typeof times[peakIndex] === "number" ? times[peakIndex] : null,
    allZero: series.every((value) => value === 0),
  };
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
    requiredValue: t("env.domainHint.requiredValue"),
    deriveFrom: [
      t("env.domainHint.deriveFromOrigin"),
      t("env.domainHint.deriveFromDevServer"),
    ],
    note: t("env.domainHint.note"),
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
      message: t("env.domainResult.createMessage"),
      propagation: {
        requiresPolling: true,
        pollTool: "queryEnv",
        pollAction: "domains",
        pollIntervalSuggestionSeconds: 10,
        timeoutSuggestionSeconds: 300,
        successCondition: t("env.domainResult.createSuccess"),
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
    message: t("env.domainResult.deleteMessage"),
    propagation: {
      requiresPolling: true,
      pollTool: "queryEnv",
      pollAction: "domains",
      pollIntervalSuggestionSeconds: 10,
      timeoutSuggestionSeconds: 300,
      successCondition: t("env.domainResult.deleteSuccess"),
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
    t("env.deviceAuth.heading"),
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
    t("env.deviceAuth.uriNotice"),
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

async function fetchAccountEnvCandidates(
  cloudBaseOptions: any,
): Promise<EnvCandidate[]> {
  try {
    return await listAvailableEnvCandidates({
      cloudBaseOptions,
      ignorePinnedEnvId: true,
    });
  } catch {
    return [];
  }
}

type CredentialScope = "single_env" | "account";

function isApiKeyCredentialMode(): boolean {
  return Boolean(getCloudBaseApiKeyFromEnv() && process.env.CLOUDBASE_ENV_ID);
}

function getCredentialScope(cloudBaseOptions?: {
  credentialScope?: string;
}): CredentialScope {
  // 只认宿主的显式声明 credentialScope: 'env'（如 tcb-bff hosted OAuth 签发的
  // 环境级 federated STS）。账号级 DescribeEnvs（不带 EnvId）会被后端拒绝（invalid token）。
  // 注意：不能用 token 字段的有无推断范围——sessionToken 本身不携带权限范围语义。
  if (cloudBaseOptions?.credentialScope === "env") return "single_env";
  return isApiKeyCredentialMode() ? "single_env" : "account";
}

function buildCredentialBoundaryPayload(cloudBaseOptions?: {
  region?: string;
  envId?: string;
  credentialScope?: string;
}) {
  const credentialScope = getCredentialScope(cloudBaseOptions);
  const currentRegion = resolveSiteAndRegion(cloudBaseOptions ?? {}).region;
  const pinnedEnvId = process.env.CLOUDBASE_ENV_ID || cloudBaseOptions?.envId || null;
  const scopeNote =
    credentialScope === "single_env"
      ? t("env.credential.singleEnvNote", {
          pinnedEnvId: pinnedEnvId ? ` ${pinnedEnvId}` : "",
        })
      : t("env.credential.accountNote", { currentRegion });

  return {
    credential_scope: credentialScope,
    current_region: currentRegion,
    scope_note: scopeNote,
  };
}

function applyBoundEnvRegion(
  server: ExtendedMcpServer,
  region?: string,
) {
  if (!region) {
    return;
  }
  process.env.TCB_REGION = region;
  if (server.cloudBaseOptions) {
    server.cloudBaseOptions.region = region;
  }
}

/**
 * 绑定环境后固化站点：region 歧义（如 ap-singapore 同时属于 domestic 与 intl）且
 * 未显式指定 site 时，若仅一个凭证槽位可用，则将 TCB_SITE 固定为该站点，
 * 避免后续资源调用再次落入歧义默认分支（issue #960）。
 */
async function applyBoundEnvSite(
  server: ExtendedMcpServer,
  region?: string,
) {
  if (!region || getSite(region) !== "ambiguous") {
    return;
  }
  if (normalizeSite(process.env.TCB_SITE)) {
    return; // 已显式指定 site，不覆盖
  }
  const usableSites = await listUsableCredentialSites();
  if (usableSites.length !== 1) {
    return; // 无法唯一判定时不猜测，保持既有歧义回退逻辑
  }
  process.env.TCB_SITE = usableSites[0];
  if (server.cloudBaseOptions) {
    server.cloudBaseOptions.site = usableSites[0];
  }
  debug("applyBoundEnvSite: pinned TCB_SITE from the only usable credential slot", {
    region,
    site: usableSites[0],
  });
}

/**
 * 把 set_env 上**显式传入**的 site/region/lang 持久化到 `.cloudbase/project.json`
 * （MCP 机器管理文件，合并写：undefined 字段不覆盖既有值）。
 *
 * 只写显式参数：解析链推导出的值不落盘，避免把一次性推断固化成项目配置。
 * 未显式传任何一项时不落盘，也不会创建文件——set_env 的常规调用保持零副作用。
 * envId 不在此持久化：绑定态由 envManager 维护，`.cloudbase/project.json` 的 envId
 * 是使用方自己维护的绑定来源（见 readProjectEnvId），MCP 只读不写。
 * cloudbaserc.json 同样保持只读不写（那是 CLI 维护的人工部署配置）。
 * writeProjectConfig 内部 fail-safe（写失败返回 false 而不抛出），不阻塞绑定主流程。
 */
function persistAuthBinding(patch: {
  site?: string;
  region?: string;
  lang?: Lang;
}): void {
  const hasPatch = Object.values(patch).some((value) => value !== undefined);
  if (!hasPatch) {
    return;
  }
  const persisted = writeProjectConfig(patch);
  if (!persisted) {
    debug("persistAuthBinding: writeProjectConfig failed", patch);
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

// API Key 登录态 CAM 能力受限时的用户提示（实测：部分 API Key 换出的 STS 不带 CAM 策略）
const getApiKeyCamLimitationWarning = () => t("env.apiKey.camLimitation");

/**
 * API Key 登录态 AUTH_READY 出口统一追加 CAM 能力探测警告。
 * 仅在探测明确返回 limited（CAM 拒绝）时追加；capable/unknown 静默通过。
 */
async function appendApiKeyCamWarningIfNeeded(
  loginState: any,
  message: string,
): Promise<string> {
  try {
    const probe = await probeApiKeyCamCapability(loginState);
    return probe === "limited" ? message + getApiKeyCamLimitationWarning() : message;
  } catch (e) {
    debug("appendApiKeyCamWarningIfNeeded: probe threw", {
      error: e instanceof Error ? e.message : String(e),
    });
    return message;
  }
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
    // 项目级绑定（.cloudbase/project.json 的 envId，回退 cloudbaserc.json）优先于账号级登录态：
    // 登录态是全局的，可能指向别的仓库绑定的环境。
    readProjectEnvId() ||
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
      message: t("env.prepare.envReady", { envId: currentEnvId }),
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
      message: t("env.prepare.autoBound", { envId: singleEnvId }),
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
      message: t("env.prepare.multipleEnvs"),
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
          message: t("env.prepare.tcbInitFailed"),
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
    const successMessage = t("env.prepare.autoCreated", { envId: createResult.envId });
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
        message: t("env.prepare.envCreateFailed"),
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
  /**
   * region 是否真正透传到了按地域的 DescribeEnvs 查询。
   * 环境级凭证（托管授权 token / API Key）下 list 会 pin 到绑定 envId 改走
   * describeEnvInfo，此时 region 不参与查询——回执必须如实反映，否则调用方
   * 会拿 AppliedFilters.region 误判环境地域。缺省视为已生效（向后兼容）。
   */
  regionApplied?: boolean;
  /**
   * 本次查询实际落到的 envId。list 的 pinned 分支用的是
   * `process.env.CLOUDBASE_ENV_ID || cloudBaseOptions.envId`，两者在 API Key
   * 场景下可能不同；过滤「只保留当前环境」时必须按真正查询的那个 id，
   * 否则会把唯一的结果滤成空列表。缺省回落到 cloudBaseOptions.envId。
   */
  targetEnvId?: string;
    filters: {
      alias?: string;
      aliasExact?: boolean;
      envId?: string;
      region?: string;
      limit?: number;
      offset?: number;
      fields?: EnvFieldName[];
  };
}) {
  const envList = Array.isArray(params.result?.EnvList) ? params.result.EnvList : [];
  const currentEnvId = params.targetEnvId || params.cloudBaseOptions?.envId;
  const regionIgnored =
    params.regionApplied === false && Boolean(params.filters.region);
  // region 被忽略时，结果实际仍被限制在绑定环境上
  const shouldRestrictToCurrentEnv =
    (params.hasEnvId || Boolean(params.targetEnvId)) &&
    !params.filters.alias &&
    !params.filters.envId &&
    (!params.filters.region || regionIgnored);
  const baseList = shouldRestrictToCurrentEnv
    ? envList.filter((env: any) => env.EnvId === currentEnvId)
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
  const credentialBoundary = buildCredentialBoundaryPayload(params.cloudBaseOptions);
  // query_region 表示「本次查询实际落到哪」：
  // - pinned（环境级凭证 / env 变量绑定）：查询不按地域过滤，用结果里该环境自身的
  //   Region 回答；取不到（结果为空）才回落到当前凭据地域；
  // - 账号级：region 生效时就是所传地域，未传时是当前凭据地域。
  // 任何时候都不要拿它判断「某地域有没有环境」。
  const pinnedEnvRegion = params.targetEnvId
    ? envList.find((env: any) => env.EnvId === currentEnvId)?.Region
    : undefined;
  const queryRegion =
    params.filters.region && !regionIgnored
      ? params.filters.region
      : pinnedEnvRegion || credentialBoundary.current_region;
  const currentEnvOnlyNote =
    shouldRestrictToCurrentEnv && credentialBoundary.credential_scope === "account"
      ? t("env.list.currentEnvOnlyNote")
      : undefined;
  const boundEnvId = currentEnvId;
  const regionIgnoredNote = regionIgnored
    ? `已忽略 region="${params.filters.region}"：当前为环境级凭证（单环境权限），查询固定落在绑定环境${boundEnvId ? ` ${boundEnvId}` : ""}，地域参数不参与查询。这是凭据权限边界，不代表该地域没有环境。`
    : undefined;
  const scopeNotes = [currentEnvOnlyNote, regionIgnoredNote].filter(
    (note): note is string => Boolean(note),
  );

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
      // 只回显真正生效的地域；被忽略时置 null，原因见 ignored_params / scope_note
      region: regionIgnored ? null : (params.filters.region ?? null),
      fields: params.filters.fields ?? [...DEFAULT_ENV_FIELDS],
      currentEnvOnly: shouldRestrictToCurrentEnv,
    },
    ...credentialBoundary,
    query_region: queryRegion,
    ...(scopeNotes.length ? { scope_note: scopeNotes.join(" ") } : {}),
    ...(regionIgnored
      ? {
          ignored_params: [
            {
              name: "region",
              value: params.filters.region,
              reason:
                "环境级凭证为单环境权限，region 不参与查询；结果恒为绑定环境",
            },
          ],
        }
      : {}),
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

/**
 * Project gateway Route.Enable onto envQuery(info) without mutating StaticDomain.
 *
 * StaticStorages[].StaticDomain stays the cloud-API nominal hostname.
 * Sibling field staticDomainRouteEnabled (and EnvInfo-level mirrors for the
 * primary store) tell callers whether the default hosting domain route is
 * actually reachable (Enable !== false). Matches queryHosting websiteConfig.
 */
async function enrichEnvInfoWithStaticDomainRouteEnabled(
  manager: any,
  result: any,
  envId?: string,
): Promise<any> {
  const envInfo = result?.EnvInfo;
  if (!envInfo || typeof envInfo !== "object") {
    return result;
  }

  const staticStorages = Array.isArray(envInfo.StaticStorages)
    ? envInfo.StaticStorages
    : null;
  if (!staticStorages || staticStorages.length === 0) {
    return result;
  }

  if (typeof manager?.env?.describeHttpServiceRoute !== "function") {
    return result;
  }

  const resolvedEnvId =
    (typeof envId === "string" && envId.trim()) ||
    (typeof envInfo.EnvId === "string" && envInfo.EnvId.trim()) ||
    undefined;
  if (!resolvedEnvId) {
    return result;
  }

  try {
    const routeResult = await manager.env.describeHttpServiceRoute({
      EnvId: resolvedEnvId,
      Limit: 1000,
    });
    const routes = flattenHttpServiceRoutes(routeResult);

    let primaryRouteEnabled: boolean | null = null;
    const enrichedStorages = staticStorages.map(
      (store: unknown, index: number) => {
        if (!store || typeof store !== "object" || Array.isArray(store)) {
          return store;
        }
        const record = store as Record<string, unknown>;
        const domain =
          typeof record.StaticDomain === "string" ? record.StaticDomain : "";
        if (!domain) {
          return store;
        }
        const reachable = isDomainPathReachableViaGateway(routes, domain, "/");
        if (index === 0) {
          primaryRouteEnabled = reachable;
        }
        return {
          ...record,
          staticDomainRouteEnabled: reachable,
        };
      },
    );

    const enrichment: Record<string, unknown> = {
      StaticStorages: enrichedStorages,
    };
    if (primaryRouteEnabled !== null) {
      enrichment.staticDomainRouteEnabled = primaryRouteEnabled;
      enrichment.accessUrlReachable = primaryRouteEnabled !== false;
      if (primaryRouteEnabled === false) {
        const primaryDomain =
          typeof (enrichedStorages[0] as Record<string, unknown> | undefined)
            ?.StaticDomain === "string"
            ? String(
                (enrichedStorages[0] as Record<string, unknown>).StaticDomain,
              )
            : "";
        enrichment.routeDisabled = true;
        if (primaryDomain) {
          enrichment.disabledAccessUrls = [`https://${primaryDomain}/`];
        }
      }
    }

    return {
      ...result,
      EnvInfo: {
        ...envInfo,
        ...enrichment,
      },
    };
  } catch {
    // Gateway route lookup is best-effort enrichment only.
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
    suggestions.push(t("env.queryError.paramHeader"));
    suggestions.push(t("env.queryError.paramItem1"));
    suggestions.push(t("env.queryError.paramItem2"));
    suggestions.push(t("env.queryError.paramItem3"));
    suggestions.push(t("env.queryError.paramItem4", { action }));
  }

  if (hasAuthError) {
    suggestions.push(t("env.queryError.authHeader"));
    suggestions.push(t("env.queryError.authAdvice"));
  }

  if (hasPermissionError) {
    suggestions.push(t("env.queryError.permissionHeader"));
    suggestions.push(t("env.queryError.permissionAdvice"));
  }

  if (hasEnvNotFoundError) {
    suggestions.push(t("env.queryError.envHeader"));
    suggestions.push(t("env.queryError.envAdvice"));
  }

  if (hasNetworkError) {
    suggestions.push(t("env.queryError.network"));
  }

  if (action === "usage" && suggestions.length === 0) {
    suggestions.push(t("env.queryError.usageHeader"));
    suggestions.push(t("env.queryError.stepAuthStatus"));
    suggestions.push(t("env.queryError.stepListEnv"));
    suggestions.push(
      t("env.queryError.usageStep3", { modules: ENV_USAGE_MODULE_VALUES.join(", ") }),
    );
  }

  if (action === "metrics" && suggestions.length === 0) {
    suggestions.push(t("env.queryError.metricsHeader"));
    suggestions.push(t("env.queryError.stepAuthStatus"));
    suggestions.push(t("env.queryError.stepListEnv"));
    suggestions.push(
      t("env.queryError.metricsStep3", { names: ENV_METRIC_NAME_VALUES.join(", ") }),
    );
    suggestions.push(t("env.queryError.metricsStep4"));
  }

  // If no specific pattern matched, provide general guidance
  if (suggestions.length === 0) {
    suggestions.push(t("env.queryError.generalHeader"));
    suggestions.push(t("env.queryError.generalStep1"));
    suggestions.push(t("env.queryError.generalStep2"));
    suggestions.push(t("env.queryError.generalStep3"));
  }

  return t("env.queryError.wrapper", {
    action,
    message: baseMessage,
    suggestions: suggestions.join("\n"),
  });
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
    return { summary: t("env.price.empty"), detail: "" };
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
    summary = t("env.price.estimatedReal", { currency, amount: realTotalCost });
    lines.push(t("env.price.lineRealTotal", { currency, amount: realTotalCost }));
  } else if (Number.isFinite(totalCost) && totalCost > 0) {
    summary = t("env.price.estimated", { currency, amount: totalCost });
    lines.push(t("env.price.lineTotal", { currency, amount: totalCost }));
  }

  if (Number.isFinite(totalCost) && totalCost > 0 && totalCost !== realTotalCost) {
    lines.push(t("env.price.lineOriginal", { currency, amount: totalCost }));
  }

  if (Number.isFinite(unitPrice) && unitPrice > 0) {
    lines.push(t("env.price.lineUnit", { currency, amount: unitPrice }));
  }

  if (timeSpan !== undefined && TimeUnit) {
    lines.push(t("env.price.lineDuration", { timeSpan, timeUnit: TimeUnit }));
  }

  if (refund !== undefined && Number.isFinite(refund) && refund > 0) {
    lines.push(t("env.price.lineRefund", { currency, amount: refund }));
    if (summary) {
      summary += t("env.price.refundSuffix", { currency, amount: refund });
    } else {
      summary = t("env.price.refundOnly", { currency, amount: refund });
    }
  }

  if (priceResult.Formula && typeof priceResult.Formula === "string") {
    lines.push(t("env.price.lineFormula", { formula: priceResult.Formula }));
  }

  return {
    summary: summary || t("env.price.missingTotal"),
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
    method: t("env.release.method"),
    consoleUrl: "https://console.cloud.tencent.com/tcb",
    note: t("env.release.note"),
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
    package: t("env.docLink.package"),
    billingItems: t("env.docLink.billingItems"),
    resourcePointPrice: t("env.docLink.resourcePointPrice"),
    prepayExpiry: t("env.docLink.prepayExpiry"),
  };
  const entries = (filter ?? (Object.keys(MANAGE_ENV_DOC_LINKS) as Array<keyof typeof MANAGE_ENV_DOC_LINKS>))
    .map((k) => `- [${labels[k]}](${MANAGE_ENV_DOC_LINKS[k]})`)
    .join("\n");
  return t("env.docLink.header", { entries });
}

/**
 * 资源清单详细描述（对应控制台购买页"资源清单"段）。
 */
function buildResourceListText(): string {
  return t("env.resourceListText");
}

/**
 * 计费项披露（对应控制台购买页"计费项"段）。
 * 此处为静态披露，调用方在 confirm 消息中拼接即可。
 */
function buildBillingItemsText(): string {
  return t("env.billingItemsText");
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
    return t("env.billingMode.free");
  }
  return t("env.billingMode.paid");
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
  const lines: string[] = [t("env.releaseDetail.header")];
  if (isFree) {
    lines.push(t("env.releaseDetail.free"));
  } else {
    lines.push(t("env.releaseDetail.paidExpiry"));
    lines.push(t("env.releaseDetail.paidManual"));
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
  const lines: string[] = [t("env.pricing.header")];

  if (isFree) {
    lines.push(t("env.pricing.freeLine"));
    lines.push(t("env.pricing.freeUnit"));
  } else {
    const paidSummary =
      priceSection?.summary ??
      (priceError
        ? t("env.pricing.inquiryFailed", { error: priceError })
        : t("env.price.empty"));
    lines.push(t("env.pricing.paidLine", { summary: paidSummary }));
    if (priceSection?.detail) {
      lines.push(priceSection.detail);
    }
    if (priceError && priceSection) {
      lines.push(t("env.pricing.partialMissing", { error: priceError }));
    }
    lines.push(t("env.pricing.period", { period }));
    lines.push(t("env.pricing.overage"));
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
  const getManagerForEnvQuery = (
    targetEnvId?: string,
    requireEnvId = true,
    region?: string,
  ) =>
    getCloudBaseManager({
      cloudBaseOptions: {
        ...cloudBaseOptions,
        ...(targetEnvId && targetEnvId !== cloudBaseOptions?.envId
          ? { envId: targetEnvId }
          : {}),
        ...(region ? { region } : {}),
      },
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
      title: "env.authTitle",
      description: "env.authDescription",
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
                .describe("高级可选：自定义 endpoint 返回格式开关。未配置 endpoint 时默认 false；配置 endpoint 后默认 true。标准 {code,result} 包装格式的端点（如国际站 tcb-api.tencentcloud.com）应显式传 false"),
            }
          : {}),
        envId: z
          .string()
          .optional()
          .describe("环境ID(CloudBase 环境唯一标识)，绑定后工具将操作该环境。action=set_env 时必填"),
        site: z
          .enum(["domestic", "intl"])
          .optional()
          .describe(
            "站点：domestic=国内站，intl=国际站。优先级高于 TCB_SITE/项目配置；影响登录端点、授权页与 API Key 换取网关",
          ),
        region: z
          .string()
          .optional()
          .describe(
            "地域（如 ap-shanghai / ap-guangzhou / ap-singapore）。用于 region→site 推断与 API Key 换取网关选择；显式 site 优先",
          ),
        lang: z
          .enum(["zh", "en"])
          .optional()
          .describe(
            "输出语言：zh=中文（默认），en=英文。覆盖实例级语言（createCloudBaseMcpServer lang 选项 / TCB_LANG / project.json）",
          ),
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
      site?: unknown;
      region?: unknown;
      lang?: unknown;
    }) => {
      const action = rawArgs.action ?? "status";
      const authMode =
        rawArgs.authMode === "device" || rawArgs.authMode === "web"
          ? rawArgs.authMode
          : undefined;
      // 调用级站点/地域/语言（优先级高于实例配置与环境变量；底层解析链见 utils/site-map.ts）
      const toolSite = normalizeSite(rawArgs.site);
      const toolRegion =
        typeof rawArgs.region === "string" && rawArgs.region.trim().length > 0
          ? rawArgs.region.trim()
          : undefined;
      const toolLang = normalizeLang(rawArgs.lang);
      // 输出语言：调用级 lang > 实例 lang（createCloudBaseMcpServer / TCB_LANG / project.json）
      const outLang: Lang = toolLang ?? server.lang ?? "zh";
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
            message: t("env.auth.actionNotSupported", { action }, outLang),
            next_step: buildAuthNextStep("status", {
              suggestedArgs: { action: "status" },
            }),
          });
        }

        if (action === "status") {
          const loginState = await peekLoginState({
            ...(toolSite ? { site: toolSite } : {}),
            ...(toolRegion ? { region: toolRegion } : {}),
          });
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
          const credentialBoundary = buildCredentialBoundaryPayload(cloudBaseOptions);

          if (authStatus === "READY" && loginState) {
            envPreparation = await prepareAuthEnvironment({
              server,
              cloudBaseOptions,
              loginState,
            });
          }

          const statusMessage =
            authStatus === "READY"
              ? envPreparation?.message
                ? `${envPreparation.message} ${credentialBoundary.scope_note}`
                : credentialBoundary.scope_note
              : authStatus === "PENDING"
                ? t("env.auth.devicePending", undefined, outLang)
                : isCodeBuddyIde(server)
                  ? t("env.auth.notLoggedInCodeBuddy", undefined, outLang)
                  : t("env.auth.notLoggedIn", undefined, outLang);

          return buildJsonToolResult({
            ok: true,
            code: "STATUS",
            auth_status: authStatus,
            ...(toolSite ? { site: toolSite } : {}),
            ...(isApiKeyMode ? { auth_mode: "api_key" } : {}),
            ...credentialBoundary,
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
            message: statusMessage,
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
                  message: await appendApiKeyCamWarningIfNeeded(
                    existingLoginState,
                    t("env.auth.apiKeyAutoLogin", undefined, outLang),
                  ),
                  auth_mode: "api_key",
                  envId: process.env.CLOUDBASE_ENV_ID,
                });
              }
            } catch (e) {
              // peekLoginState threw; log and fall through to diagnostic
              debug("start_auth: peekLoginState threw", { error: e instanceof Error ? e.message : String(e) });
            }

            // API Key exchange failed: return diagnostic details
            const exchangeRegion = resolveApiKeyExchangeRegion();
            const endpoint =
              process.env.CLOUDBASE_API_ENDPOINT ||
              `https://${process.env.CLOUDBASE_ENV_ID}.${exchangeRegion ?? "ap-shanghai"}.tcb-api.tencentcloudapi.com`;
            const diagMessage =
              t("env.auth.apiKeyEnvExchangeFailed", undefined, outLang) +
              t(
                "env.auth.apiKeyDiagEnv",
                {
                  envId: String(process.env.CLOUDBASE_ENV_ID),
                  apiKeyPrefix: apiKeyFromEnv.slice(0, 20),
                  site: process.env.TCB_SITE || t("env.auth.siteUnset", undefined, outLang),
                  gatewayRegion:
                    exchangeRegion ?? t("env.auth.gatewayRegionDefault", undefined, outLang),
                  endpoint,
                },
                outLang,
              );

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
              message: t("env.auth.devicePendingBrowser", undefined, outLang),
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
              // 启动 Device Flow，全流程由 toolbox 负责轮询和写入 credential，这里不等待完成。
              // 登录参数（含 TCB_SITE=intl 端点覆写与授权页改写）与 ensureLogin 共享同一 helper，
              // 避免此直连路径绕过国际站改写导致国际站账号拿到的仍是国内站链接
              auth
                .loginByWebAuth({
                  ...buildDeviceLoginOptions(resolvedAuthOptions, {
                    region: toolRegion ?? region,
                    site: toolSite ?? server.cloudBaseOptions?.site,
                  }),
                  onDeviceCode: deviceOnCode,
                })
                .then(async () => {
                  // toolbox 将新凭证写入 flat 'credential'，这里迁移为分槽格式
                  //（legacy flat 等价 domestic 槽位），对齐 ensureLogin() 的分槽行为
                  try {
                    await ensureSlottedCredential();
                  } catch (err) {
                    debug("device auth: slotted credential migration failed", {
                      error: err instanceof Error ? err.message : String(err),
                    });
                  }
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
                message: t("env.auth.deviceInitFailed", { message }, outLang),
                next_step: buildAuthNextStep("start_auth", {
                  suggestedArgs: { action: "start_auth", authMode: "device" },
                }),
              });
            }

            if (!deviceAuthInfo) {
              return buildJsonToolResult({
                ok: false,
                code: "AUTH_REQUIRED",
                message: t("env.auth.deviceCodeMissing", undefined, outLang),
                next_step: buildAuthNextStep("start_auth", {
                  suggestedArgs: { action: "start_auth", authMode: "device" },
                }),
              });
            }

            const envCandidates = await fetchAvailableEnvCandidates(cloudBaseOptions, server);
            return buildJsonToolResult({
              ok: true,
              code: "AUTH_PENDING",
              message: t("env.auth.deviceStarted", undefined, outLang),
              auth_challenge: authChallenge(),
              ...buildEnvCandidatePayload(envCandidates),
              next_step: buildAuthNextStep("status", {
                suggestedArgs: { action: "status" },
              }),
            });
          }

          // 3. 非 Device Flow（显式 web 模式）仍然使用 getLoginState 阻塞等待
          const loginState = await ensureLogin({
            region: toolRegion ?? region,
            site: toolSite ?? server.cloudBaseOptions?.site,
            authMode: effectiveMode,
            clientId: resolvedAuthOptions.clientId,
            oauthEndpoint: resolvedAuthOptions.oauthEndpoint,
            oauthCustom: resolvedAuthOptions.oauthCustom,
          });

          if (!loginState) {
            return buildJsonToolResult({
              ok: false,
              code: "AUTH_REQUIRED",
              message: t("env.auth.loginStateMissing", undefined, outLang),
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
              message: t("env.auth.apiKeyArgsRequired", undefined, outLang),
              next_step: buildAuthNextStep("login_by_api_key", {
                suggestedArgs: { action: "login_by_api_key", apiKey: "<your-api-key>", envId: "<your-env-id>" },
              }),
            });
          }

          // 写入 process.env（与 cli.ts 处理 --api-key/--env-id 的逻辑一致）
          process.env.CLOUDBASE_API_KEY = toolApiKey;
          process.env.CLOUDBASE_ENV_ID = toolApiKeyEnvId;

          try {
            // 显式 site/region 直接透传：显式 intl → ap-singapore 换取网关；
            // 国内站 key 不受影响（resolveApiKeyExchangeRegion 对 domestic/歧义回默认网关）
            const loginState = await peekLoginState({
              ...(toolSite ? { site: toolSite } : {}),
              ...(toolRegion ? { region: toolRegion } : {}),
            });
            if (loginState) {
              const envPreparation = await prepareAuthEnvironment({
                server,
                cloudBaseOptions,
                loginState,
              });
              return buildJsonToolResult({
                ok: true,
                code: "AUTH_READY",
                message: await appendApiKeyCamWarningIfNeeded(
                  loginState,
                  t("env.auth.apiKeySuccess", undefined, outLang),
                ),
                auth_mode: "api_key",
                ...buildAuthEnvSetupPayload(envPreparation),
                next_step: envPreparation.nextStep,
              });
            }

            // API Key 换取失败：清理 env vars 并返回诊断信息
            delete process.env.CLOUDBASE_API_KEY;
            delete process.env.CLOUDBASE_ENV_ID;

            const diagMessage =
              t("env.auth.apiKeyExchangeFailed", undefined, outLang) +
              t(
                "env.auth.apiKeyDiagLogin",
                {
                  envId: toolApiKeyEnvId,
                  apiKeyPrefix: toolApiKey.slice(0, 20),
                  site: process.env.TCB_SITE || t("env.auth.siteUnset", undefined, outLang),
                },
                outLang,
              );

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
              message: t("env.auth.apiKeyException", { message }, outLang),
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
                ? t("env.auth.notLoggedInCodeBuddy", undefined, outLang)
                : t("env.auth.notLoggedInPeriod", undefined, outLang),
              next_step: buildAuthRequiredNextStep(server),
            });
          }

          const credentialBoundary = buildCredentialBoundaryPayload(cloudBaseOptions);
          const envCandidates = isApiKeyCredentialMode()
            ? await fetchAvailableEnvCandidates(cloudBaseOptions, server)
            : await fetchAccountEnvCandidates(cloudBaseOptions);
          if (!envId) {
            return buildJsonToolResult({
              ok: false,
              code: "INVALID_ARGS",
              message: t("env.auth.setEnvIdRequired", undefined, outLang),
              ...credentialBoundary,
              ...buildEnvCandidatePayload(envCandidates),
              next_step: buildSetEnvNextStep(envCandidates),
            });
          }

          if (isApiKeyCredentialMode()) {
            const pinnedEnvId = process.env.CLOUDBASE_ENV_ID;
            if (pinnedEnvId && envId !== pinnedEnvId) {
              return buildJsonToolResult({
                ok: false,
                code: "CREDENTIAL_SCOPE_LIMITED",
                message: t(
                  "env.auth.credentialScopeLimited",
                  { pinnedEnvId, envId },
                  outLang,
                ),
                ...credentialBoundary,
                current_env_id: pinnedEnvId,
                ...buildEnvCandidatePayload(envCandidates),
              });
            }
            await envManager.setEnvId(envId);
            persistAuthBinding({
              site: toolSite,
              region: toolRegion,
              lang: toolLang,
            });
            return buildJsonToolResult({
              ok: true,
              code: "ENV_READY",
              message: t("env.auth.envReady", { envId }, outLang),
              current_env_id: envId,
              ...credentialBoundary,
            });
          }

          let target = envCandidates.find((item) => item.envId === envId);
          if (!target) {
            target = await resolveEnvCandidateByEnvId({
              envId,
              cloudBaseOptions,
              loginState,
            });
          }

          await envManager.setEnvId(envId);
          // 跨客户端通用事件推送（MCP 协议 notification，无 id）：任何客户端
          // （如 dsh-plugin 面板）都能通过 notifications/cloudbase/env_changed
          // 感知环境变更，替代客户端本地推断与兜底轮询。通知失败不影响主流程。
          void server.server
            .notification({
              method: "notifications/cloudbase/env_changed",
              params: { envId },
            })
            .catch(() => {});
          applyBoundEnvRegion(server, target?.region);
          await applyBoundEnvSite(server, target?.region);
          persistAuthBinding({
            site: toolSite,
            region: toolRegion,
            lang: toolLang,
          });
          const regionHint = target?.region
            ? t("env.auth.regionHint", { region: target.region }, outLang)
            : target
              ? ""
              : t("env.auth.regionHintUnverified", undefined, outLang);
          return buildJsonToolResult({
            ok: true,
            code: "ENV_READY",
            message: t("env.auth.envReadyWithHint", { envId, regionHint }, outLang),
            ...credentialBoundary,
            current_env_id: envId,
            current_region: target?.region || credentialBoundary.current_region,
          });
        }

        if (action === "logout") {
          // Disallow logout in API Key mode
          if (getCloudBaseApiKeyFromEnv() && process.env.CLOUDBASE_ENV_ID) {
            return buildJsonToolResult({
              ok: false,
              code: "LOGOUT_NOT_ALLOWED",
              message: t("env.auth.logoutNotAllowedApiKey", undefined, outLang),
              auth_mode: "api_key",
            });
          }

          if (confirm !== "yes") {
            return buildJsonToolResult({
              ok: false,
              code: "INVALID_ARGS",
              message: t("env.auth.logoutConfirmRequired", undefined, outLang),
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
            message: t("env.auth.loggedOut", undefined, outLang),
          });
        }

        if (action === "get_temp_credentials") {
          const loginState = (await peekLoginState()) as Record<string, unknown> | null;
          if (!loginState) {
            return buildJsonToolResult({
              ok: false,
              code: "AUTH_REQUIRED",
              message: t("env.auth.tempCredNotLoggedIn", undefined, outLang),
              next_step: buildAuthRequiredNextStep(server),
            });
          }

          if (confirm !== "yes") {
            return buildJsonToolResult({
              ok: false,
              code: "INVALID_ARGS",
              message: t("env.auth.tempCredConfirmRequired", undefined, outLang),
              next_step: buildAuthNextStep("get_temp_credentials", {
                suggestedArgs: { action: "get_temp_credentials", confirm: "yes" },
              }),
            });
          }

          if (!isTemporaryCredentialLoginState(loginState)) {
            return buildJsonToolResult({
              ok: false,
              code: "UNSUPPORTED_CREDENTIAL_TYPE",
              message: t("env.auth.tempCredUnsupportedType", undefined, outLang),
            });
          }

          const secretId = normalizeOptionalToolString(loginState.secretId);
          const secretKey = normalizeOptionalToolString(loginState.secretKey);
          const token = normalizeOptionalToolString(loginState.token);
          if (!secretId || !secretKey || !token) {
            return buildJsonToolResult({
              ok: false,
              code: "INTERNAL_ERROR",
              message: t("env.auth.tempCredIncomplete", undefined, outLang),
            });
          }

          return buildJsonToolResult({
            ok: true,
            code: "TEMP_CREDENTIALS_READY",
            message: reveal
              ? t("env.auth.tempCredReadyReveal", undefined, outLang)
              : t("env.auth.tempCredReadyMasked", undefined, outLang),
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
          message: t("env.auth.unsupportedAction", { action }, outLang),
          next_step: buildAuthNextStep("status", {
            suggestedArgs: { action: "status" },
          }),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return buildJsonToolResult({
          ok: false,
          code: "INTERNAL_ERROR",
          message: t("env.auth.internalError", { message }, outLang),
          auth_challenge: authChallenge(),
          next_step: buildAuthNextStep("status", {
            suggestedArgs: { action: "status" },
          }),
        });
      }
    },
  );
  } // end: wxide guard for auth tool

  // queryEnv - 环境查询（合并 listEnvs + getEnvInfo + getEnvAuthDomains + usage + metrics）
  const queryEnvHandler: (args: any) => Promise<any> = async ({
    action,
    alias,
    aliasExact,
    envId,
    region,
    limit,
    offset,
    fields,
    type,
    startDate,
    endDate,
    needUsageDetails,
    metricName,
    startTime,
    endTime,
    period,
    resourceID,
    subresourceID,
  }: {
      action: "list" | "info" | "domains" | "usage" | "metrics";
      alias?: string;
      aliasExact?: boolean;
      envId?: string;
      region?: (typeof TCB_QUERY_REGIONS)[number];
      limit?: number;
      offset?: number;
      fields?: EnvFieldName[];
      type?: EnvUsageModule[];
      startDate?: string;
      endDate?: string;
      needUsageDetails?: boolean;
      metricName?: string;
      startTime?: string;
      endTime?: string;
      period?: number;
      resourceID?: string;
      subresourceID?: string;
    }) => {
      try {
        let result;
        // region 是否真正透传到按地域的 DescribeEnvs：环境级凭证会 pin 到绑定
        // envId 改走 describeEnvInfo（见下方 list 分支），此时 region 不生效，
        // 回执必须如实告知，避免调用方据此误判环境地域。
        let regionAppliedToQuery = false;
        // pinned 分支实际查询的 envId（可能是 CLOUDBASE_ENV_ID，与
        // cloudBaseOptions.envId 不一致）。回执里「只保留当前环境」必须按它过滤。
        let pinnedEnvId: string | undefined;

        switch (action) {
          case "list":
            try {
              const cloudbaseList = await getManagerForEnvQuery(undefined, false, region);

              // API Key / env-var pin: skip DescribeEnvs (STS often cannot list).
              // Account-level sessions that only pinned CLOUDBASE_ENV_ID via set_env
              // can still pass region/alias/envId to list other environments.
              // Hosted OAuth: 宿主（tcb-bff）显式声明 credentialScope: 'env'，签发的
              // 环境级 federated STS 调账号级 DescribeEnvs 会被拒（"invalid token"），
              // 同样 pin 到绑定 envId 降级为 describeEnvInfo。
              const isEnvScopedCredential =
                cloudBaseOptions?.credentialScope === "env" &&
                typeof cloudBaseOptions?.envId === "string" &&
                cloudBaseOptions.envId.length > 0;
              const envIdFromEnv =
                !cloudBaseOptions?.requestFn &&
                (process.env.CLOUDBASE_ENV_ID ||
                  (isEnvScopedCredential ? cloudBaseOptions.envId : undefined));
              const shouldPinToEnvVar = Boolean(
                envIdFromEnv &&
                (isApiKeyCredentialMode() ||
                  isEnvScopedCredential ||
                  (!region && !alias && !envId)),
              );
              if (shouldPinToEnvVar && envIdFromEnv) {
                // 记录真正被查询的 envId：后面回执按它过滤，而不是按
                // cloudBaseOptions.envId（两者在 API Key 场景下可能不同）。
                pinnedEnvId = envIdFromEnv;
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
                // 给调用方 AI 说明降级原因，避免误判为"账号只有一个环境"
                if (isEnvScopedCredential) {
                  result = {
                    ...result,
                    scope_note: t("env.list.singleEnvDegradedNote", { envId: envIdFromEnv }),
                  };
                }
              } else {
                // 走到这里说明没有 pin 到绑定环境，region 会随 manager 透传到
                // DescribeEnvs 的 X-TC-Region
                regionAppliedToQuery = Boolean(region);
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
                const cloudbaseList = await getManagerForEnvQuery(undefined, false, region);
                regionAppliedToQuery = Boolean(region);
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
              regionApplied: regionAppliedToQuery,
              targetEnvId: pinnedEnvId,
              filters: {
                alias,
                aliasExact,
                envId,
                region,
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
            // Project gateway Route.Enable next to StaticDomain (do not rewrite StaticDomain).
            result = await enrichEnvInfoWithStaticDomainRouteEnabled(
              cloudbaseInfo,
              result,
              envId,
            );
            result = await enrichEnvInfoWithRuntimeMode(result, cloudbaseInfo);
            break;

          case "domains":
            // 与 info/usage/metrics 对齐：必须落到调用方指定的 envId。
            // 之前用 getManager() 会静默返回「当前绑定环境」的域名，
            // 传了别的 envId 时会拿到错误对象（配 Web 安全域名时尤其危险）。
            const cloudbaseDomains = await getManagerForEnvQuery(envId);
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
                  note: t("env.domainStatus.note"),
                },
                next_step_template: {
                  tool: "manageEnv",
                  action: "addSecurityDomain",
                  domains: ["<actual-browser-host>:<actual-browser-port>"],
                  note: t("env.domainStatus.nextStepNote"),
                },
              };
            }
            break;

          case "usage": {
            // Explicit EnvId is required (DescribeEnvPostpayPackage / credits APIs reject missing EnvId).
            const usageEnvId = normalizeOptionalToolString(envId);
            if (!usageEnvId) {
              throw new Error(t("env.usage.envIdRequired"));
            }
            const modules = resolveEnvUsageModules(type);
            const includeDetails =
              typeof needUsageDetails === "boolean" ? needUsageDetails : true;
            const cloudbaseUsage = await getManagerForEnvQuery(usageEnvId);
            const accountCircle = await cloudbaseUsage.env.describeEnvAccountCircle({
              EnvId: usageEnvId,
            });
            logCloudBaseResult(server.logger, accountCircle);
            const dateRange = resolveEnvUsageDateRange({
              startDate,
              endDate,
              accountCircle,
            });
            const usageDetail = await cloudbaseUsage.env.describeCreditsUsageDetail({
              EnvId: usageEnvId,
              Modules: modules,
              StartDate: dateRange.startDate,
              EndDate: dateRange.endDate,
              NeedUsageDetails: includeDetails,
            });
            logCloudBaseResult(server.logger, usageDetail);
            result = {
              EnvId: usageEnvId,
              Modules: modules,
              StartDate: dateRange.startDate,
              EndDate: dateRange.endDate,
              DateSource: dateRange.dateSource,
              NeedUsageDetails: includeDetails,
              AccountCircle: {
                StartTime: accountCircle?.StartTime,
                EndTime: accountCircle?.EndTime,
                HistoryTime: accountCircle?.HistoryTime ?? [],
                RequestId: accountCircle?.RequestId,
              },
              Usages: usageDetail?.Usages ?? [],
              RequestId: usageDetail?.RequestId,
            };
            break;
          }

          case "metrics": {
            const metricsEnvId = normalizeOptionalToolString(envId);
            if (!metricsEnvId) {
              throw new Error(t("env.metrics.envIdRequired"));
            }
            const resolvedMetricName = resolveEnvMetricName(metricName);
            const timeRange = resolveEnvMetricTimeRange({ startTime, endTime });
            const resolvedPeriod = resolveEnvMetricPeriod(period);
            const resolvedResourceId = resolveEnvMetricResourceId(
              resolvedMetricName,
              resourceID,
            );
            const resolvedSubresourceId = normalizeOptionalToolString(subresourceID);
            const cloudbaseMetrics = await getManagerForEnvQuery(metricsEnvId);
            if (typeof cloudbaseMetrics?.monitor?.describeCurveData !== "function") {
              throw new Error(t("env.metrics.curveUnsupported"));
            }
            const curveParams: {
              MetricName: EnvMetricName;
              StartTime: string;
              EndTime: string;
              Period?: EnvMetricPeriod;
              ResourceID?: string;
              SubresourceID?: string;
            } = {
              MetricName: resolvedMetricName,
              StartTime: timeRange.startTime,
              EndTime: timeRange.endTime,
            };
            if (resolvedPeriod !== undefined) {
              curveParams.Period = resolvedPeriod;
            }
            if (resolvedResourceId) {
              curveParams.ResourceID = resolvedResourceId;
            }
            if (resolvedSubresourceId) {
              curveParams.SubresourceID = resolvedSubresourceId;
            }
            const curve = await cloudbaseMetrics.monitor.describeCurveData(curveParams);
            logCloudBaseResult(server.logger, curve);
            result = {
              EnvId: metricsEnvId,
              MetricName: resolvedMetricName,
              StartTime: timeRange.startTime,
              EndTime: timeRange.endTime,
              TimeSource: timeRange.timeSource,
              Period: resolvedPeriod ?? curve?.Period,
              ResourceID: resolvedResourceId,
              SubresourceID: resolvedSubresourceId,
              Curve: curve,
              Summary: summarizeEnvMetricCurve(curve ?? {}),
            };
            break;
          }

          default:
            throw new Error(t("env.queryError.unsupportedAction", { action }));
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
    title: "env.queryTitle",
    description: "env.queryDescription",
    inputSchema: {
      action: z
        .enum(["list", "info", "domains", "usage", "metrics"])
        .describe(
          "查询类型：list=环境列表/摘要筛选（按 DescribeEnvs 语义筛选，支持通过 envId / region 筛选，返回 EnvId、Alias、Status、EnvType、Region、PackageId、PackageName、IsDefault，不支持 expiry），info=指定环境的详细信息（必须传入 envId，返回资源字段和计费信息），domains=安全域名列表，usage=环境资源用量（必须传入 envId，对齐 tcb env usage/info），metrics=环境监控时序（必须传入 envId 与 metricName，对齐 TCB DescribeCurveData）",
        ),
      alias: z.string().optional().describe("按环境别名筛选。action=list 时可选"),
      aliasExact: z.boolean().optional().describe("按环境别名精确筛选。action=list 时可选；与 alias 配合使用"),
      envId: z
        .string()
        .optional()
        .describe(
          "环境 ID。action=list 时可选（仅按 DescribeEnvs 语义做筛选，仍返回摘要）；action=info / action=usage / action=metrics 时必填；action=domains 时可选（不传则查当前绑定环境，传了则查该环境的安全域名）。",
        ),
      region: z
        .enum(TCB_QUERY_REGIONS)
        .optional()
        .describe(
          "查询地域。仅 action=list 时有效。账号级凭据会把该值透传到 DescribeEnvs（X-TC-Region），例如 ap-singapore。等价 CLI：tcb env list -r <region> --json。环境级凭据（API Key / 托管授权 token）为单环境权限，该参数会被忽略：结果恒为绑定环境，响应的 AppliedFilters.region 为 null、query_region 取该环境自身的 Region，ignored_params 说明忽略原因——不要据此判定该地域没有环境。",
        ),
      limit: z.number().int().positive().optional().describe("返回数量上限。action=list 时可选"),
      offset: z.number().int().min(0).optional().describe("分页偏移。action=list 时可选"),
      fields: z
        .array(z.enum(DEFAULT_ENV_FIELDS))
        .optional()
        .describe("返回字段白名单。仅支持 EnvId、Alias、Status、EnvType、Region、PackageId、PackageName、IsDefault。action=list 时可选"),
      type: z
        .array(z.enum(ENV_USAGE_MODULE_VALUES))
        .optional()
        .describe(
          "用量模块过滤。仅 action=usage 时有效；不传则查询全部模块。可选值对齐 tcb CLI：FLEXDB、TDSQL、SCF、EKS、COS、AI、HOSTING、Auth、APIInvocation、HTTPInvocation、VM、Workflow、Other。",
        ),
      startDate: z
        .string()
        .optional()
        .describe(
          "用量开始日期（YYYY-MM-DD）。仅 action=usage 时有效；与 endDate 成对传入。不传则使用当前计费周期。",
        ),
      endDate: z
        .string()
        .optional()
        .describe(
          "用量结束日期（YYYY-MM-DD）。仅 action=usage 时有效；与 startDate 成对传入。不传则使用当前计费周期。",
        ),
      needUsageDetails: z
        .boolean()
        .optional()
        .describe(
          "是否返回每日用量明细。仅 action=usage 时有效；默认 true。",
        ),
      metricName: z
        .enum(ENV_METRIC_NAME_VALUES)
        .optional()
        .describe(
          "监控指标名。仅 action=metrics 时有效且必填。GatewayTraceEnvQPS/EnvQPSAll=环境与网关 QPS；FunctionInvocation/FunctionError/FunctionTimeout/FunctionThrottle=云函数调用、错误、超时、限流；DbRead/DbWrite/DbSizepkg=文档库读写与容量；MysqlCpuUsageRate/MysqlMemoryUse/MysqlStorageUsage=SQL 库 CPU/内存/磁盘；TkeCpuUsedService/TkeQPSService/TkeHttpErrorService=云托管 CPU/QPS/错误。",
        ),
      startTime: z
        .string()
        .optional()
        .describe(
          "监控开始时间（YYYY-MM-DD HH:mm:ss）。仅 action=metrics 时有效；与 endTime 成对传入。不传则默认最近 24 小时。结束时间须晚于开始时间至少五分钟。",
        ),
      endTime: z
        .string()
        .optional()
        .describe(
          "监控结束时间（YYYY-MM-DD HH:mm:ss）。仅 action=metrics 时有效；与 startTime 成对传入。不传则默认最近 24 小时。",
        ),
      period: z
        .union([z.literal(300), z.literal(3600), z.literal(86400)])
        .optional()
        .describe(
          "统计周期（秒）。仅 action=metrics 时有效；仅支持 300、3600、86400。不传则由后端按时间范围自动选择。时间范围 ≤1 天不可用 86400；>3 天不可用 300。",
        ),
      resourceID: z
        .string()
        .optional()
        .describe(
          "资源 ID。仅 action=metrics 时有效。云函数传函数名，文档库传集合名，云托管必须传服务名；GatewayTraceEnvQPS 不传则使用环境级 all|:|all|:|all|:|all。",
        ),
      subresourceID: z
        .string()
        .optional()
        .describe(
          "子资源 ID。仅 action=metrics 时有效；查询云托管某版本监控时传入版本名。",
        ),
    },
    annotations: {
      readOnlyHint: true,
      openWorldHint: true,
      category: "env",
    },
  };
  server.registerTool?.("queryEnv", queryEnvToolSchema, queryEnvHandler);
  // 向后兼容：envQuery 作为 queryEnv 的别名注册。
  // DEPRECATED：词序与 query*/manage* 规范不一致（灯塔数据显示与 queryEnv 在 2.32.5 并行被调用），
  // 本版本仅标记废弃，计划下个版本移除此别名注册。
  server.registerTool?.(
    "envQuery",
    {
      ...queryEnvToolSchema,
      // 别名 description 是拼接文本（不是单一词典 key），注册包装层无法再按 key 解析，
      // 因此这里按实例语言先解析成最终文案再拼接。
      description:
        t("env.queryDescription", undefined, server.lang) +
        t("env.envQueryDeprecatedNotice", undefined, server.lang),
      annotations: {
        ...queryEnvToolSchema.annotations,
      },
    },
    queryEnvHandler,
  );

  // envDomainManagement - 环境域名管理（合并 createEnvDomain + deleteEnvDomain）
  // 微信 IDE 场景不需要域名管理
  if (server.ide !== 'wxide') {
  server.registerTool?.(
    "envDomainManagement",
    {
      title: "env.domainTitle",
      description: "env.domainDescription",
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
            throw new Error(t("env.domain.unsupportedActionType", { action }));
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
              text: t("env.domain.operationFailed", {
                message: error instanceof Error ? error.message : String(error),
              }),
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
      title: "env.manageTitle",
      description: "env.manageDescription",
      inputSchema: {
        action: z
          .enum(["listPackages", "create", "modifyPlan", "renew", "addSecurityDomain", "removeSecurityDomain"])
          .describe(
            "操作类型：listPackages=查询可选套餐，create=创建环境，modifyPlan=变更套餐，renew=续费，addSecurityDomain=添加安全域名（CORS 白名单条目），removeSecurityDomain=删除安全域名",
          ),
        domains: z
          .array(z.string())
          .optional()
          .describe(
            "安全域名数组（格式：host:port，例如 localhost:5173 或 127.0.0.1:4173）。仅 action=addSecurityDomain/removeSecurityDomain 时有效且必填。注意：这是 CORS 白名单条目，不是自定义域名，不需要证书。添加前应先用 queryEnv(action=domains) 检查浏览器实际 origin 是否已在白名单中。",
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
      domains?: string[];
    }) => {
      const action = rawArgs.action ?? "";
      const alias = normalizeOptionalToolString(rawArgs.alias);
      const packageId = normalizeOptionalToolString(rawArgs.packageId);
      const resolvedResources = resolveCreateEnvResources(rawArgs.resources);
      const duration = rawArgs.duration ?? 1;
      const envId = normalizeOptionalToolString(rawArgs.envId);
      const confirmed = rawArgs.confirm === "yes";
      const domains = (rawArgs.domains ?? [])
        .map((d) => (typeof d === "string" ? d.trim() : ""))
        .filter(Boolean);

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
              message: t("env.manage.packagesSuccess"),
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
                : { error: t("env.manage.missingPackageIdForPrice") };
              const priceSection = priceProbe.priceResult
                ? formatPriceSection(priceProbe.priceResult)
                : null;
              const releaseMethod = buildReleaseMethodHint();

              // 组合多段披露文案（对照控制台购买页确认对话框）
              const messageLines: string[] = [];
              messageLines.push(t("env.manage.createHeader"));
              messageLines.push(t("env.manage.createNotice"));
              messageLines.push(t("env.manage.createFreeNote"));
              messageLines.push(t("env.manage.createConfirmPrompt"));
              messageLines.push(
                t("env.manage.createAlias", {
                  alias: alias ?? t("env.manage.notProvided"),
                }),
              );
              messageLines.push(
                t("env.manage.createPackage", {
                  packageId: packageId ?? t("env.manage.notProvided"),
                }) + (packageTitle ? `（${packageTitle}）` : ""),
              );
              messageLines.push(
                t("env.manage.createResources", { resources: resolvedResources.join(", ") }),
              );
              messageLines.push(t("env.manage.createDuration", { duration }));
              messageLines.push(t("env.manage.createRegionNote"));
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
              messageLines.push(t("env.manage.createAck"));
              messageLines.push(t("env.manage.createCancelNote"));

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
                  text: t("env.manage.createAckText"),
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
              throw new Error(t("env.manage.createAliasRequired"));
            }
            if (!packageId) {
              throw new Error(t("env.manage.createPackageRequired"));
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
              message: t("env.manage.createSuccess", { envId: result.EnvId }),
              envId: result.EnvId,
              resources: resolvedResources,
            });
          }

          case "modifyPlan": {
            // 变更套餐需要 confirm
            if (!confirmed) {
              if (!envId || !packageId) {
                throw new Error(t("env.manage.modifyArgsRequired"));
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
              messageLines.push(t("env.manage.modifyHeader", { envId }));
              messageLines.push(t("env.manage.confirmPrompt"));
              messageLines.push(
                t("env.manage.currentPackage", {
                  packageName:
                    currentBilling?.packageName ??
                    currentBilling?.packageId ??
                    t("env.manage.unknownValue"),
                }) +
                  (currentBilling?.packageId && currentBilling.packageName
                    ? `（${currentBilling.packageId}）`
                    : ""),
              );
              if (currentBilling?.expireTime) {
                messageLines.push(
                  t("env.manage.currentExpireTime", {
                    expireTime: currentBilling.expireTime,
                  }),
                );
              }
              messageLines.push(
                t("env.manage.newPackage", { packageId }) +
                  (newPackageTitle ? `（${newPackageTitle}）` : ""),
              );
              messageLines.push("");
              if (priceSection) {
                messageLines.push(
                  t("env.manage.modifyPriceChange", { summary: priceSection.summary }),
                );
                if (priceSection.detail) {
                  messageLines.push(priceSection.detail);
                }
              } else if (priceProbe.error) {
                messageLines.push(
                  t("env.manage.modifyPriceFailed", { error: priceProbe.error }),
                );
              } else {
                messageLines.push(t("env.manage.modifyPriceEmpty"));
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

              messageLines.push(t("env.manage.modifyAck"));
              messageLines.push(t("env.manage.cancelNote"));

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
                  text: t("env.manage.modifyAckText"),
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
              throw new Error(t("env.manage.modifyEnvIdRequired"));
            }
            if (!packageId) {
              throw new Error(t("env.manage.modifyPackageIdRequired"));
            }

            const result = await cloudbase.env.modifyEnvPlan({ EnvId: envId, PackageId: packageId });
            logCloudBaseResult(server.logger, result);
            return buildJsonToolResult({
              ok: true,
              code: "PLAN_MODIFIED",
              message: t("env.manage.modifySuccess", { envId, packageId }),
              envId,
              packageId,
            });
          }

          case "renew": {
            // 续费需要 confirm
            if (!confirmed) {
              if (!envId) {
                throw new Error(t("env.manage.renewEnvIdRequired"));
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
              messageLines.push(t("env.manage.renewHeader", { envId }));
              messageLines.push(t("env.manage.confirmPrompt"));
              messageLines.push(
                t("env.manage.currentPackage", {
                  packageName:
                    currentBilling?.packageName ??
                    currentBilling?.packageId ??
                    t("env.manage.unknownValue"),
                }) +
                  (currentBilling?.packageId && currentBilling.packageName
                    ? `（${currentBilling.packageId}）`
                    : ""),
              );
              if (currentBilling?.expireTime) {
                messageLines.push(
                  t("env.manage.currentExpireTime", {
                    expireTime: currentBilling.expireTime,
                  }),
                );
              }
              messageLines.push(t("env.manage.renewDuration", { duration }));
              messageLines.push("");
              if (priceSection) {
                messageLines.push(
                  t("env.manage.renewPrice", { summary: priceSection.summary }),
                );
                if (priceSection.detail) {
                  messageLines.push(priceSection.detail);
                }
              } else if (priceProbe.error) {
                messageLines.push(
                  t("env.manage.renewPriceFailed", { error: priceProbe.error }),
                );
              } else {
                messageLines.push(t("env.manage.renewPriceEmpty"));
              }
              messageLines.push("");

              // 资源释放方式
              messageLines.push(buildReleaseMethodDetailText(currentPackageId));
              messageLines.push("");

              // 文档链接（续费主要看预付费与到期释放）
              messageLines.push(renderDocLinksBlock(["prepayExpiry"]));
              messageLines.push("");

              messageLines.push(t("env.manage.renewAck"));
              messageLines.push(t("env.manage.cancelNote"));

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
                  text: t("env.manage.renewAckText"),
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
              throw new Error(t("env.manage.renewEnvIdRequired"));
            }

            const result = await cloudbase.env.renewEnv({ EnvId: envId, Period: duration });
            logCloudBaseResult(server.logger, result);
            return buildJsonToolResult({
              ok: true,
              code: "ENV_RENEWED",
              message: t("env.manage.renewSuccess", { envId, duration }),
              envId,
            });
          }

          case "addSecurityDomain":
          case "removeSecurityDomain": {
            // 安全域名（浏览器 CORS 白名单）增删。原 envDomainManagement(create/delete) 的能力收编：
            // 不计费、无需 confirm；微信 IDE 场景不提供域名管理（与原工具的注册 guard 保持一致）。
            if (server.ide === "wxide") {
              return buildJsonToolResult({
                ok: false,
                code: "TOOL_UNAVAILABLE_IN_WXIDE",
                message:
                  t("env.manage.wxideDomainUnsupported"),
              });
            }
            if (!domains.length) {
              return buildJsonToolResult({
                ok: false,
                code: "DOMAINS_REQUIRED",
                message: t("env.manage.domainsRequired", { action }),
                next_step: {
                  tool: "queryEnv",
                  action: "domains",
                },
              });
            }
            // 安全域名是环境级操作，复用与原 envDomainManagement 相同的管理器获取方式（要求环境上下文）。
            const domainManager = await getManager();
            const domainResult =
              action === "addSecurityDomain"
                ? await domainManager.env.createEnvDomain(domains)
                : await domainManager.env.deleteEnvDomain(domains);
            logCloudBaseResult(server.logger, domainResult);
            return buildJsonToolResult(
              buildEnvDomainManagementResult({
                action: action === "addSecurityDomain" ? "create" : "delete",
                domains,
                result: domainResult,
              }),
            );
          }

          default:
            return buildJsonToolResult({
              ok: false,
              code: "INVALID_ACTION",
              message: t("env.manage.unsupportedAction", { action }),
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
            message: t("env.manage.listPackagesFailed", { message: errorMessage }),
          });
        }
        return {
          content: [
            {
              type: "text",
              text: t("env.manage.operationFailed", { message: errorMessage }),
            },
          ],
        };
      }
    },
  );
}
