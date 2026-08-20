# platform-kit 能力对齐矩阵

> 由 `scripts/capability-sync.mjs` 自动生成 · 上次巡检：2026-08-20T01:12
>
> **维护约定**：dev-platform 或 cloudbase-mcp 迭代后重跑本脚本（`node scripts/capability-sync.mjs`），把新增的 ❌/⚠️ 缺口派发为 ATO 任务。不要手改本文件（要改改脚本）。
>
> **重要说明**：本矩阵只提供**功能深度线索**（UI 操作数 + API 调用数），不代表对齐结论。真正的功能点对齐必须由执行 agent **深读 dev-platform 源码**逐页列出功能点（按钮/表单/弹窗/交互流），再对照 kit 实现。脚本不能替代源码阅读。

## 1. 十菜单功能域对齐（含功能深度指数）

| 菜单域 | kit 页面 | 状态 | 功能范围 | dev-platform 功能深度 |
|---|---|---|---|---|
| overview | OverviewPage | ⚠️ 部分（功能深度待对齐） | 概览（用量/告警/访问入口/部署时间轴） | 26 UI / 0 API / 74 文件 |
| database | DatabasePage | ⚠️ 部分 | 数据库（PG schema/RLS/SQL/角色/迁移/备份） | 798 UI / 50 API / 254 文件 |
| storage | StoragePage | ⚠️ 部分 | 存储（bucket/文件/安全规则/CDN） | 202 UI / 11 API / 75 文件 |
| auth | AuthUsersPage | ⚠️ 部分（功能深度待对齐） | 认证（用户列表/登录方式/MFA） | 68 UI / 1 API / 35 文件 |
| functions | FunctionsPage | ⚠️ 部分 | 云函数（列表/详情/触发器/日志） | 111 UI / 37 API / 50 文件 |
| cloudrun | CloudRunPage | ⚠️ 部分 | 云托管（服务/版本/部署） | 108 UI / 3 API / 41 文件 |
| hosting | HostingPage | ⚠️ 部分（功能深度待对齐） | 静态托管（域名/文件/部署） | 111 UI / 43 API / 50 文件 |
| gateway | GatewayPage | ⚠️ 部分 | 网关（HTTP 开关/域名/路由/安全来源） | 104 UI / 18 API / 54 文件 |
| logs | LogsPage | ⚠️ 部分 | 日志（CLS 查询/函数日志） | 11 UI / 0 API / 5 文件 |
| settings | SettingsPage | ❌ 缺失 | 设置（环境配置/QPS/CDN） | 85 UI / 17 API / 53 文件 |

> **功能深度解读**：dev-platform 大量功能是 UI/交互层实现的（如 bucket 表单校验、RLS 策略编辑器、上传进度、空态引导），接口层并未增加。UI 操作数反映"这个页面有多少交互功能面"，API 调用数反映"数据层有多少请求点"。两者都要对齐。

## 2. MCP 工具清单（能力边界 · 已注册 31 个）

```
auth callCloudApi downloadTemplate envDomainManagement envQuery manageAgents manageAppAuth manageApps manageCloudRun manageDataModel manageEnv manageFunctions manageGateway managePermissions manageStorage modifyDataModel queryAgents queryAppAuth queryApps queryCloudRun queryEnv queryFunctions queryGateway queryLogs queryPermissions queryStorage readNoSqlDatabaseContent readNoSqlDatabaseStructure searchKnowledgeBase writeNoSqlDatabaseContent writeNoSqlDatabaseStructure
```

> capi-only 铁律：kit 内不得调用上述专用工具，一律走 `callCloudApi(service, action, params)`。

## 3. MCP manager SDK 方法调用（藏得深的真实能力）

- **manager.commonService**: ``
- **manager.env**: `calculatePackageCreatePrice`, `calculatePackageModifyPrice`, `calculatePackageRenewPrice`, `describeBaasPackageList`, `describeBillingInfo`, `describeHttpServiceRoute`, `getEnvInfo`
- **manager.cloudrun**: ``
- **manager.agent**: `createFunctionAgent`
- **manager.database**: `executePGSql`
- **manager.net**: ``
- **manager.storage**: ``

> 工具名只是门面，manager SDK 方法才是数据引擎。对齐时以本表为准，不要只盯着 registerTool 清单。

## 4. MCP action 枚举（数据层能力）

- **STORAGE_ACTIONS**: `buckets`, `config`, `uploadPlan`, `objectInfo`, `signUpload`, `signDownload`, `createBucket`

## 5. platform-kit 已实现组件（27 个）

- `AccessEndpointsList`
- `AuthParts`
- `AuthUsersPage`
- `CloudRunPage`
- `DatabasePage`
- `DatabaseParts`
- `DeploymentTimeline`
- `FeatureGuard`
- `FunctionsPage`
- `GatewayPage`
- `GatewayParts`
- `HostingPage`
- `LogFiltersBar`
- `LogResultsTable`
- `LogsExplorerPage`
- `LogsPage`
- `ManagerShell`
- `MetricCardsGrid`
- `OverviewPage`
- `ResourceParts`
- `SidebarNav`
- `SparkChart`
- `SqlEditorPanel`
- `StoragePage`
- `UrlCombobox`
- `UrlPreview`
- `UsageBarsList`

## 6. 缺口线索（巡检结论 · 需 agent 深读源码确认）

- | overview | OverviewPage | ⚠️ 部分（功能深度待对齐） | 概览（用量/告警/访问入口/部署时间轴） | 26 UI / 0 API / 74 文件 |
- | database | DatabasePage | ⚠️ 部分 | 数据库（PG schema/RLS/SQL/角色/迁移/备份） | 798 UI / 50 API / 254 文件 |
- | storage | StoragePage | ⚠️ 部分 | 存储（bucket/文件/安全规则/CDN） | 202 UI / 11 API / 75 文件 |
- | auth | AuthUsersPage | ⚠️ 部分（功能深度待对齐） | 认证（用户列表/登录方式/MFA） | 68 UI / 1 API / 35 文件 |
- | functions | FunctionsPage | ⚠️ 部分 | 云函数（列表/详情/触发器/日志） | 111 UI / 37 API / 50 文件 |
- | cloudrun | CloudRunPage | ⚠️ 部分 | 云托管（服务/版本/部署） | 108 UI / 3 API / 41 文件 |
- | hosting | HostingPage | ⚠️ 部分（功能深度待对齐） | 静态托管（域名/文件/部署） | 111 UI / 43 API / 50 文件 |
- | gateway | GatewayPage | ⚠️ 部分 | 网关（HTTP 开关/域名/路由/安全来源） | 104 UI / 18 API / 54 文件 |
- | logs | LogsPage | ⚠️ 部分 | 日志（CLS 查询/函数日志） | 11 UI / 0 API / 5 文件 |
- | settings | SettingsPage | ❌ 缺失 | 设置（环境配置/QPS/CDN） | 85 UI / 17 API / 53 文件 |

---
*生成命令：`node scripts/capability-sync.mjs`*
