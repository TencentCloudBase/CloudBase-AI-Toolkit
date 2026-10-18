/**
 * MCP Apps（`ui://` 面板）总开关。
 *
 * 面板是给支持 MCP Apps 的宿主看的；有的宿主不渲染、有的环境只想拿纯工具，
 * 那就把 `ui://` 资源与工具上的 `_meta.ui` 一起摘掉，回到最普通的 MCP server：
 * 工具返回照旧是 JSON 文本，宿主不会为任何卡片留位置。
 *
 * 关闭方式：`CLOUDBASE_MCP_UI=off`（也接受 0 / false / no / disabled）。
 * 默认开启；无法识别的值按开启处理，避免拼错一个词就把面板全关掉。
 */
export function isMcpUiEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.CLOUDBASE_MCP_UI ?? "").trim().toLowerCase();
  return !["off", "0", "false", "no", "disabled"].includes(raw);
}

/**
 * 给工具定义用的 `_meta.ui` 片段：开着时返回 `{ _meta: { ui: { resourceUri } } }`，
 * 关掉时返回空对象——调用点直接展开即可，不需要每处再写一遍 if。
 */
export function mcpUiMeta(uri: string): { _meta?: { ui: { resourceUri: string } } } {
  return isMcpUiEnabled() ? { _meta: { ui: { resourceUri: uri } } } : {};
}
