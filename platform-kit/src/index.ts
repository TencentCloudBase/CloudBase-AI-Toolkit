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
  LoginMethod,
  LoginOption,
  EnvItem,
  MetricSeries,
  UsageItem,
  LogEntry,
  LogSearchFilters,
  LogSearchResult,
  EnvInfoView,
  AppAuthConfig,
  AppUser,
  SecretItem,
  TableSchemaDetail,
  PolicySummary,
  PolicyInput,
  GatewayRoute,
  GatewayRouteInput,
  GatewayPrivilege,
  PgFunctionRow,
  PgExtensionRow,
  PgRoleRow,
  PgMigrationRow,
  CloudFunctionSummary,
  CloudFunctionDetail,
  CloudRunService,
  HostingDomain,
  StorageBucket,
} from "./core/types.js";
export { EFeatureId, isFeatureAvailable, resolvePostgresEnv } from "./core/features.js";
export { t, createTranslator, detectLocale } from "./i18n/index.js";
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
export { useMetricCards } from "./hooks/use-metrics.js";
export { useLogsSearch, useLogServiceCheck } from "./hooks/use-logs-search.js";
export {
  useTableSchema,
  useSchemaPolicies,
  usePgMutation,
  usePgFunctions,
  usePgExtensions,
  usePgRoles,
  usePgMigrations,
} from "./hooks/use-database.js";
export { useAuthUsers, useSetUserStatus } from "./hooks/use-auth-users.js";
export {
  useGatewayRoutes,
  useGatewayPrivilege,
  useGatewayMutations,
  useGatewayDomains,
  useFunctionNames,
} from "./hooks/use-gateway-routes.js";
export { useFunctions, useCloudRunServices, useStorageBuckets, useHostingDomains } from "./hooks/use-resources.js";
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
  normalizeUrl,
  hostFromUrl,
  sortDeploymentsNewestFirst,
} from "./services/apps-access.js";
export { bucketUserGrowth } from "./utils/insights.js";
export {
  sqlListSchemaPolicies,
  sqlToggleRLS,
  sqlDropPolicy,
  sqlCreatePolicy,
  sqlAlterPolicy,
  sqlListFunctions,
  sqlListExtensions,
  sqlListRoles,
} from "./pg/sql.js";
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
export { LogsPage, LogsExplorerPage } from "./components/LogsPage.js";
export { DatabasePage } from "./components/database/DatabasePage.js";
export { AuthUsersPage } from "./components/auth/AuthUsersPage.js";
export { GatewayPage } from "./components/gateway/GatewayPage.js";
export { FunctionsPage } from "./components/resources/FunctionsPage.js";
export { CloudRunPage } from "./components/resources/CloudRunPage.js";
export { HostingPage } from "./components/resources/HostingPage.js";
export { StoragePage } from "./components/resources/StoragePage.js";
export { SparkChart } from "./components/charts/SparkChart.js";
export { MetricCardsGrid } from "./components/charts/MetricCardsGrid.js";
export { UsageBarsList } from "./components/charts/UsageBarsList.js";
export { UsersGrowthChart } from "./components/auth/AuthParts.js";
export { ManagerShell } from "./components/ManagerShell.js";
