# 技术方案：消息推送配置 MCP（通用）+ 虚拟支付配套（商户查询 / 云调用服务端链路）

## 1. 目标与非目标

**目标：** 让 agent 通过 MCP 批量、幂等地完成消息推送配置（通用工具，虚拟支付 7 事件为默认场景），查询米大师应用信息；云调用绑定经服务端链路（TCB 后端接口 + CloudBase MCP）完成；配套 skill。

**非目标（本阶段）：** 实现代码、微信公众平台商户后台自动化开户、普通微信支付下单流程改造、**微信 IDE MCP 的云调用绑定写入（v1 不做，归属服务端链路）**。

## 2. 架构与分工

```mermaid
flowchart TB
  Agent[CodeBuddy / Agent]
  Skill[virtual-payment skill]
  IDEMCP[WeChat DevTools MCP]
  CBMCP[CloudBase MCP]
  QBase[wxa-dev-qbase CGI]
  TCB[TCB Cloud API 待建设]
  SCF[回调云函数]

  Agent --> Skill
  Skill --> IDEMCP
  Skill -.->|API 就绪后| CBMCP
  IDEMCP -->|微信登录态 ideRequest| QBase
  CBMCP -->|腾讯云身份| TCB
  TCB -.->|代理 qbase（含云调用 setfuncconfig 后）| QBase
  QBase -->|推送 event| SCF
  IDEMCP -->|cloud_fn_deploy| SCF
```

| 层 | 职责 |
| --- | --- |
| WeChat IDE Skills/MCP | **默认执行面**：消息推送配置（通用）+ 虚拟支付商户查询；云调用仅只读查询；登录=扫码 |
| CloudBase MCP | **补齐 + 服务端链路**：无 DevTools 时；云调用绑定（读+写，依赖 `setfuncconfig` 或等价）；依赖 TCB 代理 API |
| CloudBase Skills | 知识与顺序，不替代执行 |

依据：`config/source/skills/miniprogram-development/references/wxide-vs-cloudbase-mcp.md`。
分工裁定：Booker 2026-08-20 —— 消息推送工具**通用化**（不限虚拟支付）；云调用绑定归属**云开发服务端链路**，微信 IDE MCP v1 不做写入。

## 3. 工具命名与参数风格

### 3.1 微信 IDE 暴露名（snake_case，≤30）

对齐 `main/.../mcp.config.ts` 与 `cloudbase-tools.ts`：

| 暴露名 | 语义 |
| --- | --- |
| `query_msg_push` | 查询消息推送配置 / 合法事件约束（通用） |
| `manage_msg_push` | 订阅、删除、启停、切模式（写，需确认；通用事件，xpay 为默认集合） |
| `query_cloud_call` | 查询云函数 OpenAPI 白名单（**只读**，v1 无写入） |
| `query_xpay_config` | 查询虚拟支付商户/米大师信息（只读） |

公共入参：`appid: string`（必填，与现有 wechatide 一致）、`env`/`env_id`（环境 ID）。

> **v1 边界：** 微信 IDE MCP **不提供** `manage_cloud_call`（云调用绑定写入）。该能力归属服务端链路，由 CloudBase MCP 在 `setfuncconfig` 或等价接口就绪后提供（见 4.2 与需求 5）。

CloudBase MCP 对齐名（API 就绪后）：

| CloudBase | 对齐 | 归属 |
| --- | --- | --- |
| `queryMessagePush` / `manageMessagePush` | ← msg push（通用） | 双端对齐 |
| `queryCloudCall` / `manageCloudCall` | ← cloud call（读+写） | **服务端链路主执行面**（微信 IDE 仅读） |
| `queryVirtualPaymentConfig` | ← xpay config | 双端对齐 |

### 3.2 Schema 草案（Zod）

```ts
// 虚拟支付默认事件集合（event_types 缺省时使用）
export const XPAY_EVENT_TYPES = [
  "xpay_goods_deliver_notify",
  "xpay_coin_pay_notify",
  "xpay_complaint_notify",
  "xpay_subscribe_signing_result_notify",
  "xpay_subscribe_pay_fail_notify",
  "xpay_subscribe_ios_refund_query_notify",
  "xpay_refund_notify",
] as const;

// 云调用 OpenAPI 路径枚举（CloudBase MCP 侧使用；微信 IDE v1 只读查询不涉及）
export const XPAY_OPENAPI_PATHS = [
  "/xpay/query_order",
  "/xpay/refund_order",
  "/xpay/query_user_balance",
  "/xpay/currency_pay",
  "/xpay/cancel_currency_pay",
  "/xpay/present_currency",
  "/xpay/notify_provide_goods",
  "/xpay/start_upload_goods",
  "/xpay/query_upload_goods",
  "/xpay/start_publish_goods",
  "/xpay/query_publish_goods",
  "/xpay/start_download_order",
  "/xpay/query_download_order",
  "/xpay/download_bill",
  "/xpay/download_ios_settlement_bill",
  "/xpay/create_withdraw_order",
  "/xpay/query_withdraw_order",
  "/xpay/query_biz_balance",
  "/xpay/get_complaint_list",
  "/xpay/response_complaint",
  "/xpay/complete_complaint",
  "/xpay/upload_vp_file",
] as const;

// query_msg_push
z.object({
  appid: z.string(),
  env: z.string().optional(),
  action: z.enum(["list", "listSupportedEvents"]),
});

// manage_msg_push —— 通用消息推送（不限于虚拟支付）
// event_types 省略 → 默认 XPAY_EVENT_TYPES（虚拟支付默认场景）
// event_types 传入 → 支持任意合法事件（由 listSupportedEvents 返回全量约束）
z.object({
  appid: z.string(),
  env_id: z.string(), // = envId
  function_name: z.string(),
  action: z.enum([
    "subscribe",      // default: XPAY_EVENT_TYPES if event_types omitted
    "unsubscribe",
    "setEnable",      // enable/disable one or many
    "ensureCloudFunctionMode",
  ]),
  event_types: z.array(z.string()).optional(), // 任意合法事件；缺省=xpay 默认集合
  enable: z.boolean().optional(), // setEnable
  confirm: z.boolean().optional(), // if host requires, mirror CloudBase write tools
});

// query_cloud_call —— 微信 IDE v1 仅只读
z.object({
  appid: z.string(),
  env_id: z.string(),
  function_name: z.string(),
  action: z.enum(["list"]),
});

// manage_cloud_call —— CloudBase MCP 侧（服务端链路），API 就绪后注册
// z.object({
//   appid/env_id/function_name: ...,
//   action: z.enum(["bind", "unbind"]),
//   api_list: z.array(z.enum(XPAY_OPENAPI_PATHS)).min(1),
//   confirm: z.boolean().optional(),
// });

// query_xpay_config
z.object({
  appid: z.string(),
  action: z.enum(["info"]).default("info"),
});
```

说明：

- `event_types` 用 `z.string()`（开放类型）并依赖 `listSupportedEvents` 提供合法集合；若产品要求强校验，可在服务端/调用时校验非法值并提示。**不要**用 `z.enum(XPAY_EVENT_TYPES)` 收窄——工具是通用的，xpay 只是默认集合（mcp_tool_schema_rules 第 2 条：枚举来自契约，非 xpay 事件同样是合法契约值）
- `api_list` 在 CloudBase MCP 侧 `manage_cloud_call` 中 **必须** 使用 `z.enum(XPAY_OPENAPI_PATHS)`（固定枚举，mcp_tool_schema_rules 第 1 条）

## 4. API 调用链

### 4.1 消息推送（已存在，IDE MCP 可封装）

| 步骤 | CGI | 备注 |
| --- | --- | --- |
| 读配置 | `POST .../getappconfig` `{type:1}` | 解析 `config.callbacks`，带 `version` |
| 读合法事件 | `POST .../route/getcallbacksupportlist` | 校验 xpay 七类均在列表中 |
| 写配置 | `POST .../uploadappconfig` | 全量 overwrite + version |
| 云托管模式 | `get/set containercallbackconfig` | `ensureCloudFunctionMode` 时设 `qbase_open:false` |

**幂等算法（subscribe）：**

1. GET list + version  
2. `targets = event_types ?? XPAY_EVENT_TYPES`（缺省=虚拟支付默认集合；传入则为任意合法事件）  
3. 对每个 event：移除同 `(msgType=event, event)` 的旧条目；若已存在完全相同 env+function 则跳过添加  
4. 若集合无变化 → 直接成功（不 POST）  
5. 否则 POST overwrite，失败则提示 version conflict 并建议重试  

### 4.2 云调用（服务端链路，微信 IDE MCP v1 不写）

| 步骤 | 接口 | 状态 | 归属 |
| --- | --- | --- | --- |
| 读 | `POST .../getfuncconfig` `{func_name, env}` → `api_whitelist` | 已存在 | 微信 IDE 只读 / CloudBase MCP 读 |
| 写 | **待** `setfuncconfig` 或等价 | **缺口** | **CloudBase MCP（服务端链路）** |
| 降级 | 改本地 `config.json` `permissions.openapi` + `cloud_fn_deploy` | 评审可选 | 服务端/CloudBase MCP |

不要把 `usecloudaccesstoken`（云托管令牌）当成虚拟支付云函数绑定。

### 4.3 虚拟支付商户

| 步骤 | 接口 | 状态 |
| --- | --- | --- |
| 普通商户 | `getmchbyappid` / `getapplywxpaylist` / `getauthstate` | 已存在，**不可**冒充虚拟支付 |
| 米大师/xpay | **待** 查询 CGI / Cloud API | **缺口** |

UI：在 `globalsettings` 微信支付 Card 旁增加「虚拟支付」子区，数据源接新查询。

## 5. 鉴权边界

| 调用方 | 身份 | 可调 |
| --- | --- | --- |
| WeChat IDE MCP | 小程序开发者扫码 / IDE ticket | qbase CGI（与控制台相同） |
| CloudBase MCP | 腾讯云 API Key / 设备码 | 仅 TCB Cloud API；**禁止**直接打 `servicewechat.com` |
| Agent | 无独立密钥 | 只通过 MCP |

写操作：对齐 `cloudbase-tools.ts`，走用户确认（`runWithUserConfirmation`）。

## 6. 与 wxide CloudBase wrap 层关系

当前 `cloudbase-tools.ts` 只包装 `@cloudbase/cloudbase-mcp` 的 nosql/storage，且 `requestFn` 打 tcb。

**推荐：** 消息推送（通用）/ xpay 查询作为 **wechatide 原生 tools**（与 `cloud_fn_deploy` 同层），不要塞进 `createCloudBaseToolDefs` 白名单，直到 CloudBase MCP 包内也有同名工具且存在 TCB API。云调用绑定写入（`manage_cloud_call`）**不进入微信 IDE**，由 CloudBase MCP 承接（服务端链路）。

## 7. Agent skill 草案

路径建议：`config/source/skills/miniprogram-virtual-payment/SKILL.md`（源）  
配套 reference：工具参数表 + 回调云函数应答示例（验签、发货幂等）。

顺序（强制）：

1. 确认 AppID / envId / 虚拟支付已开通（`query_xpay_config`）  
2. `manage_msg_push(action=ensureCloudFunctionMode)`  
3. 创建回调云函数代码 → `cloud_fn_deploy`  
4. `manage_msg_push(action=subscribe)`（默认 7 事件；其他事件传入 `event_types`）  
5. 云调用 OpenAPI 绑定（如需）→ **CloudBase MCP `manage_cloud_call`（服务端链路，待 API 就绪）**；微信 IDE 侧仅 `query_cloud_call` 只读确认  
6. 小程序端 `wx.requestVirtualPayment`（或文档现行 API）  
7. 云函数处理 notify，调用 `/xpay/notify_provide_goods` 等  

与现有 `cloudbase-wechat-integration`（普通微信支付/集成中心）分流：虚拟支付触发词走本 skill。

## 8. 测试策略

- 单测：幂等 merge、version 冲突、enum 拒绝非法 path  
- 契约测：mock qbase CGI body  
- e2e（阶段 4）：真实 AppID；扩展 wxide e2e 文档新分组  
- schema 生成：`scripts/tools.json` / `doc/mcp-tools.md`（CloudBase 侧）

## 9. 安全性

- 不在日志/返回中打印支付密钥、session_key  
- 写操作需确认  
- 不调用未文档化的公众平台管理接口  
- 云函数回调必须校验微信签名（skill 强制提醒）

## 10. 文档同步

- `doc/ide-setup/wechat-devtools.mdx`：增加虚拟支付 MCP 小节（实现后）  
- 分工文档：补充「支付回调配置属 IDE MCP」  
- 插件清单变更时按 `doc_freshness_rules` 检查
