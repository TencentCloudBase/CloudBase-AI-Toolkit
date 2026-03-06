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
              text: JSON.stringify(result, null, 2),
            }],
          };
        }

        // action === "list"
        const result = await manager.agent.describeAgentList({
          PageNumber: pageNumber,
          PageSize: pageSize,
        });
        logCloudBaseResult(logger, result);

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `查询智能体失败: ${error instanceof Error ? error.message : String(error)}`,
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
      description: `管理云开发 AI 智能体（基于云函数的长连接 AI 服务，支持 SSE 流式输出和会话保持）：创建、更新、删除。代码目录需包含可执行的 scf_bootstrap 启动脚本，监听 SCF_RUNTIME_PORT 端口。创建/更新后需用 queryAgent 查询状态，底层云函数可能仍在部署中。`,
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
        ignore: z.union([z.string(), z.array(z.string())]).optional().describe("忽略文件 glob 模式"),
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
            throw new Error(`代码目录不存在: ${resolvedPath}`);
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
                message: `成功创建智能体 "${name}"`,
                agentId: result.AgentId,
                data: result,
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
              throw new Error(`代码目录不存在: ${cwd}`);
            }
          }

          const result = await manager.agent.updateAgent({
            AgentId: agentId,
            cwd,
            envVariables,
            Runtime: runtime,
            Timeout: timeout,
            MemorySize: memorySize,
            InstallDependency: installDependency,
            Ignore: ignore,
          });

          logCloudBaseResult(logger, result);

          // 收集更新的字段
          const updatedFields: Record<string, boolean> = {};
          if (targetPath) updatedFields.code = true;
          if (envVariables) updatedFields.envVariables = true;
          if (runtime) updatedFields.runtime = true;
          if (timeout !== undefined) updatedFields.timeout = true;
          if (memorySize !== undefined) updatedFields.memorySize = true;
          if (installDependency !== undefined) updatedFields.installDependency = true;
          if (ignore) updatedFields.ignore = true;

          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                success: true,
                message: `成功更新智能体 "${agentId}"`,
                updatedFields,
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
                message: `成功删除智能体 "${agentId}"`,
                result,
              }, null, 2),
            }],
          };
        }

        // 未知 action
        return {
          content: [{
            type: "text",
            text: JSON.stringify({ success: false, error: `未知操作: ${action}` }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `管理智能体失败: ${error instanceof Error ? error.message : String(error)}`,
          }],
        };
      }
    }
  );
}
