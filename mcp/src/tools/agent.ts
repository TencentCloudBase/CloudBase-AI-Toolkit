import * as fs from "fs";
import * as path from "path";
import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";

const CATEGORY = "agent";

/**
 * 运行时版本（仅 SCF 云函数支持）
 */
const RUNTIME_VERSIONS = [
  "Nodejs20.19",
  "Nodejs18.15",
  "Nodejs16.13",
  "Nodejs14.18",
  "Python3.10",
  "Python3.9",
  "Python3.7",
  "Php8.0",
  "Php7.4",
  "Go1",
  "Java11",
  "Java8",
] as const;

/**
 * 会话来源
 */
const SESSION_SOURCES = ["HEADER", "COOKIE", "QUERY_STRING"] as const;

/**
 * 会话配置 Schema
 */
const SessionConfigSchema = z.object({
  SessionSource: z.enum(SESSION_SOURCES).optional().describe("会话来源，默认 'HEADER'"),
  SessionName: z.string().optional().describe("会话名称，5-40字符，字母开头"),
  MaximumConcurrencySessionPerInstance: z.number().optional().describe("单实例并发会话数，1-100，默认 1"),
  MaximumTTLInSeconds: z.number().optional().describe("会话最长生命周期（秒），1-604800，默认 21600"),
  MaximumIdleTimeInSeconds: z.number().optional().describe("会话最长空闲时间（秒），不超过 TTL，默认 1800"),
  MaxConcurrency: z.number().optional().describe("单实例最大并发数，1-100，默认 50"),
}).optional();

/**
 * 注册 Agent 管理工具
 */
export function registerAgentTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const logger = server.logger;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions, mcpServer: server });

  // ============================================
  // 工具 1: queryAgent - 查询（只读）
  // ============================================
  server.registerTool?.(
    "queryAgent",
    {
      title: "查询智能体",
      description: `查询云开发 AI 智能体（CloudBase Agent）列表或详情。智能体是基于云函数的长连接 AI 服务，支持流式输出和会话保持。

操作：list=查询列表（可选 pageNumber/pageSize），detail=查询详情（需 agentId）`,
      inputSchema: {
        action: z.enum(["list", "detail"]).describe("操作类型：list=查询列表，detail=查询详情(需agentId)"),
        agentId: z.string().optional().describe("Agent ID，action=detail 时必需"),
        pageNumber: z.number().optional().describe("页码，action=list 时有效，默认 1"),
        pageSize: z.number().optional().describe("每页数量，action=list 时有效，默认 20"),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async (params: {
      action: "list" | "detail";
      agentId?: string;
      pageNumber?: number;
      pageSize?: number;
    }) => {
      try {
        const { action, agentId, pageNumber = 1, pageSize = 20 } = params;
        const manager = await getManager();

        if (action === "detail") {
          // 校验必需参数
          if (!agentId) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: false,
                  error: "action=detail 时必须提供 agentId",
                }, null, 2),
              }],
            };
          }

          const result = await manager.agent.describeAgent(agentId);
          logCloudBaseResult(logger, result);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                data: { agent: result },
                message: `查询到智能体 "${agentId}" 的详情`,
                nextActions: [
                  { tool: "manageAgent", action: "update", reason: "更新该智能体配置或代码" },
                  { tool: "manageAgent", action: "delete", reason: "删除该智能体" },
                  { tool: "searchLogs", reason: "查询该智能体的运行日志" },
                ],
              }, null, 2),
            }],
          };
        }

        // action === "list"
        const result = await manager.agent.describeAgentList({
          PageNumber: pageNumber,
          PageSize: pageSize,
        });
        logCloudBaseResult(logger, result);

        const agents = result.AgentList || [];
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              data: { agents, total: (result as any).TotalCount ?? agents.length, pageNumber, pageSize },
              message: `查询到 ${agents.length} 个智能体`,
              nextActions: [
                { tool: "queryAgent", action: "detail", reason: "查看某个智能体的详细信息" },
                { tool: "manageAgent", action: "create", reason: "创建新的智能体" },
              ],
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `查询智能体失败: ${error instanceof Error ? error.message : String(error)}`,
            }, null, 2),
          }],
        };
      }
    }
  );

  // ============================================
  // 工具 2: manageAgent - 管理（创建/更新/删除）
  // ============================================
  server.registerTool?.(
    "manageAgent",
    {
      title: "管理智能体",
      description: `管理云开发 AI 智能体/Agent（基于云函数的长连接 AI 服务，支持 SSE 流式输出和会话保持）：创建、更新、删除。当用户要求部署/更新/创建 Agent 智能体时，必须使用本工具（manageAgent），而非云托管服务。即使代码目录中存在 Dockerfile，只要用户明确操作的是智能体/Agent，就应使用本工具。

部署前检查：代码目录必须包含 scf_bootstrap 启动脚本（无后缀名，需有可执行权限），脚本内容需启动服务并监听 $SCF_RUNTIME_PORT 端口。如果目录中不存在 scf_bootstrap，必须先为用户创建该文件再进行部署。`,
      inputSchema: {
        action: z.enum(["create", "update", "delete"]).describe(`操作类型：
- create: 创建智能体，必需 name/targetPath/runtime，可选 timeout/memorySize/envVariables/installDependency/ignore/sessionConfig/agentId
- update: 更新智能体，必需 agentId，可选 targetPath/envVariables/runtime/timeout/memorySize/installDependency/ignore
- delete: 删除智能体，必需 agentId + force=true`),
        agentId: z.string().optional().describe("智能体 ID"),
        name: z.string().optional().describe("智能体名称，仅英文"),
        targetPath: z.string().optional().describe("本地代码目录路径"),
        runtime: z.enum(RUNTIME_VERSIONS).optional().describe("运行时版本，默认Nodejs20.19"),
        timeout: z.number().optional().describe("超时时间（秒），默认 7200"),
        memorySize: z.number().optional().describe("内存大小（MB），64 或 128-3072"),
        installDependency: z.boolean().optional().describe("自动安装依赖，更新即创建时如果部署代码不携带依赖时需为true"),
        envVariables: z.record(z.string(), z.string()).optional().describe("环境变量键值对"),
        ignore: z.union([z.string(), z.array(z.string())]).optional().describe("忽略文件/目录，如 ['.git', 'node_modules', '*.log']"),
        sessionConfig: SessionConfigSchema.describe("会话配置"),
        force: z.boolean().optional().describe("确认删除标志"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: CATEGORY,
      },
    },
    async (params: {
      action: "create" | "update" | "delete";
      agentId?: string;
      name?: string;
      targetPath?: string;
      runtime?: typeof RUNTIME_VERSIONS[number];
      timeout?: number;
      memorySize?: number;
      installDependency?: boolean;
      envVariables?: Record<string, string>;
      ignore?: string | string[];
      sessionConfig?: {
        SessionSource?: "HEADER" | "COOKIE" | "QUERY_STRING";
        SessionName?: string;
        MaximumConcurrencySessionPerInstance?: number;
        MaximumTTLInSeconds?: number;
        MaximumIdleTimeInSeconds?: number;
        MaxConcurrency?: number;
      };
      force?: boolean;
    }) => {
      try {
        const manager = await getManager();
        const { action } = params;

        // ==================== CREATE ====================
        if (action === "create") {
          const { name, targetPath, runtime, agentId, timeout, memorySize, installDependency, envVariables, ignore, sessionConfig } = params;

          // 校验必需参数
          if (!name) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "create 需要 name 参数" }, null, 2) }] };
          }
          if (!targetPath) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "create 需要 targetPath 参数" }, null, 2) }] };
          }
          if (!runtime) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "create 需要 runtime 参数" }, null, 2) }] };
          }

          // 验证路径
          const resolvedPath = path.resolve(targetPath);
          if (!fs.existsSync(resolvedPath)) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: `代码目录不存在: ${resolvedPath}` }, null, 2) }] };
          }

          const result = await manager.agent.createScfAgent({
            Name: name,
            AgentId: agentId,
            cwd: resolvedPath,
            Runtime: runtime,
            Timeout: timeout || 7200,
            MemorySize: memorySize,
            InstallDependency: installDependency,
            envVariables,
            ignore,
            SessionConfig: sessionConfig,
          });

          logCloudBaseResult(logger, result);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                data: { agentId: result.AgentId, ...result },
                message: `智能体 "${name}" 创建成功，底层云函数可能仍在部署中`,
                nextActions: [
                  { tool: "queryAgent", action: "detail", reason: "查询部署状态" },
                ],
              }, null, 2),
            }],
          };
        }

        // ==================== UPDATE ====================
        if (action === "update") {
          const { agentId, targetPath, envVariables, runtime, timeout, memorySize, installDependency, ignore } = params;

          // 校验必需参数
          if (!agentId) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "update 需要 agentId 参数" }, null, 2) }] };
          }

          // 验证路径
          let cwd: string | undefined;
          if (targetPath) {
            cwd = path.resolve(targetPath);
            if (!fs.existsSync(cwd)) {
              return { content: [{ type: "text", text: JSON.stringify({ success: false, error: `代码目录不存在: ${cwd}` }, null, 2) }] };
            }
          }

          // 超时时间（毫秒）- 超过 30 秒未完成则先返回，不阻塞
          const UPDATE_TIMEOUT_MS = 20 * 1000;
          const TIMEOUT_FLAG = Symbol("timeout");

          const updatePromise = manager.agent.updateAgent({
            AgentId: agentId,
            cwd,
            envVariables,
            Runtime: runtime,
            Timeout: timeout,
            MemorySize: memorySize,
            InstallDependency: installDependency,
            Ignore: ignore,
          });

          const timeoutPromise = new Promise<typeof TIMEOUT_FLAG>((resolve) => {
            setTimeout(() => resolve(TIMEOUT_FLAG), UPDATE_TIMEOUT_MS);
          });

          const raceResult = await Promise.race([updatePromise, timeoutPromise]);

          if (raceResult === TIMEOUT_FLAG) {
            // 超时：更新仍在进行中，先返回提示
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  data: null,
                  message: `智能体 "${agentId}" 更新已提交，正在部署中，请稍后查询状态`,
                  nextActions: [
                    { tool: "queryAgent", action: "detail", params: { agentId }, reason: "查询智能体部署状态" },
                  ],
                }, null, 2),
              }],
            };
          }

          // 正常完成
          logCloudBaseResult(logger, raceResult);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                data: raceResult,
                message: `成功更新智能体 "${agentId}"`,
                nextActions: [
                  { tool: "queryAgent", action: "detail", reason: "查询部署状态" },
                ],
              }, null, 2),
            }],
          };
        }

        // ==================== DELETE ====================
        if (action === "delete") {
          const { agentId, force } = params;

          // 校验必需参数
          if (!agentId) {
            return { content: [{ type: "text", text: JSON.stringify({ success: false, error: "delete 需要 agentId 参数" }, null, 2) }] };
          }
          if (!force) {
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: false,
                  message: `删除智能体 "${agentId}" 是不可恢复的操作。如确认删除，请设置 force=true 重新调用。`,
                }, null, 2),
              }],
            };
          }

          const result = await manager.agent.deleteAgent({ AgentId: agentId });
          logCloudBaseResult(logger, result);

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                data: result,
                message: `成功删除智能体 "${agentId}"`,
                nextActions: [
                  { tool: "queryAgent", action: "list", reason: "确认智能体已删除" },
                ],
              }, null, 2),
            }],
          };
        }

        // 未知 action
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: false, error: `Unknown action: ${action}` }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `管理智能体失败: ${error instanceof Error ? error.message : String(error)}`,
            }, null, 2),
          }],
        };
      }
    }
  );
}
