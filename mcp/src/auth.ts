import { AuthSupervisor } from "@cloudbase/toolbox";
import { debug } from "./utils/logger.js";
import { isInternationalRegion } from "./utils/tencent-cloud.js";

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
  serverAuthOptions?: AuthOptions;
  onDeviceCode?: (info: DeviceFlowAuthInfo) => void;
}

export interface DeviceFlowAuthInfo {
  user_code: string;
  verification_uri?: string;
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

function normalizeLoginStateFromEnvVars(options?: {
  ignoreEnvVars?: boolean;
}) {
  const {
    TENCENTCLOUD_SECRETID,
    TENCENTCLOUD_SECRETKEY,
    TENCENTCLOUD_SESSIONTOKEN,
  } = process.env;

  if (!options?.ignoreEnvVars && TENCENTCLOUD_SECRETID && TENCENTCLOUD_SECRETKEY) {
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

  if (options.oauthEndpoint && !options.oauthCustom) {
    return "配置自定义 oauthEndpoint 时必须启用 oauthCustom=true。";
  }

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

export async function peekLoginState(options?: {
  ignoreEnvVars?: boolean;
}) {
  const envVarLoginState = normalizeLoginStateFromEnvVars(options);
  if (envVarLoginState) {
    debug("loginByApiSecret");
    return envVarLoginState;
  }

  return auth.getLoginState();
}

export async function ensureLogin(options?: EnsureLoginOptions) {
  debug("TENCENTCLOUD_SECRETID", { hasSecretId: !!process.env.TENCENTCLOUD_SECRETID });

  const loginState = await peekLoginState({
    ignoreEnvVars: options?.ignoreEnvVars,
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
    const loginOptions: Record<string, unknown> = { flow: mode };

    if (mode === "web") {
      loginOptions.getAuthUrl =
        options?.fromCloudBaseLoginPage && !isInternationalRegion(options?.region)
          ? (url: string) => {
            const separator = url.includes("?") ? "&" : "?";
            const urlWithParam = `${url}${separator}allowNoEnv=true`;
            return `https://tcb.cloud.tencent.com/login?_redirect_uri=${encodeURIComponent(urlWithParam)}`;
          }
          : (url: string) => {
            if (isInternationalRegion(options?.region)) {
              url = url.replace("cloud.tencent.com", "tencentcloud.com");
            }
            const separator = url.includes("?") ? "&" : "?";
            return `${url}${separator}allowNoEnv=true`;
          };
    } else {
      if (resolvedAuthOptions.clientId) {
        loginOptions.client_id = resolvedAuthOptions.clientId;
      }
      if (resolvedAuthOptions.oauthEndpoint) {
        loginOptions.getOAuthEndpoint = () => resolvedAuthOptions.oauthEndpoint!;
      }
      if (resolvedAuthOptions.oauthCustom) {
        loginOptions.custom = true;
      }
      if (options?.onDeviceCode) {
        loginOptions.onDeviceCode = (info: DeviceFlowAuthInfo) => {
          setPendingAuthProgressState(info, mode);
          options.onDeviceCode?.(info);
        };
      }
    }
    debug("beforeloginByWebAuth", { loginOptions });
    try {
      await auth.loginByWebAuth(loginOptions as Parameters<typeof auth.loginByWebAuth>[0]);
      resolveAuthProgressState();
    } catch (error) {
      rejectAuthProgressState(error);
      throw error;
    }
    const loginState = await peekLoginState({
      ignoreEnvVars: options?.ignoreEnvVars,
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

export async function logout() {
  const result = await auth.logout();
  resetAuthProgressState();
  return result;
}
