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

  async function handleSearchClsLog({
    queryString,
    service,
    startTime,
    endTime,
    limit,
    context,
    sort,
  }: {
    queryString?: string;
    service?: "tcb" | "tcbr";
    startTime?: string;
    endTime?: string;
    limit?: number;
    context?: string;
    sort?: "asc" | "desc";
  }) {
    try {
      if (!queryString) {
        throw new Error("必须提供 queryString");
      }
      const cloudbase = await getManager();
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
  }

  server.registerTool?.(
    "queryLogs",
    {
      title: "查询日志服务",
      description:
        "日志域统一只读入口。支持检查日志服务状态并搜索 CLS 日志。（原工具名：searchClsLog，为兼容旧AI规则可继续使用该名称；action=searchLogs 与 searchClsLog 工具等价）",
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

        return handleSearchClsLog({
          queryString,
          service,
          startTime,
          endTime,
          limit,
          context,
          sort,
        });
      } catch (error) {
        return jsonContent(buildErrorEnvelope(error));
      }
    },
  );

  server.registerTool?.(
    "searchClsLog",
    {
      title: "搜索 CLS 日志",
      description:
        "搜索 CLS 日志的直接入口，与 queryLogs(action=\"searchLogs\") 等价。当已知 CloudBase Manager SDK 的 searchClsLog 方法名时可直接使用此工具。",
      inputSchema: {
        queryString: z.string(),
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
    handleSearchClsLog,
  );
}
