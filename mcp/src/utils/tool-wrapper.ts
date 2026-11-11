import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations as SdkToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { ExtendedMcpServer } from "../server.js";
import { normalizeLang, setPanelLang } from "../i18n/index.js";
import { shouldRegisterTool } from './cloud-mode.js';
import { debug } from './logger.js';
import { reportToolCall, readMcpClientInfoFromServer, readClientCapabilitiesFromServer } from './telemetry.js';
import { isBusinessFailureToolResult, isToolPayloadError, ToolPayloadError, withBusinessFailureIsError } from "./tool-result.js";
import { applyRepeatGuardToPayload, resetRepeatGuard } from "./repeat-error-guard.js";
import { enhanceErrorMessage, resolveRequestId } from "./error-guidance.js";
import { resolveSiteAndRegion } from "./site-map.js";
import { guardDestructiveAction, type ConfirmationServer } from "./confirmation-guard.js";
import { guardCredentialWrite, type CredentialGuardServer } from "./credential-guard.js";


/**
 * 工具包装器，为 MCP 工具添加数据上报功能
 * 自动记录工具调用的成功/失败状态、执行时长等信息
 */

// Re-export MCP SDK Tool type for other modules.
export type { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * CloudBase extends MCP ToolAnnotations with a stable `category` hint used by
 * IDE UIs for grouping. SDK >=1.26 types annotations as a closed/strip object,
 * so we keep category via an intersection while still passing it through at
 * runtime (listTools returns registered annotations without schema stripping).
 */
export type ToolAnnotations = SdkToolAnnotations & {
  category?: string;
};

type ToolConfigWithCategory = {
  annotations?: ToolAnnotations;
  _meta?: Record<string, unknown>;
  [key: string]: unknown;
};

/**
 * Mirror annotations.category into _meta.category.
 *
 * MCP SDK Client >=1.26 parses tools/list with a stripping ToolAnnotationsSchema,
 * which drops unknown annotation keys. `_meta` remains available to clients, while
 * the server wire payload still includes annotations.category for non-SDK hosts.
 */
export function applyCategoryAnnotationMeta<T extends ToolConfigWithCategory>(config: T): T {
  const category = config?.annotations?.category;
  if (typeof category !== "string" || category.length === 0) {
    return config;
  }

  const existingMeta =
    config._meta && typeof config._meta === "object" ? config._meta : undefined;

  if (existingMeta && existingMeta.category === category) {
    return config;
  }

  return {
    ...config,
    _meta: {
      ...existingMeta,
      category,
    },
  };
}

// 构建时注入的版本号
declare const __MCP_VERSION__: string;

const GITHUB_REPO = "https://github.com/TencentCloudBase/CloudBase-AI-ToolKit";
const CNB_REPO = "https://cnb.cool/tencent/cloud/cloudbase/CloudBase-AI-ToolKit";
/** 云平台 / 权限 / 账号类问题统一去社区仓库，不收在本仓 issue 里 */
const CNB_COMMUNITY_ISSUES = "https://cnb.cool/tencent/cloud/cloudbase/community/-/issues/new";

/**
 * Point toolkit bugs at a pull request and platform problems at the community issue tracker.
 * The URL carries no environment ID, arguments, or error text.
 */
function contributionHint(server: ExtendedMcpServer): string {
    const site = resolveSiteAndRegion({
        site: server.cloudBaseOptions?.site,
        region: server.cloudBaseOptions?.region,
    }).site;
    if (site === "intl") {
        return [
            "If this is a bug in this repo's MCP server, skills, or CLI, open a pull request:",
            `${GITHUB_REPO}/blob/main/CONTRIBUTING.md`,
            "If it is the cloud platform, permissions, or the account, open an issue and fill it in yourself. Do not include the environment ID or secrets:",
            `${GITHUB_REPO}/issues/new`,
        ].join("\n");
    }
    return [
        "如果问题出在本仓库的 MCP、skill 或 CLI，请按贡献指南提 Pull Request：",
        `${CNB_REPO}/-/blob/main/CONTRIBUTING.md`,
        "如果是云平台、权限或账号问题，请打开 issue 页面自行填写。不要把环境 ID 或密钥写进去：",
        CNB_COMMUNITY_ISSUES,
    ].join("\n");
}

/**
 * 从 `auth` 的返回里取出「环境准备」的结果，供遥测上报。
 *
 * 为什么要从返回体里抠：`env_setup_status` / `env_setup_reason` 只存在于
 * `auth` 的 payload 里，不是 `reportToolCall` 的入参。而工具 wrapper 是唯一同时
 * 看得见 args 和 result 的地方。
 *
 * 现状（2026-11-04）：无环境不再自动创建，`auth` 只回 `ACTION_REQUIRED` +
 * `reason=no_env`，所以这一列用来数「有多少人卡在没环境」。
 */
function readEnvSetupOutcome(
    result: unknown,
): { status?: string; reason?: string } | undefined {
    const rec = result as Record<string, unknown> | null | undefined;
    if (!rec || typeof rec !== 'object') return undefined;

    // 优先 structuredContent（MCP 规范位），退到 content[0].text 里的 JSON
    const candidates: unknown[] = [];
    if (rec.structuredContent) candidates.push(rec.structuredContent);
    const content = Array.isArray(rec.content) ? rec.content : [];
    for (const item of content) {
        const text = (item as { text?: unknown })?.text;
        if (typeof text === 'string' && text.trim().startsWith('{')) {
            try {
                candidates.push(JSON.parse(text));
            } catch {
                /* 不是 JSON 就跳过，不要因为解析失败影响正常返回 */
            }
        }
    }

    for (const payload of candidates) {
        const p = payload as Record<string, unknown>;
        const status = typeof p?.env_setup_status === 'string' ? p.env_setup_status : undefined;
        if (!status) continue;
        const reason =
            typeof p?.env_setup_reason === 'string' ? p.env_setup_reason : undefined;
        return { status, reason };
    }
    return undefined;
}

/**
 * 工具自己返回的失败：结构化 `{ success: false }`（`isBusinessFailureToolResult` 已覆盖
 * 顶层 / structuredContent / JSON 文本三种挂法），**或**已经显式带 `isError: true` 的回执。
 * 护栏拦截的返回两样都不占（它的载荷是 `{status, executed:false}`）。
 */
function isReturnedFailureResult(result: unknown): boolean {
    if (!result || typeof result !== 'object') {
        return false;
    }
    if ((result as Record<string, unknown>).isError === true) {
        return true;
    }
    return isBusinessFailureToolResult(result);
}

/**
 * 失败时给客户端的最终文案：**抛错与"返回的失败"共用这一处构造**，
 * 所以两条路径对同一个底层错误得到的文本逐字相同（🆔 RequestId + 📦 版本页脚都在这里）。
 */
function buildFailureClientText(
    errorMessage: string,
    requestId: string | undefined,
    server: ExtendedMcpServer,
): string {
    const mcpVersion = typeof __MCP_VERSION__ !== 'undefined' ? __MCP_VERSION__ : 'unknown';
    const requestIdSuffix = requestId ? `\n🆔 RequestId: ${requestId}` : '';
    return `${errorMessage}${requestIdSuffix}\n\n📦 CloudBase MCP v${mcpVersion}\n${contributionHint(server)}`;
}

/** 从工具返回的失败结果里取"人话那句"+ 结构化错误码（用于指引匹配）。 */
function failureMessageOf(result: unknown): { message: string; code?: string; parsed?: Record<string, unknown>; text?: string } {
    const content = Array.isArray((result as any)?.content) ? (result as any).content : [];
    const firstText = content.find(
        (item: any) => item && item.type === 'text' && typeof item.text === 'string',
    );
    const text: string | undefined = firstText?.text;
    if (typeof text === 'string') {
        try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                const record = parsed as Record<string, unknown>;
                const message =
                    typeof record.message === 'string' && record.message
                        ? record.message
                        : typeof record.error === 'string' && record.error
                            ? record.error
                            : text;
                const code =
                    typeof record.code === 'string' ? record.code
                        : typeof record.errorCode === 'string' ? record.errorCode
                            : undefined;
                return { message, code, parsed: record, text };
            }
        } catch {
            // 纯文本失败回执（buildTextErrorResult）：整段就是那句话
        }
        return { message: text, text };
    }
    const record = (result ?? {}) as Record<string, unknown>;
    const message =
        typeof record.message === 'string' && record.message ? record.message : '工具返回了失败结果';
    return { message, code: typeof record.code === 'string' ? record.code : undefined };
}

/**
 * 把"返回的失败"改成与抛错同款的文案：文案本体走 `enhanceErrorMessage`（同一张指引表），
 * 尾部接同一个 RequestId/版本页脚。**结构化契约不破**：
 *   - 文本内容是 JSON 对象 ⇒ 只替换它的 `message` 字段，其余字段原样保留、仍可 JSON.parse；
 *   - 纯文本失败回执 ⇒ 整段替换（与抛错路径逐字相同）。
 */
function withEnhancedFailureText(
    result: any,
    errorMessage: string,
    requestId: string | undefined,
    server: ExtendedMcpServer,
): any {
    const clientText = buildFailureClientText(errorMessage, requestId, server);
    const info = failureMessageOf(result);
    const content = Array.isArray(result?.content) ? result.content : [];
    const index = content.findIndex(
        (item: any) => item && item.type === 'text' && typeof item.text === 'string',
    );

    if (info.parsed && index >= 0) {
        const nextContent = [...content];
        nextContent[index] = {
            ...nextContent[index],
            text: JSON.stringify({ ...info.parsed, message: clientText }, null, 2),
        };
        return { ...result, content: nextContent };
    }
    if (typeof info.text === 'string' && index >= 0) {
        const nextContent = [...content];
        nextContent[index] = { ...nextContent[index], text: clientText };
        return { ...result, content: nextContent };
    }
    return result;
}

/**
 * 创建包装后的处理函数，添加数据上报功能
 */
function createWrappedHandler(
    name: string,
    handler: any,
    server: ExtendedMcpServer,
    options: { telemetryEnabled: boolean } = { telemetryEnabled: true },
) {
    const { telemetryEnabled } = options;
    return async (args: any, extra?: { requestId?: unknown; signal?: unknown }) => {
        const startTime = Date.now();
        let success = false;
        let errorMessage: string | undefined;
        let requestId: string | undefined;
        // 提到 try 外：finally 里要读 auth 的环境准备结果（env_setup_status / failure.reason）。
        // 护栏拦截的早退路径不会赋值，finally 里按 undefined 处理。
        let result: any;
        // 破坏性确认的结果，随遥测一起上报（只有命中破坏性名单才有值）。
        // 拦截路径直接 return，但 finally 仍会执行，所以这一列在「没执行」的行上也有。
        let confirmStatus: string | undefined;

        try {
            debug(`开始执行工具: ${name}`, { args: sanitizeArgs(args) });
            // MCP Apps panels bake HTML on resources/read after the tool returns.
            // Remember call-time `lang` so ui:// HTML follows this invocation, not
            // only the process/instance lang (auth(lang=en) must not leave a zh panel).
            setPanelLang(normalizeLang(args?.lang));
            // In test environment, skip logger to avoid potential blocking
            const isTestEnvironment =
              process.env.NODE_ENV === "test" || process.env.VITEST === "true";
            if (!isTestEnvironment) {
                server.logger?.({ type: 'beforeToolCall', toolName: name, args: sanitizeArgs(args) });
            }

            // 凭证形态入参的执行前**软确认**（先于破坏性确认）。参数里扫到凭证形态字符串时，
            // 要求客户端拿这串与它自己那份原始来源比对确认；未通过则不执行，直接返回说明文本。
            // 与破坏性确认同一取舍：这是"正常返回"而不是错误（详见 credential-guard.ts）。
            const credentialDecision = await guardCredentialWrite(server as unknown as CredentialGuardServer, {
                toolName: name,
                args,
                extra: extra as { requestId?: any },
            });
            if (credentialDecision.intercept) {
                success = true;
                return credentialDecision.result;
            }

            // 破坏性动作的执行前确认（护栏）。命中且未确认时不执行，直接返回说明文本：
            // 这是"正常返回"而不是错误（详见 confirmation-guard.ts 的取舍说明）。
            const guardDecision = await guardDestructiveAction(server as unknown as ConfirmationServer, {
                toolName: name,
                args,
                extra: extra as { requestId?: any },
            });
            // 不是 not_applicable 就说明命中了破坏性名单，把确认结果带上遥测：
            // 事后要能区分「有人点过确认」和「客户端根本问不了人」。
            if (guardDecision.status !== "not_applicable") {
                confirmStatus = guardDecision.status;
            }
            if (guardDecision.intercept) {
                success = true;
                return guardDecision.result;
            }

            // 执行原始处理函数（extra 一并透传，工具可据此拿到在途请求 id）
            result = await handler(args, extra);

            // 工具**自己返回**的失败（`{ success: false }` 结构化载荷，或已经带 `isError: true` 的
            // 失败回执）与"抛错"是同一件事：遥测要按失败记，文案要吃同一套收尾（增强 + RequestId +
            // 版本页脚）。护栏拦截的返回走不到这里——它在上面就 return 了，且它的载荷既没有
            // `success: false` 也没有 `isError`（见 confirmation-guard.ts / credential-guard.ts）：
            // 那是"用户选择不执行"，不是失败。
            const returnedFailure = isReturnedFailureResult(result);
            success = !returnedFailure;
            // 同一凭证的工具成功说明重复错误循环已被打破，只清零该凭证的计数
            if (!returnedFailure) {
                resetRepeatGuard(server);
            }
            requestId = extractRequestIdFromToolResult(result);
            const duration = Date.now() - startTime;
            debug(returnedFailure ? `工具返回失败结果: ${name}` : `工具执行成功: ${name}`, {
                duration,
                requestId: requestId || undefined,
            });
            if (!isTestEnvironment) {
                server.logger?.({
                    type: returnedFailure ? 'errorToolCall' : 'afterToolCall',
                    toolName: name,
                    args: sanitizeArgs(args),
                    ...(returnedFailure ? { message: failureMessageOf(result).message } : { result }),
                    duration,
                });
            }
            if (returnedFailure && !isTestEnvironment) {
                const failure = failureMessageOf(result);
                errorMessage = enhanceErrorMessage(
                    { message: failure.message, ...(failure.code ? { code: failure.code } : {}) },
                    failure.message,
                );
                return withBusinessFailureIsError(
                    withEnhancedFailureText(result, errorMessage, requestId, server),
                );
            }
            // 业务失败（结构化 { success: false } 返回）必须带 MCP isError=true，
            // 否则客户端会把失败误判为成功（实测 applyMigration / 知识库查询失败均踩坑）。
            return withBusinessFailureIsError(result);
        } catch (error) {
            success = false;
            // 在这里统一挂错误指引，而不是每个工具各自 catch 里做一次：
            // 全部工具的失败都会经过这一处，新增指引只需往注册表里加一条。
            errorMessage = enhanceErrorMessage(
              error,
              error instanceof Error ? error.message : String(error),
            );
            requestId = resolveRequestId(error);
            debug(`工具执行失败: ${name}`, {
                error: errorMessage,
                requestId: requestId || undefined,
                duration: Date.now() - startTime
            });
            const isTestEnvironment =
              process.env.NODE_ENV === "test" || process.env.VITEST === "true";
            if (!isTestEnvironment) {
                server.logger?.({ type: 'errorToolCall', toolName: name, args: sanitizeArgs(args), message: errorMessage, duration: Date.now() - startTime });
            }

            // Preserve structured tool guidance such as next_step.
            // These errors are expected control flow and should be serialized by the outer server wrapper.
            if (isToolPayloadError(error)) {
                // 连续相同结构化错误达到阈值时注入 repeat_guard 升级提示，
                // 打断无头客户端的原样重试循环（不改写 message，保持遥测聚合稳定）
                const payload = applyRepeatGuardToPayload(error.payload, server);
                throw new ToolPayloadError(payload);
            }

            // In tests, avoid any extra work that may block (envId lookup, issue link generation, etc.)
            if (isTestEnvironment) {
                throw error instanceof Error ? error : new Error(String(error));
            }

            const enhancedErrorMessage = buildFailureClientText(errorMessage, requestId, server);

            // 创建新的错误对象，保持原有的错误类型但更新消息
            const enhancedError = error instanceof Error
                ? new Error(enhancedErrorMessage)
                : new Error(enhancedErrorMessage);

            // 保持原有的错误属性
            if (error instanceof Error) {
                enhancedError.stack = error.stack;
                enhancedError.name = error.name;
            }

            // 重新抛出增强的错误
            throw enhancedError;
        } finally {
            // 上报工具调用数据（测试环境中跳过，避免阻塞）
            const isTestEnvironment =
              process.env.NODE_ENV === "test" || process.env.VITEST === "true";
            
            if (!isTestEnvironment && telemetryEnabled) {
                const duration = Date.now() - startTime;
                const envSetup = name === 'auth' ? readEnvSetupOutcome(result) : undefined;

                // 异步上报，不阻塞工具返回
                reportToolCall({
                    toolName: name,
                    envSetupStatus: envSetup?.status,
                    envSetupFailReason: envSetup?.reason,
                    success,
                    requestId,
                    duration,
                    error: errorMessage,
                    inputParams: sanitizeArgs(args), // 添加入参上报
                    action: args?.action, // 工具级 action（如 auth 的 status/set_env）
                    cloudBaseOptions: server.cloudBaseOptions,
                    ide: server.ide || process.env.INTEGRATION_IDE, // 传递集成IDE信息
                    client: server.client || process.env.CLOUDBASE_MCP_CLIENT, // 传递 MCP client 来源标识
                    mcpClientInfo: readMcpClientInfoFromServer(server),
                    mcpClientCapabilities: readClientCapabilitiesFromServer(server),
                    confirmStatus,
                }).catch(err => {
                    // 静默处理上报错误，不影响主要功能
                    debug('遥测上报失败', { toolName: name, error: err instanceof Error ? err.message : String(err) });
                });
            }
        }
    };
}

function extractRequestIdFromToolResult(result: any): string | undefined {
    if (!result || typeof result !== 'object') {
        return undefined;
    }

    if (typeof result.requestId === 'string' && result.requestId.length > 0) {
        return result.requestId;
    }

    if (typeof result.RequestId === 'string' && result.RequestId.length > 0) {
        return result.RequestId;
    }

    const content = Array.isArray((result as any).content) ? (result as any).content : [];
    for (const item of content) {
        if (!item || item.type !== 'text' || typeof item.text !== 'string') {
            continue;
        }

        try {
            const parsed = JSON.parse(item.text);
            if (parsed && typeof parsed === 'object') {
                if (typeof parsed.requestId === 'string' && parsed.requestId.length > 0) {
                    return parsed.requestId;
                }
                if (typeof parsed.RequestId === 'string' && parsed.RequestId.length > 0) {
                    return parsed.RequestId;
                }
            }
        } catch {
            // Ignore non-JSON text payloads.
        }
    }

    return undefined;
}

/**
 * 安装工具管线：注册期过滤 + 执行前检查 + 返回语义，外加可选的遥测上报。
 *
 * 这一层在所有配置下都需要安装，与是否上报数据无关；`telemetryEnabled`
 * 只控制是否发出工具调用上报事件，不影响管线本身的职责。
 *
 * @param server MCP Server 实例
 * @param options.telemetryEnabled 是否上报工具调用事件，默认 true（兼容既有调用与测试）
 */
export function wrapServerWithTelemetry(
    server: McpServer,
    options: { telemetryEnabled?: boolean } = {},
): void {
    const telemetryEnabled = options.telemetryEnabled ?? true;
    // 保存原始的 registerTool 方法
    const originalRegisterTool = server.registerTool.bind(server);

    // Override the registerTool method to add telemetry and conditional registration
    server.registerTool = function (toolName: string, toolConfig: any, handler: any) {
        // If the tool should not be registered in the current mode, do not register and return undefined
        if (!shouldRegisterTool(toolName)) {
            debug(`Cloud mode: skipping registration of incompatible tool: ${toolName}`);
            // Explicitly return undefined to satisfy the expected type
            return undefined as any;
        }

        // Use the wrapped handler, passing the server instance
        const wrappedHandler = createWrappedHandler(
            toolName,
            handler,
            server as unknown as ExtendedMcpServer,
            { telemetryEnabled },
        );

        // Call the original registerTool method
        return originalRegisterTool(toolName, applyCategoryAnnotationMeta(toolConfig ?? {}), wrappedHandler);
    };
}

/**
 * 清理参数中的敏感信息，用于日志记录
 * @param args 原始参数
 * @returns 清理后的参数
 */
function sanitizeArgs(args: any): any {
    if (!args || typeof args !== 'object') {
        return args;
    }

    const sanitized = { ...args };

    // 敏感字段列表
    const sensitiveFields = [
        'password', 'token', 'secret', 'key', 'auth',
        'localPath', 'filePath', 'content', 'code',
        'secretId', 'secretKey', 'envId'
    ];

    // 递归清理敏感字段
    function cleanObject(obj: any): any {
        if (Array.isArray(obj)) {
            return obj.map(cleanObject);
        }

        if (obj && typeof obj === 'object') {
            const cleaned: any = {};
            for (const [key, value] of Object.entries(obj)) {
                const lowerKey = key.toLowerCase();
                const isSensitive = sensitiveFields.some(field => lowerKey.includes(field));

                if (isSensitive) {
                    cleaned[key] = '[REDACTED]';
                } else {
                    cleaned[key] = cleanObject(value);
                }
            }
            return cleaned;
        }

        return obj;
    }

    return cleanObject(sanitized);
}
