export const PLUGIN_NAME = "cloudbase-dsh-plugin";
export const PACKAGE_NAME = "@cloudbase/dsh-plugin";
export const DEFAULT_ENV_ID = "ai-share-d2guukyxybb63b206";
export const MCP_PACKAGE = "@cloudbase/cloudbase-mcp@latest";
export const DATA_TABLE_TOOLS = [
  "queryPgDatabase",
  "queryMysqlDatabase",
  "readNoSqlDatabaseContent",
] as const;
export const DEPLOY_TOOLS = ["manageHosting"] as const;
export const DSH_COMPAT = ">=0.1.0-rc.6 <0.2.0";

export function buildMcpPassthroughEnv(
  env: NodeJS.ProcessEnv = process.env,
  fallbackEnvId = DEFAULT_ENV_ID,
): Record<string, string> {
  const envId = env.CLOUDBASE_ENV_ID?.trim() || fallbackEnvId;
  return { CLOUDBASE_ENV_ID: envId };
}
