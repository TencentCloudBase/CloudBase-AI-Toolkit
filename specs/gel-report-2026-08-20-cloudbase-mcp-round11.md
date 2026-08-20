# 目标演进闭环（GEL）审视报告 2026-08-20 早 — CloudBase-MCP（round11）

> 任务：`dcb26ccc-00d7-4ccb-8c40-4ca64f4c9bd2`  
> 审视时间：2026-08-20 10:40（北京）  
> 前置：round10（`a3e4ec02`，2026-08-19 22:34）  
> 范围：CloudBase-MCP（`dab4f6ac`）3 个 active goal（不含 PG 评测 `21c6e5d7`）

## 一、阶段1 盘点（Recon）

### Goals（status=active AND project_id=dab4f6ac，本模板仅 3 个）

| goal_id | 标题 | round10 pct | 本轮回写 |
|---------|------|------------|----------|
| `47644538` | 功能对齐 CLI 与 Manager SDK | 38% | → **38%** |
| `db980bd8` | 市场覆盖 | 28% | → **28%** |
| `0b2daecd` | 使用数据表现提升 | 42% | → **42%** |

### 近 30 天 goal 关联任务（生产 PG，deleted_at IS NULL）

| goal | done | pending | cancelled | 相对 round10 变化 |
|------|------|---------|-----------|------------------|
| 功能对齐 | 3 | **3** | 4 | pending +1（`30fe065b` slow-query 仍待审） |
| 市场覆盖 | 8 | 1 | 2 | 无新 done；`97411460` DSH 仍待审 |
| 数据表现 | 6 | **4** | 3 | pending +1（`1d2a4d69` 发版复验仍待审） |

**自 round10 以来 delta**

- 无新 done / cancelled（仅 round10 当晚新建的 2 条仍 pending）
- 功能 pending：`d3ade75b` sandbox、`2a9e711f` backup、`30fe065b` slow-query
- 市场 pending：`97411460` DSH（`91daac76` Kimi 仍 **未挂 goal_id**）
- 数据 pending：`f53ad9d6` overrun、`cb38ada0` callCloudApi Action、`c1c78e46` ModifyLoginConfig、`1d2a4d69` npm 发版复验
- 未挂本 goal 但相关：`f7106baf` 版本灰度、`7d35192b` AUTH 引导、`5f762ef8` 同参短路

**主阻塞**：人工审批积压（goal 挂接 **8** 条 pending）+ 灯塔日更 OA 登录（`e4936a01` 周更、Datainsight 不可达）。

**ELL 过滤（rejected / 先不处理 / 已有待批）**

- destroy / fn copy / 预置并发 / tool_errors 断档 / CodeX / VPC：不重建
- backup / sandbox / slow-query / DSH / overrun / callCloudApi Action / ModifyLoginConfig / 发版复验：已有 pending，不重复开
- mcp.so `a7d8035a` cancelled：不重建
- PlatformKit「不用了」系列：不重建
- OpenCode / Composio / Grok / Copilot / Smithery / PulseMCP：延伸 lesson 7–14 天后再 poll

## 二、阶段2 差距分析（Gap + 产物巡检）

### 2a. 功能对齐（SDK `@cloudbase/manager-node` **5.6.6** / CLI **3.7.2** / tools.json；npm **2.28.1**）

| 能力 | CLI/SDK | MCP | 状态 |
|------|---------|-----|------|
| cloudrun traffic/records/imageUrl | ✅ | ✅ | 已闭合 |
| env usage/metrics | ✅ | ✅ `queryEnv` | 已闭合 |
| MySQL backup | ✅ `tcb db backup` + SDK | ❌ | `2a9e711f` **待审** |
| MySQL slow-query | ✅ `tcb db monitor slow-query` + SDK | ❌ | `30fe065b` **待审** |
| sandbox/aiModel | ✅ `tcb sandbox` + SDK | ❌ | `d3ade75b` **待审** |
| fn publish-version | ✅ `tcb fn publish-version` | ❌ | `f7106baf` 待审（**未挂本 goal**） |
| **MySQL error logs** | ✅ SDK `describeInstanceErrorLogs`；CLI monitor **仅** slow-query | ❌ `queryMysqlDatabase` 6 action 无 errorLogs | **本轮新缺口** |
| VPC/destroy/copy/预置并发 | ✅ | ❌ | 已拒或 cancelled，搁置 |

`queryMysqlDatabase` 当前 action：`runQuery/describeCreateResult/describeTaskStatus/getInstanceInfo/describeInstance/getConnectionInfo`。  
errorLogs 与 slow-query 同属 CynosDB 日志只读面，符合 2026-08-14 imageUrl 反例（SDK 一等方法未进 MCP schema）。

### 2b. 市场覆盖（live 巡检 2026-08-20 早）

| 渠道 | 状态 | 证据 |
|------|------|------|
| awesome-mcp | ✅ | punkpeye README L569 CloudBase-AI-ToolKit |
| Official MCP Registry | ✅ | `io.github.TencentCloudBase/cloudbase-mcp` **v2.28.1** isLatest（含 packages npm） |
| OpenCode 社区市场 | ⏳ | `e35020ab` done；合并 live 核验仍缺（`7acda65e` 已 cancel） |
| awesome-dsh-plugin | ❌ 0 CloudBase | count.json **1650**（round10 约 1472，**+178**）；窗口继续扩大 |
| DSH 落地 | ⏳ | `97411460` 待审；本仓 `dsh-plugin/` + 分支 `feat/dsh-plugin` 开发中 |
| Kimi Code/Work | ⏳ | `91daac76` pending（无 goal_id） |
| **Cursor Marketplace** | ❓ 未核验 listed | cursor.com/marketplace 200；历史 GEL 未开此渠道 |
| mcp.so / Smithery / PulseMCP / Composio / Grok | ⏳/❌ | 与 round10 一致，不重复开 |

**本轮市场结论**：DSH 规模继续涨且仍 0 占位 → **优先批 `97411460`**；本轮只衍生独立新渠道（Cursor Marketplace），不拆 DSH 依赖链。

### 2c. 数据表现（灯塔实测）

**数据源**：`beacon_history.sqlite` snapshot `2026-08-17T02:31:06Z`（与 round10 相同）。  
- `daily_time_series`：`tool_calls` 最晚 **08-14**（半日/不完整，errors=0 不可比）；`tool_errors`/`errors` 最晚 **08-13**。  
- **灯塔 Datainsight 自助 SQL**：未能新拉。README 记录 Chrome Default `tof_auth` 已于 2026-08-14 过期；补跑任务 `e4936a01` 仍 pending。本轮对比仍用 snapshot 内 08-11→08-13。

**全量 errors 趋势（latest snapshot SUM）**

| 日期 | tool_calls | tool_errors | 总报错率 |
|------|------------|-------------|----------|
| 08-11 | 142,193 | 25,164 | 17.7% |
| 08-12 | 156,515 | 28,323 | 18.1% |
| 08-13 | 144,933 | 16,619 | **11.5%** ↓ |
| 08-14 | 36,130 | （无 tool_errors 日） | 不可比 |

**工具报错率（errors/calls）**

| 工具 | 08-11 | 08-12 | 08-13 | 结论 |
|------|-------|-------|-------|------|
| readNoSqlDatabaseContent | 55.6% | 59.9% | 47.0% | 仍头号 → `f53ad9d6` 待审 |
| callCloudApi | 37.2% | 32.5% | 18.5% | 下降仍高 → `cb38ada0` 待审 |
| deleteFiles | — | 15.4% | 17.2% | 未挂本 goal |
| manageCloudRun | 23.8% | 20.9% | 13.3% | 下降 |
| **queryPgDatabase** | — | — | **244 errors / 6489 calls ≈ 3.8%** | **进入 errors Top3** |
| writeNoSqlDatabaseContent | 3.2% | 2.2% | 1.5% | **闭环维持** |

**08-13 errors 维 Top**

| 错误 | 次数 | 覆盖 |
|------|------|------|
| 未登录 AUTH | 14,042 | `7d35192b` 待审（**未挂 goal**） |
| 未绑环境 | 129 | 同上 |
| Query projection illegal | 125 | `636a3578` done，待发版复验 |
| Updating 态配置失败 | 80 | `4fb1eeb8` done，待发版复验 |
| **ExecutePGSql syntax error at `;`** | **34** | **本轮新引导缺口** |
| 云托管未开通 | 34 | 既有引导 |
| CODING BuildLog | 22 | `18efa60c` done，待发版复验 `1d2a4d69` |
| DescribeStaticStore 限频 | 20+ | `5f762ef8` 待审（未挂本 goal） |

**发现→修复→验证**

| 发现 | 修复 | 验证 |
|------|------|------|
| getDeployLog CODING | `18efa60c` done | ⏳ `1d2a4d69` 待审+发版 |
| writeNoSql 高报错 | 历史 | ✅ ~1.5% |
| AUTH 占 errors 绝大多数 | `7d35192b` pending | ⏳ |
| 灯塔断档 | OA 登录后 `e4936a01` | ⏳ |
| PG ExecutePGSql `;` | **本轮衍生** | — |

## 三、阶段2 四选一处置

| goal | 结论 | 依据 |
|------|------|------|
| 功能对齐 `47644538` | **维持** | 无新闭合；errorLogs 为新缺口 → 衍生 1 条 |
| 市场覆盖 `db980bd8` | **维持** | 无新 done；DSH 窗口扩大但不重复开 → 衍生 Cursor 渠道 1 条 |
| 数据表现 `0b2daecd` | **维持** | 无新灯塔日、无新 done；PG `;` 错误可修 → 衍生 1 条 |

## 四、阶段3 衍生（Derive）

每 goal **1** 条（共 3）；`derived_confidence=low` → 人审。

| # | goal | 标题 | confidence | auto_approve | 依据 |
|---|------|------|------------|--------------|------|
| 1 | 功能对齐 | MCP 补齐 MySQL 错误日志查询（对齐 SDK describeInstanceErrorLogs） | low | false | CynosDB 日志只读面；与 slow-query 并列缺口，不并入已待审任务 |
| 2 | 市场覆盖 | Cursor Marketplace 收录核验 + CloudBase MCP/插件上架材料 | low | false | 新渠道；DSH 已有 pending 不拆 |
| 3 | 数据表现 | queryPgDatabase：ExecutePGSql 尾部分号/空语句引导 | low | false | 08-13 34 次 syntax error at `;`；与已 done 的 role 引导不同因 |

**明确不建**：backup/sandbox/slow-query/DSH/Kimi/OpenCode/AUTH/overrun/ModifyLoginConfig/发版复验/destroy/VPC/mcp.so/灯塔 OA（运营动作写 notes）。

## 五、阶段4 观察调整

- percent：三个 goal **维持** 38% / 28% / 42%（无新闭合、无新灯塔日）
- 人工优先批：`97411460`（DSH，count=1650 仍 0）、`2a9e711f`、`30fe065b`、`f53ad9d6`、`7d35192b`（建议挂 `0b2daecd`）、`91daac76`（建议挂 `db980bd8`）
- 灯塔：人工 OA 登录 beacon.woa.com 后批 `e4936a01`，下轮才能做真正日环比

## 关键快照

- MCP npm `2.28.1`；manager-node 5.6.6；CLI 3.7.2
- 灯塔 snapshot：`2026-08-17T02:31:06Z`；08-13 总报错率 11.5%
- DSH plugins：**1650**（round10 ~1472）
- 本轮已创建任务：见 ATO pending（本报告提交后回填 ID）
