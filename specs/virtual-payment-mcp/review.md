# 评审说明：开发前需确认的决策点

面向产品 / starkewang / 微信 IDE / CloudBase MCP 维护者。本阶段无实现代码。

## 决策点清单

### D1. Tool 粒度

**提案（默认）：** `query_*` / `manage_*` + `action` 枚举（见 `design.md`），微信侧 snake_case ≤30 字符。

**备选：** 每个事件一个 tool（拒绝：工具膨胀，不利于 agent）。

**请确认：** 是否采纳默认提案。

### D2. 推送类型覆盖

**提案（默认）：**

- 默认订阅 = **仅 7 个** `xpay_*` 事件
- `listSupportedEvents` 可返回全量 constraints，供高级场景
- 默认**不**订阅客服消息、扫码等非支付事件

**请确认：** 「十几个推送场景」是否全部落在这 7 个 xpay 事件内；若有额外官方 event 名，请补清单以便扩 enum。

### D3. 消息推送写模型

**提案（默认）：** 复用全量 `uploadappconfig` + version 乐观锁，MCP 客户端做 batch/幂等。

**备选：** 新做增量 add/remove CGI（更清晰，但要排期）。

**请确认：** 是否允许 MCP 直接复用现网 CGI（微信 IDE 登录态）。

### D4. 云调用写路径

**提案优先：** 新 setfuncconfig（或 batch bind）与 getfuncconfig 对称。

**降级：** 改 `config.json` + `cloud_fn_deploy`，工具返回中标明「需重新上传后生效」。

**请确认：** 选优先还是降级；降级是否可进 v1。

### D5. 接口权限边界

**硬边界：**

- 允许：控制台已使用的 `servicewechat.com/wxa-dev-qbase/*`
- 禁止：未在控制台出现的 mp 公众平台管理接口、未文档化 path
- CloudBase MCP 禁止在无 TCB 代理时直连 qbase

**请确认：** TCB 代理 API 是否立项及 ETA（决定需求 5 同期还是二期）。

### D6. 虚拟支付商户查询 availability

**现状：** 无 offerId 查询面；普通商户 API 不可复用。

**请确认：** 查询 CGI/字段 owner、ETA；未就绪时 UI/MCP 是否接受 blocked 空态上线。

### D7. UI 形态

**提案：** 微信支付 Card 内增加「虚拟支付」子区域（不必强行合并表格）。

**请确认：** tab vs 子区域。

### D8. Skill 归属

**提案：** 新建 `miniprogram-virtual-payment` skill，与 `cloudbase-wechat-integration`（普通微信支付）分流。

**备选：** 仅在 `miniprogram-development` 下加 reference。

**请确认：** 选新建 skill 还是挂 reference。

## 给 starkewang 的摘要

1. **7 个虚拟支付回调事件**可由现有消息推送 overwrite 模型一次覆盖；动态 constraints 还能覆盖更多非支付事件，但产品默认应锁 xpay。
2. 最大缺口不是「能不能配消息推送」，而是：**云函数 OpenAPI 写接口**与**米大师应用查询接口**；以及 CloudBase MCP 所需的 **TCB 身份可调代理**。
3. 现有 get/overwrite CGI + version 已足够支撑幂等批量订阅，增量 API 为体验优化非必须。

## 旧任务

任务说明要求 Reject `404ee717-30b1-49b7-9da4-5b188e56fc4c` 与 `ec6a15f8-0acf-4bcb-abcd-f146f60251a6`。AI 无法经 API 自 Reject，需人工在 ATO 仪表盘 Reject。
