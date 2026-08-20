# platform-kit 能力对齐矩阵

> 由 `scripts/capability-sync.mjs` 自动生成 · 上次巡检：2026-08-20T00:53
>
> **维护约定**：dev-platform 或 cloudbase-mcp 迭代后重跑本脚本（`node scripts/capability-sync.mjs`），把新增的 ❌/⚠️ 缺口派发为 ATO 任务。不要手改本文件（要改改脚本）。

## 1. 十菜单功能域对齐

| 菜单域 | kit 页面 | 状态 | 功能范围 | dev-platform 对照 |
|---|---|---|---|---|
| overview | OverviewPage | ✅ 已实现 | 概览（用量/告警/访问入口/部署时间轴） | dev-platform 74 文件 |
| database | DatabasePage | ⚠️ 部分 | 数据库（PG schema/RLS/SQL/角色/迁移/备份） | dev-platform 254 文件 |
| storage | StoragePage | ❌ 缺失 | 存储（bucket/文件/安全规则/CDN） | dev-platform 75 文件 |
| auth | AuthUsersPage | ✅ 已实现 | 认证（用户列表/登录方式/MFA） | dev-platform 35 文件 |
| functions | FunctionsPage | ❌ 缺失 | 云函数（列表/详情/触发器/日志） | dev-platform 50 文件 |
| cloudrun | CloudRunPage | ❌ 缺失 | 云托管（服务/版本/部署） | dev-platform 41 文件 |
| hosting | HostingPage | ❌ 缺失 | 静态托管（域名/文件/部署） | dev-platform 50 文件 |
| gateway | GatewayPage | ⚠️ 部分 | 网关（HTTP 开关/域名/路由/安全来源） | dev-platform 54 文件 |
| logs | LogsPage | ⚠️ 部分 | 日志（CLS 查询/函数日志） | dev-platform 5 文件 |
| settings | SettingsPage | ❌ 缺失 | 设置（环境配置/QPS/CDN） | dev-platform 53 文件 |

## 2. MCP 工具清单（能力边界 · 已注册 31 个）

```
auth callCloudApi downloadTemplate envDomainManagement envQuery manageAgents manageAppAuth manageApps manageCloudRun manageDataModel manageEnv manageFunctions manageGateway managePermissions manageStorage modifyDataModel queryAgents queryAppAuth queryApps queryCloudRun queryEnv queryFunctions queryGateway queryLogs queryPermissions queryStorage readNoSqlDatabaseContent readNoSqlDatabaseStructure searchKnowledgeBase writeNoSqlDatabaseContent writeNoSqlDatabaseStructure
```

> capi-only 铁律：kit 内不得调用上述专用工具，一律走 `callCloudApi(service, action, params)`。

## 3. MCP action 枚举（数据层能力）

- **STORAGE_ACTIONS**: `buckets`, `config`, `uploadPlan`, `objectInfo`, `signUpload`, `signDownload`, `createBucket`

## 4. platform-kit 已实现组件（22 个）

- `AccessEndpointsList`
- `AuthParts`
- `AuthUsersPage`
- `DatabasePage`
- `DatabaseParts`
- `DeploymentTimeline`
- `FeatureGuard`
- `GatewayPage`
- `GatewayParts`
- `LogFiltersBar`
- `LogResultsTable`
- `LogsExplorerPage`
- `LogsPage`
- `ManagerShell`
- `MetricCardsGrid`
- `OverviewPage`
- `SidebarNav`
- `SparkChart`
- `SqlEditorPanel`
- `UrlCombobox`
- `UrlPreview`
- `UsageBarsList`

## 5. 已知缺口（巡检结论）

- | database | DatabasePage | ⚠️ 部分 | 数据库（PG schema/RLS/SQL/角色/迁移/备份） | dev-platform 254 文件 |
- | storage | StoragePage | ❌ 缺失 | 存储（bucket/文件/安全规则/CDN） | dev-platform 75 文件 |
- | functions | FunctionsPage | ❌ 缺失 | 云函数（列表/详情/触发器/日志） | dev-platform 50 文件 |
- | cloudrun | CloudRunPage | ❌ 缺失 | 云托管（服务/版本/部署） | dev-platform 41 文件 |
- | hosting | HostingPage | ❌ 缺失 | 静态托管（域名/文件/部署） | dev-platform 50 文件 |
- | gateway | GatewayPage | ⚠️ 部分 | 网关（HTTP 开关/域名/路由/安全来源） | dev-platform 54 文件 |
- | logs | LogsPage | ⚠️ 部分 | 日志（CLS 查询/函数日志） | dev-platform 5 文件 |
- | settings | SettingsPage | ❌ 缺失 | 设置（环境配置/QPS/CDN） | dev-platform 53 文件 |

---
*生成命令：`node scripts/capability-sync.mjs`*
