# @cloudbase/platform-kit

[![npm version](https://img.shields.io/npm/v/@cloudbase/platform-kit.svg)](https://www.npmjs.com/package/@cloudbase/platform-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

无运行时 CloudBase SDK 依赖的平台控制台 kit。宿主实现 `PlatformProvider`，kit 负责渲染环境概览、数据库（含 RLS 与 SQL 编辑器）、认证用户、网关自定义域名与日志查询。

English: [README.md](./README.md)

## 功能清单

- **Provider 驱动 UI** — 可替换 CloudBase / 其他云 / mock；kit 不绑定任何平台专用 MCP 工具
- **v3 资源管理**
  - 数据库深度管理（表、结构、索引、外键）
  - RLS 策略编辑器
  - SQL 编辑器（只读 SQL + 确认后的写/DDL）
  - 网关路由 + 自定义域名
  - 日志查询器（CLS 查询 / 空态 / 未开通）
  - 认证用户搜索与启用/禁用
- **概览** — 环境信息、访问入口、部署时间轴、指标与用量
- **ManagerShell** — 10 项侧边栏控制台
- **i18n** — `zh` / `en`，跟随宿主 `KitProvider` locale
- **capi 数据通道** — 实时数据统一走 `capi(service, action, params)`

## 快速开始

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
          if (route === "settings") return <div>宿主设置页</div>;
          return null;
        }}
      />
    </KitProvider>
  );
}
```

复制 [`src/examples/custom-provider.example.ts`](./src/examples/custom-provider.example.ts)，把 `capi()` 换成你的后端即可。

## PlatformProvider 全量契约

Kit 只消费该接口。可选方法可省略，必选方法必须实现。

### 认证 / 会话

| 方法 | 语义 | 示例返回 |
| --- | --- | --- |
| `authStatus()` | 当前是否持有**有效**凭证。缺凭证、过期或探测失败时 `signedIn` 必须为 false。 | `{ signedIn: true, envId: "env-xxx", message: "已登录", persisted: true }` |
| `startLogin(method?, params?)` | 启动三类登录之一（见下）。 | 见 **三类登录** |
| `authStateChange(listener)` | 订阅状态变化，返回取消订阅函数。 | `() => void` |
| `logout()` | 清除宿主凭证并返回未登录状态。 | `{ signedIn: false, message: "已退出登录", loginOptions: [...] }` |
| `listEnvironments()` | 当前身份可用的环境列表。 | `[{ envId: "env-xxx", alias: "prod", region: "ap-shanghai" }]` |
| `setEnvironment(envId)` | 绑定当前环境，返回更新后的 `AuthStatus`。 | `{ signedIn: true, envId, message: "环境已切换" }` |

### 三类登录

`startLogin(method, params)` 必须覆盖：

1. **`host-injected`** — 宿主（IDE / 插件运行时）已注入凭证，直接返回已登录，不走 OAuth。
2. **`apikey`** — 校验 `params.envId` + `params.apiKey`。缺参或校验失败时 `signedIn: false`。
3. **`device-code`**（默认） — 启动设备码授权。用户完成浏览器步骤前保持 `signedIn: false`，并返回 `verificationUrl` 与 `userCode`。

```ts
await provider.startLogin("host-injected");
// { signedIn: true, authMode: "host-injected", envId: "env-xxx", message: "host-injected session" }

await provider.startLogin("apikey", { envId: "env-xxx", apiKey: "sk-..." });
// 成功: { signedIn: true, authMode: "apikey", envId: "env-xxx" }
// 失败: { signedIn: false, message: "API Key 登录需要 envId 与有效 apiKey" }

await provider.startLogin("device-code");
// {
//   signedIn: false,
//   authMode: "device-code",
//   verificationUrl: "https://...",
//   userCode: "ABCD-1234",
//   message: "请在浏览器完成 device-code 授权"
// }
```

### capi 数据通道

Kit **不会**按名称调用 `manageApps`、`queryFunctions` 等 CloudBase MCP 工具。宿主只需要提供：

```ts
capi?(service: string, action: string, params?: Record<string, unknown>): Promise<unknown>
```

CloudBase 参考实现（`dsh-plugin`）将其映射为 `callCapi("tcb", action, params)`。下面的资源方法应是 `capi` 的薄封装，换云厂商时只换 Provider。

```ts
await provider.capi("tcb", "DescribeEnvs", {});
```

### 环境 / 概览

| 方法 | 语义 | 示例返回 |
| --- | --- | --- |
| `envInfo()` | Overview 页头信息 | `{ envId, regionLabel: "Shanghai", functionCount: 3, hostingDomainCount: 1, timezone: "Asia/Shanghai" }` |
| `listAccessEndpoints()` | 可访问 URL | `[{ id, label, url, resourceType: "app" }]` |
| `listDeployments()` | 聚合部署历史 | `[{ id, resourceType: "app", resourceName, status: "success", deployedAt }]` |
| `rollbackDeployment?(record)` | 可选回滚，不支持返回 `false` | `false` |
| `metrics()` / `usage()` / `fetchMetricSeries(name, opts?)` | 概览图表 | `{ name, label, valueLabel, points: [1, 2] }` |
| `recentErrors()` | 概览错误摘要 | `[{ level: "error", message: "..." }]` |

### 数据库 / SQL / RLS

| 方法 | 语义 | 典型 capi action |
| --- | --- | --- |
| `listTables()` | 表/视图列表 | `ExecutePGSql` |
| `listTableColumns(table)` | 列摘要 | `ExecutePGSql` |
| `readRows(table, opts?)` | 分页行 | `ExecutePGSql` |
| `runReadSql(sql)` | SQL 编辑器只读 | `ExecutePGSql` |
| `getTableSchema(schemaTable)` | 列 + 索引 + 外键 + RLS | `ExecutePGSql` |
| `listSchemaPolicies(schema?)` | schema 下全部策略 | `ExecutePGSql` |
| `runPgDDL(sql, confirm)` | 确认后的写/DDL | `ExecutePGSql` |
| `listPgFunctions?` / `listPgExtensions?` / `listPgRoles?` / `listMigrations?` | 目录页签 | `ExecutePGSql` |
| `upsertPolicy?` / `dropPolicy?` / `toggleTableRls?` | RLS 编辑器 | `ExecutePGSql` |

`runReadSql` 示例：`{ columns: ["ok"], rows: [{ ok: 1 }], total: 1 }`

### 认证用户

| 方法 | 语义 | 典型 capi action |
| --- | --- | --- |
| `appAuthConfig()` / `getAuthLoginConfig?()` | 登录方式 | `DescribeAppAuth` |
| `listAppUsers(opts?)` | 用户分页 | `DescribeUserList` |
| `searchAppUsers(opts?)` | 关键词搜索 | `DescribeUserList` |
| `setAppUserStatus(uid, enabled)` | 启用 / 禁用 | `ModifyUser` |

`searchAppUsers` 示例：`{ users: [], total: 0 }`

### 网关 / 域名

| 方法 | 语义 | 典型 capi action |
| --- | --- | --- |
| `listGatewayRoutes()` | HTTP 路由 | `DescribeHTTPServiceRoute` |
| `upsertGatewayRoute(input)` | 创建/更新 | `CreateHTTPServiceRoute` / `ModifyHTTPServiceRoute` |
| `deleteGatewayRoute(routeId, confirm)` | 删除 | `DeleteHTTPServiceRoute` |
| `getGatewayPrivilege()` | 服务/鉴权开关 | `DescribeCloudBaseGWService` |
| `listCustomDomains?()` | 自定义域名 | `DescribePublicGwDomains` |
| `bindCustomDomain?` / `deleteCustomDomain?` | 绑定 / 解绑 | `CreatePublicGwCustomDomain` / `UnbindPublicGwCustomDomain` |
| `setGatewayServiceEnabled?` / `setGatewayAuthEnabled?` | 网关权限 | `ModifyCloudBaseGWPrivilege` |
| `listFunctionNames?()` | 上游函数列表 | `DescribeFunctions` |

空路由示例：`[]`

### 日志 / 存储 / 密钥

| 方法 | 语义 | 典型 capi action |
| --- | --- | --- |
| `searchLogs(opts)` | CLS 查询 + 分页 `context` | `SearchClsLog` |
| `checkLogService?()` | 是否开通 CLS | `SearchClsLog` 探测 |
| `listStorage(path?)` / `storageUrl(cloudPath)` | 文件列表 / 签名 URL | 宿主 COS 或 CAPI |
| `listSecrets()` | 脱敏环境变量 | `DescribeFunctions` + `GetFunction` |

`searchLogs` 示例：`{ entries: [], context: undefined }`

## 导出清单（`src/index.ts`）

**类型：** `PlatformProvider`、`KitEventName`、`AccessEndpoint`、`DeploymentRecord`、`DeploymentStatus`、`ResourceType`、`EnvFeatureContext`、`TableSummary`、`ColumnSummary`、`RowPage`、`StorageObject`、`AuthStatus`、`LoginMethod`、`LoginOption`、`EnvItem`、`MetricSeries`、`UsageItem`、`LogEntry`、`LogSearchFilters`、`LogSearchResult`、`EnvInfoView`、`AppAuthConfig`、`AppUser`、`SecretItem`、`TableSchemaDetail`、`PolicySummary`、`PolicyInput`、`GatewayRoute`、`GatewayRouteInput`、`GatewayPrivilege`、`PgFunctionRow`、`PgExtensionRow`、`PgRoleRow`、`PgMigrationRow`、`Locale`、`MessageKey`、`MenuRouteId`、`MenuItem`、`KitProviderProps`、`UrlPreviewProps`、`RecentDeploy`

**常量 / 枚举：** `KIT_EVENTS`、`EFeatureId`、`EMenuType`

**i18n / 主题：** `t`、`createTranslator`、`detectLocale`、`ensureKitStyles`、`KIT_CSS`

**Hooks：** `useAsyncResource`、`useAccessEndpoints`、`useDeployments`、`useEnvInfo`、`useMetrics`、`useUsage`、`useTables`、`useRecentLogs`、`useMetricCards`、`useLogsSearch`、`useLogServiceCheck`、`useTableSchema`、`useSchemaPolicies`、`usePgMutation`、`usePgFunctions`、`usePgExtensions`、`usePgRoles`、`usePgMigrations`、`useAuthUsers`、`useSetUserStatus`、`useGatewayRoutes`、`useGatewayPrivilege`、`useGatewayMutations`、`useGatewayDomains`、`useFunctionNames`、`useFeatureAvailable`、`useEnvFeatures`、`useMenu`、`useKit`

**组件：** `KitProvider`、`FeatureGuard`、`SidebarNav`、`UrlCombobox`、`UrlPreview`、`AccessEndpointsList`、`DeploymentTimeline`、`OverviewPage`、`LogsPage`、`LogsExplorerPage`、`DatabasePage`、`AuthUsersPage`、`GatewayPage`、`SparkChart`、`MetricCardsGrid`、`UsageBarsList`、`UsersGrowthChart`、`ManagerShell`

**工具函数：** `isFeatureAvailable`、`resolvePostgresEnv`、`mapAppToEndpoint`、`mapVersionToDeployment`、`normalizeDeployStatus`、`normalizeUrl`、`hostFromUrl`、`sortDeploymentsNewestFirst`、`bucketUserGrowth`、`sqlListSchemaPolicies`、`sqlToggleRLS`、`sqlDropPolicy`、`sqlCreatePolicy`、`sqlAlterPolicy`、`sqlListFunctions`、`sqlListExtensions`、`sqlListRoles`、`getRecentDeploys`、`recordDeployUrl`

样式入口：`import { ensureKitStyles, KIT_CSS } from "@cloudbase/platform-kit/styles"`。

## i18n

- 语言：`zh`（`navigator.language` 以 `zh` 开头时默认）与 `en`
- 在 `KitProvider` / `ManagerShell` 上传 `locale` 即可跟随宿主
- 自定义 UI 可用 `t(locale, key)` 或 `createTranslator(locale)`
- 未传 locale 时 `detectLocale()` 读取宿主环境

## 构建 / 测试 / 类型

```bash
npm install
npm run typecheck
npm test
npm run build
npm pack --dry-run          # 产物必须含 dist/index.d.ts 与 dist/styles.d.ts
npm run consumer-smoke      # 对发布类型跑 tsc --noEmit
```

`npm run build` 先用 esbuild 打 ESM，再用 `tsc -p tsconfig.build.json` 产出声明文件。

## License

MIT
