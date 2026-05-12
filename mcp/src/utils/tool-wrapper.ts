import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import os from 'os';
import { getCachedEnvId, getEnvId } from '../cloudbase-manager.js';
import { ExtendedMcpServer } from "../server.js";
import { CloudBaseOptions } from '../types.js';
import { shouldRegisterTool } from './cloud-mode.js';
import { debug } from './logger.js';
import { reportToolCall } from './telemetry.js';
import { isToolPayloadError } from "./tool-result.js";


/**
 * 工具包装器，为 MCP 工具添加数据上报功能
 * 自动记录工具调用的成功/失败状态、执行时长等信息
 */

// 重新导出 MCP SDK 的类型，方便其他模块使用
export type { Tool, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

// 构建时注入的版本号
declare const __MCP_VERSION__: string;

/**
 * 生成 GitHub Issue 创建链接
 * @param toolName 工具名称
 * @param errorMessage 错误消息
 * @param args 工具参数
 * @param cloudBaseOptions CloudBase 配置选项
 * @returns GitHub Issue 创建链接
 */
async function generateGitHubIssueLink(toolName: string, errorMessage: string, args: any, cloudBaseOptions?: CloudBaseOptions, payload?: {
    requestId: string;
    ide: string;
}): Promise<string> {
    const { requestId, ide } = payload || {};
    const baseUrl = 'https://github.com/TencentCloudBase/CloudBase-AI-ToolKit/issues/new';

    const isTestEnvironment =
      process.env.NODE_ENV === "test" || process.env.VITEST === "true";

    // 尝试获取环境ID（测试环境跳过，避免交互/阻塞）
    let envIdSection = '';
    if (!isTestEnvironment) {
        try {
            // Avoid blocking forever on envId lookup
            const envId = await Promise.race([
                getEnvId(cloudBaseOptions),
                new Promise<string>((resolve) => setTimeout(() => resolve(''), 2000)),
            ]);
            if (envId) {
                envIdSection = `
## 环境ID
${envId}
`;
            }
        } catch (error) {
            // 如果获取 envId 失败，不添加环境ID部分
            debug('无法获取环境ID:', error instanceof Error ? error : new Error(String(error)));
        }
    }

    // 构建标题
    const title = `MCP工具错误: ${toolName}`;

    // 构建问题描述
    const body = `## 错误描述
工具 \`${toolName}\` 执行时发生错误

## 错误信息
\`\`\`
${errorMessage}
\`\`\`
${envIdSection}
## 环境信息
- 操作系统: ${os.type()} ${os.release()}
- Node.js版本: ${process.version}
- MCP 版本：${process.env.npm_package_version || __MCP_VERSION__ || 'unknown'}
- 系统架构: ${os.arch()}
- 时间: ${new Date().toISOString()}
- 请求ID: ${requestId}
- 集成IDE: ${ide}

## 工具参数
\`\`\`json
${JSON.stringify(sanitizeArgs(args), null, 2)}
\`\`\`

## 复现步骤
1. 使用工具: ${toolName}
2. 传入参数: 上述参数信息
3. 出现错误

## 期望行为
[请描述您期望的正确行为]

## 其他信息
[如有其他相关信息，请在此补充]
`;

    // URL 编码
    const encodedTitle = encodeURIComponent(title);
    const encodedBody = encodeURIComponent(body);

    return `${baseUrl}?title=${encodedTitle}&body=${encodedBody}`;
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
            requestId = extractRequestIdFromToolResult(result);
            const duration = Date.now() - startTime;
            debug(`工具执行成功: ${name}`, { duration });
            if (!isTestEnvironment) {
                server.logger?.({ type: 'afterToolCall', toolName: name, args: sanitizeArgs(args), result: result, duration });
            }
            return result;
        } catch (error) {
            success = false;
            errorMessage = error instanceof Error ? error.message : String(error);
            requestId = (typeof error === 'object' && error && 'requestId' in error) ? (error as any).requestId : '';
            debug(`工具执行失败: ${name}`, {
                error: errorMessage,
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
                throw error;
            }

            // In tests, avoid any extra work that may block (envId lookup, issue link generation, etc.)
            if (isTestEnvironment) {
                throw error instanceof Error ? error : new Error(String(error));
            }

            // 生成 GitHub Issue 创建链接
            const issueLink = await generateGitHubIssueLink(name, errorMessage, args, server.cloudBaseOptions, {
                requestId: (typeof error === 'object' && error && 'requestId' in error) ? (error as any).requestId : '',
                ide: server.ide || process.env.INTEGRATION_IDE || ''
            });
            const mcpVersion = typeof __MCP_VERSION__ !== 'undefined' ? __MCP_VERSION__ : 'unknown';
            const enhancedErrorMessage = `${errorMessage}\n\n📦 CloudBase MCP v${mcpVersion}\n🔗 遇到问题？请复制以下链接到浏览器打开\n即可自动携带错误详情快速创建 GitHub Issue：\n${issueLink}`;

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
                    ide: server.ide || process.env.INTEGRATION_IDE // 传递集成IDE信息
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
        const wrappedHandler = createWrappedHandler(toolName, handler, server as ExtendedMcpServer);

        // Call the original registerTool method
        return originalRegisterTool(toolName, toolConfig, wrappedHandler);
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
