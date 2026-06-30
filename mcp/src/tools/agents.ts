import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";

const QUERY_AGENT_ACTIONS = ["listAgents", "getAgent", "getAgentLogs"] as const;
const MANAGE_AGENT_ACTIONS = ["createAgent", "updateAgent", "deleteAgent"] as const;

type QueryAgentAction = (typeof QUERY_AGENT_ACTIONS)[number];
type ManageAgentAction = (typeof MANAGE_AGENT_ACTIONS)[number];

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

function normalizeString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Sanitize agent name for CloudBase backend.
 * The backend creates a cloud function alias from the agent name (e.g. "agent-{name}"),
 * and SCF aliases only allow alphanumeric characters and hyphens.
 * This function replaces any character that is not [a-zA-Z0-9] with a hyphen,
 * then collapses consecutive hyphens into one.
 */
function sanitizeAgentName(name: string): string {
  return name
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function normalizeAgentPayload(params?: Record<string, unknown>) {
  if (!params) {
    return {};
  }

  const {
    name,
    description,
    agentId,
    runtime,
    timeout,
    memorySize,
    installDependency,
    zipFile,
    cosBucketRegion,
    tempCosObjectName,
    sessionConfig,
    ...rest
  } = params;

  return {
    ...rest,
    ...(normalizeString(name) ? { Name: normalizeString(name) } : {}),
    ...(normalizeString(description) ? { Description: normalizeString(description) } : {}),
    ...(normalizeString(agentId) ? { AgentId: normalizeString(agentId) } : {}),
    ...(normalizeString(runtime) ? { Runtime: normalizeString(runtime) } : {}),
    ...(normalizeNumber(timeout) !== undefined ? { Timeout: normalizeNumber(timeout) } : {}),
    ...(normalizeNumber(memorySize) !== undefined
      ? { MemorySize: normalizeNumber(memorySize) }
      : {}),
    ...(normalizeBoolean(installDependency) !== undefined
      ? { InstallDependency: normalizeBoolean(installDependency) }
      : {}),
    ...(normalizeString(zipFile) ? { ZipFile: normalizeString(zipFile) } : {}),
    ...(normalizeString(cosBucketRegion)
      ? { CosBucketRegion: normalizeString(cosBucketRegion) }
      : {}),
    ...(normalizeString(tempCosObjectName)
      ? { TempCosObjectName: normalizeString(tempCosObjectName) }
      : {}),
    ...(sessionConfig && typeof sessionConfig === "object" ? { SessionConfig: sessionConfig } : {}),
  };
}

export function registerAgentTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  server.registerTool?.(
    "queryAgents",
    {
      title: "查询 CloudBase Agent",
      description: "CloudBase Agent 域统一只读入口。支持列表、详情与日志查询。",
      inputSchema: {
        action: z.enum(QUERY_AGENT_ACTIONS),
        agentId: z.string().optional(),
        pageNumber: z.number().optional(),
        pageSize: z.number().optional(),
        params: z.record(z.any()).optional(),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "agents",
      },
    },
    async ({
      action,
      agentId,
      pageNumber,
      pageSize,
      params,
    }: {
      action: QueryAgentAction;
      agentId?: string;
      pageNumber?: number;
      pageSize?: number;
      params?: Record<string, unknown>;
    }) => {
      try {
        const cloudbase = await getManager();
        if (action === "listAgents") {
          const result = await cloudbase.agent.describeAgentList({
            PageNumber: pageNumber ?? 1,
            PageSize: pageSize ?? 20,
          });
          logCloudBaseResult(server.logger, result);
          return jsonContent(
            buildEnvelope(
              {
                action,
                agents: result.AgentList ?? (result as any).Agents ?? [],
                total: result.Total ?? 0,
                raw: result,
              },
              "Agent 列表查询成功",
            ),
          );
        }

        if (!agentId) {
          throw new Error(`action=${action} 时必须提供 agentId`);
        }

        if (action === "getAgent") {
          const result = await cloudbase.agent.describeAgent(agentId);
          logCloudBaseResult(server.logger, result);
          return jsonContent(
            buildEnvelope(
              {
                action,
                agentId,
                agent: result.AgentInfo ?? null,
                readiness: {
                  isReady: result.IsReady,
                  reason: result.NotReadyReason ?? null,
                },
                raw: result,
              },
              "Agent 详情查询成功",
            ),
          );
        }

        const result = await cloudbase.agent.getAgentLogs({
          AgentId: agentId,
          ...(params ?? {}),
        });
        logCloudBaseResult(server.logger, result);
        return jsonContent(
          buildEnvelope(
            {
              action,
              agentId,
              logs: result,
            },
            "Agent 日志查询成功",
          ),
        );
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );

  server.registerTool?.(
    "manageAgents",
    {
      title: "管理 CloudBase Agent",
      description: "CloudBase Agent 域统一写入口。支持创建、更新和删除远端 Agent。",
      inputSchema: {
        action: z.enum(MANAGE_AGENT_ACTIONS),
        agentId: z.string().optional(),
        name: z.string().optional(),
        description: z.string().optional(),
        runtime: z.string().optional(),
        timeout: z.number().optional(),
        memorySize: z.number().optional(),
        installDependency: z.boolean().optional(),
        zipFile: z.string().optional(),
        cosBucketRegion: z.string().optional(),
        tempCosObjectName: z.string().optional(),
        sessionConfig: z.record(z.any()).optional(),
        cwd: z.string().optional(),
        params: z.record(z.any()).optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true,
        category: "agents",
      },
    },
    async ({
      action,
      agentId,
      name,
      description,
      runtime,
      timeout,
      memorySize,
      installDependency,
      zipFile,
      cosBucketRegion,
      tempCosObjectName,
      sessionConfig,
      cwd,
      params,
    }: {
      action: ManageAgentAction;
      agentId?: string;
      name?: string;
      description?: string;
      runtime?: string;
      timeout?: number;
      memorySize?: number;
      installDependency?: boolean;
      zipFile?: string;
      cosBucketRegion?: string;
      tempCosObjectName?: string;
      sessionConfig?: Record<string, unknown>;
      cwd?: string;
      params?: Record<string, unknown>;
    }) => {
      let _agentName: string | undefined;
      let _agentRuntime: string | undefined;
      try {
        const cloudbase = await getManager();
        const payload = normalizeAgentPayload({
          name,
          description,
          runtime,
          timeout,
          memorySize,
          installDependency,
          zipFile,
          cosBucketRegion,
          tempCosObjectName,
          sessionConfig,
          cwd,
          ...(params ?? {}),
        });
        _agentName = payload?.Name;
        _agentRuntime = payload?.Runtime;

        if (action === "createAgent") {
          const normalizedName = normalizeString(payload.Name);
          if (!normalizedName) {
            throw new Error("action=createAgent 时必须提供 name（可通过顶层 name 或 params.name 传入）");
          }

          // CloudBase 后端在创建 Agent 时会同步创建云函数，函数名/别名长度受 SCF 限制（最大 64 字符）。
          // envId 可能被用作前缀或别名的一部分，因此这里预留足够余量，避免后端 CreateFunction 失败。
          // 同时，后端会用 name 生成云函数 alias（如 "agent-{name}"），而 SCF alias 只允许字母、数字和连字符，
          // 因此需要对 name 做 sanitize，将非法字符（如下划线）替换为连字符。
          const sanitizedName = sanitizeAgentName(normalizedName);
          if (!sanitizedName) {
            throw new Error(
              `name "${normalizedName}" 经 sanitize 后为空，请使用包含字母或数字的 name`
            );
          }
          if (sanitizedName.length > 30) {
            throw new Error(
              `agent name 过长（当前 ${sanitizedName.length} 字符）。CloudBase 创建 Agent 时会同步创建云函数，` +
              `函数名/别名受 SCF 64 字符长度限制，且 envId 可能作为前缀拼接。请将 name 控制在 30 字符以内。`
            );
          }

          const createPayload = {
            ...payload,
            Name: sanitizedName,
            Runtime: normalizeString(payload.Runtime) ?? "Nodejs20.19",
          };
          const result = await cloudbase.agent.createAgent(createPayload as any);
          logCloudBaseResult(server.logger, result);
          return jsonContent(
            buildEnvelope(
              {
                action,
                raw: result,
              },
              "Agent 创建成功",
            ),
          );
        }

        if (!agentId) {
          throw new Error(`action=${action} 时必须提供 agentId`);
        }

        if (action === "updateAgent") {
          const result = await cloudbase.agent.updateAgent({
            AgentId: agentId,
            ...payload,
          } as any);
          logCloudBaseResult(server.logger, result);
          return jsonContent(
            buildEnvelope(
              {
                action,
                agentId,
                raw: result,
              },
              "Agent 更新成功",
            ),
          );
        }

        const result = await cloudbase.agent.deleteAgent({
          AgentId: agentId,
        });
        logCloudBaseResult(server.logger, result);
        return jsonContent(
          buildEnvelope(
            {
              action,
              agentId,
              raw: result,
            },
            "Agent 删除成功",
          ),
        );
      } catch (error) {
        // 对后端 InternalError 提供更有意义的错误信息
        const errMsg = error instanceof Error ? error.message : String(error);
        if (errMsg.includes("InternalError") || errMsg.includes("服务处理出错")) {
          server.logger?.({
            type: "createAgentError",
            message: "createAgent 后端返回 InternalError，可能是云函数创建失败",
            originalError: errMsg,
            name: _agentName,
            runtime: _agentRuntime,
          });
        }
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );
}
