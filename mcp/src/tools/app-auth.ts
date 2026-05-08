import { z } from "zod";
import { getCloudBaseManager, getEnvId, logCloudBaseResult } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";
import { isToolPayloadError } from "../utils/tool-result.js";

const QUERY_APP_AUTH_ACTIONS = [
  "getLoginConfig",
  "listProviders",
  "getProvider",
  "getClientConfig",
  "getPublishableKey",
  "getStaticDomain",
  "listApiKeys",
] as const;

const MANAGE_APP_AUTH_ACTIONS = [
  "patchLoginStrategy",
  "addProvider",
  "updateProvider",
  "deleteProvider",
  "updateClientConfig",
  "ensurePublishableKey",
  "createApiKey",
  "deleteApiKey",
  "createCustomLoginKeys",
] as const;

const APP_AUTH_KEY_TYPES = ["publish_key", "api_key"] as const;

type QueryAppAuthAction = (typeof QUERY_APP_AUTH_ACTIONS)[number];
type ManageAppAuthAction = (typeof MANAGE_APP_AUTH_ACTIONS)[number];
type AppAuthKeyType = (typeof APP_AUTH_KEY_TYPES)[number];

const SUPABASE_LIKE_SDK_HINTS = {
  phoneOtp: "auth.signInWithOtp({ phone })",
  emailOtp: "auth.signInWithOtp({ email })",
  password: "auth.signInWithPassword({ username|email|phone, password })",
  signup: "auth.signUp({ phone|email, ... })",
  verifyOtp: "verifyOtp({ token })",
  anonymous: "auth.signInAnonymously()",
} as const;

function buildErrorEnvelope(error: unknown) {
  return {
    success: false,
    data: {},
    message: error instanceof Error ? error.message : String(error),
  };
}

function buildShortError(error: string) {
  return {
    success: false,
    error,
  };
}

function buildShortErrorWithCode(error: string, code: string) {
  return {
    success: false,
    error,
    code,
  };
}
function normalizePlainObject(
  value: unknown,
  label: string,
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象`);
  }
  return value as Record<string, unknown>;
}

function normalizeLocalizedMessage(
  value: unknown,
  label: string,
  fallback?: string,
): Record<string, unknown> {
  if (typeof value === "string") {
    return { Message: value };
  }

  const normalized = normalizePlainObject(value, label);
  if (normalized) {
    return normalized;
  }

  if (fallback) {
    return { Message: fallback };
  }

  throw new Error(`${label} 必须是字符串或对象`);
}

function omitKeys(
  value: Record<string, unknown> | undefined,
  keys: string[],
): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !keys.includes(key)),
  );
}

function extractLoginStrategyState(value: unknown): Record<string, unknown> {
  const source = normalizePlainObject(value, "loginStrategy") ?? {};
  const data = normalizePlainObject(source.Data, "loginStrategy.Data") ?? source;

  return {
    PhoneNumberLogin: Boolean(data.PhoneNumberLogin ?? data.PhoneLogin ?? false),
    EmailLogin: Boolean(data.EmailLogin ?? false),
    AnonymousLogin: Boolean(data.AnonymousLogin ?? false),
    UserNameLogin: Boolean(data.UserNameLogin ?? data.UsernameLogin ?? false),
    ...(data.SmsVerificationConfig ? { SmsVerificationConfig: data.SmsVerificationConfig } : {}),
    ...(typeof data.Mfa === "boolean" ? { Mfa: data.Mfa } : {}),
    ...(data.MfaConfig ? { MfaConfig: data.MfaConfig } : {}),
    ...(data.PwdUpdateStrategy ? { PwdUpdateStrategy: data.PwdUpdateStrategy } : {}),
  };
}

function normalizeLoginConfigPatch(value: Record<string, unknown>) {
  const {
    PhoneLogin,
    UsernameLogin,
    usernamePassword,
    email,
    anonymous,
    phone,
    ...rest
  } = value;

  return {
    ...rest,
    ...(typeof PhoneLogin === "boolean" ? { PhoneNumberLogin: PhoneLogin } : {}),
    ...(typeof UsernameLogin === "boolean" ? { UserNameLogin: UsernameLogin } : {}),
    ...(typeof usernamePassword === "boolean" ? { UserNameLogin: usernamePassword } : {}),
    ...(typeof email === "boolean" ? { EmailLogin: email } : {}),
    ...(typeof anonymous === "boolean" ? { AnonymousLogin: anonymous } : {}),
    ...(typeof phone === "boolean" ? { PhoneNumberLogin: phone } : {}),
  };
}

function buildLoginMethods(value: unknown) {
  const state = extractLoginStrategyState(value);
  return {
    usernamePassword: Boolean(state.UserNameLogin),
    email: Boolean(state.EmailLogin),
    anonymous: Boolean(state.AnonymousLogin),
    phone: Boolean(state.PhoneNumberLogin),
  };
}

function buildWebSdkHint(loginMethods: ReturnType<typeof buildLoginMethods>) {
  if (!loginMethods.usernamePassword) {
    return {
      blocked: true,
      reason: "plain username-style identifiers require usernamePassword auth",
      nextStep: 'manageAppAuth({ action: "patchLoginStrategy", patch: { usernamePassword: true } })',
      accountInputType: "text",
      avoidEmailHelpers: true,
    };
  }

  return {
    blocked: false,
    register: "auth.signUp({ username, password })",
    login: "auth.signInWithPassword({ username, password })",
    accountInputType: "text",
    avoidEmailHelpers: true,
  };
}

function buildLoginConfigNextStep(loginMethods: ReturnType<typeof buildLoginMethods>) {
  if (loginMethods.usernamePassword) {
    return undefined;
  }

  return {
    tool: "manageAppAuth",
    action: "patchLoginStrategy",
    patch: {
      usernamePassword: true,
    },
  };
}

function extractProviders(value: unknown): Array<Record<string, unknown>> {
  const payload = normalizePlainObject(value, "providersResult");
  const providers = payload?.Providers ?? payload?.ProviderList ?? payload?.Data ?? [];
  return Array.isArray(providers) ? (providers as Array<Record<string, unknown>>) : [];
}

function extractStaticStores(value: unknown): Array<Record<string, unknown>> {
  const payload = normalizePlainObject(value, "staticStoreResult");
  const stores = payload?.Data ?? [];
  return Array.isArray(stores) ? (stores as Array<Record<string, unknown>>) : [];
}

function getNonEmptyString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function resolveStaticStoreDomain(store: Record<string, unknown> | undefined): string | null {
  return getNonEmptyString(store?.CdnDomain) ?? getNonEmptyString(store?.StaticDomain) ?? null;
}

function extractApiKeyList(value: unknown): Array<Record<string, unknown>> {
  const payload = normalizePlainObject(value, "apiKeyResult");
  const items = payload?.ApiKeyList ?? payload?.Data ?? [];
  return Array.isArray(items) ? (items as Array<Record<string, unknown>>) : [];
}

function findPublishableKey(value: unknown): Record<string, unknown> | null {
  const apiKeys = extractApiKeyList(value);
  return (
    apiKeys.find(
      (item) =>
        item.Name === "publish_key" ||
        item.KeyName === "publish_key" ||
        item.KeyType === "publish_key",
    ) ?? null
  );
}

function buildPublishableKeyResponse(
  envId: string,
  record: Record<string, unknown> | null,
  options?: { created?: boolean },
) {
  return {
    success: true,
    envId,
    sdkStyle: "supabase-like",
    sdkHints: SUPABASE_LIKE_SDK_HINTS,
    publishableKey:
      typeof record?.ApiKey === "string" ? record.ApiKey : null,
    keyId: typeof record?.KeyId === "string" ? record.KeyId : null,
    keyName:
      typeof record?.Name === "string"
        ? record.Name
        : typeof record?.KeyName === "string"
          ? record.KeyName
          : record
            ? "publish_key"
            : null,
    expireAt: typeof record?.ExpireAt === "string" ? record.ExpireAt : null,
    createdAt: typeof record?.CreateAt === "string" ? record.CreateAt : null,
    ...(typeof options?.created === "boolean" ? { created: options.created } : {}),
  };
}

function buildSupabaseLikeAuthResponse(payload: Record<string, unknown>) {
  return {
    ...payload,
    sdkStyle: "supabase-like",
    sdkHints: SUPABASE_LIKE_SDK_HINTS,
  };
}

function buildClientConfigResponse(
  envId: string,
  clientId: string,
  clientConfig: unknown,
) {
  return {
    success: true,
    envId,
    clientId,
    clientConfig,
  };
}

async function getActiveEnvId(cloudBaseOptions?: Record<string, unknown>) {
  try {
    return await getEnvId(cloudBaseOptions as any);
  } catch (error) {
    const payload =
      isToolPayloadError(error)
        ? error.payload
        : normalizePlainObject((error as any)?.payload, "error.payload");
    if (payload?.code === "ENV_REQUIRED") {
      const nextError = new Error("no active environment selected");
      (nextError as Error & { code?: string }).code = "ENV_REQUIRED";
      throw nextError;
    }
    if (payload?.code === "AUTH_REQUIRED") {
      const nextError = new Error("authentication required");
      (nextError as Error & { code?: string }).code = "AUTH_REQUIRED";
      throw nextError;
    }
    throw error;
  }
}

function isResourceInUseError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as { code?: unknown; message?: unknown; name?: unknown };
  const code = typeof candidate.code === "string" ? candidate.code : "";
  const name = typeof candidate.name === "string" ? candidate.name : "";
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const haystack = `${code} ${name} ${message}`;

  return /ResourceInUse/i.test(haystack);
}
export function registerAppAuthTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  const withEnvelope = async (handler: () => Promise<Record<string, unknown>>) => {
    try {
      return jsonContent(await handler());
    } catch (error) {
      if (error instanceof Error && (error.message === "no active environment selected" || error.message === "authentication required")) {
        const code = (error as Error & { code?: string }).code;
        if (code) {
          return jsonContent(buildShortErrorWithCode(error.message, code));
        }
        return jsonContent(buildShortError(error.message));
      }
      return jsonContent(buildErrorEnvelope(error));
    }
  };

  const describePublishableKey = async (cloudbase: Awaited<ReturnType<typeof getManager>>, envId: string) => {
    const result = await cloudbase.env.describeApiKeyList({ KeyType: "publish_key", PageNumber: 1, PageSize: 10 });

    return {
      result,
      record: findPublishableKey(result),
    };
  };

  server.registerTool?.(
    "queryAppAuth",
    {
      title: "查询应用认证配置",
      description:
        "应用侧认证配置只读入口。用于查询登录方式、provider、publishable key、API key、client 配置和静态域名等认证准备状态。⚠️ 本工具为管理端配置查询工具，不执行用户登录。当任务要求编写客户端登录代码时（例如「用 JS SDK 登录」），应先通过本工具确认配置状态，再在项目代码中编写 @cloudbase/js-sdk 客户端登录代码（如 auth.signInWithPassword()），而非使用本工具完成登录。若业务要接受普通用户名样式标识符，先查询 action=getLoginConfig；若 usernamePassword=false，下一步应立即调用 manageAppAuth(action=patchLoginStrategy, patch={ usernamePassword: true })，不要直接写 email 登录 API。",
      inputSchema: {
        action: z.enum(QUERY_APP_AUTH_ACTIONS),
        providerId: z.string().optional().describe("provider 标识，如 email、google"),
        clientId: z
          .string()
          .optional()
          .describe("OAuth client_id / DescribeClient 的 Id；省略时默认使用当前环境 ID（默认客户端）"),
        keyType: z
          .enum(APP_AUTH_KEY_TYPES)
          .optional()
          .describe("API key 类型过滤，可选 publish_key 或 api_key"),
        pageNumber: z.number().int().positive().optional().describe("API key 列表页码，从 1 开始"),
        pageSize: z.number().int().positive().optional().describe("API key 列表每页条数"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "auth",
      },
    },
    async ({
      action,
      providerId,
      clientId,
      keyType,
      pageNumber,
      pageSize,
    }: {
      action: QueryAppAuthAction;
      providerId?: string;
      clientId?: string;
      keyType?: AppAuthKeyType;
      pageNumber?: number;
      pageSize?: number;
    }) =>
      withEnvelope(async () => {
        const envId = await getActiveEnvId(cloudBaseOptions as Record<string, unknown>);
        const cloudbase = await getManager();

        switch (action) {
          case "getLoginConfig": {
            const result = await cloudbase.env.getLoginConfig();
            logCloudBaseResult(server.logger, result);
            const loginMethods = buildLoginMethods(result);
            const nextStep = buildLoginConfigNextStep(loginMethods);
            const webSdkHint = buildWebSdkHint(loginMethods);
            return buildSupabaseLikeAuthResponse({
              success: true,
              envId,
              loginMethods,
              ...(nextStep ? { next_step: nextStep } : {}),
              ...(webSdkHint ? { webSdkHint } : {}),
            });
          }
          case "listProviders": {
            const result = await cloudbase.env.getProviders();
            return {
              success: true,
              envId,
              providers: extractProviders(result),
            };
          }
          case "getProvider": {
            if (!providerId) {
              throw new Error("action=getProvider 时必须提供 providerId");
            }

            const result = await cloudbase.env.getProviders();
            const provider =
              extractProviders(result).find(
                (item) => item.Id === providerId || item.id === providerId,
              ) ?? null;

            return {
              success: true,
              envId,
              providerId,
              provider,
            };
          }
          case "getClientConfig": {
            const clientRecordId = clientId ?? envId;
            const result = await cloudbase.env.describeClient(clientRecordId);
            return buildClientConfigResponse(envId, clientRecordId, result);
          }
          case "getPublishableKey": {
            const { record } = await describePublishableKey(cloudbase, envId);
            return buildPublishableKeyResponse(envId, record);
          }
          case "getStaticDomain": {
            const service = cloudbase.commonService("tcb", "2018-06-08");
            const result = await service.call({
              Action: "DescribeStaticStore",
              Param: { EnvId: envId },
            });
            logCloudBaseResult(server.logger, result);
            const stores = extractStaticStores(result);
            const primaryDomain = resolveStaticStoreDomain(stores[0]);

            return {
              success: true,
              envId,
              cdnDomain: primaryDomain,
              staticDomain: primaryDomain,
              staticStores: stores,
            };
          }
          case "listApiKeys": {
            const currentPageNumber = pageNumber ?? 1;
            const currentPageSize = pageSize ?? 20;
            const result = await cloudbase.env.describeApiKeyList({
              ...(keyType ? { KeyType: keyType } : {}),
              PageNumber: currentPageNumber,
              PageSize: currentPageSize,
            });
            logCloudBaseResult(server.logger, result);
            const apiKeys = extractApiKeyList(result);

            return {
              success: true,
              envId,
              ...(keyType ? { keyType } : {}),
              apiKeys,
              total: typeof (result as { Total?: unknown }).Total === "number"
                ? (result as { Total: number }).Total
                : apiKeys.length,
              pageNumber: currentPageNumber,
              pageSize: currentPageSize,
            };
          }
        }
      }),
  );

  server.registerTool?.(
    "manageAppAuth",
    {
      title: "管理应用认证配置",
      description:
        "应用侧认证配置写入口。用于修改登录方式、provider、client 配置，确保 publishable key，以及创建或删除 API key、自定义登录密钥。⚠️ 本工具为管理端配置工具，不执行用户登录。当任务要求编写客户端登录代码时（例如「用 JS SDK 登录」），应先通过本工具完成配置（如启用 usernamePassword、获取 publishable key），再在项目代码中编写 @cloudbase/js-sdk 客户端登录代码（如 auth.signInWithPassword()），而非使用本工具完成登录。若前端要接受普通用户名样式标识符，应先执行 action=patchLoginStrategy 并传入 patch={ usernamePassword: true }，再实现对应前端登录逻辑。",
      inputSchema: {
        action: z.enum(MANAGE_APP_AUTH_ACTIONS),
        patch: z
          .record(z.any())
          .optional()
          .describe("patchLoginStrategy 使用的简化登录策略 patch，如 { usernamePassword: true }"),
        providerId: z.string().optional().describe("provider 标识，如 email、google；addProvider 时也可作为自定义 provider Id"),
        providerType: z.string().optional().describe("addProvider 时的 provider 协议类型，如 OAUTH、OIDC、EMAIL"),
        displayName: z
          .union([z.string(), z.record(z.any())])
          .optional()
          .describe("addProvider 时的展示名称，可传字符串或多语言对象"),
        clientId: z
          .string()
          .optional()
          .describe("updateClientConfig 时的客户端 Id；省略时默认使用当前环境 ID"),
        config: z.record(z.any()).optional().describe("provider / client 的配置对象"),
        keyType: z
          .enum(APP_AUTH_KEY_TYPES)
          .optional()
          .describe("createApiKey 时的 API key 类型，默认 publish_key"),
        keyName: z.string().optional().describe("createApiKey 时的 API key 名称"),
        expireIn: z.number().int().min(0).optional().describe("createApiKey 时的有效期，单位秒；0 表示不过期"),
        keyId: z.string().optional().describe("deleteApiKey 时的 API key 唯一标识"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: "auth",
      },
    },
    async ({
      action,
      patch,
      providerId,
      providerType,
      displayName,
      clientId,
      config,
      keyType,
      keyName,
      expireIn,
      keyId,
    }: {
      action: ManageAppAuthAction;
      patch?: Record<string, unknown>;
      providerId?: string;
      providerType?: string;
      displayName?: string | Record<string, unknown>;
      clientId?: string;
      config?: Record<string, unknown>;
      keyType?: AppAuthKeyType;
      keyName?: string;
      expireIn?: number;
      keyId?: string;
    }) =>
      withEnvelope(async () => {
        const envId = await getActiveEnvId(cloudBaseOptions as Record<string, unknown>);
        const cloudbase = await getManager();

        switch (action) {
          case "patchLoginStrategy": {
            const input = normalizePlainObject(patch, "patch");
            const normalized = input ? normalizeLoginConfigPatch(input) : undefined;
            if (!normalized) {
              throw new Error("action=patchLoginStrategy 时必须提供 patch");
            }

            const current = await cloudbase.env.getLoginConfig();
            const merged = {
              ...extractLoginStrategyState(current),
              ...normalized,
            };
            const result = await cloudbase.env.modifyLoginConfig(merged as any);
            logCloudBaseResult(server.logger, result);

            const confirmed = await cloudbase.env.getLoginConfig();
            logCloudBaseResult(server.logger, confirmed);
            const loginMethods = buildLoginMethods(confirmed);
            const nextStep = buildLoginConfigNextStep(loginMethods);
            const webSdkHint = buildWebSdkHint(loginMethods);
            return buildSupabaseLikeAuthResponse({
              success: true,
              envId,
              loginMethods,
              ...(nextStep ? { next_step: nextStep } : {}),
              ...(webSdkHint ? { webSdkHint } : {}),
            });
          }
          case "addProvider": {
            const normalized = omitKeys(normalizePlainObject(config, "config"), ["EnvId"]);
            if (!providerType) {
              throw new Error("action=addProvider 时必须提供 providerType");
            }

            const localizedDisplayName = normalizeLocalizedMessage(
              displayName,
              "displayName",
              providerId ?? providerType,
            );
            const result = await cloudbase.env.addProvider({
              ...(providerId ? { Id: providerId } : {}),
              Name: localizedDisplayName as any,
              ProviderType: providerType,
              ...(normalized ? { Config: normalized as any } : {}),
            } as any);
            logCloudBaseResult(server.logger, result);
            const addProviderResult = normalizePlainObject(result, "addProviderResult") ?? {};

            return {
              success: true,
              envId,
              providerId:
                providerId ??
                (typeof addProviderResult.Id === "string" ? addProviderResult.Id : null),
              providerType,
            };
          }
          case "updateProvider": {
            const normalized = omitKeys(normalizePlainObject(config, "config"), ["EnvId", "Id"]);
            if (!providerId) {
              throw new Error("action=updateProvider 时必须提供 providerId");
            }
            if (!normalized) {
              throw new Error("action=updateProvider 时必须提供 config");
            }

            await cloudbase.env.modifyProvider({ Id: providerId, ...normalized });

            return {
              success: true,
              envId,
              providerId,
            };
          }
          case "deleteProvider": {
            if (!providerId) {
              throw new Error("action=deleteProvider 时必须提供 providerId");
            }

            const result = await cloudbase.env.deleteProvider(providerId);
            logCloudBaseResult(server.logger, result);

            return {
              success: true,
              envId,
              providerId,
              deleted: true,
            };
          }
          case "updateClientConfig": {
            const normalized = omitKeys(normalizePlainObject(config, "config"), ["EnvId", "Id"]);
            if (!normalized) {
              throw new Error("action=updateClientConfig 时必须提供 config");
            }

            const clientRecordId = clientId ?? envId;
            await cloudbase.env.modifyClient({ Id: clientRecordId, ...normalized });
            const confirmed = await cloudbase.env.describeClient(clientRecordId);

            return buildClientConfigResponse(envId, clientRecordId, confirmed);
          }
          case "ensurePublishableKey": {
            const existing = await describePublishableKey(cloudbase, envId);
            if (existing.record) {
              return buildPublishableKeyResponse(envId, existing.record, { created: false });
            }

            let created: unknown;
            try {
              created = await cloudbase.env.createApiKey({ KeyType: "publish_key" });
            } catch (error) {
              if (!isResourceInUseError(error)) {
                throw error;
              }

              const reread = await describePublishableKey(cloudbase, envId);
              if (!reread.record) {
                throw error;
              }
              return buildPublishableKeyResponse(envId, reread.record, { created: false });
            }

            return buildPublishableKeyResponse(envId, normalizePlainObject(created, "createdApiKey") ?? null, {
              created: true,
            });
          }
          case "createApiKey": {
            const effectiveKeyType = keyType ?? "publish_key";
            const result = await cloudbase.env.createApiKey({
              KeyType: effectiveKeyType,
              ...(keyName ? { KeyName: keyName } : {}),
              ...(typeof expireIn === "number" ? { ExpireIn: expireIn } : {}),
            });
            logCloudBaseResult(server.logger, result);
            const createApiKeyResult = normalizePlainObject(result, "createApiKeyResult") ?? {};

            return {
              success: true,
              envId,
              keyType: effectiveKeyType,
              keyId: typeof result.KeyId === "string" ? result.KeyId : null,
              keyName:
                typeof result.Name === "string"
                  ? result.Name
                  : typeof createApiKeyResult.KeyName === "string"
                    ? createApiKeyResult.KeyName
                    : keyName ?? null,
              apiKey: typeof result.ApiKey === "string" ? result.ApiKey : null,
              expireAt: typeof result.ExpireAt === "string" ? result.ExpireAt : null,
              createdAt: typeof result.CreateAt === "string" ? result.CreateAt : null,
            };
          }
          case "deleteApiKey": {
            if (!keyId) {
              throw new Error("action=deleteApiKey 时必须提供 keyId");
            }

            const result = await cloudbase.env.deleteApiKey(keyId);
            logCloudBaseResult(server.logger, result);

            return {
              success: true,
              envId,
              keyId,
              deleted: true,
            };
          }
          case "createCustomLoginKeys": {
            const result = await cloudbase.env.createCustomLoginKeys();
            logCloudBaseResult(server.logger, result);
            return {
              success: true,
              envId,
              privateKey: result.PrivateKey,
              keyId: result.KeyID,
            };
          }
        }
      }),
  );
}
