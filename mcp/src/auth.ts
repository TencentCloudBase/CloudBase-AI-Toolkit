import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AuthSupervisor,
  authStore,
  checkAndGetCredential,
  cloudbaseConfigDir,
  getProjectDir,
  refreshTmpToken,
  resolveCredential,
} from "@cloudbase/toolbox";
import { debug } from "./utils/logger.js";
import { requireProjectRoot } from "./utils/project-config.js";
import {
  resolveApiKeyExchangeRegion,
  resolveSite,
  resolveSiteAndRegion,
  SITE_REGION_MAP,
  type SiteId,
} from "./utils/site-map.js";

const auth = AuthSupervisor.getInstance({});

export type AuthFlowMode = "web" | "device";

export interface AuthOptions {
  authMode?: AuthFlowMode;
  clientId?: string;
  oauthEndpoint?: string;
  oauthCustom?: boolean;
}

export interface ResolvedAuthOptions {
  authMode: AuthFlowMode;
  clientId?: string;
  oauthEndpoint?: string;
  oauthCustom: boolean;
  usesToolboxDefaults: boolean;
}

export interface EnsureLoginOptions extends AuthOptions {
  fromCloudBaseLoginPage?: boolean;
  ignoreEnvVars?: boolean;
  region?: string;
  site?: string;
  serverAuthOptions?: AuthOptions;
  onDeviceCode?: (info: DeviceFlowAuthInfo) => void;
}

export interface DeviceFlowAuthInfo {
  user_code: string;
  verification_uri?: string;
  verification_uri_complete?: string;
  device_code: string;
  expires_in: number;
}

export type AuthProgressStatus =
  | "IDLE"
  | "PENDING"
  | "READY"
  | "DENIED"
  | "EXPIRED"
  | "ERROR";

export interface AuthProgressState {
  status: AuthProgressStatus;
  authMode?: AuthFlowMode;
  authChallenge?: DeviceFlowAuthInfo;
  lastError?: string;
  updatedAt: number;
}

const authProgressState: AuthProgressState = {
  status: "IDLE",
  updatedAt: Date.now(),
};

function normalizeOptionalString(value?: string | null) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildVerificationUriComplete(
  deviceAuthInfo?: Pick<
    DeviceFlowAuthInfo,
    "verification_uri" | "verification_uri_complete" | "user_code"
  >,
) {
  const explicitComplete = normalizeOptionalString(
    deviceAuthInfo?.verification_uri_complete,
  );
  if (explicitComplete) {
    return explicitComplete;
  }

  const verificationUri = normalizeOptionalString(deviceAuthInfo?.verification_uri);
  const userCode = normalizeOptionalString(deviceAuthInfo?.user_code);
  if (!verificationUri || !userCode) {
    return undefined;
  }

  try {
    const url = new URL(verificationUri);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;

    if (hash) {
      const [hashPath, hashQuery = ""] = hash.split("?");
      const hashParams = new URLSearchParams(hashQuery);
      if (!hashParams.has("user_code")) {
        hashParams.set("user_code", userCode);
      }
      url.hash = hashParams.toString()
        ? `#${hashPath}?${hashParams.toString()}`
        : `#${hashPath}`;
      return url.toString();
    }

    if (!url.searchParams.has("user_code")) {
      url.searchParams.set("user_code", userCode);
    }
    return url.toString();
  } catch {
    if (verificationUri.includes("user_code=")) {
      return verificationUri;
    }

    const separator = verificationUri.includes("?") ? "&" : "?";
    return `${verificationUri}${separator}user_code=${encodeURIComponent(userCode)}`;
  }
}

export function buildDeviceAuthChallengePayload(deviceAuthInfo?: DeviceFlowAuthInfo) {
  if (!deviceAuthInfo) {
    return undefined;
  }

  return {
    user_code: deviceAuthInfo.user_code,
    verification_uri: deviceAuthInfo.verification_uri,
    verification_uri_complete: buildVerificationUriComplete(deviceAuthInfo),
    expires_in: deviceAuthInfo.expires_in,
  };
}

function normalizeAuthMode(value?: string | null): AuthFlowMode | undefined {
  return value === "web" || value === "device" ? value : undefined;
}

function normalizeOptionalBoolean(value?: boolean | string | null) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return undefined;
}

function updateAuthProgressState(
  partial: Partial<AuthProgressState>,
): AuthProgressState {
  Object.assign(authProgressState, partial, {
    updatedAt: Date.now(),
  });
  return getAuthProgressStateSync();
}

/**
 * Resolve CloudBase API Key from env.
 * Prefer CLOUDBASE_API_KEY; fall back to CLOUDBASE_APIKEY (js-sdk / node-sdk convention).
 */
export function getCloudBaseApiKeyFromEnv(): string | undefined {
  return process.env.CLOUDBASE_API_KEY || process.env.CLOUDBASE_APIKEY || undefined;
}

function normalizeLoginStateFromEnvVars(options?: {
  ignoreEnvVars?: boolean;
}) {
  if (options?.ignoreEnvVars) {
    return null;
  }

  // Prefer CloudBase API Key over TENCENTCLOUD_*
  const apiKey = getCloudBaseApiKeyFromEnv();
  const CLOUDBASE_ENV = process.env.CLOUDBASE_ENV_ID;

  if (apiKey && CLOUDBASE_ENV) {
    return {
      _type: 'api_key' as const,
      apiKey,
      envId: CLOUDBASE_ENV,
    };
  }

  // 然后检查腾讯云密钥环境变量
  const {
    TENCENTCLOUD_SECRETID,
    TENCENTCLOUD_SECRETKEY,
    TENCENTCLOUD_SESSIONTOKEN,
  } = process.env;

  if (TENCENTCLOUD_SECRETID && TENCENTCLOUD_SECRETKEY) {
    return {
      secretId: TENCENTCLOUD_SECRETID,
      secretKey: TENCENTCLOUD_SECRETKEY,
      token: TENCENTCLOUD_SESSIONTOKEN,
      envId: process.env.CLOUDBASE_ENV_ID,
    };
  }

  return null;
}

function mapAuthErrorStatus(error: unknown): Extract<AuthProgressStatus, "DENIED" | "EXPIRED" | "ERROR"> {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("拒绝") || message.includes("denied")) {
    return "DENIED";
  }
  if (message.includes("过期") || message.includes("expired")) {
    return "EXPIRED";
  }
  return "ERROR";
}

export function getAuthProgressStateSync(): AuthProgressState {
  return {
    ...authProgressState,
    authChallenge: authProgressState.authChallenge
      ? { ...authProgressState.authChallenge }
      : undefined,
  };
}

export async function getAuthProgressState(): Promise<AuthProgressState> {
  const loginState = await peekLoginState();
  if (loginState && authProgressState.status === "PENDING") {
    updateAuthProgressState({
      status: "READY",
      lastError: undefined,
    });
  }

  if (
    authProgressState.status === "PENDING" &&
    authProgressState.authChallenge?.expires_in
  ) {
    const issuedAt = authProgressState.updatedAt;
    const expiresAt = issuedAt + authProgressState.authChallenge.expires_in * 1000;
    if (Date.now() > expiresAt) {
      updateAuthProgressState({
        status: "EXPIRED",
        lastError: "设备码已过期，请重新发起授权",
      });
    }
  }

  return getAuthProgressStateSync();
}

export function resolveAuthOptions(options?: AuthOptions & {
  ignoreEnvVars?: boolean;
  serverAuthOptions?: AuthOptions;
}): ResolvedAuthOptions {
  const envAuthMode = options?.ignoreEnvVars
    ? undefined
    : normalizeAuthMode(process.env.TCB_AUTH_MODE);
  const envClientId = options?.ignoreEnvVars
    ? undefined
    : normalizeOptionalString(process.env.TCB_AUTH_CLIENT_ID);
  const envOAuthEndpoint = options?.ignoreEnvVars
    ? undefined
    : normalizeOptionalString(process.env.TCB_AUTH_OAUTH_ENDPOINT);
  const envOAuthCustom = options?.ignoreEnvVars
    ? undefined
    : normalizeOptionalBoolean(process.env.TCB_AUTH_OAUTH_CUSTOM);

  const explicitAuthMode =
    normalizeAuthMode(options?.authMode) ??
    normalizeAuthMode(options?.serverAuthOptions?.authMode) ??
    envAuthMode;
  const clientId =
    normalizeOptionalString(options?.clientId) ??
    normalizeOptionalString(options?.serverAuthOptions?.clientId) ??
    envClientId;
  const oauthEndpoint =
    normalizeOptionalString(options?.oauthEndpoint) ??
    normalizeOptionalString(options?.serverAuthOptions?.oauthEndpoint) ??
    envOAuthEndpoint;
  const explicitOAuthCustom =
    normalizeOptionalBoolean(options?.oauthCustom) ??
    normalizeOptionalBoolean(options?.serverAuthOptions?.oauthCustom) ??
    envOAuthCustom;
  const oauthCustom = explicitOAuthCustom ?? (oauthEndpoint ? true : false);
  const authMode = explicitAuthMode ?? "device";

  return {
    authMode,
    clientId,
    oauthEndpoint,
    oauthCustom,
    usesToolboxDefaults:
      explicitAuthMode === undefined &&
      clientId === undefined &&
      oauthEndpoint === undefined &&
      oauthCustom === false,
  };
}

export function getAuthConfigValidationError(options: ResolvedAuthOptions): string | null {
  if (
    options.authMode === "web" &&
    (options.clientId !== undefined ||
      options.oauthEndpoint !== undefined ||
      options.oauthCustom)
  ) {
    return "自定义 device 登录参数仅支持 authMode=device。";
  }

  if (options.oauthCustom && !options.oauthEndpoint) {
    return "oauthCustom=true 时必须同时提供 oauthEndpoint。";
  }

  // oauthEndpoint + 显式 oauthCustom=false 放行：resolveAuthOptions 对"只配 endpoint
  // 未配 custom"已默认 custom=true，走到这里的 endpoint+false 只可能是用户显式指定——
  // 即标准 {code,result} 包装格式的自定义端点（如国际站 tcb-api.tencentcloud.com），
  // 拦截会导致标准格式端点在工具层永远不可用。

  return null;
}

export function buildAuthConfigSummary(options: ResolvedAuthOptions) {
  return {
    auth_mode: options.authMode,
    client_id: options.clientId ?? null,
    oauth_endpoint: options.oauthEndpoint ?? null,
    oauth_custom: options.oauthCustom,
    uses_toolbox_defaults: options.usesToolboxDefaults,
  };
}

/**
 * Resolve the site for this login (explicit site, then TCB_SITE, then region).
 * The result selects the OAuth endpoint and authorization page only.
 * The stored credential stays one flat record.
 */
export function resolveDeviceLoginSite(
  siteHints: { region?: string; site?: string } = {},
): SiteId {
  return resolveSite(siteHints.region, siteHints.site ?? process.env.TCB_SITE);
}

/**
 * 构造 device flow 的 loginByWebAuth 基础参数（onDeviceCode 由调用方按需注入）。
 *
 * 所有 device 登录路径（ensureLogin 与 auth 工具 start_auth 的 device 分支）必须
 * 共享本函数：TCB_SITE=intl 时的 getOAuthEndpoint 覆写与 getAuthUrl 授权页改写
 * 只在 ensureLogin 生效，会导致工具层直连路径仍打国内站端点/授权页，国际站账号
 * 无法完成授权（device-code 注册表国内外隔离，国内授权页对国际站账号无效）。
 */
export function buildDeviceLoginOptions(
  resolvedAuthOptions: ResolvedAuthOptions,
  siteHints: { region?: string; site?: string } = {},
): Record<string, unknown> {
  const resolvedSite = resolveDeviceLoginSite(siteHints);
  const loginOptions: Record<string, unknown> = { flow: "device" };

  if (resolvedAuthOptions.clientId) {
    loginOptions.client_id = resolvedAuthOptions.clientId;
  }
  if (resolvedAuthOptions.oauthEndpoint) {
    loginOptions.getOAuthEndpoint = () => resolvedAuthOptions.oauthEndpoint!;
  } else if (resolvedSite === "intl") {
    // 国际站 OAuth 后端独立部署（2026-09-01 实测 device/code+token 可用，注册表与国内站隔离）；
    // 不覆写时 toolbox 默认打国内站端点，国际站账号无法完成授权
    loginOptions.getOAuthEndpoint = () => SITE_REGION_MAP.intl.oauthEndpoint!;
  }
  if (resolvedSite === "intl") {
    // device 模式的 verification_uri 标准模式下由客户端拼接，指向国内站授权页；
    // 与 web 模式同款 host 改写，把授权页切到国际站
    loginOptions.getAuthUrl = (url: string) =>
      url
        .replace(
          `${SITE_REGION_MAP.domestic.authHost}/dev`,
          `${SITE_REGION_MAP.intl.authHost}/dev`,
        )
        .replace(SITE_REGION_MAP.domestic.authHost, SITE_REGION_MAP.intl.authHost);
  }
  if (resolvedAuthOptions.oauthCustom) {
    loginOptions.custom = true;
  }
  return loginOptions;
}

export function setPendingAuthProgressState(
  challenge: DeviceFlowAuthInfo,
  authMode: AuthFlowMode = "device",
) {
  return updateAuthProgressState({
    status: "PENDING",
    authMode,
    authChallenge: challenge,
    lastError: undefined,
  });
}

export function resolveAuthProgressState() {
  return updateAuthProgressState({
    status: "READY",
    lastError: undefined,
  });
}

export function rejectAuthProgressState(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "unknown error");
  return updateAuthProgressState({
    status: mapAuthErrorStatus(error),
    lastError: message,
  });
}

export function resetAuthProgressState() {
  return updateAuthProgressState({
    status: "IDLE",
    authMode: undefined,
    authChallenge: undefined,
    lastError: undefined,
  });
}

export interface LoginState {
  secretId: string;
  secretKey: string;
  token?: string;
  envId?: string;
  /**
   * 主账号 uin。本地凭证（`~/.config/.cloudbase/auth.json`）自带，
   * 由 `@cloudbase/toolbox` 的 `resolveCredential()` 透传。
   * 注意：临时密钥续期响应里没有 uin，须由调用方保留旧值（见 resolveFlatLoginState）。
   */
  uin?: string | number;
}

/**
 * 本轮生效的凭据从哪来。只回答「来源」，不改变权限范围——
 * 范围仍由 `credential_scope`（account / single_env）表达。
 *
 * - `env`：进程环境变量。宿主按工作区注入，或 `login_by_api_key` 显式传入。
 * - `project`：项目级文件 `~/.config/.cloudbase/projects/<项目根>/auth.json`，
 *   按工作目录自动采纳。
 * - `global`：全局 `~/.config/.cloudbase/auth.json`（账号级登录态）。
 */
export type CredentialSource = "env" | "project" | "global";

let credentialSource: CredentialSource | null = null;
/**
 * 从项目级凭据回填进进程 env 的那一份 key/envId。
 * 用来区分「宿主注入的 env」与「我们自己回填的 env」——否则
 * `peekLoginState` 第二次调用会走 env 分支，把项目级来源报成 `env`。
 */
let adoptedProjectApiKey: string | null = null;
let adoptedProjectEnvId: string | null = null;

export function getCredentialSource(): CredentialSource | null {
  return credentialSource;
}

// One flat credential in auth.json, shared with the CLI. Legacy slotted
// files ({ domestic, intl }) are collapsed once on read; the other site is dropped.

function isSlottedCredential(value: unknown): value is { domestic?: unknown; intl?: unknown } {
  if (!value || typeof value !== "object") {
    return false;
  }
  return "domestic" in value || "intl" in value;
}

function hasResolvableSecrets(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") {
    return false;
  }
  const credential = resolveCredential(value as Parameters<typeof resolveCredential>[0]);
  return Boolean(credential?.secretId && credential?.secretKey);
}

/** Read CLI config.json isIntl. Missing or non-boolean values are ignored. Never writes the file. */
function readCliIsIntl(): boolean | undefined {
  try {
    const text = readFileSync(join(cloudbaseConfigDir, "config.json"), "utf8");
    const parsed = JSON.parse(text) as { isIntl?: unknown };
    return typeof parsed.isIntl === "boolean" ? parsed.isIntl : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Collapse a legacy slotted credential to one flat record.
 * The rewritten file is the completion marker; a crash leaves the slotted file for the next read.
 */
async function migrateSlottedCredentialToFlat(): Promise<void> {
  const raw = await authStore.get("credential");
  if (!isSlottedCredential(raw)) {
    return;
  }
  const domestic = hasResolvableSecrets(raw.domestic) ? raw.domestic : undefined;
  const intl = hasResolvableSecrets(raw.intl) ? raw.intl : undefined;
  const isIntl = readCliIsIntl();
  let site: SiteId;
  if (isIntl === true && intl) {
    site = "intl";
  } else if (isIntl === false && domestic) {
    site = "domestic";
  } else {
    site = resolveSiteAndRegion().site;
  }
  const chosen = site === "intl" ? (intl ?? domestic) : (domestic ?? intl);
  await authStore.set("credential", chosen ?? {});
}

function isTempTokenExpired(
  credential: { accessTokenExpired?: number | string },
  gap = 120,
): boolean {
  return (
    !!credential.accessTokenExpired &&
    Number(credential.accessTokenExpired) < Date.now() + gap * 1000
  );
}

/**
 * Read the single flat credential and refresh it when the temp token is expired.
 * Refresh responses omit uin, so the previous uin is copied back onto the stored record.
 */
async function resolveFlatLoginState(): Promise<LoginState | null> {
  const raw = await authStore.get("credential");
  if (!hasResolvableSecrets(raw)) {
    return null;
  }
  const credential = resolveCredential(raw as Parameters<typeof resolveCredential>[0]);
  if (!credential?.secretId || !credential?.secretKey) {
    return null;
  }

  if (credential.refreshToken) {
    if (!isTempTokenExpired(credential)) {
      return credential as LoginState;
    }
    if (Date.now() < Number(credential.expired)) {
      try {
        const refreshed = await refreshTmpToken(credential);
        const refreshedCredential =
          refreshed &&
          (refreshed as { uin?: unknown }).uin === undefined &&
          credential.uin !== undefined
            ? { ...refreshed, uin: credential.uin }
            : refreshed;
        await authStore.set("credential", refreshedCredential ?? {});
        const resolved = resolveCredential((refreshedCredential ?? {}) as Parameters<typeof resolveCredential>[0]);
        return resolved?.secretId ? (resolved as LoginState) : null;
      } catch (e) {
        const code = (e as { code?: string })?.code;
        if (code === "AUTH_FAIL" || code === "InternalError.GetRoleError") {
          return null;
        }
        throw e;
      }
    }
    return null;
  }

  return credential as LoginState;
}

/**
 * 读项目级凭据文件 `~/.config/.cloudbase/projects/<项目根>/auth.json` 的原始内容。
 *
 * 只读、不建目录——没绑定的项目不该因为我们探一下就多出一个空目录。
 * 判据与 `@cloudbase/toolbox` 的 `getProjectApiKeyCredential()` 一致：必须同时有
 * 密钥与 `authSource`，也就是只有 API Key 来源的凭据会落到项目级（web/device
 * 登录态永远进全局），这样两边的判据不会分叉。
 */
function readProjectCredentialFile(projectRoot: string): Record<string, unknown> | null {
  try {
    const raw = readFileSync(join(getProjectDir(projectRoot), "auth.json"), "utf8");
    const parsed = JSON.parse(raw) as { credential?: Record<string, unknown> };
    const stored = parsed?.credential;
    if (!stored || typeof stored !== "object") {
      return null;
    }
    if (!stored.secretId || !stored.authSource) {
      return null;
    }
    return stored;
  } catch {
    return null;
  }
}

/**
 * 项目级凭据优先于账号级全局登录态。
 *
 * 与 `readProjectEnvId()`「项目配置优先于账号级登录态」保持同一原则：项目级凭据是
 * API Key 登录按 cwd 落下的那一份，随仓库走、跨进程存活，新起的 stdio 进程不必重复登录。
 *
 * 命中后把 apiKey/envId 回填进进程 env（与 `login_by_api_key` 同一做法），
 * 让下游的 credential_scope / auth_mode / 环境候选 / 绑定校验保持同一套判断，
 * 不必各自再认一遍项目级文件。
 *
 * 过期与续期交给 toolbox 的 `checkAndGetCredential()`：API Key 凭据用 apiKey 重换，
 * 换取结果回写项目级（refreshToken 续期仍写全局——项目级凭据只有 API Key 一种来源）。
 * 不可用（换取失败、密钥失效）时返回 null，由调用方回落全局登录态。
 */
async function resolveProjectLoginState(): Promise<LoginState | null> {
  let projectRoot: string;
  try {
    projectRoot = requireProjectRoot();
  } catch {
    // 宿主配置目录等非法项目根：不参与项目级凭据
    return null;
  }
  if (!readProjectCredentialFile(projectRoot)) {
    return null;
  }
  const credential = (await checkAndGetCredential({ cwd: projectRoot })) as
    | (LoginState & { apiKey?: string; authSource?: string })
    | null;
  if (!credential?.secretId) {
    debug("peekLoginState: project credential unusable, falling back to global", {
      projectRoot,
    });
    return null;
  }
  if (credential.authSource === "api_key" && credential.apiKey && credential.envId) {
    process.env.CLOUDBASE_API_KEY = credential.apiKey;
    process.env.CLOUDBASE_ENV_ID = credential.envId;
    adoptedProjectApiKey = credential.apiKey;
    adoptedProjectEnvId = credential.envId;
  }
  return credential as LoginState;
}

/** 清掉我们回填进 env 的那一份，别把已失效的 key 留在进程里。 */
function clearAdoptedProjectEnv(): void {
  if (adoptedProjectApiKey !== null && process.env.CLOUDBASE_API_KEY === adoptedProjectApiKey) {
    delete process.env.CLOUDBASE_API_KEY;
    delete process.env.CLOUDBASE_ENV_ID;
  }
  adoptedProjectApiKey = null;
  adoptedProjectEnvId = null;
}

/**
 * env 里的这一份 key 是不是我们自己从项目级回填的。
 * 是的话来源报 `project`，别报成 `env`——否则第二次调用就会把来源说反。
 */
function isAdoptedProjectCredential(apiKey: string, envId: string): boolean {
  return adoptedProjectApiKey !== null && apiKey === adoptedProjectApiKey && envId === adoptedProjectEnvId;
}

export async function peekLoginState(options?: {
  ignoreEnvVars?: boolean;
  site?: string;
  region?: string;
}): Promise<LoginState | null> {
  credentialSource = null;
  const envVarLoginState = normalizeLoginStateFromEnvVars(options);

  if (envVarLoginState) {
    // API Key 模式：需要先用 API Key 换取临时密钥
    if ('_type' in envVarLoginState && envVarLoginState._type === 'api_key') {
      debug("peekLoginState: detected CLOUDBASE_API_KEY env var");
      try {
        const projectCwd = requireProjectRoot();
        // 换取网关按站点选型：显式 intl → ap-singapore；domestic/歧义 → toolbox 默认
        // ap-shanghai（国内站多地域环境均经其全局路由，详见 resolveApiKeyExchangeRegion）
        const exchangeRegion = resolveApiKeyExchangeRegion({
          site: options?.site,
          region: options?.region,
        });
        const credential = await auth.loginByApiKey(
          envVarLoginState.apiKey,
          envVarLoginState.envId,
          { cwd: projectCwd, ...(exchangeRegion ? { region: exchangeRegion } : {}) }
        );
        // 这一份 env 如果是我们上一轮从项目级回填的，来源仍算 project
        credentialSource = isAdoptedProjectCredential(
          envVarLoginState.apiKey,
          envVarLoginState.envId,
        )
          ? "project"
          : "env";
        return credential;
      } catch (e) {
        debug("peekLoginState: API Key login failed", { error: e instanceof Error ? e.message : String(e) });
        return null;
      }
    }

    // 腾讯云密钥模式：直接返回
    debug("loginByApiSecret");
    credentialSource = "env";
    return envVarLoginState as LoginState;
  }

  // 项目级凭据优先于账号级登录态（与 readProjectEnvId 同一原则）
  const projectLoginState = await resolveProjectLoginState();
  if (projectLoginState) {
    credentialSource = "project";
    return projectLoginState;
  }

  // Site selects endpoints, not which credential is stored. One flat record is shared.
  await migrateSlottedCredentialToFlat();
  const flatLoginState = await resolveFlatLoginState();
  credentialSource = flatLoginState ? "global" : null;
  return flatLoginState;
}

export async function ensureLogin(options?: EnsureLoginOptions) {
  debug("TENCENTCLOUD_SECRETID", { hasSecretId: !!process.env.TENCENTCLOUD_SECRETID });
  debug("CLOUDBASE_API_KEY", { hasApiKey: !!getCloudBaseApiKeyFromEnv() });

  const loginState = await peekLoginState({
    ignoreEnvVars: options?.ignoreEnvVars,
    site: options?.site,
    region: options?.region,
  });
  if (!loginState) {
    const resolvedAuthOptions = resolveAuthOptions({
      authMode: options?.authMode,
      clientId: options?.clientId,
      oauthEndpoint: options?.oauthEndpoint,
      oauthCustom: options?.oauthCustom,
      ignoreEnvVars: options?.ignoreEnvVars,
      serverAuthOptions: options?.serverAuthOptions,
    });
    const validationError = getAuthConfigValidationError(resolvedAuthOptions);
    if (validationError) {
      throw new Error(validationError);
    }

    const mode = resolvedAuthOptions.authMode;
    // Site selects the login URL only. ap-singapore is ambiguous and defaults to intl.
    const resolvedSite: SiteId = resolveSite(
      options?.region,
      options?.site ?? process.env.TCB_SITE,
    );
    const loginOptions: Record<string, unknown> = { flow: mode };

    if (mode === "web") {
      loginOptions.getAuthUrl =
        options?.fromCloudBaseLoginPage && resolvedSite === "domestic"
          ? (url: string) => {
            const separator = url.includes("?") ? "&" : "?";
            const urlWithParam = `${url}${separator}allowNoEnv=true`;
            return `https://${SITE_REGION_MAP.domestic.authHost}/login?_redirect_uri=${encodeURIComponent(urlWithParam)}`;
          }
          : (url: string) => {
            let finalUrl = url;
            if (resolvedSite === "intl") {
              try {
                const parsed = new URL(url);
                parsed.host = SITE_REGION_MAP.intl.authHost;
                finalUrl = parsed.toString();
              } catch {
                finalUrl = url.replace("cloud.tencent.com", "tencentcloud.com");
              }
            }
            const separator = finalUrl.includes("?") ? "&" : "?";
            return `${finalUrl}${separator}allowNoEnv=true`;
          };
    } else {
      // device 模式：与 auth 工具 start_auth device 分支共享 intl 端点覆写与授权页改写
      Object.assign(
        loginOptions,
        buildDeviceLoginOptions(resolvedAuthOptions, {
          region: options?.region,
          site: options?.site,
        }),
      );
      if (options?.onDeviceCode) {
        loginOptions.onDeviceCode = (info: DeviceFlowAuthInfo) => {
          setPendingAuthProgressState(info, mode);
          options.onDeviceCode?.(info);
        };
      }
    }
    debug("beforeloginByWebAuth", { loginOptions });
    try {
      // toolbox writes the new credential as flat auth.json. Leave that shape unchanged.
      await auth.loginByWebAuth(
        loginOptions as Parameters<typeof auth.loginByWebAuth>[0],
      );
      resolveAuthProgressState();
    } catch (error) {
      rejectAuthProgressState(error);
      throw error;
    }
    const loginState = await peekLoginState({
      ignoreEnvVars: options?.ignoreEnvVars,
      site: options?.site,
      region: options?.region,
    });
    debug("loginByWebAuth", { mode, hasLoginState: !!loginState });
    return loginState;
  } else {
    resolveAuthProgressState();
    return loginState;
  }
}

export async function getLoginState(options?: EnsureLoginOptions) {
  return ensureLogin(options);
}

export async function logout(_options?: { site?: string }) {
  let cwd: string | undefined;
  try {
    cwd = requireProjectRoot();
  } catch {
    cwd = undefined;
  }
  await auth.logout(cwd ? { cwd } : undefined);
  clearAdoptedProjectEnv();
  credentialSource = null;
  resetAuthProgressState();
}
