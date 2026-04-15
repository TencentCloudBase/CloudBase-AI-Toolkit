import { z } from "zod";
import { getCloudBaseManager, logCloudBaseResult } from "../cloudbase-manager.js";
import type { ExtendedMcpServer } from "../server.js";
import { jsonContent } from "../utils/json-content.js";

const QUERY_LOG_ACTIONS = ["checkLogService", "searchLogs"] as const;

type QueryLogAction = (typeof QUERY_LOG_ACTIONS)[number];
type LogService = "tcb" | "tcbr";

type ToolEnvelope = {
  success: boolean;
  data: Record<string, unknown>;
  message: string;
};

type SearchClsLogInput = {
  queryString: string;
  service?: LogService;
  startTime?: string;
  endTime?: string;
  limit?: number;
  context?: string;
  sort?: "asc" | "desc";
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

function buildSearchClsLogPayload({
  queryString,
  service,
  startTime,
  endTime,
  limit,
  context,
  sort,
}: SearchClsLogInput) {
  return {
    queryString,
    StartTime: startTime ?? "1970-01-01 00:00:00",
    EndTime: endTime ?? "2099-12-31 23:59:59",
    Limit: limit ?? 20,
    Context: context,
    Sort: sort,
    service,
  };
}

export function registerLogTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions });

  const runSearchClsLog = async (
    input: SearchClsLogInput,
    action: "searchLogs" | "searchClsLog",
    aliasOf?: string,
  ) => {
    const cloudbase = await getManager();
    const result = await cloudbase.log.searchClsLog(buildSearchClsLogPayload(input));
    logCloudBaseResult(server.logger, result);
    return jsonContent(
      buildEnvelope(
        {
          action,
          aliasOf,
          queryString: input.queryString,
          results: result.LogResults ?? null,
          raw: result,
        },
        "日志检索成功",
      ),
    );
  };

  server.registerTool?.(
    "queryLogs",
    {
      title: "查询日志服务",
      description:
        "日志域统一只读入口。支持检查日志服务状态，并通过 action=\"searchLogs\" 调用与 CloudBase Manager `searchClsLog` 对齐的 CLS 检索能力。（原工具名：searchClsLog，为兼容旧 AI 规则可继续使用该名称）",
      inputSchema: {
        action: z.enum(QUERY_LOG_ACTIONS),
        queryString: z.string().optional(),
        service: z.enum(["tcb", "tcbr"]).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        limit: z.number().optional(),
        context: z.string().optional(),
        sort: z.enum(["asc", "desc"]).optional(),
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
      service?: LogService;
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
          throw new Error("action=searchLogs 时必须提供 queryString");
        }

        return await runSearchClsLog(
          {
            queryString,
            service,
            startTime,
            endTime,
            limit,
            context,
            sort,
          },
          "searchLogs",
          "searchClsLog",
        );
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );

  server.registerTool?.(
    "searchClsLog",
    {
      title: "按 requestId 或 CLS 语句搜索日志",
      description:
        "直接暴露 CloudBase Manager `searchClsLog` 能力，适合按 requestId、关键词或完整 CLS 查询语句检索日志。与 queryLogs(action=\"searchLogs\") 等价，但名称更贴近底层能力。",
      inputSchema: {
        queryString: z.string().describe("CLS 查询语句，例如 request_id:\"<requestId>\" 或关键词条件"),
        service: z.enum(["tcb", "tcbr"]).optional(),
        startTime: z.string().optional(),
        endTime: z.string().optional(),
        limit: z.number().optional(),
        context: z.string().optional(),
        sort: z.enum(["asc", "desc"]).optional(),
      },
      annotations: {
        readOnlyHint: true,
        openWorldHint: true,
        category: "logs",
      },
    },
    async ({
      queryString,
      service,
      startTime,
      endTime,
      limit,
      context,
      sort,
    }: SearchClsLogInput) => {
      try {
        if (!queryString) {
          throw new Error("必须提供 queryString");
        }

        return await runSearchClsLog(
          {
            queryString,
            service,
            startTime,
            endTime,
            limit,
            context,
            sort,
          },
          "searchClsLog",
          "queryLogs(action=searchLogs)",
        );
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );
}
