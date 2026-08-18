import { DEFAULT_ENV_ID, buildMcpPassthroughEnv } from "../shared/constants.js";

export interface McpClientPatchConfig {
  serverName: string;
  transport: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function buildMcpClientConfig(
  env: NodeJS.ProcessEnv = process.env,
): McpClientPatchConfig {
  const passthrough = buildMcpPassthroughEnv(env, DEFAULT_ENV_ID);
  if (Object.values(passthrough).some((value) => value === undefined)) {
    throw new Error("MCP env passthrough must not contain undefined values");
  }
  return {
    serverName: "cloudbase",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@cloudbase/cloudbase-mcp@latest"],
    env: passthrough,
  };
}

export function loginHint(signedIn: boolean): string {
  if (signedIn) {
    return "CloudBase 已复用本机登录态。可直接调用 mcp__cloudbase__* 工具。";
  }
  return [
    "CloudBase 尚未登录。请调用 mcp__cloudbase__auth，action=start_auth，authMode=device。",
    "打开返回的 verification URL，在浏览器完成授权后登录态会持久化，无需 API Key。",
    "不要设置无效的 CLOUDBASE_API_KEY，否则会挡住 device-code 流程。",
  ].join(" ");
}
