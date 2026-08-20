# 需求文档：小程序消息推送配置 MCP（通用）+ 虚拟支付配套（商户展示 / 云调用后端开发）

## 介绍

云开发支持通过「消息推送」把小程序事件（含虚拟支付回调）送到云函数，开发者无需自建服务器。当前 AI 工具接入的痛点是：

1. 消息推送事件需在控制台逐条配置（同环境+云函数重复粘贴），且**通用能力**（不限虚拟支付）无脚本化入口
2. 云调用 OpenAPI 绑定是**云函数部署/服务端配置链路**（`config.json` + 上传），属后端开发工作，MCP 不封装
3. 微信支付配置区不展示米大师/虚拟支付商户信息（控制台团队负责）
4. 面向人的文档无法给 agent 结构化执行顺序

本需求将**消息推送配置能力**下沉到 **CloudBase MCP（实现源）**，工具为**通用消息推送配置**（不限于虚拟支付，虚拟支付 7 事件为默认场景）；**微信开发者工具 MCP 通过升级 `@cloudbase/cloudbase-mcp` 版本消费**（`EXPOSED_TOOL_NAME` 映射暴露为 `cloud_msg_push_*`）；**云调用绑定与虚拟支付商户展示分别归属后端开发与控制台团队，MCP 均不提供对应工具**。同时提供 agent skill。

**实现路径（Booker 2026-08-20 裁定）：** 单端实现——在 **CloudBase-MCP 仓库**实现 `queryMessagePush` / `manageMessagePush`（内部 camelCase 命名，进 `AVAILABLE_PLUGINS`），随包发布新版本；**main（微信开发者工具）仓库升级 `@cloudbase/cloudbase-mcp` 版本号消费**（验证旧工具无 break change，`EXPOSED_TOOL_NAME` 映射不破），再提 PR 给微信侧参考。测试用 `mcp/scripts/test-with-ticket.cjs`（微信 IDE ticket + 模拟请求）扩展；telemetry 保持开启以收集工具使用数据。

**本轮范围：** 仅需求/设计/任务拆分（spec）。不实现、不集成、不开 PR。

---

## 需求

### 需求 1 - 消息推送配置（通用 MCP 工具，虚拟支付为默认场景）

**用户故事：** 作为使用 CodeBuddy 等 AI 工具的小程序开发者，我希望通过一个通用消息推送工具（`cloud_msg_push_query` / `cloud_msg_push_manage`，对齐 IDE `cloud_*` 命名体系），一次指定环境与回调云函数，就能批量订阅任意合法事件（虚拟支付事件是其中一个默认场景），并能查询、增量增删且重复执行不产生重复配置。

**通用性边界：** 本工具是**通用消息推送配置**（消息类型 `event` + 任意合法 `event_type`），不只服务虚拟支付。虚拟支付 7 个 `xpay_*` 事件作为 `event_types` 缺省时的默认订阅集合，是工具的一个便捷入口，而非工具的唯一用途。

**命名依据（Booker 2026-08-20 裁定）：** CloudBase MCP 内部实现用 **camelCase**（`queryMessagePush` / `manageMessagePush`，对齐 `readNoSqlDatabaseStructure` 惯例，进 `AVAILABLE_PLUGINS`）；微信 IDE 侧经 `EXPOSED_TOOL_NAME` 映射暴露为 **`cloud_msg_push_query` / `cloud_msg_push_manage`**（对齐 `cloud_db_read_struct` 体系）。

#### 验收标准

1. When 调用 `cloud_msg_push_manage` 且未传 `event_types`，the MCP shall 默认订阅虚拟支付 7 个事件（各生成或保持一条 `msgType=event` 配置，目标为给定 `env_id` + `function_name`），并在返回中标明默认集合：  
   `xpay_goods_deliver_notify`、`xpay_coin_pay_notify`、`xpay_complaint_notify`、`xpay_subscribe_signing_result_notify`、`xpay_subscribe_pay_fail_notify`、`xpay_subscribe_ios_refund_query_notify`、`xpay_refund_notify`。
2. When 传入 `event_types`，the MCP shall 支持任意合法事件（不限于 `xpay_*`），仅确保这些事件指向给定云函数（增量合并）；当事件不在合法约束内时，the MCP shall 返回校验错误并提示可查询的合法事件来源。
3. When 调用 `cloud_msg_push_query`，the MCP shall 返回至少包含 `msgType`、`event`、`env`、`functionName`、`enable` 的当前配置列表；并支持返回全部合法事件约束（含虚拟支付 7 事件子集），供 agent 与高级场景使用。
4. When 删除指定事件订阅，the MCP shall 只移除匹配条目并保留其他配置。
5. When 对已存在且完全相同的 `(msgType, event, env, functionName)` 重复执行订阅，the MCP shall 不产生重复行（幂等）。
6. When 某 `event` 已绑定到其他云函数，the MCP shall 按平台约束改为绑定到本次 `function_name`（与控制台「一事一函数」一致），并在结果中说明发生了重绑。
7. When 写入时 version 冲突或配置不存在错误码，the MCP shall 返回可重试错误，不得静默丢弃。
8. While 推送模式为云托管整包接收，when 用户请求按事件绑定云函数，the MCP shall 明确提示需先切换到云函数模式（或提供显式 action），不得静默失败。

### 需求 2 - 云调用绑定（完全归属微信云开发后端开发，MCP 均不提供工具）

**用户故事：** 作为云开发服务端实现方，我需要可程序化的云函数 OpenAPI 白名单查询与变更接口，使云调用绑定可通过后端链路完成，而不是仅能点控制台。

**归属边界（Booker 2026-08-20 裁定，范围收窄）：** 云调用绑定是**微信云开发后端的开发工作**（现网写入路径 = `config.json` 的 `permissions.openapi` + `cloud_fn_deploy`/开发者工具上传，无独立 set CGI，需要后端补 `setfuncconfig`）。**微信 IDE MCP 与 CloudBase MCP 均不提供云调用工具**（`queryCloudCall` / `manageCloudCall` 已从设计移除）；该能力完全由**微信云开发后端**开发提供。

#### 验收标准

1. When 服务端提供云调用绑定能力，the 后端 shall 提供查询与变更接口（查询现有 `getfuncconfig` 白名单、变更需 `setfuncconfig` 或等价批量 bind/unbind），契约文档化鉴权与作用域（函数/环境）。
2. When `api_list` 含非法 path，the 服务端契约校验 shall 拒绝（枚举约束），不得静默忽略。
3. When 查询已绑定列表，the 查询接口 shall 返回当前函数（或契约定义的作用域）上的 OpenAPI 白名单。
4. When 解绑指定 path，the 变更接口 shall 仅移除这些 path，保留其余。
5. When 重复绑定已存在 path，the 变更接口 shall 保持幂等（结果集合不变）。
6. When 后端尚无独立 set 接口，the 云开发侧 shall 书面确认降级路径（改 `config.json` + 上传）。
7. When MCP 工具集发布（微信 IDE 或 CloudBase MCP），the 工具列表 shall 不包含任何云调用工具，云调用能力在 MCP 侧完全不可见。

### 需求 3 - 虚拟支付商户信息展示（控制台团队负责，MCP 均不提供查询工具）

**用户故事：** 作为开发者，我希望在微信支付配置区看到当前 AppID 关联的米大师/虚拟支付应用信息，而不与普通微信支付商户混为一谈。

**归属边界（Booker 2026-08-20 裁定，范围收窄）：** 虚拟支付商户展示是**控制台（weda-alternative）团队**的工作。**微信 IDE MCP 与 CloudBase MCP 均不提供虚拟支付商户查询工具**（`query_xpay_config` / `queryVirtualPaymentConfig` 已从设计移除）。

#### 验收标准

1. When 打开微信支付配置区，the 控制台 shall 提供虚拟支付专用入口（独立 tab 或子区域均可）。
2. When 虚拟支付应用已关联，the UI shall 至少展示：`offerId`、商户名、签约/启用状态；若有则展示订阅签约状态与 iOS 虚拟支付状态。
3. When 未关联或接口未就绪，the UI shall 展示明确空态/未就绪说明，不得复用普通商户号列表冒充。
4. When 仅存在普通微信支付商户，the 普通商户区行为 shall 保持现状，虚拟支付区独立展示。
5. When 微信 IDE MCP 工具集发布，the 工具列表 shall 不包含虚拟支付商户查询工具；商户信息查询仅由控制台 UI 提供。

### 需求 4 - 云开发侧后端接口支撑

**用户故事：** 作为 MCP/服务端实现方，我需要可程序化的查询与变更接口，而不是只能点控制台。

**云调用归属（Booker 2026-08-20 裁定）：** 云调用绑定属**微信云开发后端开发**范畴，其后端接口由后端团队独立开发，**微信 IDE MCP 与 CloudBase MCP 均不封装**（`queryCloudCall` / `manageCloudCall` 已从设计移除）。

#### 验收标准

1. When 消息推送需要读写，the 后端 shall 提供查询与变更能力（允许复用现有 `getappconfig`/`uploadappconfig`/`getcallbacksupportlist`，或提供增量 API）；契约需文档化鉴权与 version。
2. When 云调用需要绑定/解绑（后端开发），the 后端 shall 提供查询+变更（现有 `getfuncconfig` 读 + 新增 `setfuncconfig` 或等价批量 bind/unbind 写）；若短期仅有查询，shall 书面确认降级路径（`config.json` + 上传）。
3. When 虚拟支付商户需要展示，the 后端 shall 提供只读查询（offerId 等字段）；无接口则控制台 UI 标 blocked。
4. When 接口仅接受微信 IDE 登录态，the 文档 shall 标明 CloudBase MCP（腾讯云身份）不可直接调用，避免实现方越权。

### 需求 5 - CloudBase MCP 消息推送工具（实现源 + 发布）

**用户故事：** 作为 CloudBase MCP 维护者，我希望在 CloudBase-MCP 仓库实现消息推送工具，随包发布新版本，供微信开发者工具与纯 CloudBase MCP 用户消费。

**实现路径（Booker 2026-08-20 裁定，实现源修正）：** **CloudBase MCP 是消息推送工具的唯一实现源**（`queryMessagePush` / `manageMessagePush`，进 `AVAILABLE_PLUGINS` 或 DEFAULT_PLUGINS）。发布链路：实现 + 单测 + 用 `mcp/scripts/test-with-ticket.cjs`（微信 IDE ticket）做真实调用测试 → 提交 PR → 发布新版本 → **main 仓库升级 `@cloudbase/cloudbase-mcp` 版本号消费**（验证旧工具无 break change）→ 提 PR 给微信侧参考。telemetry 保持开启（`enableTelemetry` 默认 true）以收集工具使用数据用于优化。

#### 验收标准

1. When TCB/云开发侧可调用 API 就绪，the CloudBase MCP shall 提供消息推送查询/管理工具（`queryMessagePush` / `manageMessagePush`，命名按 CloudBase `query*`/`manage*` 惯例，进 `AVAILABLE_PLUGINS`），schema 含相同枚举。
2. When 发布新版本，the 旧工具（nosql/storage 等）schema 与行为 shall 无 break change（main 升级后 `EXPOSED_TOOL_NAME` 映射不破、既有工具可用）。
3. When 需要真实调用验证，the 测试 shall 通过 `mcp/scripts/test-with-ticket.cjs`（微信 IDE ticket + 模拟 qbase 请求）完成，不依赖手工点控制台。
4. When telemetry 可用，the 工具使用与错误数据 shall 保持上报（默认开启），用于后续优化。
5. When 修改插件清单或工具名，the 文档 (`doc/connection-modes.mdx`、README) shall 同步校验（canonical 名可解析）。
6. When 在 wxide 嵌入场景，the 实现 shall 遵守 `wxide-vs-cloudbase-mcp.md`：不复制 wechatide schema，微信侧默认执行面仍为 IDE Skills。

### 需求 6 - 虚拟支付接入 agent skill

**用户故事：** 作为 agent，我需要可执行的接入顺序与每步工具/参数，而不是仅自然语言长文。

#### 验收标准

1. When 用户提出小程序虚拟支付接入，the skill shall 固化顺序：开通虚拟支付 → 配置消息推送（通用工具，默认 7 事件）→ 创建/部署回调云函数 → 小程序端发起支付 → 应答与幂等发货；云调用 OpenAPI 绑定（如需要服务端接口）作为服务端链路步骤，由 CloudBase MCP/后端完成，标注归属与生效方式。
2. When 描述工具调用，the skill shall 优先引用 MCP 工具名与 JSON schema / 参数表，而非仅散文。
3. When Nightly 可用，the skill shall 默认指引 wechatide 工具；CloudBase MCP 仅作缺口补充（与分工文档一致）。
4. When skill 进入 `plugin/cloudbase/skills/`，the 仓库 shall 同步 `plugin/cloudbase/skill-metadata.json` 并执行 `npm run build:skill-manifest`。

### 需求 7 - 工程与协作约束

**用户故事：** 作为并行开发者，我希望本能力的实现不污染其他 worktree。

#### 验收标准

1. When 产出本 spec，the 变更 shall 落在独立 worktree/分支（如 `feat/virtual-payment-spec`），不得改主工作区正在开发的其他功能。
2. When 后续开发任务启动，the 任务说明 shall 标注「开发时使用 worktree 隔离」，且合并使用 merge（不用 rebase）除非另有规定。
3. When 本分析设计任务结束，the 仓库 shall 不包含产品功能实现 PR（本阶段禁止开发/集成/PR）。
