# 10 菜单可用性门禁报告（platform-kit v3）

> 门禁任务：`926161cb` · 日期：2026-08-21
> 基线：HEAD `95dfb71cb`（批3）+ `b14f8fc2a`（批1）+ `1c880015c`（批2）
> 真机环境：dsh web `http://127.0.0.1:3081`（DeepSeek Harness）· CloudBase 环境 `ai-native-d1ggefhgb8c27e3e8`（生产，postgresql, ap-shanghai）
> 方法：agent-browser 逐菜单点验 + 真实数据截图 + RPC/capi 交叉探测

## 结论（先行）

**❌ 打回。** 10 菜单中 6 个 ❌ 不可用（数据库/存储/云函数/云托管/静态托管/日志）、2 个 ⚠️ 部分可用（网关/设置）、2 个 ✅ 可用（概览/认证）。打回对象：

| 打回给 | 原因 |
|---|---|
| **批1 `36419d89`** | `parseSqlRows` 不解析 ExecutePGSql 字符串化行 → 数据库表列表/行数据/SQL 结果全空、存储（PG bucket）空 |
| **批3 `89b1e443`** | RPC 层方法暴露缺口（typert.ts / remote-service.ts 未暴露 6 类资源方法）→ 云函数/云托管/静态托管/存储假空态；日志 `searchLogs` 字段解析错 → 永远空；网关删除与访问鉴权开关断链；设置认证安全域名空态 |

> 批3 commit message 自称 "Live gate e2e-live: env not bound locally, manual device verification pending on PR #933"——**自认未做真机验证**，测试全绿但 RPC 层未验证，正是门禁要拦截的「测试过了=完成」。

---

## 一、硬指标检查

| # | 检查项 | 结果 | 证据 |
|---|---|---|---|
| 1 | `git grep "前往.*控制台\|CloudBase 控制台" platform-kit/src` | ✅ 0 命中 | 批2 铁律达标 |
| 2 | platform-kit 专用工具名（queryPgDatabase/queryLogs/manageGateway）grep | ✅ 0 命中 | capi-only 铁律达标 |
| 3 | `node platform-kit/scripts/validate-i18n.mjs` | ✅ 255 keys symmetric | zh/en 对称 |
| 4a | platform-kit typecheck | ✅ 0 错 | `npx tsc --noEmit` exit 0 |
| 4b | dsh-plugin typecheck | ✅ 0 错 | `npx tsc --noEmit` exit 0 |
| 4c | platform-kit 测试 | ✅ 43/43 pass | vitest run |
| 4d | dsh-plugin 测试 | ✅ 83/83 pass | vitest run |
| 4e | platform-kit build | ✅ 成功 | build.mjs exit 0 |
| 4f | dsh-plugin build | ✅ 成功 | build.mjs exit 0 |
| 5 | `window.confirm` 全源码扫描 | ✅ 0 命中 | — |
| 6 | `node scripts/capability-sync.mjs --diff` | ✅ 10 域 0 缺失/10 部分 | 脚本线索，不作结论 |

**硬指标全部通过，但真机点验暴露 6 个菜单不可用**——证明硬指标只是必要不充分条件。

---

## 二、逐菜单真机点验

### 1. 概览 — ✅ 可用

| 功能点 | 状态 | 真机证据 |
|---|---|---|
| 环境摘要（EnvId/Region/Runtime） | ✅ | EnvId=ai-native-d1ggefhgb8c27e3e8 · 上海（ap-shanghai）· postgresql |
| 服务数量 | ✅ | Functions 4 / Hosting 1（真实计数） |
| 指标 (24h) | ✅ 空态合理 | 「该环境暂无可展示指标，请确认环境是否有调用量」（不阻断） |
| 用量（本计费周期） | ✅ 空态合理 | 「该环境暂无用量数据」 |
| 访问入口 | ✅ | 4 个真实 URL：ai-blogs / ato-site / ato-web / hosting（*.webapps.tcloudbase.com / *.tcloudbaseapp.com） |
| 部署时间轴 | ✅ | 14 条真实部署记录（ai-blogs/ato-site/ato-web，全部成功状态） |

截图：`/tmp/dsh-gate-overview.png`

### 2. 数据库 — ❌ 不可用（打回批1）

| 功能点 | 状态 | 真机证据 |
|---|---|---|
| 表列表渲染 | ❌ | 46 个表全部显示为 `▸ unknown`（真实表名丢失） |
| 点表看列/索引/RLS | ❌ | 点表后详情区无列数据（只有空 Tab 头） |
| 行数据浏览 | ❌ | RPC `runReadSql` 返回 `{"rows":[{}]}`——行内容全空 |
| SQL 执行 | ❌ | UI 运行 `SELECT 1 AS ok` 只显示列头 `ok`，行值缺失 |

**根因**：`parseSqlRows`（`dsh-plugin/src/server/data-service.ts:2014-2036`）不处理 ExecutePGSql 返回的字符串化行。真实返回 `Rows: ["[\"auth\",\"apikey_token\",\"r\",\"-1\"]"]`（每行是 JSON 字符串），`arr(line)` 对字符串返回 `[]`（`data-service.ts:90-92`）→ 字段全丢 → `name: str(row.name) ?? "unknown"`（`data-service.ts:356`）。影响 listTables / readRows / runReadSql / getTableSchema / listSchemaPolicies 等所有 PG 读路径。

截图：`/tmp/dsh-gate-database.png`、`/tmp/dsh-gate-database-detail.png`、`/tmp/dsh-gate-database-sql.png`

### 3. 存储 — ❌ 不可用（打回批3；PG 分支叠加打回批1）

| 功能点 | 状态 | 真机证据 |
|---|---|---|
| bucket 列表 | ❌ | 「当前环境还没有可展示的存储桶」（空态） |
| 新建 bucket | ❌ | 按钮存在但 RPC 层无 `createStorageBucket` 暴露 |
| 文件浏览/上传/临时链接 | ❌ | 无法进入（无 bucket 列表） |

**根因**：RPC 层缺口（client `dsh-plugin/src/client/lib/typert.ts` 与 host `dsh-plugin/src/server/remote-service.ts:84-143` manifest 均未暴露 `listStorageBuckets` 等）；host `data-service.ts:1550` 有实现但 PG 分支同样走 `parseSqlRows`（叠加根因 #1）。

截图：`/tmp/dsh-gate-storage.png`

### 4. 云函数 — ❌ 不可用（打回批3）

| 功能点 | 状态 | 真机证据 |
|---|---|---|
| 函数列表 | ❌ | 假空态「当前环境还没有云函数」——**环境真实有 4 个函数**（概览页 Functions 4；网关路由「上游资源」下拉列出 fde-demo-api / s5-whitelist-login / ato-public-api / atoPgPermProbe） |
| 函数详情/环境变量/触发器 | ❌ | 无列表可点 |
| invoke 测试 | ❌ | RPC 层无 `invokeFunction` 暴露 |

**根因**：RPC 层未暴露 `listFunctions/getFunction/listFunctionLogs/invokeFunction`（typert.ts 仅有 `listFunctionNames`）；`platform-kit/src/hooks/use-resources.ts:16` optional guard `provider?.listFunctions ? ... : []` 静默返回空态。

截图：`/tmp/dsh-gate-functions.png`

### 5. 云托管 — ❌ 不可用（打回批3）

| 功能点 | 状态 | 真机证据 |
|---|---|---|
| 服务列表 | ❌ | 「当前环境还没有云托管服务」空态 |
| 版本/部署记录/构建日志 | ❌ | 无服务可点 |

**根因**：RPC 层未暴露 `listCloudRunServices/getCloudRunService/listCloudRunDeployRecords/getCloudRunProcessLog/getCloudRunBuildLog`（host `data-service.ts:1408-1477` 有实现，`use-resources.ts:43-72` optional guard 静默空态）。

截图：`/tmp/dsh-gate-cloudrun.png`

### 6. 静态托管 — ❌ 不可用（打回批3）

| 功能点 | 状态 | 真机证据 |
|---|---|---|
| 域名展示 | ❌ | 假空态「当前环境还没有静态托管资源」——**环境真实有 hosting**（概览页 Hosting 1 + 真实域名 `ai-native-...tcloudbaseapp.com`） |
| 文件浏览 | ❌ | 「当前环境无法列出托管文件」错误态 |
| 部署记录 | ❌ | 「暂无数据」 |

**根因**：RPC 层未暴露 `listHostingDomains/listHostingVersions/listHostingObjects`（host 层 `data-service.ts:1477-1612` 有实现）。

截图：`/tmp/dsh-gate-hosting.png`

### 7. 认证 — ✅ 可用

| 功能点 | 状态 | 真机证据 |
|---|---|---|
| 用户列表 | ✅ | 5 条真实用户（UID/名称/邮箱/状态/操作） |
| 分页 | ✅ | 「共 5 条 页 1/1」+ 上一页/下一页 |
| 搜索 | ✅ | 输入 `admin` 过滤出 1 条 ato-e2e-admin-49f95480 |
| 详情抽屉 | ✅ | 点 UID 打开，显示最近登录 2026-08-07T10:24:10Z 等 |
| 禁用/启用 | ✅ | 禁用 → 状态变「已禁用」；启用 → 恢复「正常」（确认弹窗齐全，测试后已恢复原状） |

截图：`/tmp/dsh-gate-auth.png`、`/tmp/dsh-gate-auth-detail.png`、`/tmp/dsh-gate-auth-restored.png`

### 8. 网关 — ⚠️ 部分可用（打回批3）

| 功能点 | 状态 | 真机证据 |
|---|---|---|
| 路由列表 | ✅ | 2 条真实路由（/api/public→ato-public-api、/atoPgPermProbe→atoPgPermProbe）按域名折叠 |
| 添加路由 | ✅ | 真机创建 `/gate-probe → ato-public-api` 成功并出现在列表（字段：域名/路径/上游类型 SCF-WEB_SCF-CBR-STATIC_STORE-LH/上游资源 4 个真实函数/鉴权/启用） |
| 编辑路由 | ⚠️ | 未完整走通（删除失败后未继续；ModifyHTTPServiceRoute 参数与 Create 同构，风险低） |
| 删除路由 | ❌ | 点击删除 → 确认弹窗 → 确认后**无任何效果**（路由仍在）。双重根因：① UI `GatewayPage.tsx:323` `if (!route?.routeId) return` 静默拦截——`mapGatewayRoute` 拿不到 RouteId（`DescribeHTTPServiceRoute` 不返回该字段）；② host `deleteGatewayRoute` 传 `Path`，SDK 定义 `Paths?: string[]`（`mcp/node_modules/@cloudbase/manager-node/types/env/type.d.ts:153`）。真机验证：用 `Paths:['/gate-probe']` 直接调 DeleteHTTPServiceRoute 成功删除 |
| 网关服务总开关 | ✅ | 真机关→开切换成功（checkbox 状态跟随） |
| 访问鉴权开关 | ❌ | 点击无效果（checkbox 不变）。`setGatewayAuthEnabled`（`data-service.ts`）传 `Options:[{Key:"EnableAuth"}]`，API 报 missing `EnableService`；SDK `switchAuth` 用 `Options:[{Key:"serviceswitch"}]` 且 `EnableService` 必填 |
| 绑定域名 | ⚠️ | 抽屉可用，但「证书」下拉恒 `—`（RPC 层未暴露 `listSslCertificates`）→ 无法完成绑定 |
| 域名管理 | ⚠️ | 「暂无数据」（真实域名在路由分组折叠中已展示） |

测试产物 `/gate-probe` 路由已清理（Paths 格式）。

截图：`/tmp/dsh-gate-gateway.png`、`/tmp/dsh-gate-gateway-crud.png`、`/tmp/dsh-gate-gateway-auth-toggle.png`

### 9. 日志 — ❌ 不可用（打回批3）

| 功能点 | 状态 | 真机证据 |
|---|---|---|
| 服务/级别/时间筛选 | ✅ | 全部服务/云函数/云托管/静态托管/数据库/网关 + ERROR/WARN/INFO + 近4h/24h/3天/自定义 |
| CLS 未开通横幅 | ✅ | `checkLogService` 返回 true（已开通），无横幅合理 |
| 查询结果 | ❌ | 查询显示「暂无日志」——但直接调 `SearchClsLog` **真实返回 accesslog**（`{"logType":"accesslog","path":"/v1/rdb/rest/tasks",...}`，2026-08-21 01:25:17，即本门禁 RPC 探测产生的日志） |
| 行展开/CSV | ❌ | 无行可展开 |

**根因**：`searchLogs`（`dsh-plugin/src/server/data-service.ts`）取 `payload.Results ?? payload.logs ?? payload.items`，但 SearchClsLog 真实返回结构是嵌套的 `LogResults.Results`（`{LogResults:{AnalysisRecords,Context,ListOver,Results:[...]}}`）→ 永远解析为空。

截图：`/tmp/dsh-gate-logs.png`

### 10. 设置 — ⚠️ 部分可用（打回批3）

| 功能点 | 状态 | 真机证据 |
|---|---|---|
| 环境信息 | ✅ | EnvId/地域/运行时 postgresql/时区 Asia/Shanghai/云函数数量 4 |
| 网关服务开关 | ✅ | 可切换（同网关页链路） |
| 访问鉴权开关 | ❌ | 不可切换（同网关页断链，Options Key 错） |
| 网关 QPS（近 1h） | ✅ 空态 | 显示 `—` |
| 认证安全域名 | ❌ | 假空态「暂无数据」——直接调 `DescribeAuthDomains` 返回 4+ 真实域名（USER 型 tcloudbaseapp.com + SYSTEM 型 weda.cloud.tencent.com 等）。RPC 层未暴露 `listAuthDomains/deleteAuthDomain`（批3 只加了 host 层） |
| 环境变量 | ⚠️ | 「暂无环境变量」（未进一步验证真实性，见 follow-up） |

截图：`/tmp/dsh-gate-settings.png`

---

## 三、断链根因清单（文件:行）

| # | 根因 | 文件:行 | 影响菜单 |
|---|---|---|---|
| R1 | `parseSqlRows` 不解析 ExecutePGSql 字符串化行（`Rows` 元素是 JSON 字符串，`arr()` 对字符串返回 `[]`） | `dsh-plugin/src/server/data-service.ts:2014-2036`（`arr` at :90） | 数据库、存储（PG） |
| R2 | RPC 层方法暴露缺口：typert.ts client 与 remote-service.ts manifest 未暴露 6 类资源方法（host data-service 全有、shared/types 契约全有、批3 未改 RPC 层） | `dsh-plugin/src/client/lib/typert.ts`、`dsh-plugin/src/server/remote-service.ts:84-143` | 云函数、云托管、静态托管、存储、网关（SSL 证书）、设置（认证域名） |
| R3 | 网关删除：UI 因 routeId 为空静默拦截 + host 参数 `Path` 应为 `Paths[]` | `platform-kit/src/components/gateway/GatewayPage.tsx:323`、`dsh-plugin/src/server/data-service.ts`（deleteGatewayRoute） | 网关 |
| R4 | 网关访问鉴权开关：`Options Key:"EnableAuth"` 不合法 + 缺必填 `EnableService` | `dsh-plugin/src/server/data-service.ts`（setGatewayAuthEnabled） | 网关、设置 |
| R5 | 日志：searchLogs 取 `payload.Results`，真实结构为嵌套 `LogResults.Results` | `dsh-plugin/src/server/data-service.ts`（searchLogs） | 日志 |

## 四、Follow-up 建议（打回修复后复验）

1. R1 修复后需复验：数据库 46 表名称真实、行数据、SQL 结果、存储 PG bucket 列表
2. R2 修复后需复验：云函数/云托管/静态托管/存储四页真实数据 + 网关 SSL 证书下拉 + 设置认证域名
3. R3 修复后需复验：网关删除路由走通（含确认弹窗）
4. R4 修复后需复验：网关/设置访问鉴权开关切换生效
5. R5 修复后需复验：日志查询展示真实 accesslog 行、行展开、CSV 导出
6. 设置页「环境变量」数据源需确认（疑似可展示但未验证）
