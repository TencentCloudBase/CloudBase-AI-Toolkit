# 目标演进闭环（GEL）审视报告 2026-08-18 晚 — CloudBase-MCP（round8）

> 任务：`d5fa467d-fb19-4463-a3b5-a0d5e51653fb`  
> 审视时间：2026-08-18 22:10（北京）  
> 前置：round7（`971eb044`，同日 10:40）  
> 范围：CloudBase-MCP（`dab4f6ac`）3 个 active goal（不含 PG 评测 `21c6e5d7`）

## 一、阶段1 盘点（Recon）

### Goals（status=active AND project_id=dab4f6ac，本模板仅 3 个）

| goal_id | 标题 | round7 pct | 本轮回写 |
|---------|------|------------|----------|
| `47644538` | 功能对齐 CLI 与 Manager SDK | 38% | → 38% |
| `db980bd8` | 市场覆盖 | 22% | → 26% |
| `0b2daecd` | 使用数据表现提升 | 35% | → 40% |

### 近 30 天 goal 关联任务（Agent API，deleted 不可见）

| goal | done | pending | cancelled | 相对 round7 变化 |
|------|------|---------|-----------|------------------|
| 功能对齐 | 3 | 1（`d3ade75b` sandbox） | 3（destroy / copy / **预置并发 `188a1a94`**） | 预置并发 **拒「涉及计费，先不处理」**；无新 done |
| 市场覆盖 | 7 | 1（`97411460` DSH） | 0 | `51b46c29` Smithery/PulseMCP/Glama **done**；Composio 再轮询 **done**（#424 仍 OPEN） |
| 数据表现 | 5 | 2（`f53ad9d6` overrun、`cb38ada0` callCloudApi） | 3 | Updating `4fb1eeb8` **done**（`function-updating.ts` 落地） |

**无供给停滞**；主阻塞仍是人工审批积压（sandbox、DSH、readNoSql overrun、AUTH `7d35192b`、functions 版本 `f7106baf`、callCloudApi、同参短路 `5f762ef8`）。

**ELL 过滤（rejected / 先不处理）**

- `3f4e21e9` env destroy、`fcad0dfb` fn copy、`188a1a94` 预置并发（**计费**）、`492dd34f` tool_errors 断档、`9a4509d8` CodeX/Aider：均不重建
- SkillHub demo / cursor.directory 浏览器核验：历史已拒 → 不重建
- `b7997931` API Key 替代云托管临时密钥：已拒 → 不把 `tcb env apikey` 再包装成替代方案
- `51b46c29` 已提交 Smithery #61 / PulseMCP #678，Glama live listed → 不重复开渠道任务

## 二、阶段2 差距分析（Gap + 产物巡检）

### 2a. 功能对齐（SDK `@cloudbase/manager-node` 5.6.6 / CLI 3.7.2 / tools.json **38** 工具；npm 包 2.28.1）

对照 `mcp/node_modules/@cloudbase/manager-node/lib/` 与 `tcb fn/env --help`：

| 能力 | CLI/SDK | MCP | 状态 |
|------|---------|-----|------|
| cloudrun traffic/records/imageUrl | ✅ | ✅ | 已闭合 |
| env usage/metrics | ✅ | ✅ `queryEnv` usage/metrics | `967b070f` done |
| OPA policy / roles / users | ✅ tcb policy/role/user | ✅ query/managePermissions | 已覆盖 |
| layers / triggers | ✅ | ✅ query/manageFunctions | 已覆盖 |
| sandbox/aiModel | ✅ | ❌ | `d3ade75b` 待审 |
| fn publish-version / config-route | ✅ | ❌ | `f7106baf` 待审（未挂本 goal） |
| env destroy / fn copy | ✅ | ❌ | **已拒，搁置** |
| fn 预置并发 | ✅ CLI + SDK | ❌ | **本轮拒「计费」，搁置** |
| HTTP routes | ✅ tcb routes/service | ✅ query/manageGateway | 已覆盖 |
| **VPC/子网枚举** | ✅ SDK `getVpcs`/`getSubnets` | ❌ mcp/src **零引用** | **本轮新缺口** |

`functions.ts` 明确要求 TCP 连库必须填真实 `vpcId+subnetId`、「禁止猜测」，但 MCP 没有只读枚举入口——与 2026-08-14 imageUrl 反例同类。

### 2b. 市场覆盖（live 巡检 2026-08-18 晚）

| 渠道 | 状态 | 证据 |
|------|------|------|
| awesome-mcp | ✅ | punkpeye README L569 |
| Official MCP Registry | ✅ remotes **+ packages** | search count=3：v2.27.0 remotes-only；**v2.28.0 / v2.28.1 含 npm `@cloudbase/cloudbase-mcp` stdio**（round7 早盘 packages 仍空） |
| Glama | ✅ listed | `51b46c29`：`https://glama.ai/mcp/servers/TencentCloudBase/CloudBase-AI-Toolkit` |
| Smithery | ⏳ 已提交 | clavia-inc/registry#61；live 搜索仍非 CloudBase |
| PulseMCP | ⏳ 认领 issue | pulsemcp/mcp-servers#678；页仍 mirror |
| Composio awesome-claude-plugins | ⏳ PR OPEN | #424 MERGEABLE；勿再开轮询 |
| Grok plugin-marketplace | ⏳ PR OPEN | #151 MERGEABLE |
| awesome-dsh-plugin | ❌ 0 CloudBase | live `count.json`=**1411**（round7 1247→+164） |
| dshworks registry | ❌ 0 CloudBase MCP | live `plugins=6290`（08-18）；仅 CLS/memory 腾讯插件占位 |
| **mcp.so** | ❌ unknown→未命中 | `/server/cloudbase` 未收录；markets.yaml 自 2026-07-27 未提交 |

本工作区 `dsh-plugin/` 已在开发，但 `97411460` 仍待批；dshworks 收录依赖该插件产物，**并入 DSH 任务、不拆开**。

### 2c. 数据表现（灯塔实测）

**数据源**：`beacon_history.sqlite` 最新 snapshot `2026-08-17T02:31:06Z`。  
08-18 日更因 OA `tof_auth` 过期未入库（与 round7 同源，**无新日环比**）。tool_errors 有效日仍止于 **08-13**。

**工具报错率（errors/calls，08-13）**

| 工具 | 08-11 | 08-12 | 08-13 | 结论 |
|------|-------|-------|-------|------|
| readNoSqlDatabaseContent | 55.6% | 59.9% | 47.0% | 仍头号 → `f53ad9d6` 待审 |
| callCloudApi | 37.2% | 32.5% | 18.5% | 下降仍高 → `cb38ada0` 待审 |
| deleteFiles | — | — | **17.2%**（142/824） | 旧工具名可能；`12b7f0f2` 在做单环境降频 |
| manageCloudRun | 23.8% | 20.9% | 13.3% | 下降 |
| writeNoSqlDatabaseContent | 3.2% | 2.2% | 1.5% | **闭环维持** |
| downloadRemoteFile | 35.2% | 94.9% | 34.0% | 调用已萎缩 |

**08-13 `errors` 维 Top（非 tool 名）**

| 错误 | 次数 | 覆盖 |
|------|------|------|
| 未登录 AUTH | 14,042 | `7d35192b` 待审 |
| Query projection illegal | 125 | `636a3578` done |
| Updating 态配置失败 | 80 | `4fb1eeb8` **本轮已 done** |
| ExecutePGSql syntax | 34 | 不单开 |
| 云托管未开通 | 34 | 引导已存在 |
| **`[tcb/ModifyLoginConfig] missing required parameter`** | **20** | **无任务** → 本轮衍生 |
| DescribeStaticStore 秒级限流 | 多条 20+ | `5f762ef8` 同参短路待审 |

**发现→修复→验证**

| 发现 | 修复 | 验证 |
|------|------|------|
| writeNoSql 高报错 | 历史 | ✅ ~1.5–3% |
| downloadRemoteFile | 废弃/done | ✅ 调用萎缩 |
| PG set role | `8a8139ec` | ✅ 实现落地；待发版后灯塔复验 |
| projection/MgoLimit | `636a3578` | ✅ 代码落地；待发版复验 |
| Updating 态 | `4fb1eeb8` | ✅ `function-updating.ts` 落地；待发版复验 |
| AUTH / Read overrun / callCloudApi MySQL | pending | ⏳ |
| ModifyLoginConfig 缺参 | **本轮衍生** | — |

## 三、阶段2 四选一处置

| goal | 结论 | 依据 |
|------|------|------|
| 功能对齐 `47644538` | **升级** | sandbox/版本灰度仍卡人审；预置并发已拒；VPC 枚举是新的 SDK 一等缺口 |
| 市场覆盖 `db980bd8` | **升级** | Registry packages 已齐、Glama listed；DSH 窗口 1411 且 dshworks 6290 仍 0；mcp.so 长期 unknown |
| 数据表现 `0b2daecd` | **升级** | Updating 闭环落地；overrun/AUTH 仍待批；ModifyLoginConfig 新错误源未覆盖 |

## 四、阶段3 衍生（Derive）

本轮每 goal **恰好 1 条**（克制；`derived_confidence=low` 走人审）。

| # | goal | 标题 | confidence | auto_approve | 依据 |
|---|------|------|------------|--------------|------|
| 1 | 功能对齐 | `e2524ce0` MCP 补齐 VPC/子网只读查询 | low | false | SDK 实证 + mcp 零引用；与 sandbox/版本任务无依赖 |
| 2 | 市场覆盖 | `a7d8035a` mcp.so 收录 PR + Registry 2.28.1 packages 回写 | low | false | live 未命中；验证并入禁止拆任务 |
| 3 | 数据表现 | `c1c78e46` callCloudApi ModifyLoginConfig 缺参引导 | low | false | 灯塔 08-13 单日 20 次；正确入口已存在 |

**明确不建**：destroy、fn copy、预置并发、tool_errors 断档、sandbox、DSH 落地、functions 版本/灰度、AUTH/readNoSql overrun、DescribeMySQLInstances、CodeX 适配、Grok/Composio 再盯盘、Smithery/PulseMCP 再提交、queryMetrics、env apikey、dshworks 独立收录。

## 五、阶段4 观察调整

- percent：功能对齐 **38%**（无新闭合，预置并发被拒不降分）、市场 **26%**（Registry packages + Glama listed）、数据 **40%**（Updating 引导落地）。
- notes 追加本轮结论；`ato goal update` 自动保留 `_prev`。
- 建议人工优先批：`97411460`（DSH 1411 + 本仓已有 dsh-plugin 代码）、`f53ad9d6`、`7d35192b`、`d3ade75b`/`f7106baf`。

## 关键快照

- MCP npm `2.28.1`；`scripts/tools.json` 仍标 v1.8.1（38 tools）；manager-node 5.6.6；CLI 3.7.2
- 灯塔 snapshot：`2026-08-17T02:31:06Z`；tool_errors 有效日止于 08-13；08-18 日更未入库
- DSH awesome 插件数：1411（CloudBase=0）；dshworks 6290（CloudBase MCP=0）
- Registry：`io.github.TencentCloudBase/cloudbase-mcp` v2.28.1 packages=npx stdio
- Glama：listed（bjxivwd225）
- 本轮已创建任务：`e2524ce0-0af4-468c-a30b-cc6c54fe4aaf` / `a7d8035a-217e-437d-a4d1-4901d8a5e69b` / `c1c78e46-bfd4-4e32-8342-010d5c717c8d`
