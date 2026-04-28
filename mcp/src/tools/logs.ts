import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";

const QUERY_LOG_ACTIONS = ["checkLogService", "searchLogs"] as const;

type QueryLogAction = (typeof QUERY_LOG_ACTIONS)[number];

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

export function registerLogTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  server.registerTool?.(
    "queryLogs",
    {
      title: "查询日志服务",
      description:
        "日志域统一只读入口。支持检查日志服务状态并搜索 CLS 日志。" +
        "\n\n**重要区分**：" +
        "\n- 查询云函数日志：使用 `queryFunctions(action=\"listFunctionLogs\", functionName=\"xxx\")`" +
        "\n- 查询 CLS 日志（跨服务日志聚合）：使用本工具 `queryLogs(action=\"searchLogs\")`" +
        "\n\n**适用场景**：" +
        "\n- 检查 CLS 日志服务是否开通：`action=\"checkLogService\"`" +
        "\n- 跨服务日志搜索（如搜索所有 ERROR 日志）：`action=\"searchLogs\"`" +
        "\n- 按 CLS 语法检索特定服务的日志：`action=\"searchLogs\", service=\"tcb|tcbr\"`",
      inputSchema: {
        action: z
          .enum(QUERY_LOG_ACTIONS)
          .describe(
            "操作类型：" +
            "\n- `checkLogService`: 检查 CLS 日志服务是否开通" +
            "\n- `searchLogs`: 搜索 CLS 日志（需要提供 queryString）"
          ),
        queryString: z
          .string()
          .optional()
          .describe(
            "CLS 查询语句。**action=\"searchLogs\" 时必填**。" +
            "\n\n**常用查询语法**：" +
            "\n- `ERROR`: 搜索包含 ERROR 的日志" +
            "\n- `functionName:myFunc AND level:ERROR`: 搜索函数 myFunc 的错误日志" +
            "\n- `timeout OR 超时`: 搜索超时相关日志" +
            "\n- `coldStart OR 冷启动`: 搜索冷启动日志" +
            "\n- `statusCode:>499`: 搜索 5xx 错误" +
            "\n\n**注意**：查询云函数日志时，优先使用 `queryFunctions(action=\"listFunctionLogs\")`"
          ),
        service: z
          .enum(["tcb", "tcbr"])
          .optional()
          .describe(
            "日志来源服务：" +
            "\n- `tcb`: 云函数、数据库、存储等基础服务日志" +
            "\n- `tcbr`: CloudRun 容器服务日志"
          ),
        startTime: z
          .string()
          .optional()
          .describe("查询开始时间，格式：`YYYY-MM-DD HH:mm:ss`，如 `2024-01-01 00:00:00`"),
        endTime: z
          .string()
          .optional()
          .describe("查询结束时间，格式：`YYYY-MM-DD HH:mm:ss`，如 `2024-01-01 23:59:59`"),
        limit: z.number().optional().describe("返回日志条数限制，默认 20"),
        context: z.string().optional().describe("翻页上下文，用于继续上一次查询"),
        sort: z.enum(["asc", "desc"]).optional().describe("按时间排序：`asc` 升序，`desc` 降序"),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "logs",
      },
    },
    async ({
      action,
      queryString,
      service,
      startTime,
      endTime,
      limit,
      context,
      sort,
    }: {
      action: QueryLogAction;
      queryString?: string;
      service?: "tcb" | "tcbr";
      startTime?: string;
      endTime?: string;
      limit?: number;
      context?: string;
      sort?: "asc" | "desc";
    }) => {
      try {
        const cloudbase = await getManager();
        if (action === "checkLogService") {
          const enabled = await cloudbase.log.checkLogServiceEnabled();
          return jsonContent(
            buildEnvelope(
              {
                action,
                enabled,
              },
              enabled ? "日志服务已开通" : "日志服务未开通或仍在初始化中",
            ),
          );
        }

        if (!queryString) {
          throw new Error(
            "action=\"searchLogs\" 时必须提供 queryString 参数。" +
            "\n\n常用查询示例：" +
            "\n- `ERROR`: 搜索所有错误日志" +
            "\n- `functionName:xxx AND level:ERROR`: 搜索特定函数的错误日志" +
            "\n- `timeout`: 搜索超时日志" +
            "\n\n如果需要查询特定云函数的执行日志，建议使用 `queryFunctions(action=\"listFunctionLogs\", functionName=\"xxx\")`"
          );
        }
        const result = await cloudbase.log.searchClsLog({
          queryString,
          StartTime: startTime ?? "1970-01-01 00:00:00",
          EndTime: endTime ?? "2099-12-31 23:59:59",
          Limit: limit ?? 20,
          Context: context,
          Sort: sort,
          service,
        });
        logCloudBaseResult(server.logger, result);
        return jsonContent(
          buildEnvelope(
            {
              action,
              queryString,
              results: result.LogResults ?? null,
              raw: result,
            },
            "日志检索成功",
          ),
        );
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );
}
