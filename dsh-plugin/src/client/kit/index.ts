/**
 * @cloudbase/dsh-plugin —— 通用平台 UI Kit
 *
 * 目标：对齐 Supabase Platform Kit 的形态 —— 一组坐在云 Management API 之上
 * 的可复用组件，通过可配置的 PlatformProvider 只关心输入输出，不关心底层实现。
 *
 * - provider.ts：PlatformProvider 输入输出协议 + KIT_EVENTS 跨组件事件
 * - components/：通用组件（ResourceTable / UrlPreview / EnvSelect …）
 * - lib/：通用工具（recent-deploys 最近访问地址）
 *
 * 默认 provider 实现 = cloudbase-data 服务（host 端包装 cloudbase-mcp，可切到 MCP capi）。
 */
export { type PlatformProvider, KIT_EVENTS, type KitEventName } from "./provider.js";
export { ResourceTable, type ResourceTableProps } from "./components/ResourceTable.js";
export { UrlPreview, type UrlPreviewProps } from "./components/UrlPreview.js";
export { EnvSelect, type EnvSelectProps } from "./components/EnvSelect.js";
export { getRecentDeploys, recordDeployUrl, type RecentDeploy } from "./lib/recent-deploys.js";
