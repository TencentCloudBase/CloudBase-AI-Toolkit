# 需求文档：小程序虚拟支付配套 MCP（消息推送 / 云调用绑定 / 商户展示）

## 介绍

云开发支持通过「消息推送」把小程序虚拟支付回调送到云函数，开发者无需自建服务器。当前 AI 工具接入的痛点是：

1. 虚拟支付回调事件需在控制台逐条配置（同环境+云函数重复粘贴）
2. 云调用 OpenAPI 绑定缺少可脚本化批量接口说明
3. 微信支付配置区不展示米大师/虚拟支付商户信息
4. 面向人的文档无法给 agent 结构化执行顺序

本需求将配置能力下沉到 **微信开发者工具 MCP（默认执行面）**，并在后端契约就绪后对齐 **CloudBase MCP**，同时提供 agent skill。

**本轮范围：** 仅需求/设计/任务拆分（spec）。不实现、不集成、不开 PR。

---

## 需求

### 需求 1 - 消息推送自动化配置（MCP）

**用户故事：** 作为使用 CodeBuddy 等 AI 工具的小程序开发者，我希望一次指定环境与回调云函数，就能批量订阅虚拟支付相关事件，并能查询、增量增删且重复执行不产生重复配置。

#### 验收标准

1. When 调用消息推送管理工具且未传 `event_types`，the MCP shall 为以下 7 个虚拟支付事件各生成（或保持）一条 `msgType=event` 配置，目标为给定 `env_id` + `function_name`：  
   `xpay_goods_deliver_notify`、`xpay_coin_pay_notify`、`xpay_complaint_notify`、`xpay_subscribe_signing_result_notify`、`xpay_subscribe_pay_fail_notify`、`xpay_subscribe_ios_refund_query_notify`、`xpay_refund_notify`。
2. When 传入 `event_types` 子集，the MCP shall 仅确保这些事件指向给定云函数（增量合并），且不得默认订阅非 xpay 的无关事件。
3. When 查询当前配置，the MCP shall 返回至少包含 `msgType`、`event`、`env`、`functionName`、`enable` 的列表。
4. When 删除指定事件订阅，the MCP shall 只移除匹配条目并保留其他配置。
5. When 对已存在且完全相同的 `(msgType, event, env, functionName)` 重复执行订阅，the MCP shall 不产生重复行（幂等）。
6. When 某 `event` 已绑定到其他云函数，the MCP shall 按平台约束改为绑定到本次 `function_name`（与控制台「一事一函数」一致），并在结果中说明发生了重绑。
7. When 写入时 version 冲突或配置不存在错误码，the MCP shall 返回可重试错误，不得静默丢弃。
8. While 推送模式为云托管整包接收，when 用户请求按事件绑定云函数，the MCP shall 明确提示需先切换到云函数模式（或提供显式 action），不得静默失败。

### 需求 2 - 云调用绑定自动化（MCP）

**用户故事：** 作为开发者，我希望批量把虚拟支付服务端 OpenAPI（如 `/xpay/query_order`）绑定到指定环境的云函数调用权限，并能查询与解绑，且重复绑定不重复。

#### 验收标准

1. When 调用云调用管理工具并传入 `env_id`、`function_name`（若契约需要）与 `api_list`，the MCP shall 批量绑定列表中的 OpenAPI path。
2. When `api_list` 含枚举外路径，the MCP shall 在 schema 校验阶段拒绝（`z.enum`），不得静默忽略。
3. When 查询已绑定列表，the MCP shall 返回当前函数（或契约定义的作用域）上的 OpenAPI 白名单。
4. When 解绑指定 path，the MCP shall 仅移除这些 path，保留其余。
5. When 重复绑定已存在 path，the MCP shall 保持幂等（结果集合不变）。
6. While 后端尚无独立 set 接口，when 仅能通过 `config.json` + 上传生效，the MCP shall 采用评审确认的降级方案并在返回中写明生效方式；不得假装已远端写入成功。

### 需求 3 - 虚拟支付商户信息展示与查询

**用户故事：** 作为开发者，我希望在微信支付配置区看到当前 AppID 关联的米大师/虚拟支付应用信息，并可通过 MCP 查询，而不与普通微信支付商户混为一谈。

#### 验收标准

1. When 打开微信支付配置区，the 控制台 shall 提供虚拟支付专用入口（独立 tab 或子区域均可）。
2. When 虚拟支付应用已关联，the UI shall 至少展示：`offerId`、商户名、签约/启用状态；若有则展示订阅签约状态与 iOS 虚拟支付状态。
3. When 未关联或接口未就绪，the UI shall 展示明确空态/未就绪说明，不得复用普通商户号列表冒充。
4. When 调用 `query_xpay_config`（或等价查询工具），the MCP shall 返回与 UI 同语义字段；写操作不在本需求（只读）。
5. When 仅存在普通微信支付商户，the 普通商户区行为 shall 保持现状，虚拟支付区独立展示。

### 需求 4 - 云开发侧后端接口支撑

**用户故事：** 作为 MCP 实现方，我需要可程序化的查询与变更接口，而不是只能点控制台。

#### 验收标准

1. When 消息推送需要读写，the 后端 shall 提供查询与变更能力（允许复用现有 `getappconfig`/`uploadappconfig`/`getcallbacksupportlist`，或提供增量 API）；契约需文档化鉴权与 version。
2. When 云调用需要绑定/解绑，the 后端 shall 提供查询+变更；若短期仅有查询，shall 书面确认降级路径。
3. When 虚拟支付商户需要展示，the 后端 shall 提供只读查询（offerId 等字段）；无接口则需求 3 的 MCP/UI 标 blocked。
4. When 接口仅接受微信 IDE 登录态，the 文档 shall 标明 CloudBase MCP（腾讯云身份）不可直接调用，避免实现方越权。

### 需求 5 - CloudBase MCP 能力对齐

**用户故事：** 作为不使用微信开发者工具、仅使用 CloudBase MCP 的 AI 会话，我希望在后端契约允许时也能完成同类配置。

#### 验收标准

1. When TCB/云开发侧可调用 API 就绪，the CloudBase MCP shall 提供与微信 IDE MCP **语义对齐**的查询/管理工具（命名可按 CloudBase `query*`/`manage*` 惯例），schema 含相同枚举。
2. When API 未就绪，the CloudBase MCP shall 不注册假工具或乱调 `callCloudApi`；若注册占位，调用时 shall 返回明确 blocked 与 nextActions（指向 wechatide 工具或控制台）。
3. When 修改插件清单或工具名，the 文档 (`doc/connection-modes.mdx`、README) shall 同步校验（canonical 名可解析）。
4. When 在 wxide 嵌入场景，the 实现 shall 遵守 `wxide-vs-cloudbase-mcp.md`：不复制 wechatide schema，默认执行面仍为 IDE Skills。

### 需求 6 - 虚拟支付接入 agent skill

**用户故事：** 作为 agent，我需要可执行的接入顺序与每步工具/参数，而不是仅自然语言长文。

#### 验收标准

1. When 用户提出小程序虚拟支付接入，the skill shall 固化顺序：开通虚拟支付 → 配置消息推送 → 创建/部署回调云函数 → 绑定云调用 OpenAPI → 小程序端发起支付 → 应答与幂等发货。
2. When 描述工具调用，the skill shall 优先引用 MCP 工具名与 JSON schema / 参数表，而非仅散文。
3. When Nightly 可用，the skill shall 默认指引 wechatide 工具；CloudBase MCP 仅作缺口补充（与分工文档一致）。
4. When skill 进入 `plugin/cloudbase/skills/`，the 仓库 shall 同步 `plugin/cloudbase/skill-metadata.json` 并执行 `npm run build:skill-manifest`。

### 需求 7 - 工程与协作约束

**用户故事：** 作为并行开发者，我希望本能力的实现不污染其他 worktree。

#### 验收标准

1. When 产出本 spec，the 变更 shall 落在独立 worktree/分支（如 `feat/virtual-payment-spec`），不得改主工作区正在开发的其他功能。
2. When 后续开发任务启动，the 任务说明 shall 标注「开发时使用 worktree 隔离」，且合并使用 merge（不用 rebase）除非另有规定。
3. When 本分析设计任务结束，the 仓库 shall 不包含产品功能实现 PR（本阶段禁止开发/集成/PR）。
