import { z } from "zod";
import {
    getCloudBaseManager,
    logCloudBaseResult,
} from "../cloudbase-manager.js";
import { ExtendedMcpServer } from "../server.js";

const CATEGORY = "logs";

type CloudBaseLogServiceLike = {
  searchClsLog: (params: Record<string, unknown>) => Promise<any>;
};

function formatDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function resolveTimeRange(timeRange: string): { startTime: string; endTime: string } {
  if (timeRange.includes(",")) {
    const parts = timeRange.split(",").map((item) => item.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new Error("Invalid timeRange. Use '30m', '1h', '1d' or 'YYYY-MM-DD HH:mm:ss,YYYY-MM-DD HH:mm:ss'.");
    }

    const [startTime, endTime] = parts;
    const start = new Date(startTime);
    const end = new Date(endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new Error("Invalid absolute timeRange. Expected format: YYYY-MM-DD HH:mm:ss,YYYY-MM-DD HH:mm:ss.");
    }
    if (start.getTime() > end.getTime()) {
      throw new Error("Invalid timeRange. startTime must be earlier than endTime.");
    }

    return { startTime, endTime };
  }

  const match = timeRange.match(/^(\d+)(m|h|d)$/);
  if (!match) {
    throw new Error("Invalid timeRange. Use '30m', '1h', '1d' or 'YYYY-MM-DD HH:mm:ss,YYYY-MM-DD HH:mm:ss'.");
  }

  const [, value, unit] = match;
  const durationMap = {
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  } as const;

  const duration = Number(value) * durationMap[unit as keyof typeof durationMap];
  const end = new Date();
  const start = new Date(end.getTime() - duration);

  return {
    startTime: formatDateTime(start),
    endTime: formatDateTime(end),
  };
}

export function registerLogTools(server: ExtendedMcpServer) {
  const cloudBaseOptions = server.cloudBaseOptions;
  const logger = server.logger;
  const getManager = () => getCloudBaseManager({ cloudBaseOptions, mcpServer: server });

  server.registerTool?.(
    "searchLogs",
    {
      title: "搜索日志",
      description: `查询云开发环境日志。queryString 使用 CLS 检索语法，。

## 可检索字段（queryString 中可用）

### 云函数日志
- function_name: 函数名
- request_id: 调用唯一标识
- status_code: 状态码（200=成功，202=START/END中间态需过滤，其他=失败）
- src: system=系统日志(START/END) app=用户代码print日志
- log: 日志正文
- namespace: 环境ID
- qualifier: 版本，通常 $LATEST

### 云托管日志（service 参数传 "tcbr"）
- 全文检索：直接写关键词匹配 __CONTENT__，如 "error" AND "timeout"
- __TAG__.container_name: 服务名+实例，如 __TAG__.container_name:/servername-[0-9]+/
- __TAG__.pod_name: Pod 名称

### 平台日志（按 module 检索，部分支持 eventType/logType 过滤）
- database(云数据库文档型): module:database, eventType: MongoSlowQuery
- rdb(云数据库SQL型): module:rdb, eventType: MysqlFreeze | MysqlRecover | MysqlSlowQuery
- model(数据模型): module:model
- workflow(审批流): module:workflow
- auth(用户权限): module:auth
- llm(大模型): module:llm AND logType:llm-tracelog
- app(应用): module:app, eventType: AppProdPub | AppProdDel
- 网关访问日志: logType:accesslog

## queryString 示例

1. 云函数调用列表（SQL 聚合，结果在 AnalysisRecords）：
   function_name:"myFunc" | select request_id, max(status_code) as status_code where status_code!=202 AND retry_num=0 group by request_id limit 10

2. 仅失败的云函数调用：
   function_name:"myFunc" | select request_id, max(status_code) as status_code, max(ret_msg) as ret_msg where status_code>200 AND status_code!=202 AND retry_num=0 group by request_id limit 10

3. 按 requestId 查日志（sort 设 asc 按时序，支持批量 OR）：
   request_id:("id1" OR "id2")`,
      inputSchema: {
        queryString: z.string().describe("CLS 检索分析语句"),
        timeRange: z.string().describe("时间范围：相对时间如 30m/1h/6h/1d/7d，或绝对时间如 2026-03-10 14:00:00,2026-03-10 15:00:00"),
        limit: z.number().int().min(1).max(1000).optional().describe("返回条数，默认 100，最大 1000"),
        sort: z.enum(["asc", "desc"]).optional().describe("排序方式，默认 desc（最新在前）"),
        context: z.string().optional().describe("分页游标，首次不传，后续透传上次返回的 Context"),
        service: z.string().optional().describe("日志服务标识，云托管场景传 'tcbr'，其他场景不传"),
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
      queryString: string;
      timeRange: string;
      limit?: number;
      sort?: "asc" | "desc";
      context?: string;
      service?: string;
    }) => {
      try {
        const { queryString, timeRange, limit, sort, context, service } = params;
        const { startTime, endTime } = resolveTimeRange(timeRange);
        const cloudbase = await getManager();
        const logService = cloudbase.log as unknown as CloudBaseLogServiceLike;

        const searchParams: Record<string, unknown> = {
          queryString,
          StartTime: startTime,
          EndTime: endTime,
          Limit: limit ?? 100,
          Sort: sort ?? "desc",
        };
        if (context) searchParams.Context = context;
        if (service) searchParams.service = service;

        const result = await logService.searchClsLog(searchParams);
        logCloudBaseResult(logger, result);

        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: true,
              queryString,
              startTime,
              endTime,
              data: result,
            }, null, 2),
          }],
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: `Failed to search logs: ${error instanceof Error ? error.message : String(error)}`,
            }, null, 2),
          }],
        };
      }
    },
  );
}
