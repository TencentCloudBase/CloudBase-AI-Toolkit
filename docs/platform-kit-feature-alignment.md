# platform-kit 功能点级对齐表

> 巡检日期：2026-08-20 · 任务 `39bdc913`  
> 线索脚本：`node scripts/capability-sync.mjs --diff`（10 域 9⚠️ + 1❌）  
> **本表才是对齐结论**：深读 `~/Projects/cloudbase/weda-alternative/apps/dev-platform/src/pages`，对照 kit 组件与 MCP `callCloudApi` / `manager.*`。  
> 自动矩阵 `docs/platform-kit-alignment.md` 不要手改。

## 图例

| 标记 | 含义 |
|---|---|
| ✅ | kit 已实现对应用户路径（可简化 UI） |
| ⚠️ | kit 有入口但交互不完整 / 只读 / 依赖可选 Provider |
| ❌ | kit 无此功能点 |
| 数据源 | kit 铁律一律 `callCloudApi(service, action)`；PG DDL 额外走 `manager.database.executePGSql`（须标 Provider 扩展） |

## 交叉任务

| 任务 | 状态 | 覆盖 |
|---|---|---|
| `035d481c` | in_progress | 云函数/云托管/静态托管/存储 bucket 列表级补齐 |
| 本巡检新派 | pending（需人工 approve） | settings `989e0177` / database `fb78588b` / auth `93e67bab` / gateway `e7a590ec` |

---

## 1. overview

dev-platform：`src/pages/tcb/overview/`（区块：快速开始 / 服务数据 / 最佳实践，无 Tab）。  
kit：`platform-kit/src/components/OverviewPage.tsx`。

| 功能点 | dev-platform 位置 | kit 状态 | 数据源 (capi/manager) | 缺口描述 |
|---|---|---|---|---|
| 环境摘要（EnvId/Region/Runtime） | `tcb/overview/useData.ts:46-58`（产品计数）；kit 用 `envInfo()` | ✅ | capi `tcb/DescribeEnvs`；manager.env.getEnvInfo | — |
| 24h 指标卡 + 刷新 | 控制台概览无同等 MetricCards；用量在服务卡片 | ✅ | capi `tcb/DescribeCurveData`（禁止猜监控 Action） | kit 已有；控制台概览侧更偏 CMS 产品介绍 |
| 计费周期用量条 | 非本页主路径 | ✅ | manager.env.describeBillingInfo / capi 用量 | — |
| 访问入口列表 | 非本页；控制台跳各产品 | ✅ | capi apps/hosting/gateway 聚合 | — |
| 部署时间轴 + 回滚 hook | 非本页 | ⚠️ | capi 各资源部署记录；回滚需对应 Write Action | rollback 仅 optional Provider |
| 服务数量卡片（函数/云托管/轻量） | `IntroServiceCard.tsx:47-53` `useData.ts:22-40` | ❌ | capi `tcb/ListFunctions`；`tcbr/DescribeCloudRunServers` | kit 只在 envInfo 显示 functionCount，无跳转卡片 |
| 快速开始 CMS 按钮 | `IntroFeatureCard.tsx:127-134` | ❌ | 无（路由跳转） | 不要求对齐 CMS；可选降级「前往控制台」 |
| AI 选型 Copilot | `AICopilotButton.tsx:17-22` | ❌ | 无 CAPI | IDE 宿主已有 Agent，不必移植 Copilot 按钮 |
| 最佳实践外链 | `IntroGuideCard.tsx:27-50` | ❌ | 无 | 文档外链，P2 |
| 配额/冻结告警条 | 各产品页 `DescribePostpayQuotaLimit` | ❌ | capi `tcb/DescribePostpayQuotaLimit` | 概览无告警条 |

---

## 2. database

dev-platform：`src/pages/db/postgres/*`、`db/mysql/*`、`db/sql-editor`。  
kit：`database/DatabasePage.tsx` + `DatabaseParts.tsx` + `SqlEditorPanel.tsx`。

| 功能点 | dev-platform 位置 | kit 状态 | 数据源 (capi/manager) | 缺口描述 |
|---|---|---|---|---|
| Schema 内表/视图列表 | `db/postgres/tables/index.tsx:95-399` | ✅ | manager.database.executePGSql（list tables SQL） | — |
| 表结构 / 索引 / FK Tab | data-editor 多 Tab；kit `TableDetailSheet` | ✅ | executePGSql | 无可视化建列向导 |
| RLS 列表 + 开关确认 | `policies/index.tsx:810-818` | ✅ | executePGSql `ALTER TABLE … ENABLE/DISABLE ROW LEVEL SECURITY` | — |
| 创建/编辑 RLS（name/cmd/roles/using/withCheck + SQL 预览） | `policies/index.tsx:703-1123` | ✅ | executePGSql `CREATE/ALTER POLICY` | 无模板面板 |
| 删除 RLS 确认 | `policies/index.tsx:405-418` | ✅ | executePGSql `DROP POLICY` | — |
| SQL 编辑器执行 + 写确认 | `postgres/sql-editor/index.tsx:55-117,387-404` | ✅ | executePGSql | — |
| SQL 角色模拟（anon/authenticated/JWT） | `sql-editor/index.tsx:367-413` | ❌ | executePGSql + `set_config('request.jwt.claims')` | 缺 impersonation |
| 函数/扩展/角色/迁移 **列表** | `functions/index.tsx:27-79` `extensions/index.tsx:70-119` `roles/index.tsx:42-119` `migrations/index.tsx:50-152` | ⚠️ | executePGSql | 只读列表，无 CRUD |
| 新建表 Drawer（列/FK/RLS/CSV） | `tables/index.tsx:364-410` `CreateTableModal.tsx:79+` | ❌ | executePGSql `CREATE TABLE` | 完全缺失 |
| 编辑/复制/删除表 | `tables/index.tsx:251-437` | ❌ | executePGSql | 缺失 |
| 列管理 Drawer | `tables/index.tsx:439-476` | ❌ | executePGSql `ALTER TABLE` | 缺失 |
| 数据编辑器（行 CRUD） | `data-editor/index.tsx:64-80` | ❌ | executePGSql / 行读写 | 缺失 |
| 新建 Schema | `CreateSchemaModal.tsx:25-41` | ❌ | executePGSql `CREATE SCHEMA` | 缺失 |
| Schema 可视化 ER | `schema-visual/` `SchemaGraph.tsx:46-80` | ❌ | executePGSql | P2 |
| 创建/删除角色 | `CreateRolePanel.tsx:27-49` | ❌ | executePGSql `CREATE/DROP ROLE` | 列表只读 |
| 启用/禁用扩展 | `EnableExtensionModal.tsx:20-43` | ❌ | executePGSql + ⚠️ 可能改 `shared_preload_libraries` | 需探活 postgresService |
| 函数 Drawer 创建/编辑 | `FunctionDrawer.tsx:41-60` | ❌ | executePGSql | 列表只读 |
| 备份列表/恢复/手动备份 | `backups/index.tsx:144-314` | ❌ | capi postgres `DescribeBaseBackups` / `RestoreDBInstanceObjects` / `CreateBaseBackup` | ⚠️ 需探活准确 Action 名 |
| PITR | `backups/index.tsx:35-36,283` | ❌ | 控制台一期关闭 | kit 应降级说明「未开放」 |
| 迁移 SQL 只读 Drawer | `migrations/index.tsx:67-89` | ⚠️ | executePGSql | kit 仅列表无 SQL 内容 |
| MySQL 模型/表/账号/备份/回档 | `db/mysql/**` | ❌ | lowcode TDSQL CAPI | **应做 pgOnly 式降级说明页**，禁止半套 TDSQL 占位 |
| 通用 MySQL SQL 编辑器 | `db/sql-editor/index.tsx:186-198` | ❌ | capi `tcb/RunSQL` 类 | 非 PG 环境降级文案即可 |

---

## 3. storage

dev-platform：`src/pages/tcb/storage/`（文件/权限/缓存/CI/审核/自定义域名/PG bucket）。  
kit：`resources/StoragePage.tsx`。  
**列表级补齐已派 `035d481c`，下表仍记录深层缺口。**

| 功能点 | dev-platform 位置 | kit 状态 | 数据源 (capi/manager) | 缺口描述 |
|---|---|---|---|---|
| Bucket 列表点击进入 | PG：`pg-storage` 列表；COS：单桶 | ✅ | capi `tcb/DescribeEnvs` Storages；PG Gateway GET buckets | — |
| 文件浏览 + 面包屑 | `file/index.tsx:107-215` Finder | ✅ | COS listObjects（宿主临时密钥）或 PG objects | — |
| 上传 | `Finder.tsx:487-574` | ⚠️ | COS upload / Gateway upload+sign | 依赖 `uploadStorage`；无进度条 |
| 临时链接打开 | `file/index.tsx:121-163` | ✅ | 签名 URL | 无有效期编辑 |
| ACL 标签 + 自定义 Rule 保存 | `AccessPermissionsCard.tsx:73-164` `ModifySafeRule.tsx:60-103` | ⚠️ | capi `tcb/DescribeStorageSafeRule` `ModifyStorageSafeRule` | 无确认弹窗、无 CDN 防盗链任务轮询 |
| CDN 状态表 | cache 页 | ⚠️ | capi `cdn/TcbCheckResource` | 只读 status |
| **创建 PG bucket**（id/public/file_size_limit/allowed_mime_types） | `pg-storage/operations/BucketFormModal.tsx:48-76,83+` | ❌ | Storage Gateway `POST /storage/v1/buckets/`（非 MCP manager.storage） | kit 仅 degrade「不支持创建」；Provider 有 `createStorageBucket` 未接表单 |
| 编辑/删除 PG bucket | `BucketFormModal.tsx:62-67` `DeleteBucketModal.tsx:28` | ❌ | Gateway PUT/DELETE + executePGSql DROP POLICY | 缺失 |
| 新建文件夹 | `CreateFolder.tsx:15-70` | ❌ | COS putObject directory | 缺失 |
| 单文件/批量删除 | `Finder.tsx:628-666` | ❌ | COS deleteObject(s) | 缺失 |
| 临时链接有效期 | `ModifyAuthentication.tsx:28-93` | ❌ | capi `cdn/TcbModifyAttribute` Authentication.ExpireTime | 缺失 |
| CDN 节点/浏览器缓存规则编辑 | `cache/components/EditCdnCache.tsx:127-161` | ❌ | capi `cdn/TcbModifyAttribute` | 缺失 |
| 刷新 CDN | `RefreshCdn.tsx:37-68` | ❌ | capi `cdn/PurgeUrlsCache` | 缺失 |
| 自定义存储域名 + 切换加速域名 | `custom-domain/custom-domain.tsx:294-567` | ❌ | capi `tcb/ModifyStorageDomain` `CreateCustomCdnDomain` + 网关路由 | 缺失 |
| CI / 内容审核 | `ci/index.tsx` `audit/index.tsx` | ❌ | 外链 COS 控制台 | **降级说明页**（跳转原因：COS 控制台） |
| PG 对象 RLS 策略编辑 | `PolicyFormModal.tsx:119-127` | ❌ | executePGSql on `storage.objects/buckets` | 与 DB RLS 编辑器可复用 |

---

## 4. auth

dev-platform：`src/pages/identity/`。  
kit：`auth/AuthUsersPage.tsx`（用户列表/搜索/启用停用/增长图）。

| 功能点 | dev-platform 位置 | kit 状态 | 数据源 (capi/manager) | 缺口描述 |
|---|---|---|---|---|
| 用户列表 + 刷新 | `identity/user-management/index.tsx:51` | ✅ | capi `lowcode/DescribeWedaUserList` 或 tcb 用户列表 | — |
| 关键词搜索 | header `45-110` | ⚠️ | 同上 QueryWhere | kit 仅前端 filter，未走 `searchAppUsers` 服务端 |
| 启用/冻结 | `all-user/index.tsx:240-245` | ✅ | capi `BatchOperateWedaUserLicense` / 等价 tcb | kit `setAppUserStatus` |
| 14 日增长图 | 控制台无同款 | ✅ | 本地聚合 | — |
| 新建用户 | `edit-dialog` + `CreateUserInfo` | ❌ | capi `tcb/CreateUserInfo` | 缺失 |
| 编辑/删除用户 | `ModifyUserInfo` `DeleteWedaUser` | ❌ | capi tcb/lowcode | 缺失 |
| 用户详情（基本信息/凭证/安全日志/角色） | `identity/user-detail/**` | ❌ | `DescribeUserBasicInfoMgr` `DescribeSecurityActionHistory` | 缺失 |
| 重置密码 | `pwd-modal` `EditUserBasicMgr` | ❌ | capi tcb | 缺失 |
| 匿名登录 / 短信密码 / 邮箱 SMTP | `login-manage/index.tsx:192-719` | ❌ | capi `tcb/ModifyLoginStrategy` `ModifyProvider` | Provider 有 `getAuthLoginConfig` **页面未用** |
| OAuth 身份源 CRUD | `login-oauth/detail.tsx:66-80` | ❌ | `AddProvider` `ModifyProvider` `DeleteProvider` | 缺失 |
| 自定义登录私钥 | `login-manage/index.tsx:434-447` | ❌ | `CreateCustomLoginKey` | 缺失 |
| 短信 MFA 开关 | `mfa-management/index.tsx:77-94` | ❌ | `ModifyLoginStrategy` MfaConfig.Sms | 缺失 |

---

## 5. functions

dev-platform：`src/pages/tcb/scf/`。  
kit：`resources/FunctionsPage.tsx`。  
**列表/详情只读已在 `035d481c` 范围。**

| 功能点 | dev-platform 位置 | kit 状态 | 数据源 (capi/manager) | 缺口描述 |
|---|---|---|---|---|
| 列表搜索 + 点选详情 | `function/index.tsx:59-379` | ✅ | capi `tcb/ListFunctions` `GetFunction` | — |
| 配置 KV（runtime/timeout/memory/handler） | `detail/basicInfo.tsx:28-38` | ⚠️ | `GetFunction` | 只读，无 `UpdateFunctionConfiguration` 表单 |
| 环境变量展示 | basicInfo | ⚠️ | 同上 | 只读 |
| 触发器列表 | basicInfo BatchCreateTrigger 区 | ⚠️ | `ListTriggers` 类 | 只读，无创建 |
| 函数日志 | `scfLogV2.tsx:23-52` | ⚠️ | CLS SearchClsLog / GetFunctionLogs | 有 CLS 降级文案 |
| 测试调用 | `detail/index.tsx:319-401` | ⚠️ | capi `scf/Invoke`（或 tcb InvokeFunction） | degrade + optional `invokeFunction` |
| 新建函数（模板/zip/CLI） | `function/create/*` | ❌ | capi `CreateFunction`；代码 COS | `035d481c` 若只做列表则仍缺 |
| 删除函数（含解绑网关） | `DeleteFunctions.tsx:24-47` | ❌ | `DeleteFunction` + `DeleteCloudBaseGWAPI` | 缺失 |
| 权限安全规则 JSON | `SecurityRules.tsx:35-74` | ❌ | `DescribeSecurityRule` `ModifySecurityRule` | 缺失 |
| 在线代码 / ZIP 更新 / 下载 | `scfCode.tsx:101-324` | ❌ | `DownloadFunction` `UpdateFunctionCode` | IDE 级，可降级「用 CLI/MCP manageFunctions」说明 |
| 版本发布 / 流量 / 删除版本 | `scfVersion.tsx` `PublishVersionModal.tsx:28` `VersionTrafficConfigModal.tsx:155` | ❌ | `PublishVersion` `UpdateAlias` `DeleteFunctionVersion` | 缺失 |
| 层绑定/解绑/排序 | `BindLayer.tsx` `UnbindLayer.tsx` | ❌ | `UpdateFunctionConfiguration` + ListLayers | 缺失 |
| 预置并发 | `scfConcurrency.tsx` | ❌ | Put/DeleteProvisionedConcurrencyConfig | 缺失 |
| 监控曲线 | `scfMonitor.tsx:64-79` | ❌ | `DescribeCurveData` | 可复用 Overview 指标 hook |
| 层独立管理页 | `layer/index.tsx` `EditForm.tsx:102` | ❌ | PublishLayerVersion | P2 / 降级说明 |

---

## 6. cloudrun

dev-platform：`src/pages/platform-run/tcb-service/`。  
kit：`resources/CloudRunPage.tsx`。  
**列表级 `035d481c`。**

| 功能点 | dev-platform 位置 | kit 状态 | 数据源 (capi/manager) | 缺口描述 |
|---|---|---|---|---|
| 服务列表 | `serviceIndex/index.tsx:158-213` | ✅ | capi `tcbr/DescribeCloudRunServers` | MCP dist **无** manager.cloudrun 调用 |
| 版本列表 | `deploy/DeployIndex.tsx:71-258` | ✅ | `DescribeCloudRunServerDetail` | 只读 |
| 部署记录 | 同上 | ✅ | `DescribeCloudRunDeployRecord` | 只读 |
| 进程/构建日志 | `tcb-log/DetailLog.tsx:12-29` `deployDetail` | ⚠️ | `DescribeCloudRunProcessLog` `DescribeCloudRunBuildLog` / CLS | build log 常 degrade |
| 新建/更新服务（Git/镜像/包/模板） | `create/*` | ❌ | `CreateCloudRunServer` `UpdateCloudRunServer` | 缺失；代码/镜像通道需标宿主扩展 |
| 删除服务 | `DeleteServiceModal.tsx:31` | ❌ | `DeleteCloudRunServer` | 缺失 |
| 灰度 / 完成 / 放弃 | `ReleaseGrayModal.tsx:29` | ❌ | `ReleaseGray` `OperateServerManage` | 缺失 |
| 版本回退 | `RollbackModal.tsx:34-45` | ❌ | `SubmitServerRollback` | 缺失 |
| 启动/删除版本、Pod | `DeployIndex.tsx:110-267` | ❌ | `StartVersionInstance` `DeleteCloudRunVersions` | 缺失 |
| 服务配置编辑（CPU/扩缩容/VPC） | `ServerConfigForm.tsx:57-77` | ❌ | `SubmitServerConfigChangeDiff` | 缺失 |
| 自定义域名（CBR 路由） | `setting/SettingIndex.tsx:25-75` | ❌ | 网关 createHTTPServiceRoute | 与 gateway 域重复，应复用 |
| 监控 | `MetricIndex.tsx:28-67` | ❌ | DescribeCurveData Tke* | 需 resourceID=服务名 |
| 在线开发 | `OnlineDev.tsx:8-10` | ❌ | Cloud Editor | **降级说明**（非 kit 职责） |

---

## 7. hosting

dev-platform：`src/pages/static-hosting/`。  
kit：`resources/HostingPage.tsx`。  
**列表级 `035d481c`。**

| 功能点 | dev-platform 位置 | kit 状态 | 数据源 (capi/manager) | 缺口描述 |
|---|---|---|---|---|
| 域名只读列表 | `ConfigInfo.tsx:103-170` | ✅ | capi `DescribeStaticStore` `describeHTTPServiceRoute` | — |
| 文件浏览面包屑 | `HostingFile.tsx:28-47` Finder | ⚠️ | 宿主 COS；kit `listHostingObjects` | hostMissing 降级条 |
| 部署版本只读 | `DeployInfo.tsx:28-45` | ✅ | `describeCloudAppVersionList` | — |
| ZIP/模板/Git 创建应用 | `create/index.tsx:316-504` | ❌ | `createCloudApp` + COS 上传 zip | 缺失 |
| 更新服务 / 删除应用 | `detail/index.tsx:84-92` `DeleteServiceModal.tsx:26-74` | ❌ | `createCloudApp` update / `deleteCloudApp` | 缺失 |
| 删除版本 | `DeployInfo.tsx:48-66` | ❌ | `deleteCloudAppVersion` | 缺失 |
| 部署日志 | `DeployDetail.tsx:54-60` | ❌ | `DescribeCloudRunBuildLog` | 缺失 |
| 绑定自定义域名 / HTTPS | `CreateHostingDomain.tsx:46-141` | ❌ | `createHostingDomain` `modifyHostingDomain` | 缺失 |
| 网站路由（index/redirect） | `DomainRouterConfig.tsx:60-195` | ❌ | COS `putBucketWebsite` | 宿主 COS 扩展 |
| 节点/浏览器缓存 + 刷新 | `NodeCacheConfig.tsx` `RefreshCacheModal.tsx:88-124` | ❌ | `modifyHostingDomainAttribute` `purgeUrlsCache` | 缺失 |
| CLI 说明 Tab | `CliToolsDoc.tsx` | ❌ | 无 | 可做降级文档页 |

---

## 8. gateway

dev-platform：`env/http-access`、`env/domain`、`env/safety-source`。  
kit：`gateway/GatewayPage.tsx`（服务开关 + 路由 CRUD 抽屉）。

| 功能点 | dev-platform 位置 | kit 状态 | 数据源 (capi/manager) | 缺口描述 |
|---|---|---|---|---|
| HTTP 服务总开关 | `HTTPServiceSettings.tsx:47-119` | ✅ | capi `tcb/DescribeCloudBaseGWService` `ModifyCloudBaseGWPrivilege` | — |
| 全局鉴权开关 | 同上 privilege | ✅ | 同上 EnableAuth | — |
| 路由列表（按域名折叠） | `domain-associated-resource/index.tsx` | ✅ | `describeHTTPServiceRoute`；manager.env.describeHttpServiceRoute | — |
| 添加/编辑路由（domain/path/type/upstream/auth/enable） | `OperationColumnRender.tsx:53-72` | ✅ | `createHTTPServiceRoute` / `ModifyCloudBaseGWAPI` | kit 无 Headers、无路由级 QPS |
| 删除路由确认 | `OperationColumnRender.tsx:135-172` | ✅ | `deleteHTTPServiceRoute` | — |
| 添加/编辑/删除自定义域名 | `DomainSettings.tsx:52-60` `CustomDomain.tsx:357-409` | ❌ | `create/modify/deleteHTTPServiceRoute` 域名对象 | Provider `bindCustomDomain` **未接 UI** |
| 启用/停用域名 | `EnableDomain.tsx:22-62` | ❌ | modifyHTTPServiceRoute enable | 缺失 |
| 默认域名开关 | `DefaultDomain.tsx:25-37` | ❌ | 同上 | 缺失 |
| 路由级 QPS | `QPSPolicyModal.tsx:66-80` | ❌ | modifyHTTPServiceRoute QPSPolicy | 缺失 |
| 路由/域名 Headers | `CustomDomain.tsx:367-474` | ❌ | 同上 | 缺失 |
| 跨域安全来源 CRUD | `safety-source/operations/CreateAuthDomain.tsx:37-41` | ❌ | capi `tcb/CreateAuthDomain` `DeleteAuthDomain` + COS CORS | Provider `listSafetyDomains` 未接 UI |
| 移动应用安全来源 | `safetySource.tsx` 已注释 | ❌ | — | 控制台已下线，kit 不必做 |

---

## 9. logs

dev-platform：`platform-run/tcb-log` + 共用 LogSearch。  
kit：`logs/LogsExplorerPage.tsx`。

| 功能点 | dev-platform 位置 | kit 状态 | 数据源 (capi/manager) | 缺口描述 |
|---|---|---|---|---|
| 服务/级别/时间/关键字搜索 | `LogManage.tsx:456-486` | ✅ | capi CLS `SearchClsLog` / tcbr SearchClsLog | — |
| CLS 未开通横幅 | DetailLog + LogSearch | ✅ | `checkLogService` | — |
| 展开行 / CSV 导出 / load more | `LogManage.tsx:351-684` | ✅ | 同上分页 Context | — |
| 自动刷新 5s | `LogManage.tsx:487-511` | ❌ | 同搜索 | P2 |
| JSON 字段加过滤 | `LogManage.tsx:596-646` | ❌ | QueryString | P2 |
| 云托管服务+版本选择器 | `ServiceAndDeploySelector.tsx:23-88` | ❌ | DescribeCloudRunDeployRecord | 可选增强 |
| 业务日志 Modal | `UserConsoleLogModal.tsx:38-123` | ❌ | SearchClsLog usercodelog | P2 |

---

## 10. settings

dev-platform：`env/env-setting`、`env/qps-limit`、`env/customize-cdn`（脚本映射；CDN 实际路由 `/storage/customize-cdn`）。  
kit：**无 `SettingsPage`**。`ManagerShell` default 渲染路由 id 字符串。DSH `renderRoute` 用 `ConfigTab`+`AnalyticsTab` 顶替，**不是**环境设置。

| 功能点 | dev-platform 位置 | kit 状态 | 数据源 (capi/manager) | 缺口描述 |
|---|---|---|---|---|
| 菜单「设置」入口 | kit `use-menu.ts:61` | ⚠️ | — | 有菜单无页面 = 近乎 P1 占位 |
| 修改环境名称 | `env-setting/base-info.tsx:31-54` `edit-form-item.tsx:85-92` | ❌ | capi `tcb/ModifyEnv` alias | 缺失 |
| 环境标签编辑 | `base-info.tsx:61-63` | ❌ | CAM Tag | P2 / 降级「请到控制台」 |
| QPS 超限按量开关 | `QPSControl.tsx:66-200` | ❌ | `tcb/ModifyEnv` customQps | 缺失 |
| 预览状态 Staging | `env-setting/index.tsx:22-77` | ❌ | `tcb/ModifyEnvExtra` Staging on/off | 缺失 |
| 云函数/云托管限频 CRUD | `QPSLimitTable.tsx:60-154` | ❌ | `Create/Modify/DeleteResourceLimitPolicy` | 缺失 |
| 静态托管防盗链/IP 黑白名单/IP 限频 | `StaticHostingSafyControl.tsx:82-400` | ❌ | `cdn/tcbModifyAttribute` | 缺失 |
| OPA 自定义策略编辑 | `OPAPolicyTab.tsx` `CustomPolicyCard.tsx:112-198` | ❌ | `DescribeEnvConfig` `ModifyEnvConfig` userRego | 可先降级说明「语法策略请用控制台」 |
| 自定义 CDN 添加/开关/删除 | `CustomizeCDN.tsx:488-624` | ❌ | `CreateCustomCdnDomain` `ModifyCustomCdnDomain` | 与 storage 域名重叠，设置页可链过去 |
| 套餐/价格计算器 | MCP `manager.env.calculatePackage*` | ❌ | manager.env 价格方法 | 非设置页主路径；kit 不做计费购买 |

---

## MCP 数据层结论（对照矩阵 §3）

从 `~/cloudbase-mcp/node_modules/@cloudbase/cloudbase-mcp/dist/index.cjs` 实扫：

| 域 | 结论 |
|---|---|
| manager.env | ✅ `getEnvInfo` `describeHttpServiceRoute` `describeBaasPackageList` `describeBillingInfo` `calculatePackage*` |
| manager.database | ✅ `executePGSql`（DB/RLS/SQL 写路径） |
| manager.agent | `createFunctionAgent`（与控制台函数页无关） |
| manager.storage / cloudrun / net | **调用为空** → 存储/云托管写操作必须 capi 或宿主 COS/Gateway，禁止幻想 SDK 方法 |
| 工具名 | 31 个 registerTool；kit **禁止**调用专用工具，一律 `provider.capi(service, action, params)` |

⚠️ 需探活（Action 名以控制台 service 封装为准，落地前用 `callCloudApi` 对真实 env 试一次）：备份 `DescribeBaseBackups`、PG Gateway bucket REST、TDSQL 账号接口。

---

## 派发子任务

铁律（已写入各任务 description）：

- capi-only 零豁免：数据与写操作一律 `callCloudApi(service, action, params)`；若必须 manager SDK，显式写 Provider 扩展契约。
- 禁 P1 占位：真实功能或降级说明页（写明原因）。
- 组件测试 + typecheck 0 错 + build + 真机截图贴 PR #933。

| 域 | 处理 |
|---|---|
| functions / cloudrun / hosting / storage 列表 | **不重复派发** → 已有 `035d481c` |
| settings | `989e0177-a8a8-47db-874b-241d65d30903` pending |
| database 写路径 + MySQL 降级 | `fb78588b-7770-494e-90f9-351766ecdb05` pending |
| auth 登录/MFA/用户 CRUD | `93e67bab-0da0-4af4-ae8a-413645147bb6` pending |
| gateway 域名 + 安全来源 | `e7a590ec-71b0-4dc8-8720-8772e95b9922` pending |
| overview 告警、logs 自动刷新 | SUGGESTED_TASKS（P2，无阻塞依赖） |

---

## 巡检方法备忘

```bash
node scripts/capability-sync.mjs --diff
# 然后深读 DEV_PLATFORM/src/pages/<domain>，不要把 UI 次数当成功能点数
```
