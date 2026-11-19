# pgdoc：让文档型数据库请求由 PostgreSQL 承载

**一句话**：启用 `pgdoc` 后，客户端继续用文档型数据库的 SDK / HTTP API，域名、路径、代码都不用改，承载方从文档型数据库换成 PostgreSQL。数据落在 PG 的 `pgdoc_data` schema，不进 `public`。

**什么时候算**：已有文档型数据库应用，想把数据放到 PG 上，且不打算重写业务代码。
**什么时候不算**：新建业务表、要用 SQL / `app.rdb()` / 行级安全策略（RLS）做业务开发——那是 PG 开发路径，走 `../SKILL.md`。

---

## 开启前必须先确认的四件事

| # | 确认什么 | 不确认会怎样 |
| --- | --- | --- |
| 1 | 数据是否已迁移完 | **启用立即生效**：接管后原文档型数据库的数据无法通过 HTTP API 访问 |
| 2 | 影响范围 | 接管是**环境级**的，该环境下所有走文档型数据库 HTTP API 的请求都会切换 |
| 3 | 环境是否已有文档型数据库 | 共存时会二次确认并**清空原文档型数据库的数据**（错误码 `FailedOperation.DocumentFlexdbCoexistence`） |
| 4 | PG 实例状态 | 过渡态（重启中 / 任务执行中）只等待；阻塞态（隔离 / 回收 / 下线）先恢复实例 |

**先用 `queryEnv(action="info", envId=...)` 查两件事**，读 `EnvInfo.RuntimeBackends`：

- `postgresql === false`：环境没有 PG 实例，开通会报 `ResourceNotFound.InstanceNotFound`。先为该环境开通 PostgreSQL，不要重试开通接口。
- `nosql === true`：与文档型数据库共存，到控制台开通（有二次确认），并先确认原数据可以清空。
- **不要从 `RuntimeBackends` 推断 pgdoc 是否已启用**：它只列环境里有哪些数据库资源，不表示文档型请求由谁承载。启用后 `nosql` 可能仍为 `true`。

**这个动作由使用者明确发起，不要自动执行。** 它是不可逆的环境级切换，且可能清空数据。迁移与启用的先后顺序以控制台当前指引为准，先确认再操作。

## 三种开启方式

控制台：Document 编辑器启用 `pgdoc` 插件。

MCP（`callCloudApi`，见 `../../cloud-api-operations/SKILL.md`）：

```json
{
  "service": "tcb",
  "action": "EnablePGDocumentExt",
  "version": "2018-06-08",
  "params": { "EnvId": "env-xxx" }
}
```

CLI（`tcb api` 通用通道）：

```bash
tcb api tcb EnablePGDocumentExt --api-version 2018-06-08 --body '{"EnvId":"env-xxx"}'
```

**只有返回 `Enabled: true` 才算后端确认开通成功。** 已开通的环境不要重复开通；报 `OperationDenied.ResourceAlreadyExists` 时先复核开通状态，再决定是否重试 1 次。

## 开启失败时怎么判

| 报错 | 做法 |
| --- | --- |
| `DocumentLibraryUnavailable` | 共享实例：等平台升级后重试，不要改参或重启；独享实例：给 `shared_preload_libraries` 补 `pgdoc`、`pgdoc_core`（保留原有库）后重启 |
| `DocumentExtensionFilesMissing` / `DocumentDependencyFilesMissing` / `DocumentExtensionUnavailable` | 共享实例：等平台升级；独享实例：升级内核后重试，仍同码就停止重试并联系技术支持 |
| `DocumentFlexdbCoexistence` | 到控制台开通（有二次确认），别用 API 硬开 |
| `InstanceStatusConflict` / `InstanceStatusLimitOpError` | 等实例回到 `running` / `limited run`，不要重复提交 |
| `PGConnectError` / `PGExecuteSqlError` | 查 `pg_extension` 确认是否部分安装，重试 1 次仍失败联系技术支持 |
| `InvalidAction` | 当前环境未开放该接口，不要重试 |
| `AuthFailure.DataSourceOperationAuthFailure` | 配数据库 / 数据源权限后重试，平台不会自动补授权 |

**不要手工执行 `DROP EXTENSION`。** `pgdoc`、`pgdoc_catalog`、`pgdoc_data`、`pgdoc_core`、`pgdoc_internal` 五个 schema 由插件维护，手工改动会让 HTTP API 读写异常。独享实例的改参（`ModifyDBInstanceParameters`）、重启（`RestartDBInstance`）、升级内核（`UpgradeDBInstanceKernelVersion`）会立即影响可用性，放在业务低峰期做。

---

## 按入口怎么走

代码一行不改，但**每个入口该读哪份指引、要注意什么不一样**。下面路径都从本文件所在的 `references/` 目录出发。

| 入口 | 代码怎么改 | 读哪份指引 | 这一路要注意 |
| --- | --- | --- | --- |
| Web JS SDK `app.database()` | 不改 | `../../cloudbase-document-database-web-sdk/SKILL.md` | 集合的 CUSTOM 安全规则不生效，改用四种基础权限或把校验放到云函数 |
| 小程序 `wx.cloud.database()` | 不改 | `../../cloudbase-document-database-in-wechat-miniprogram/SKILL.md` | 同上；小程序 SDK 是 pgdoc 的正式支持入口，不要重写成 SQL |
| 文档型数据库 HTTP API（`nosql`） | 域名、路径、请求体都不改 | `../../http-api-cloudbase/SKILL.md` | 承载方变成 PG，但 OpenAPI 仍按 `nosql` 查，不要换 `mysqldb` |
| 服务端 SDK（`wx-server-sdk` / Node SDK v3 `/admin` / Node SDK v4 gateway `/v1`） | 不改 | 对应 SDK 官方文档 | 初始化只要环境 ID，不需要 PG 连接串 |
| 直接用 SQL 读 PG | 显式写 schema：`select * from pgdoc_data.<collection> order by created_at desc limit 10;` | `../SKILL.md` | 允许直连，权限按 GRANT / RLS 判定，不按集合权限 |
| CLI 导出 / 开通 | `tcb db nosql dump <collection> -e <envId>` 导出；`tcb api tcb EnablePGDocumentExt` 开通 | `../../cloudbase-cli/references/nosql.md` | 导出是迁移第一步，开通是最后一步，中间还要导入与校验 |
| MCP 查环境 / 调云 API | `queryEnv(action="info", envId=...)`；`callCloudApi` | `../../cloud-api-operations/SKILL.md` | 单个公开 Action 用通用通道直调，不需要专用工具 |

**迁移后反而能用了**：16 位与 24 位 `_id`、NaN / Infinity 按标准 EJSON 返回、普通字段 `$oid` 同时匹配原生 ObjectId 与旧嵌入对象（这些在原文档型数据库上受限）。

## 明确「不支持 / 不生效」的能力

按「照着写会不会出错」分组，每条写清什么情况算、什么情况不算，避免把能用的能力一起禁掉。

### A. 写了也不生效：这三类能力直接没有

| 不支持什么 | 什么情况算 | 什么情况不算（别误禁） |
| --- | --- | --- |
| **安全规则（CUSTOM）** | 集合配了自定义安全规则表达式，靠它判读写权限——启用后规则不生效，只能选四种基础权限（读全改本人 / 读写本人 / 只读 / 无权限），按 `_openid` 判归属；或把校验挪到云函数等服务端逻辑里 | 四种基础权限本身是支持的；直接在 PG 里用 GRANT / RLS 管权限也是支持的 |
| **跨请求游标** | 想拿上一次请求返回的游标继续翻页——不返回可持续读取的游标，要在单次请求内读完 | 单次请求内的 `limit()` / 分页仍可用，单请求最多 4096 页 |
| **特殊集合** | `timeseries`、`clustered`、change stream 三类集合 | 普通集合、地理位置集合都支持 |

### B. 不会替你做：跳过就丢数据

| 不做的事 | 后果 / 该做什么 |
| --- | --- |
| **不自动搬迁数据** | 启用 pgdoc 不会把原文档型数据库的数据搬过来。要先按集合导出 JSON / EJSON，再导入 PG，抽样校验后才启用 |
| **不做结构映射** | 文档结构与 PG 表结构并非一一对应。导入前自己定哪些集合落成表、哪些字段落成列或 `jsonb` |
| 数据不进 `public` | 全部落在 `pgdoc_data` schema，查 `public` 查不到数据，不是数据丢了 |

### C. 禁止的操作：做了会破坏插件

- 不要手工执行 `DROP EXTENSION`，也不要删改 `pgdoc` / `pgdoc_catalog` / `pgdoc_data` / `pgdoc_core` / `pgdoc_internal` 五个 schema 里的表、例程、类型。
- 已开通的环境不要重复开通（先复核状态）。
- 实例不在 `running` / `limited run` 时不要改参或重启。

### D. 有前置条件：不做就直接失败

- 地理位置字段查询前**必须先建地理位置索引**；`geoNear` 只接受 `geometry`、`minDistance`、`maxDistance` 三个参数，限制条数要用链式 `limit()`。
- **正则表达式查询无法使用索引**，别指望加索引能救正则过滤。
- 单集合最多 64 个索引（含 `_id`）、复合索引最多 32 个键。

### E. 硬上限：超出直接报错

| 项目 | 上限 |
| --- | --- |
| 单条文档（BSON） | 16 MiB |
| 单次批量写 | 25,000 条 |
| 单集合索引数 | 64 个（含 `_id`） |
| 复合索引键 | 32 个 |
| 单次查询返回 | 默认 50 MiB，经云 API 返回 10 MiB |
| 单请求游标页数 | 4096 页 |
| 事务会话时长 | 30 秒 |
| 导入单批条数 | 1000 条 |

### F. 别把「不是 pgdoc 的活」写成「pgdoc 不支持」

新建业务表、要用 SQL / `app.rdb()` / 行级安全策略做业务开发，走 `../SKILL.md`，不是 pgdoc 的能力缺失。另外云 API 页只列了参数与错误码，没写「环境级接管」「共存清空数据」「只有 `Enabled=true` 才算成功」，通过 API 开通的人尤其要按本页的开启前确认清单走。

---

## 迁移：pgdoc 不会自动搬数据

```
文档型数据库 → 导出 JSON / EJSON → 导入 PG 的 pgdoc_data schema → 抽样校验 → 启用 pgdoc
```

1. 导出：控制台按集合导出，或 CLI `tcb db nosql dump <collection> -e <envId>`，或 SDK / HTTP API 遍历。按集合逐个导出，便于分批校验。EJSON 能保留 `ObjectId`、日期类型。
2. 定映射：文档结构与 PG 表结构**不是一一对应**，先定哪些集合落成表、哪些字段落成列或 `jsonb`。导入方式按量选 DMC / SQL 脚本 / 业务脚本。单批不超过 1000 条。
3. 校验：`select count(*) from pgdoc_data.<collection>;` + 抽样 10 条。
4. 迁移期间暂停写入；保留原文档型数据库数据作回滚依据，业务在 PG 上跑正常后再决定下线。

---

## 参考链接

**产品文档**

| 页 | 链接 |
| --- | --- |
| 插件概述（工作方式 / 五个 schema / 共存 / 启用 / 错误码 / 独享实例） | https://docs.cloudbase.net/database/postgresql/pg-doc |
| 使用 pgdoc（接入 / CRUD / 地理位置 / 事务 / 权限 / 索引 / 限制） | https://docs.cloudbase.net/database/postgresql/pg-doc-usage |
| 数据迁移（导出 / 导入 / 映射 / 校验） | https://docs.cloudbase.net/database/postgresql/pg-doc-migration |

**开通接口与索引**

| 页 | 链接 |
| --- | --- |
| `EnablePGDocumentExt` 云 API 文档 | https://cloud.tencent.com/document/product/876/140402 |
| 云开发 API 概览 | https://cloud.tencent.com/document/product/876/34809 |
| 云开发 API 索引 | https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/api-reference.md |

**相关产品页**

| 主题 | 链接 |
| --- | --- |
| 扩展管理 | https://docs.cloudbase.net/database/postgresql/extensions |
| 支持的扩展 | https://docs.cloudbase.net/database/postgresql/supported-extensions |
| 导入数据 | https://docs.cloudbase.net/database/postgresql/import-data |
| DMC 数据库管理 | https://docs.cloudbase.net/database/postgresql/dmc-data-manage |
| 文档型数据库 HTTP API | https://docs.cloudbase.net/http-api/nosql/nosql-restful-api |
| PostgreSQL 数据权限 | https://docs.cloudbase.net/database/postgresql/data-permission |
| PostgreSQL 数据库 HTTP API | https://docs.cloudbase.net/http-api/pgdb/postgresql-restful-api |

**SDK 参考**

| 主题 | 链接 |
| --- | --- |
| 小程序 SDK 新增数据 | https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/database/add.html |
| JS SDK 数据库 | https://docs.cloudbase.net/api-reference/webv3/database/fetch |
| Node SDK 数据库 | https://docs.cloudbase.net/api-reference/server/node-sdk/database/fetch |
