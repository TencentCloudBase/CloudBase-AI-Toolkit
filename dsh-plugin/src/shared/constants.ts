export const PLUGIN_NAME = "cloudbase-dsh-plugin";
export const PACKAGE_NAME = "@cloudbase/dsh-plugin";
export const MCP_PACKAGE = "@cloudbase/cloudbase-mcp@latest";
export const DATA_TABLE_TOOLS = [
  "queryPgDatabase",
  "queryMysqlDatabase",
  "readNoSqlDatabaseContent",
] as const;
/**
 * 返回真实访问 URL 的 CloudBase 工具（统一走 accessUrl / defaultDomain 字段）：
 * 静态托管 / 云托管 / 云函数 HTTP 触发 / 应用 / 网关。
 */
export const URL_TOOLS = [
  "manageHosting",
  "manageCloudRun",
  "manageFunctions",
  "manageApps",
  "manageGateway",
] as const;
/** 兼容旧名：部署即"返回 URL"的一类工具。 */
export const DEPLOY_TOOLS = URL_TOOLS;
export const DSH_COMPAT = ">=0.1.0-rc.6 <0.2.0";
