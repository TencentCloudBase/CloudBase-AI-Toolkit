export interface McpClientPatchConfig {
  serverName: string;
  transport: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
}

export function buildMcpClientConfig(
  _env: NodeJS.ProcessEnv = process.env,
): McpClientPatchConfig {
  // 不注入任何 CloudBase env：登录走 cloudbase-mcp 自身的 device-code 流程
  // （auth 工具 start_auth device），环境由用户登录后通过 auth set_env 选择。
  // 不设 env 也天然避免了 dsh 的 !!js undefined 崩溃坑。
  return {
    serverName: "cloudbase",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@cloudbase/cloudbase-mcp@latest"],
    env: {},
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
