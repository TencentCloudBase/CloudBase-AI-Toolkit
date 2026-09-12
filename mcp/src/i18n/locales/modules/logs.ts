import { defineModule } from "../types.js";

export const logs = defineModule(
  {
    title: "查询 CloudBase 日志服务",
    description:
      "CloudBase 日志域统一只读入口。支持检查日志服务状态并搜索 CLS 日志。" +
      "\n\n**重要区分**：" +
      "\n- 查询云函数日志：使用 `queryFunctions(action=\"listFunctionLogs\", functionName=\"xxx\")`" +
      "\n- 查询 CLS 日志（跨服务日志聚合）：使用本工具 `queryLogs(action=\"searchLogs\")`" +
      "\n\n**适用场景**：" +
      "\n- 检查 CLS 日志服务是否开通：`action=\"checkLogService\"`" +
      "\n- 跨服务日志搜索（如搜索所有 ERROR 日志）：`action=\"searchLogs\"`" +
      "\n- 按 CLS 语法检索特定服务的日志：`action=\"searchLogs\", service=\"tcb|tcbr\"`",
    serviceEnabled: "日志服务已开通",
    serviceDisabled: "日志服务未开通或仍在初始化中",
    missingQueryString:
      "action=\"searchLogs\" 时必须提供 queryString 参数（CLS 查询语句，需遵循 CLS 语法规范，参考 https://cloud.tencent.com/document/api/876/128127）。" +
      "\n\n常用查询示例：" +
      "\n- 云函数日志：`(src:app OR src:system) AND log:\"START RequestId\"`" +
      "\n- 文档型数据库：`module:database`" +
      "\n- SQL 型数据库：`module:rdb`" +
      "\n- 网关访问日志：`logType:accesslog`" +
      "\n- 大模型 trace 日志：`module:llm AND logType:llm-tracelog`" +
      "\n\n如果需要查询特定云函数的执行日志，建议使用 `queryFunctions(action=\"listFunctionLogs\", functionName=\"xxx\")`。",
    searchSuccess: "日志检索成功",
  },
  {
    title: "Query CloudBase log service",
    description:
      "Unified read-only entry for the CloudBase logs domain. Supports checking log service status and searching CLS logs." +
      "\n\n**Important distinction**:" +
      "\n- Query cloud function logs: use `queryFunctions(action=\"listFunctionLogs\", functionName=\"xxx\")`" +
      "\n- Query CLS logs (cross-service log aggregation): use this tool `queryLogs(action=\"searchLogs\")`" +
      "\n\n**Use cases**:" +
      "\n- Check whether the CLS log service is enabled: `action=\"checkLogService\"`" +
      "\n- Cross-service log search (e.g. find all ERROR logs): `action=\"searchLogs\"`" +
      "\n- Search logs of a specific service with CLS syntax: `action=\"searchLogs\", service=\"tcb|tcbr\"`",
    serviceEnabled: "Log service is enabled",
    serviceDisabled: "Log service is not enabled or still initializing",
    missingQueryString:
      "The queryString parameter (a CLS query statement following the CLS syntax, see https://cloud.tencent.com/document/api/876/128127) is required when action=\"searchLogs\"." +
      "\n\nCommon query examples:" +
      "\n- Cloud function logs: `(src:app OR src:system) AND log:\"START RequestId\"`" +
      "\n- Document database: `module:database`" +
      "\n- SQL database: `module:rdb`" +
      "\n- Gateway access logs: `logType:accesslog`" +
      "\n- LLM trace logs: `module:llm AND logType:llm-tracelog`" +
      "\n\nTo query execution logs of a specific cloud function, use `queryFunctions(action=\"listFunctionLogs\", functionName=\"xxx\")` instead.",
    searchSuccess: "Log search completed successfully",
  },
);
