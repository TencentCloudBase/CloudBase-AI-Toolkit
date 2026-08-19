export const PLUGIN_NAME = "cloudbase-dsh-plugin";
export const PACKAGE_NAME = "@cloudbase/dsh-plugin";
export const MCP_PACKAGE = "@cloudbase/cloudbase-mcp@latest";
export const DATA_TABLE_TOOLS = [
  "queryPgDatabase",
  "queryMysqlDatabase",
  "readNoSqlDatabaseContent",
] as const;
export const DEPLOY_TOOLS = ["manageHosting"] as const;
export const DSH_COMPAT = ">=0.1.0-rc.6 <0.2.0";
