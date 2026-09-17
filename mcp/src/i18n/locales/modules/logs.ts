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
    "schema.action":
      "操作类型：" +
      "\n- `checkLogService`: 检查 CLS 日志服务是否开通" +
      "\n- `searchLogs`: 搜索 CLS 日志（需要提供 queryString）",
    "schema.queryString":
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
      "\n\n**注意**：查询特定云函数的执行日志时，优先使用 `queryFunctions(action=\"listFunctionLogs\", functionName=\"xxx\")`。",
    "schema.service":
      "日志来源服务：" +
      "\n- `tcb`: 云函数、数据库、存储等基础服务日志" +
      "\n- `tcbr`: CloudRun 容器服务日志",
    "schema.startTime": "查询开始时间，格式：`YYYY-MM-DD HH:mm:ss`，如 `2024-01-01 00:00:00`",
    "schema.endTime": "查询结束时间，格式：`YYYY-MM-DD HH:mm:ss`，如 `2024-01-01 23:59:59`",
    "schema.limit": "返回日志条数限制，默认 20",
    "schema.context": "翻页上下文，用于继续上一次查询",
    "schema.sort": "按时间排序：`asc` 升序，`desc` 降序",
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
    "schema.action":
      "Operation type:" +
      "\n- `checkLogService`: Check whether the CLS log service is enabled" +
      "\n- `searchLogs`: Search CLS logs (requires queryString)",
    "schema.queryString":
      "CLS query statement. **Required when action=\"searchLogs\"** and must strictly follow CLS (Cloud Log Service) syntax; see https://cloud.tencent.com/document/api/876/128127." +
      "\n\n**Cloud function queries**:" +
      "\n- Cloud function logs: `(src:app OR src:system) AND log:\"START RequestId\"`" +
      "\n- Aggregate cloud function request status: `| select request_id, max(status_code) as status where ((request_id='44738f94-16dd-11f1-****' AND retry_num=0) AND retry_num=0) AND status_code!=202 group by request_id, retry_num`" +
      "\n\n**Document database**:" +
      "\n- Document database: `module:database`" +
      "\n- Document database events: `module:database AND eventType:(MongoSlowQuery)` (MongoSlowQuery indicates a slow document database query)" +
      "\n\n**SQL database**:" +
      "\n- SQL database: `module:rdb`" +
      "\n- SQL database events: `module:rdb AND eventType:(MysqlFreeze OR MysqlRecover OR MysqlSlowQuery)` (MysqlFreeze means frozen, MysqlRecover means recovered, and MysqlSlowQuery means a slow query)" +
      "\n\n**Other services**:" +
      "\n- Workflows: `module:workflow`" +
      "\n- Models: `module:model`" +
      "\n- User permissions: `module:auth`" +
      "\n- LLMs: `module:llm AND logType:llm-tracelog`" +
      "\n- Gateway service calls: `logType:accesslog`" +
      "\n- App publish/delete events: `module:app AND eventType:(AppProdPub OR AppProdDel)` (AppProdPub is a publish event and AppProdDel is a delete event)" +
      "\n\nThese are examples only; adjust the query to the actual log content." +
      "\n\n**Note**: To query execution logs for a specific cloud function, prefer `queryFunctions(action=\"listFunctionLogs\", functionName=\"xxx\")`.",
    "schema.service":
      "Log source service:" +
      "\n- `tcb`: Logs from foundational services such as cloud functions, databases, and storage" +
      "\n- `tcbr`: CloudRun container service logs",
    "schema.startTime": "Query start time in `YYYY-MM-DD HH:mm:ss` format, for example `2024-01-01 00:00:00`.",
    "schema.endTime": "Query end time in `YYYY-MM-DD HH:mm:ss` format, for example `2024-01-01 23:59:59`.",
    "schema.limit": "Maximum number of log entries to return; defaults to 20.",
    "schema.context": "Pagination context used to continue the previous query.",
    "schema.sort": "Time sort order: `asc` for ascending or `desc` for descending.",
  },
);
