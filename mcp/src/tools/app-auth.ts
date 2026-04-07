import { z } from "zod";
import { getCloudBaseManager, getEnvId, logCloudBaseResult } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";

const QUERY_APP_AUTH_ACTIONS = [
  "getLoginConfig",
  "listProviders",
  "getProvider",
  "getClientConfig",
  "listApiKeyTokens",
  "getStaticDomain",
] as const;

const MANAGE_APP_AUTH_ACTIONS = [
  "updateLoginConfig",
  "updateProvider",
  "updateClientConfig",
  "createApiKeyToken",
  "createCustomLoginKeys",
] as const;

type QueryAppAuthAction = (typeof QUERY_APP_AUTH_ACTIONS)[number];
type ManageAppAuthAction = (typeof MANAGE_APP_AUTH_ACTIONS)[number];

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
    ...rest
  } = value;

  return {
    ...rest,
    ...(typeof PhoneLogin === "boolean" ? { PhoneNumberLogin: PhoneLogin } : {}),
    ...(typeof UsernameLogin === "boolean" ? { UserNameLogin: UsernameLogin } : {}),
  };
}

export function registerAppAuthTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  const withEnvelope = async (handler: () => Promise<ToolEnvelope>) => {
    try {
      return jsonContent(await handler());
    } catch (error) {
      return jsonContent(buildErrorEnvelope(error));
    }
  };

  const callControlPlaneAction = async (
    action: string,
    params?: Record<string, unknown>,
  ) => {
    const cloudbase = await getManager();
    const service = cloudbase.commonService("tcb", "2018-06-08");
    const result = await service.call({
      Action: action,
      Param: params ?? {},
    });
    logCloudBaseResult(server.logger, result);
    return result;
  };

  server.registerTool?.(
    "queryAppAuth",
    {
      title: "查询应用认证配置",
      description:
        "应用侧认证配置只读入口。用于查询登录方式、provider、publishable key、client 配置和静态域名等认证准备状态。",
      inputSchema: {
        action: z.enum(QUERY_APP_AUTH_ACTIONS),
        providerId: z.string().optional().describe("provider 标识，如 email、google"),
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
    }: {
      action: QueryAppAuthAction;
      providerId?: string;
    }) =>
      withEnvelope(async () => {
        const envId = await getEnvId(cloudBaseOptions);
        const cloudbase = await getManager();

        switch (action) {
          case "getLoginConfig": {
            // Manager SDK v5 provides a dedicated helper for login config.
            const result = await cloudbase.env.getLoginConfigListV2();
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                loginConfig: result,
              },
              "应用登录配置查询成功",
            );
          }
          case "listProviders": {
            const result = await callControlPlaneAction("GetProviders", {
              EnvId: envId,
            });
            return buildEnvelope(
              {
                action,
                envId,
                providers: result.Providers ?? result.ProviderList ?? result.Data ?? result,
                raw: result,
              },
              "应用 provider 列表查询成功",
            );
          }
          case "getProvider": {
            if (!providerId) {
              throw new Error("action=getProvider 时必须提供 providerId");
            }
            const result = await callControlPlaneAction("GetProviders", {
              EnvId: envId,
            });
            const providers = (result.Providers ??
              result.ProviderList ??
              result.Data ??
              []) as Array<Record<string, unknown>>;
            const provider =
              providers.find((item) => item.Id === providerId || item.id === providerId) ?? null;
            return buildEnvelope(
              {
                action,
                envId,
                providerId,
                provider,
                raw: result,
              },
              `应用 provider ${providerId} 查询成功`,
            );
          }
          case "getClientConfig": {
            const result = await callControlPlaneAction("DescribeClient", {
              EnvId: envId,
            });
            return buildEnvelope(
              {
                action,
                envId,
                clientConfig: result,
              },
              "应用 client 配置查询成功",
            );
          }
          case "listApiKeyTokens": {
            const result = await callControlPlaneAction("DescribeApiKeyTokens", {
              EnvId: envId,
            });
            return buildEnvelope(
              {
                action,
                envId,
                apiKeyTokens: result.ApiKeyTokens ?? result.Data ?? result,
                raw: result,
              },
              "应用 publishable key 列表查询成功",
            );
          }
          case "getStaticDomain": {
            const result = await callControlPlaneAction("DescribeStaticDomain", {
              EnvId: envId,
            });
            return buildEnvelope(
              {
                action,
                envId,
                staticDomain: result,
              },
              "应用静态域名查询成功",
            );
          }
        }
      }),
  );

  server.registerTool?.(
    "manageAppAuth",
    {
      title: "管理应用认证配置",
      description:
        "应用侧认证配置写入口。用于修改登录方式、provider、client 配置，创建 publishable key 和自定义登录密钥。",
      inputSchema: {
        action: z.enum(MANAGE_APP_AUTH_ACTIONS),
        loginConfig: z.record(z.any()).optional().describe("updateLoginConfig 使用的登录配置对象"),
        providerId: z.string().optional().describe("provider 标识，如 email、google"),
        config: z.record(z.any()).optional().describe("provider / client / api key 的配置对象"),
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
      loginConfig,
      providerId,
      config,
    }: {
      action: ManageAppAuthAction;
      loginConfig?: Record<string, unknown>;
      providerId?: string;
      config?: Record<string, unknown>;
    }) =>
      withEnvelope(async () => {
        const envId = await getEnvId(cloudBaseOptions);
        const cloudbase = await getManager();

        switch (action) {
          case "updateLoginConfig": {
            const normalized = normalizePlainObject(loginConfig, "loginConfig");
            if (!normalized) {
              throw new Error("action=updateLoginConfig 时必须提供 loginConfig");
            }
            const current = await cloudbase.env.getLoginConfigListV2();
            const merged = {
              EnvId: envId,
              ...extractLoginStrategyState(current),
              ...normalizeLoginConfigPatch(normalized),
            };
            // Manager SDK v5 provides a dedicated helper for login config updates.
            const result = await cloudbase.env.updateLoginConfigV2(merged as any);
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                appliedLoginConfig: merged,
                raw: result,
              },
              "应用登录配置更新成功",
            );
          }
          case "updateProvider": {
            const normalized = normalizePlainObject(config, "config");
            if (!providerId) {
              throw new Error("action=updateProvider 时必须提供 providerId");
            }
            if (!normalized) {
              throw new Error("action=updateProvider 时必须提供 config");
            }
            const result = await callControlPlaneAction("ModifyProvider", {
              EnvId: envId,
              Id: providerId,
              ...normalized,
            });
            return buildEnvelope(
              {
                action,
                envId,
                providerId,
                raw: result,
              },
              `应用 provider ${providerId} 更新成功`,
            );
          }
          case "updateClientConfig": {
            const normalized = normalizePlainObject(config, "config");
            if (!normalized) {
              throw new Error("action=updateClientConfig 时必须提供 config");
            }
            const result = await callControlPlaneAction("ModifyClient", {
              EnvId: envId,
              ...normalized,
            });
            return buildEnvelope(
              {
                action,
                envId,
                raw: result,
              },
              "应用 client 配置更新成功",
            );
          }
          case "createApiKeyToken": {
            const normalized = normalizePlainObject(config, "config");
            const result = await callControlPlaneAction("CreateApiKeyToken", {
              EnvId: envId,
              ...(normalized ?? {}),
            });
            return buildEnvelope(
              {
                action,
                envId,
                raw: result,
              },
              "应用 publishable key 创建成功",
            );
          }
          case "createCustomLoginKeys": {
            const result = await cloudbase.env.createCustomLoginKeys();
            logCloudBaseResult(server.logger, result);
            return buildEnvelope(
              {
                action,
                envId,
                raw: result,
              },
              "自定义登录密钥创建成功",
            );
          }
        }
      }),
  );
}
