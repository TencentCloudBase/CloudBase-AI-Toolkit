/**
 * @cloudbase/dsh-plugin —— 通用平台 UI Kit
 *
 * 目标：对齐 Supabase Platform Kit 的形态 —— 一组坐在云 Management API 之上
 * 的可复用组件，通过可配置的 PlatformProvider 只关心输入输出，不关心底层实现。
 *
 * - provider.ts：PlatformProvider 输入输出协议 + KIT_EVENTS 跨组件事件
 * - components/：ResourceTable / UrlPreview / EnvSelect / DynamicForm / SqlEditor …
 * - hooks/：useTables / useAppUsers / useSecrets 组合层
 * - lib/：通用工具（recent-deploys 最近访问地址）
 *
 * 默认 provider 实现 = cloudbase-data 服务（host 端包装 cloudbase-mcp，可切到 MCP capi）。
 */
export { type PlatformProvider, KIT_EVENTS, type KitEventName } from "./provider.js";
export { ResourceTable, type ResourceTableProps } from "./components/ResourceTable.js";
export { UrlPreview, type UrlPreviewProps } from "./components/UrlPreview.js";
export { EnvSelect, type EnvSelectProps } from "./components/EnvSelect.js";
export { EnvBadge, type EnvBadgeProps } from "./components/EnvBadge.js";
export { Toast, type ToastProps } from "./components/Toast.js";
export { DynamicForm, type DynamicFormProps } from "./components/DynamicForm.js";
export { SqlEditor, type SqlEditorProps } from "./components/SqlEditor.js";
export { SqlCodeBlock, type SqlCodeBlockProps } from "./components/SqlCodeBlock.js";
export { WriteOpCard, type WriteOpCardProps, type WriteOpDecision } from "./components/WriteOpCard.js";
export { SparkChart, type SparkChartProps } from "./components/SparkChart.js";
export { UsersGrowthChart, type UsersGrowthChartProps, bucketUserGrowth } from "./components/UsersGrowthChart.js";
export { SecretsPanel, type SecretsPanelProps } from "./components/SecretsPanel.js";
export { SuggestionsPanel, type SuggestionsPanelProps, buildSuggestions } from "./components/SuggestionsPanel.js";
export { useAsyncResource, useTables, useAppUsers, useSecrets } from "./hooks/use-platform.js";
export { getRecentDeploys, recordDeployUrl, type RecentDeploy } from "./lib/recent-deploys.js";
