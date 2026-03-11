import { AuthSupervisor } from "@cloudbase/toolbox";
import { z } from "zod";
import {
  ensureLogin,
  getAuthProgressState,
  logout,
  peekLoginState,
  rejectAuthProgressState,
  resolveAuthProgressState,
  setPendingAuthProgressState,
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
import { getClaudePrompt } from "./rag.js";
import { successResult, errorResult, toMCPResponse, buildNextAction } from "../utils/response-builder.js";

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
    if (env.PackageName !== undefined) simplified.PackageName = env.PackageName;
    if (env.IsDefault !== undefined) simplified.IsDefault = env.IsDefault;
    
    return simplified;
  });
}

function formatDeviceAuthHint(deviceAuthInfo?: DeviceFlowAuthInfo): string {
  if (!deviceAuthInfo) {
    return "";
  }

  const lines = [
    "",
    "### Device Flow 授权信息",
    `- user_code: ${deviceAuthInfo.user_code}`,
  ];

  if (deviceAuthInfo.verification_uri) {
    lines.push(`- verification_uri: ${deviceAuthInfo.verification_uri}`);
  }
  lines.push(`- expires_in: ${deviceAuthInfo.expires_in}s`);
  lines.push(
    "",
    "请在另一台可用浏览器设备打开 `verification_uri` 并输入 `user_code` 完成授权。",
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

type AuthAction = "status" | "start_auth" | "set_env" | "logout";

const CODEBUDDY_AUTH_ACTIONS = ["status", "set_env"] as const;
const DEFAULT_AUTH_ACTIONS = [
  "status",
  "start_auth",
  "set_env",
  "logout",
] as const;

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

async function getGuidePrompt(server: ExtendedMcpServer): Promise<string> {
  if (
    getCurrentIde(server) === "CodeBuddy" ||
    process.env.CLOUDBASE_GUIDE_PROMPT === "false"
  ) {
    return "";
  }

  try {
    return await getClaudePrompt();
  } catch (promptError) {
    debug("Failed to get CLAUDE prompt", { error: promptError });
    return "";
  }
}

export function registerEnvTools(server: ExtendedMcpServer) {
  // 获取 cloudBaseOptions，如果没有则为 undefined
  const cloudBaseOptions = server.cloudBaseOptions;

  const getManager = () => getCloudBaseManager({ cloudBaseOptions, mcpServer: server });

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
      envId?: string;
      confirm?: unknown;
    }) => {
      const action = rawArgs.action ?? "status";
      const authMode =
        rawArgs.authMode === "device" || rawArgs.authMode === "web"
          ? rawArgs.authMode
          : undefined;
      const envId = rawArgs.envId;
      const confirm = rawArgs.confirm === "yes" ? "yes" : undefined;
      let deviceAuthInfo: DeviceFlowAuthInfo | undefined;
      const onDeviceCode = (info: DeviceFlowAuthInfo) => {
        deviceAuthInfo = info;
        setPendingAuthProgressState(info, "device");
        // emitDeviceAuthNotice(server, info);
      };
      const authChallenge = () =>
        deviceAuthInfo
          ? {
            user_code: deviceAuthInfo.user_code,
            verification_uri: deviceAuthInfo.verification_uri,
            expires_in: deviceAuthInfo.expires_in,
          }
          : undefined;

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
          const envId =
            getCachedEnvId() ||
            process.env.CLOUDBASE_ENV_ID ||
            (typeof loginState?.envId === "string" ? loginState.envId : undefined);

          const authStatus = loginState
            ? "READY"
            : authFlowState.status === "PENDING"
              ? "PENDING"
              : "REQUIRED";
          const envCandidates = await fetchAvailableEnvCandidates(cloudBaseOptions, server);
          const envStatus = envId
            ? "READY"
            : envCandidates.length > 1
              ? "MULTIPLE"
              : envCandidates.length === 1
                ? "READY"
                : "NONE";
          const message =
            authStatus === "READY"
              ? `当前已登录${envId ? `，环境: ${envId}` : "，但未绑定环境"}`
              : authStatus === "PENDING"
                ? "设备码授权进行中，请完成浏览器授权后再次调用 auth(action=\"status\")"
                : isCodeBuddyIde(server)
                  ? "当前未登录。CodeBuddy 暂不支持在 tool 内发起认证，请在外部完成认证后再次调用 auth(action=\"status\")。"
                  : "当前未登录，请先执行 auth(action=\"start_auth\")";

          return buildJsonToolResult({
            ok: true,
            code: "STATUS",
            auth_status: authStatus,
            env_status: envStatus,
            current_env_id: envId || null,
            env_candidates: envCandidates,
            auth_challenge:
              authFlowState.status === "PENDING" && authFlowState.authChallenge
                ? {
                    user_code: authFlowState.authChallenge.user_code,
                    verification_uri: authFlowState.authChallenge.verification_uri,
                    expires_in: authFlowState.authChallenge.expires_in,
                  }
                : undefined,
            message,
            next_step:
              authStatus === "REQUIRED"
                ? buildAuthRequiredNextStep(server)
                : authStatus === "PENDING"
                  ? buildAuthNextStep("status", {
                      suggestedArgs: { action: "status" },
                    })
                  : !envId
                    ? buildSetEnvNextStep(envCandidates)
                    : buildAuthNextStep("status", {
                        suggestedArgs: { action: "status" },
                      }),
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
              auth_challenge: {
                user_code: authFlowState.authChallenge.user_code,
                verification_uri: authFlowState.authChallenge.verification_uri,
                expires_in: authFlowState.authChallenge.expires_in,
              },
              next_step: buildAuthNextStep("status", {
                suggestedArgs: { action: "status" },
              }),
            });
          }

          // 1. 如果已经有登录态，直接返回 AUTH_READY
          try {
            const existingLoginState = await peekLoginState();
            if (existingLoginState) {
              const envId =
                typeof existingLoginState.envId === "string" ? existingLoginState.envId : null;
              const envCandidates = envId
                ? []
                : await fetchAvailableEnvCandidates(cloudBaseOptions, server);
              return buildJsonToolResult({
                ok: true,
                code: "AUTH_READY",
                message: envId
                  ? `认证成功，当前登录态 envId: ${envId}`
                  : "认证成功",
                auth_challenge: authChallenge(),
                env_candidates: envCandidates,
                next_step: envId
                  ? buildAuthNextStep("status", {
                      suggestedArgs: { action: "status" },
                    })
                  : buildSetEnvNextStep(envCandidates),
              });
            }
          } catch {
            // 忽略 getLoginState 错误，继续尝试发起登录
          }

          // 2. 设备码模式：监听到 device code 即返回 AUTH_PENDING，后续由 toolbox 异步轮询并更新本地 credential
          const effectiveMode: "device" | "web" =
            authMode && (authMode === "device" || authMode === "web")
              ? authMode
              : process.env.TCB_AUTH_MODE === "web"
                ? "web"
                : "device";

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
              env_candidates: envCandidates,
              next_step: buildAuthNextStep("status", {
                suggestedArgs: { action: "status" },
              }),
            });
          }

          // 3. 非 Device Flow（显式 web 模式）仍然使用 getLoginState 阻塞等待
          const loginState = await ensureLogin({
            region,
            authMode: effectiveMode,
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

          const envId =
            typeof loginState.envId === "string" ? loginState.envId : null;
          const envCandidates = envId
            ? []
            : await fetchAvailableEnvCandidates(cloudBaseOptions, server);
          return buildJsonToolResult({
            ok: true,
            code: "AUTH_READY",
            message: envId ? `认证成功，当前登录态 envId: ${envId}` : "认证成功",
            auth_challenge: authChallenge(),
            env_candidates: envCandidates,
            next_step: envId
              ? buildAuthNextStep("status", {
                  suggestedArgs: { action: "status" },
                })
              : buildSetEnvNextStep(envCandidates),
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
              env_candidates: envCandidates,
              next_step: buildSetEnvNextStep(envCandidates),
            });
          }

          const target = envCandidates.find((item) => item.envId === envId);
          if (envCandidates.length > 0 && !target) {
            return buildJsonToolResult({
              ok: false,
              code: "INVALID_ARGS",
              message: `未找到环境: ${envId}`,
              env_candidates: envCandidates,
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
        "查询云开发环境相关信息，支持查询环境列表、当前环境信息、安全域名和静态网站托管配置。（原工具名：listEnvs/getEnvInfo/getEnvAuthDomains/getWebsiteConfig，为兼容旧AI规则可继续使用这些名称）",
      inputSchema: {
        action: z
          .enum(["list", "info", "domains", "hosting"])
          .describe(
            "查询类型：list=环境列表，info=当前环境信息，domains=安全域名列表，hosting=静态网站托管配置",
          ),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "env",
      },
    },
    async ({ action }: { action: "list" | "info" | "domains" | "hosting" }) => {
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
              // Apply field simplification for MCP tool response to reduce token consumption
              if (result && Array.isArray(result.EnvList)) {
                result.EnvList = simplifyEnvList(result.EnvList);
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
                // Apply field simplification for fallback response as well
                if (result && Array.isArray(result.EnvList)) {
                  result.EnvList = simplifyEnvList(result.EnvList);
                }
              } catch (fallbackError) {
                const toolPayloadResult = toolPayloadErrorToResult(fallbackError);
                if (toolPayloadResult) {
                  return toolPayloadResult;
                }
                debug("降级到 listEnvs() 也失败:", fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError)));
                return {
                  content: [
                    {
                      type: "text",
                      text:
                        "获取环境列表时出错: " +
                        (fallbackError instanceof Error
                          ? fallbackError.message
                          : String(fallbackError)),
                    },
                  ],
                };
              }
            }
            if (hasEnvId && result && Array.isArray(result.EnvList) && result.EnvList.length > 1) {
              result.EnvList = result.EnvList.filter((env: any) => env.EnvId === cloudBaseOptions?.envId);
            }
            break;

          case "info":
            const cloudbaseInfo = await getManager();
            result = await cloudbaseInfo.env.getEnvInfo();
            logCloudBaseResult(server.logger, result);
            break;

          case "domains":
            const cloudbaseDomains = await getManager();
            result = await cloudbaseDomains.env.getEnvAuthDomains();
            logCloudBaseResult(server.logger, result);
            break;

          case "hosting":
            const cloudbaseHosting = await getManager();
            result = await cloudbaseHosting.hosting.getWebsiteConfig();
            logCloudBaseResult(server.logger, result);
            break;

          default:
            throw new Error(`不支持的查询类型: ${action}`);
        }

        let responseText = JSON.stringify(result, null, 2);

        // For info action, append CLAUDE.md prompt content (skip for CodeBuddy IDE)
        const currentIde = server.ide || process.env.INTEGRATION_IDE;
        if (action === "info" && currentIde !== "CodeBuddy" && process.env.CLOUDBASE_GUIDE_PROMPT !== "false") {
          try {
            const promptContent = await getClaudePrompt();
            if (promptContent) {
              responseText += `\n\n⚠️ 重要提示：后续所有云开发相关的开发工作必须严格遵循以下开发规范和最佳实践：\n\n${promptContent}`;
            }
          } catch (promptError) {
            debug("Failed to get CLAUDE prompt in envQuery", {
              error: promptError,
            });
            // Continue without prompt if fetch fails
          }
        }

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
        return {
          content: [
            {
              type: "text",
              text: `环境查询失败: ${error instanceof Error ? error.message : String(error)}`,
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
      title: "环境域名管理",
      description:
        "管理云开发环境的安全域名，支持添加和删除操作。（原工具名：createEnvDomain/deleteEnvDomain，为兼容旧AI规则可继续使用这些名称）",
      inputSchema: {
        action: z
          .enum(["create", "delete"])
          .describe("操作类型：create=添加域名，delete=删除域名"),
        domains: z.array(z.string()).describe("安全域名数组"),
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

        return {
          content: [
            {
              type: "text",
              text: `${JSON.stringify(result, null, 2)}\n\n请注意安全域名需要10分钟才能生效，用户也应该了解这一点。`,
            },
          ],
        };
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
