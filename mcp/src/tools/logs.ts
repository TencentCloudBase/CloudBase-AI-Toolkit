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
            "CLS 查询语句，**action=\"searchLogs\" 时必填**，需严格遵循 CLS（Cloud Log Service）语法规范，详见 https://cloud.tencent.com/document/api/876/128127" +
            "\n\n**云函数相关查询**：" +
            "\n- 云函数日志：`(src:app OR src:system) AND log:\"START RequestId\"`" +
            "\n- 聚合云函数请求状态：`| select request_id, max(status_code) as status where ((request_id='44738f94-16dd-11f1-****' AND retry_num=0) AND retry_num=0) AND status_code!=202 group by request_id, retry_num`" +
            "\n\n**云数据库 / 文档型**：" +
            "\n- 云数据库（文档型）：`module:database`" +
            "\n- 云数据库（文档型）事件：`module:database AND eventType:(MongoSlowQuery)`（MongoSlowQuery 为文档型数据库慢查询事件）" +
            "\n\n**云数据库 / SQL 型**：" +
            "\n- 云数据库（SQL 型）：`module:rdb`" +
            "\n- 云数据库（SQL 型）事件：`module:rdb AND eventType:(MysqlFreeze OR MysqlRecover OR MysqlSlowQuery)`（MysqlFreeze 冻结、MysqlRecover 恢复、MysqlSlowQuery 慢查询）" +
            "\n\n**其它服务**：" +
            "\n- 审批流：`module:workflow`" +
            "\n- 模型：`module:model`" +
            "\n- 用户权限：`module:auth`" +
            "\n- 大模型：`module:llm AND logType:llm-tracelog`" +
            "\n- 网关服务调用：`logType:accesslog`" +
            "\n- 应用发布/删除事件：`module:app AND eventType:(AppProdPub OR AppProdDel)`（AppProdPub 发布事件、AppProdDel 删除事件）" +
            "\n\n以上仅为示例，实际使用时请根据具体日志内容调整。" +
            "\n\n**注意**：查询特定云函数的执行日志时，优先使用 `queryFunctions(action=\"listFunctionLogs\", functionName=\"xxx\")`。"
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
            "action=\"searchLogs\" 时必须提供 queryString 参数（CLS 查询语句，需遵循 CLS 语法规范，参考 https://cloud.tencent.com/document/api/876/128127）。" +
            "\n\n常用查询示例：" +
            "\n- 云函数日志：`(src:app OR src:system) AND log:\"START RequestId\"`" +
            "\n- 文档型数据库：`module:database`" +
            "\n- SQL 型数据库：`module:rdb`" +
            "\n- 网关访问日志：`logType:accesslog`" +
            "\n- 大模型 trace 日志：`module:llm AND logType:llm-tracelog`" +
            "\n\n如果需要查询特定云函数的执行日志，建议使用 `queryFunctions(action=\"listFunctionLogs\", functionName=\"xxx\")`。"
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
