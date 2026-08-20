# @cloudbase/platform-kit

[![npm version](https://img.shields.io/npm/v/@cloudbase/platform-kit.svg)](https://www.npmjs.com/package/@cloudbase/platform-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Headless CloudBase platform console kit. Hosts implement `PlatformProvider`; the kit renders Overview, Database (including RLS + SQL editor), Auth users, Gateway custom domains, and Logs — with **zero runtime CloudBase SDK dependency**.

中文文档：[README-ZH.md](./README-ZH.md)

## Features

- **Provider-driven UI** — swap CloudBase, another cloud, or a mock; kit never binds to platform-specific MCP tools
- **v3 resource managers**
  - Database deep management (tables, schema, indexes, FKs)
  - RLS policy editor
  - SQL editor (read SQL + confirmed write/DDL)
  - Gateway routes + custom domains
  - Logs explorer (CLS query / empty / not-enabled)
  - Auth users search + enable/disable
- **Overview** — env info, access endpoints, deployment timeline, metrics/usage
- **ManagerShell** — 10-item sidebar console
- **i18n** — `zh` / `en`, follows host `KitProvider` locale
- **capi data channel** — all live data goes through `capi(service, action, params)`

## Quick start

```tsx
import { KitProvider, ManagerShell } from "@cloudbase/platform-kit";
import { createMockPlatformProvider } from "./custom-provider.example";

const provider = createMockPlatformProvider();

export function App() {
  return (
    <KitProvider locale="zh" provider={provider} featureCtx={{ runtimeMode: "postgresql" }}>
      <ManagerShell
        provider={provider}
        renderRoute={(route) => {
          if (route === "settings") return <div>Host settings page</div>;
          return null;
        }}
      />
    </KitProvider>
  );
}
```

Copy [`src/examples/custom-provider.example.ts`](./src/examples/custom-provider.example.ts) and replace `capi()` with your backend.

## PlatformProvider contract

Kit UI only calls this interface. Optional methods may be omitted; required methods must be implemented.

### Auth / session

| Method | Semantics | Example return |
| --- | --- | --- |
| `authStatus()` | Whether the host currently has **valid** credentials. `signedIn` must be false if tokens are missing, expired, or fail a live probe. | `{ signedIn: true, envId: "env-xxx", message: "已登录", persisted: true }` |
| `startLogin(method?, params?)` | Start one of the three login modes (see below). | See **Three login modes** |
| `authStateChange(listener)` | Subscribe to status updates. Returns an unsubscribe function. | `() => void` |
| `logout()` | Clear host credentials and return signed-out status. | `{ signedIn: false, message: "已退出登录", loginOptions: [...] }` |
| `listEnvironments()` | Environments the current identity can use. | `[{ envId: "env-xxx", alias: "prod", region: "ap-shanghai" }]` |
| `setEnvironment(envId)` | Bind the active env; return updated `AuthStatus`. | `{ signedIn: true, envId, message: "环境已切换" }` |

### Three login modes

`startLogin(method, params)` must implement:

1. **`host-injected`** — Host (IDE / plugin runtime) already injected credentials. Return signed-in status immediately; do not start OAuth.
2. **`apikey`** — Validate `params.envId` + `params.apiKey`. Return `signedIn: false` when either is missing or rejected.
3. **`device-code`** (default) — Start device authorization. Keep `signedIn: false` until the user finishes the browser step. Return `verificationUrl` and `userCode` so the host can show them.

```ts
await provider.startLogin("host-injected");
// { signedIn: true, authMode: "host-injected", envId: "env-xxx", message: "host-injected session" }

await provider.startLogin("apikey", { envId: "env-xxx", apiKey: "sk-..." });
// success: { signedIn: true, authMode: "apikey", envId: "env-xxx" }
// failure: { signedIn: false, message: "API Key 登录需要 envId 与有效 apiKey" }

await provider.startLogin("device-code");
// {
//   signedIn: false,
//   authMode: "device-code",
//   verificationUrl: "https://...",
//   userCode: "ABCD-1234",
//   message: "请在浏览器完成 device-code 授权"
// }
```

### capi data channel

The kit does **not** call `manageApps`, `queryFunctions`, or any other CloudBase MCP tool by name. Hosts expose a single escape hatch:

```ts
capi?(service: string, action: string, params?: Record<string, unknown>): Promise<unknown>
```

CloudBase reference adapter (`dsh-plugin`) implements this as `callCapi("tcb", action, params)`. Resource methods below should be thin wrappers around `capi`, so the same kit can target another cloud by swapping the provider.

```ts
await provider.capi("tcb", "DescribeEnvs", {});
```

### Environment / overview

| Method | Semantics | Example return |
| --- | --- | --- |
| `envInfo()` | Header facts for Overview. | `{ envId, regionLabel: "Shanghai", functionCount: 3, hostingDomainCount: 1, timezone: "Asia/Shanghai" }` |
| `listAccessEndpoints()` | Live preview/access URLs. | `[{ id, label, url, resourceType: "app" }]` |
| `listDeployments()` | Aggregated deploy history. | `[{ id, resourceType: "app", resourceName, status: "success", deployedAt }]` |
| `rollbackDeployment?(record)` | Optional rollback; return `false` when unsupported. | `false` |
| `metrics()` / `usage()` / `fetchMetricSeries(name, opts?)` | Charts on Overview. | `{ name, label, valueLabel, points: [1, 2] }` |
| `recentErrors()` | Short error list for Overview. | `[{ level: "error", message: "..." }]` |

### Database / SQL / RLS

| Method | Semantics | Typical capi action |
| --- | --- | --- |
| `listTables()` | Table/view list | `ExecutePGSql` |
| `listTableColumns(table)` | Column summary | `ExecutePGSql` |
| `readRows(table, opts?)` | Paged rows | `ExecutePGSql` |
| `runReadSql(sql)` | SQL editor reads | `ExecutePGSql` |
| `getTableSchema(schemaTable)` | Columns + indexes + FKs + RLS | `ExecutePGSql` |
| `listSchemaPolicies(schema?)` | All policies in schema | `ExecutePGSql` |
| `runPgDDL(sql, confirm)` | Confirmed writes/DDL | `ExecutePGSql` |
| `listPgFunctions?` / `listPgExtensions?` / `listPgRoles?` / `listMigrations?` | Catalog tabs | `ExecutePGSql` |
| `upsertPolicy?` / `dropPolicy?` / `toggleTableRls?` | RLS editor | `ExecutePGSql` |

`runReadSql` example: `{ columns: ["ok"], rows: [{ ok: 1 }], total: 1 }`

### Auth users

| Method | Semantics | Typical capi action |
| --- | --- | --- |
| `appAuthConfig()` / `getAuthLoginConfig?()` | Enabled providers | `DescribeAppAuth` |
| `listAppUsers(opts?)` | User page | `DescribeUserList` |
| `searchAppUsers(opts?)` | Keyword search | `DescribeUserList` |
| `setAppUserStatus(uid, enabled)` | Enable / disable | `ModifyUser` |

`searchAppUsers` example: `{ users: [], total: 0 }`

### Gateway / domains

| Method | Semantics | Typical capi action |
| --- | --- | --- |
| `listGatewayRoutes()` | HTTP routes | `DescribeHTTPServiceRoute` |
| `upsertGatewayRoute(input)` | Create/update | `CreateHTTPServiceRoute` / `ModifyHTTPServiceRoute` |
| `deleteGatewayRoute(routeId, confirm)` | Delete | `DeleteHTTPServiceRoute` |
| `getGatewayPrivilege()` | Service/auth toggles | `DescribeCloudBaseGWService` |
| `listCustomDomains?()` | Custom domains | `DescribePublicGwDomains` |
| `bindCustomDomain?` / `deleteCustomDomain?` | Bind / unbind | `CreatePublicGwCustomDomain` / `UnbindPublicGwCustomDomain` |
| `setGatewayServiceEnabled?` / `setGatewayAuthEnabled?` | Privilege | `ModifyCloudBaseGWPrivilege` |
| `listFunctionNames?()` | Upstream picker | `DescribeFunctions` |

Empty routes example: `[]`

### Logs / storage / secrets

| Method | Semantics | Typical capi action |
| --- | --- | --- |
| `searchLogs(opts)` | CLS search + pagination `context` | `SearchClsLog` |
| `checkLogService?()` | Whether CLS is enabled | `SearchClsLog` probe |
| `listStorage(path?)` / `storageUrl(cloudPath)` | File list / signed URL | host COS or CAPI |
| `listSecrets()` | Masked env vars | `DescribeFunctions` + `GetFunction` |

`searchLogs` example: `{ entries: [], context: undefined }`

## Exports (`src/index.ts`)

**Types:** `PlatformProvider`, `KitEventName`, `AccessEndpoint`, `DeploymentRecord`, `DeploymentStatus`, `ResourceType`, `EnvFeatureContext`, `TableSummary`, `ColumnSummary`, `RowPage`, `StorageObject`, `AuthStatus`, `LoginMethod`, `LoginOption`, `EnvItem`, `MetricSeries`, `UsageItem`, `LogEntry`, `LogSearchFilters`, `LogSearchResult`, `EnvInfoView`, `AppAuthConfig`, `AppUser`, `SecretItem`, `TableSchemaDetail`, `PolicySummary`, `PolicyInput`, `GatewayRoute`, `GatewayRouteInput`, `GatewayPrivilege`, `PgFunctionRow`, `PgExtensionRow`, `PgRoleRow`, `PgMigrationRow`, `Locale`, `MessageKey`, `MenuRouteId`, `MenuItem`, `KitProviderProps`, `UrlPreviewProps`, `RecentDeploy`

**Constants / enums:** `KIT_EVENTS`, `EFeatureId`, `EMenuType`

**i18n / theme:** `t`, `createTranslator`, `detectLocale`, `ensureKitStyles`, `KIT_CSS`

**Hooks:** `useAsyncResource`, `useAccessEndpoints`, `useDeployments`, `useEnvInfo`, `useMetrics`, `useUsage`, `useTables`, `useRecentLogs`, `useMetricCards`, `useLogsSearch`, `useLogServiceCheck`, `useTableSchema`, `useSchemaPolicies`, `usePgMutation`, `usePgFunctions`, `usePgExtensions`, `usePgRoles`, `usePgMigrations`, `useAuthUsers`, `useSetUserStatus`, `useGatewayRoutes`, `useGatewayPrivilege`, `useGatewayMutations`, `useGatewayDomains`, `useFunctionNames`, `useFeatureAvailable`, `useEnvFeatures`, `useMenu`, `useKit`

**Components:** `KitProvider`, `FeatureGuard`, `SidebarNav`, `UrlCombobox`, `UrlPreview`, `AccessEndpointsList`, `DeploymentTimeline`, `OverviewPage`, `LogsPage`, `LogsExplorerPage`, `DatabasePage`, `AuthUsersPage`, `GatewayPage`, `SparkChart`, `MetricCardsGrid`, `UsageBarsList`, `UsersGrowthChart`, `ManagerShell`

**Helpers:** `isFeatureAvailable`, `resolvePostgresEnv`, `mapAppToEndpoint`, `mapVersionToDeployment`, `normalizeDeployStatus`, `normalizeUrl`, `hostFromUrl`, `sortDeploymentsNewestFirst`, `bucketUserGrowth`, `sqlListSchemaPolicies`, `sqlToggleRLS`, `sqlDropPolicy`, `sqlCreatePolicy`, `sqlAlterPolicy`, `sqlListFunctions`, `sqlListExtensions`, `sqlListRoles`, `getRecentDeploys`, `recordDeployUrl`

Styles entry: `import { ensureKitStyles, KIT_CSS } from "@cloudbase/platform-kit/styles"`.

## i18n

- Locales: `zh` (default when `navigator.language` starts with `zh`) and `en`
- Pass `locale` on `KitProvider` / `ManagerShell` to follow the host
- `t(locale, key)` and `createTranslator(locale)` for custom chrome
- `detectLocale()` reads the host environment when locale is omitted

## Build / test / types

```bash
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run          # must include dist/index.d.ts and dist/styles.d.ts
npm run consumer-smoke      # tsc --noEmit against published types
```

`npm run build` bundles ESM with esbuild, then emits declarations with `tsc -p tsconfig.build.json`.

## License

MIT
