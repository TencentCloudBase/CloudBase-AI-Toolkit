/**
 * @cloudbase/platform-kit — headless CloudBase console kit
 */
export type {
  PlatformProvider,
  KitEventName,
} from "./core/provider.js";
export { KIT_EVENTS } from "./core/provider.js";
export type {
  AccessEndpoint,
  DeploymentRecord,
  DeploymentStatus,
  ResourceType,
  EnvFeatureContext,
  TableSummary,
  ColumnSummary,
  RowPage,
  StorageObject,
  AuthStatus,
  EnvItem,
  MetricSeries,
  UsageItem,
  LogEntry,
  EnvInfoView,
  AppAuthConfig,
  AppUser,
  SecretItem,
} from "./core/types.js";
export { EFeatureId, isFeatureAvailable, resolvePostgresEnv } from "./core/features.js";
export { t, createTranslator } from "./i18n/index.js";
export type { Locale, MessageKey } from "./i18n/messages.js";
export { ensureKitStyles, KIT_CSS } from "./theme/styles.js";
export {
  useAsyncResource,
  useAccessEndpoints,
  useDeployments,
  useEnvInfo,
  useMetrics,
  useUsage,
  useTables,
  useRecentLogs,
} from "./hooks/use-platform.js";
export { useFeatureAvailable, useEnvFeatures } from "./hooks/use-feature-available.js";
export {
  useMenu,
  KitProvider,
  useKit,
  EMenuType,
  type MenuRouteId,
  type MenuItem,
  type KitProviderProps,
} from "./hooks/use-menu.js";
export {
  mapAppToEndpoint,
  mapVersionToDeployment,
  normalizeDeployStatus,
  sortDeploymentsNewestFirst,
  normalizeUrl,
  hostFromUrl,
} from "./services/apps-access.js";
export { FeatureGuard } from "./components/FeatureGuard.js";
export { SidebarNav } from "./components/SidebarNav.js";
export { UrlCombobox } from "./components/UrlCombobox.js";
export {
  UrlPreview,
  getRecentDeploys,
  recordDeployUrl,
  type UrlPreviewProps,
  type RecentDeploy,
} from "./components/UrlPreview.js";
export { AccessEndpointsList } from "./components/AccessEndpointsList.js";
export { DeploymentTimeline } from "./components/DeploymentTimeline.js";
export { OverviewPage } from "./components/OverviewPage.js";
export { LogsPage } from "./components/LogsPage.js";
export { ManagerShell } from "./components/ManagerShell.js";
