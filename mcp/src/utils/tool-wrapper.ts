import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { ToolAnnotations as SdkToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { getCachedEnvId } from '../cloudbase-manager.js';
import { ExtendedMcpServer } from "../server.js";
import { shouldRegisterTool } from './cloud-mode.js';
import { debug } from './logger.js';
import { reportToolCall, readMcpClientInfoFromServer } from './telemetry.js';
import { isToolPayloadError, ToolPayloadError, withBusinessFailureIsError } from "./tool-result.js";
import { applyRepeatGuardToPayload, resetRepeatGuard } from "./repeat-error-guard.js";
import { enhanceErrorMessage, resolveRequestId } from "./error-guidance.js";
import { resolveSiteAndRegion } from "./site-map.js";


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

/**
 * Point toolkit bugs at a pull request and platform problems at a blank issue page.
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
        `${CNB_REPO}/-/issues/new`,
    ].join("\n");
}

/**
 * 创建包装后的处理函数，添加数据上报功能
 */
function createWrappedHandler(name: string, handler: any, server: ExtendedMcpServer) {
    return async (args: any) => {
        const startTime = Date.now();
        let success = false;
        let errorMessage: string | undefined;
        let requestId: string | undefined;

        try {
            debug(`开始执行工具: ${name}`, { args: sanitizeArgs(args) });
            // In test environment, skip logger to avoid potential blocking
            const isTestEnvironment =
              process.env.NODE_ENV === "test" || process.env.VITEST === "true";
            if (!isTestEnvironment) {
                server.logger?.({ type: 'beforeToolCall', toolName: name, args: sanitizeArgs(args) });
            }

            // 执行原始处理函数
            const result = await handler(args);

            success = true;
            // 同一凭证的工具成功说明重复错误循环已被打破，只清零该凭证的计数
            resetRepeatGuard(server);
            requestId = extractRequestIdFromToolResult(result);
            const duration = Date.now() - startTime;
            debug(`工具执行成功: ${name}`, { duration, requestId: requestId || undefined });
            if (!isTestEnvironment) {
                server.logger?.({ type: 'afterToolCall', toolName: name, args: sanitizeArgs(args), result: result, duration });
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

            const mcpVersion = typeof __MCP_VERSION__ !== 'undefined' ? __MCP_VERSION__ : 'unknown';
            const requestIdSuffix = requestId ? `\n🆔 RequestId: ${requestId}` : '';
            const enhancedErrorMessage = `${errorMessage}${requestIdSuffix}\n\n📦 CloudBase MCP v${mcpVersion}\n${contributionHint(server)}`;

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
            
            if (!isTestEnvironment) {
                const duration = Date.now() - startTime;
                
                // 如果 server.cloudBaseOptions 为空或没有 envId，尝试从缓存获取并更新
                let cloudBaseOptions = server.cloudBaseOptions;
                if (!cloudBaseOptions?.envId) {
                    const cachedEnvId = getCachedEnvId();
                    if (cachedEnvId) {
                        cloudBaseOptions = { ...cloudBaseOptions, envId: cachedEnvId };
                    }
                }
                
                // 异步上报，不阻塞工具返回
                reportToolCall({
                    toolName: name,
                    success,
                    requestId,
                    duration,
                    error: errorMessage,
                    inputParams: sanitizeArgs(args), // 添加入参上报
                    cloudBaseOptions: cloudBaseOptions, // 传递 CloudBase 配置（可能已更新）
                    ide: server.ide || process.env.INTEGRATION_IDE, // 传递集成IDE信息
                    client: server.client || process.env.CLOUDBASE_MCP_CLIENT, // 传递 MCP client 来源标识
                    mcpClientInfo: readMcpClientInfoFromServer(server),
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
 * 包装 MCP Server 的 registerTool 方法，添加数据上报功能和条件注册
 * @param server MCP Server 实例
 */
export function wrapServerWithTelemetry(server: McpServer): void {
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
        const wrappedHandler = createWrappedHandler(toolName, handler, server as unknown as ExtendedMcpServer);

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
