/**
 * MCP Apps（`ui://` 面板）总开关。
 *
 * **默认开启**，留一个显式关的出口用于回滚：
 *
 *   CLOUDBASE_MCP_UI=off     （也接受 0 / false / no / disabled）
 *
 * **没设置或空串按开启处理**；其余值一律按白名单判定，只认显式开启的那几个
 * （on / 1 / true / yes / enabled）。拼错的值（比如 `of`）仍然按关闭处理——
 * 反过来用「不在关闭列表里就开」的写法，会让一个错字把开关打开，用户以为关了其实开着。
 * 判定方向只能是「白名单放行」，不能是「黑名单拦截」。
 */
export function isMcpUiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.CLOUDBASE_MCP_UI ?? "").trim().toLowerCase();
  // 未配置 → 默认开。这正是这次要改的那一格。
  if (raw === "") {
    return true;
  }
  return ["on", "1", "true", "yes", "enabled"].includes(raw);
}

/**
 * 给工具定义用的 `_meta.ui` 片段：开着时返回 `{ _meta: { ui: { resourceUri } } }`，
 * 关掉时返回空对象——调用点直接展开即可，不需要每处再写一遍 if。
 */
export function mcpUiMeta(uri: string): { _meta?: { ui: { resourceUri: string } } } {
  return isMcpUiEnabled() ? { _meta: { ui: { resourceUri: uri } } } : {};
}
