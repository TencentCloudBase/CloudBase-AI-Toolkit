/**
 * MCP Apps（`ui://` 面板）总开关。
 *
 * **实验性，默认关闭**：不给环境变量就不注册 `ui://` 资源、工具也不带 `_meta.ui`，
 * 宿主看到的就是一个普通 MCP server（返回 JSON 文本）。要用面板得显式打开：
 *
 *   CLOUDBASE_MCP_UI=on      （也接受 1 / true / yes / enabled）
 *
 * 反向值（off / 0 / false / no / disabled）和拼错的值一样，都按关闭处理——
 * 实验期宁可少开，也不要因为一个错字让宿主去拉一堆资源。
 */
export function isMcpUiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.CLOUDBASE_MCP_UI ?? "").trim().toLowerCase();
  return ["on", "1", "true", "yes", "enabled"].includes(raw);
}

/**
 * 给工具定义用的 `_meta.ui` 片段：开着时返回 `{ _meta: { ui: { resourceUri } } }`，
 * 关掉时返回空对象——调用点直接展开即可，不需要每处再写一遍 if。
 */
export function mcpUiMeta(uri: string): { _meta?: { ui: { resourceUri: string } } } {
  return isMcpUiEnabled() ? { _meta: { ui: { resourceUri: uri } } } : {};
}
