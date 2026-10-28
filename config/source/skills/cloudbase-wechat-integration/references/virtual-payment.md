# Mini Program Virtual Payment (虚拟支付)

Official docs:

- `https://developers.weixin.qq.com/minigame/dev/wxcloud/guide/wechatpay/ai-virtualpayl-person.html`（AI 工具快速接入虚拟支付，含小游戏/小程序）
- `https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment`（企业/个体户接入指引，含推送字段）
- `https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment/person`（个人主体接入指引）
- Client API: `https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestVirtualPayment.html`
- 自建 HTTP 入站验签（消息推送，不是 `pay_sig`）: `https://developers.weixin.qq.com/miniprogram/dev/framework/server-ability/message-push.html`
- `query_order`: `https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_query_order`
- `refund_order`: `https://developers.weixin.qq.com/miniprogram/dev/server/API/VirtualPayment/api_refund_order`
- 出站 `pay_sig`: `https://developers.weixin.qq.com/minigame/introduction/commercialization/virtual-payment/signature.html`

## When To Use

Use this reference for **虚拟支付**（virtual goods payment）flows: 道具直购、代币、`wx.requestVirtualPayment`、`xpay_*` 回调事件、OfferID / AppKey 签名、发货推送、查单兜底。

**与微信支付的边界**：虚拟支付走 MP 后台「虚拟支付」通道（`wx.requestVirtualPayment`， OfferID + AppKey 签名），与 Integration Center 生成的微信支付（`wx.requestPayment`，商户号 + APIv3）是**两套独立链路**。卖实物/服务用微信支付（见 `mini-program-pay.md`）；卖虚拟道具/代币用本参考。

## Prerequisites

| 条件 | 说明 |
| --- | --- |
| 主体资质 | 个人 / 企业 / 个体户均可；个人主体需服务类目含「工具」，且**全终端月支付限额 10 万元** |
| 开通入口 | MP 后台 → 支付与交易 → 虚拟支付 → 开通 |
| 关键参数 | AppID（设置）、OfferID、现网 AppKey、沙箱 AppKey（均在 虚拟支付 → 基本配置） |
| 道具 | 虚拟支付 → 道具管理 创建并**发布**；发布后需等几分钟到半小时全平台同步，期间下单报 `COIN_OR_PRODUCT_ID_CREATED_IN_RECENTLY` |
| iOS 支付 | 需先配置「小程序简称」（Apple 展示名）并开通苹果 IAP；用户微信客户端需 **8.0.68+**，代码里先校验版本再拉起支付 |

## Sandbox vs 现网

| 模式 | 适用版本 | 限制 |
| --- | --- | --- |
| 沙箱 | 开发版 / 体验版 | 真机预览下会被 `PAYMENT_ILLEGAL_IN_SANDBOX` 拦截 |
| 现网 | 全版本 | iOS 真机需开通 IAP |

- 沙箱仅适合开发者工具内调试；真实联调用现网（`env: 0`、正式 AppKey）。
- 沙箱 AppKey 不要出现在生产代码里。

## Core Flow

```text
① 前端请求服务端下单 → 服务端生成唯一 outTradeNo，构造 signData，算 paySig + signature
② 前端调用 wx.requestVirtualPayment(payData) 拉起支付
③ 服务端确认支付并发货：
   路径 A：收到 xpay_goods_deliver_notify 发货推送 → 幂等发货
   路径 B：推送丢失时定时调 query_order 查单 → 已支付则补发货
④ 前端查服务端订单状态 → 展示购买成功
```

关键点：

- 发货以「发货推送」为主、`query_order` 查单兜底；**前端 success 回调不作为发货依据**。
- 幂等以平台单号 `wx_order_id`（回调里 `WeChatPayInfo.MchOrderNo`）去重。
- `outTradeNo` 每次下单重新生成、8-32 位、不能以下划线开头、不可复用。

### payData fields

| 字段 | 说明 |
| --- | --- |
| signData | JSON 字符串：`offerId` / `buyQuantity` / `env`（固定 0）/ `currencyType`（固定 CNY）/ `productId` / `goodsPrice`（单位：**分**，与后台道具价一致）/ `outTradeNo` / `attach`（透传，发货时原样返回） |
| mode | 道具直购固定 `short_series_goods` |
| paySig | 服务端用 **AppKey** 对 `requestVirtualPayment&signData` 做 HMAC-SHA256 |
| signature | 服务端用 **sessionKey**（`auth.code2Session` 获取）对 signData 做 HMAC-SHA256 |

### 签名规则

- `paySig` 消息体 = `uri + '&' + post_body`；`post_body` 必须与实际发出的请求体**完全一致**（不格式化、不改键顺序）。
- C 端下单 uri 固定 `requestVirtualPayment`；B 端服务接口（如 `/xpay/query_order`）用实际路径。

### Callback events (xpay_*)

| Event | 说明 | 处理 |
| --- | --- | --- |
| `xpay_goods_deliver_notify` | 道具发货通知 | 核心事件：幂等发货。应答格式跟 MP 后台选定的推送格式一致，见下文「Inbound notify」。格式不对时平台最多重试 15 次 |
| `xpay_coin_pay_notify` | 代币支付通知 | 更新代币余额 |
| `xpay_refund_notify` | 退款通知 | 更新订单状态、回收道具 |
| `xpay_complaint_notify` | 用户投诉通知 | 记录并人工跟进 |
| `xpay_subscribe_signing_result_notify` | 订阅签约结果 | 更新订阅状态 |
| `xpay_subscribe_pay_fail_notify` | 订阅支付失败 | 提示用户 |
| `xpay_subscribe_ios_refund_query_notify` | iOS 退款问询 | **3 秒内**返回 `IosRefundQueryResponse`：`result_code`（0 建议退款，1 拒绝）和必填 `evidence`；`result_info` 可选。连续 3 次超时则平台向 Apple 返回「不确定」 |

发货推送核心字段：`OpenId`（发给谁）、`OutTradeNo`（业务单号）、`WeChatPayInfo.MchOrderNo`（平台单号）、`GoodsInfo.ProductId` / `GoodsInfo.Quantity`（发什么、发多少）。字段全表以企业接入指引为准，不要把出站 `pay_sig` 示例当成推送 body。

### Inbound notify: gateway vs self-hosted HTTP

入站验真和出站 `pay_sig` 是两套协议。`pay_sig` 只用于本服务调用微信 `/xpay/*`（以及 C 端 `requestVirtualPayment`）。微信推送到开发者服务器时，走小程序「消息推送」。

| 接收方式 | 谁做验签 / 解密 | 业务代码做什么 |
| --- | --- | --- |
| 微信云开发云函数、CloudBase 集成中心网关 | 平台或网关已完成 | 只做幂等发货 / 回收。不要再对入站包算 `pay_sig` |
| 微信云托管消息推送 | 内网推送，默认不要求业务解密 | 公网访问开启时，只处理带 `x-wx-source` 的请求。见 `https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloudrun/src/guide/weixin/push.html` |
| 自建 HTTP（MP 后台配置的服务器 URL） | 开发者自己完成 | 按消息推送文档实现 GET 校验和 POST 验签解密 |

自建 HTTP 的配置在小程序管理后台 → 开发 → 开发管理 → 消息推送：URL、Token、EncodingAESKey、加解密方式、数据格式（XML 或 JSON）。

- **GET（提交配置时的 URL 校验）**：query 带 `signature`、`timestamp`、`nonce`、`echostr`。把 Token、`timestamp`、`nonce` 做字典序排序，拼接后 SHA1，与 `signature` 一致则**原样返回 `echostr`**。这里没有 body，也没有 `pay_sig`。消息推送文档给出了可复现的测试向量（Token `AAAAA`，期望 signature `f464b24fc39322e44b38aa78f5edd27bd1441696`）。
- **POST（发货 / 退款 / iOS 退款问询等业务通知）**：
  - 明文模式：用 query 的 `signature` 验签，算法与 GET 相同（Token、timestamp、nonce），body 即事件。
  - 安全模式（推荐）：验 query 的 `msg_signature`，不要用 `signature`。原串是 Token、timestamp、nonce、body 里的 `Encrypt` 四个字段字典序拼接后 SHA1。再用 EncodingAESKey 做 AES-256-CBC、PKCS#7 解密。明文布局是 `random(16B) + msg_len(4B, 网络字节序) + msg + appid`，`appid` 必须等于本小程序。测试向量（含期望明文与加密回包）在消息推送文档的安全模式示例里，事件名是 `debug_demo`，不是 xpay。
  - 兼容模式同时带明文和密文，不建议。
- Token 只参与签名。EncodingAESKey 只参与消息体加解密。二者都不是虚拟支付 AppKey。
- **应答格式跟推送数据格式走，XML 示例不是所有模式的通用应答**（企业接入指引 2.4）：
  - 推送为 XML：`<xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>`
  - 推送为 JSON：`{"ErrCode":0,"ErrMsg":"success"}`
  - 空串或 `success` 等价于 `ErrCode = 0`
  - `ErrCode` 必填，表示开发者已收下这条推送；`ErrMsg` 可选。这不是退款业务结果。
  - 格式不对时平台最多重试 15 次。带 `RetryTimes` 的事件写明间隔为 2、4、8、16…，从 0 起最多 15 次。
  - 公开页没有写应答的 HTTP 状态码和 `Content-Type`。不要自行补一个。
- 安全模式下，消息推送文档写明：接口没有特定回包要求时，回空串或 `success` 且不加密；其他回包内容要加密。xpay 页上的 `ErrCode` 示例是按数据格式给出的明文，没有单独的「安全模式发货回包」测试向量。iOS 问询回包带业务字段，按消息推送规则属于需要加密的回包。
- `xpay_refund_notify` 请求体里的 `RetCode` 才是退款结果：`0` 成功，非 `0` 失败（`RetMsg` 为原因）。用 `MchRefundId` / `WxRefundId` 对上那一笔退款单。通知到达本身不是退款完成。
- `xpay_subscribe_ios_refund_query_notify` 须在 **3 秒内**返回。企业接入指引的应答是 `IosRefundQueryResponse`：`result_code`（0 建议退款，1 拒绝）、`evidence`（必填，审计依据）、`result_info`（结果描述；云函数回调说明里标为非必填）。已发布的嵌套示例是云函数返回值 `{ ErrCode, ErrMsg, IosRefundQueryResponse }`，见 `https://developers.weixin.qq.com/miniprogram/dev/wxcloudservice/wxcloud/guide/wechatpay/virtual-payment-callback.html`。Apple 最终退款仍通过 `xpay_refund_notify` 通知，并且仍要看 `RetCode`。

### Query order (查单兜底)

`POST https://api.weixin.qq.com/xpay/query_order?access_token=ACCESS_TOKEN&pay_sig=PAY_SIG`

`pay_sig` 的 uri 是 `/xpay/query_order`（不带 query），消息体是实际发出的原始 JSON。本接口不支持云调用。

```json
{ "openid": "用户openid", "env": 0, "order_id": "业务单号 outTradeNo" }
```

`openid`、`env`（0 正式 / 1 沙箱）必填。`order_id` 传 outTradeNo，与 `wx_order_id` 二选一。参数名不是 `out_trade_no`。建议每 5 分钟查一次未完成订单。

返回里的 `order.status` 是**数字**。不要和字符串 `"paid"` 比较。

| status | 含义 | 业务判定 |
| --- | --- | --- |
| 0 | 初始化，未创建成功 | 不可支付 |
| 1 | 创建成功 | 待支付 |
| 2 | 已支付，待发货 | 查单兜底的发货条件 |
| 3 | 发货中 | 勿重复发货 |
| 4 | 已发货 | 幂等跳过 |
| 5 | 已经退款 | 枚举原文如此。文档没有说它在所有 `order_type` 和渠道下都等于「退款完成」 |
| 6 | 已关闭 | 不可再用 |
| 7 | 退款失败 | 不是退款成功 |
| 8 | 用户退款完成 | 枚举原文如此。不要和 status 5 当成同一种结果 |
| 9 | 回收广告金完成 | 不作为发货或退款依据 |
| 10 | 分账回退完成 | 不作为发货或退款依据 |

`order.order_type`：0 普通支付，1 普通退款，7 iOS 支付，8 iOS 退款。支付单的 `left_fee` 是剩余可退金额（分），退款前用它填 `refund_order.left_fee`。其余字段（渠道单号、结算状态、技术服务费）以 `query_order` 文档的 `Res.order` 为准，不要在代码里补一套别名。

## Refunds & Settlement

| 终端 | 退款 | 结算周期 | 费率 |
| --- | --- | --- | --- |
| Android 等 | 开发者主动（MP 后台或 `refund_order` 接口） | T+3 | 1%（腾讯技术服务费） |
| iOS | ❌ 开发者无法主动退款；用户在 App Store → 购买记录申请，Apple 审批后推送 `xpay_refund_notify` | 约 45-60 天 | 12%（Apple 佣金） |

- 可对支付后 **365 天内**的订单调用 `refund_order`。支付 **180 天内**退款平台退还手续费，超过 180 天不退手续费。
- iOS 订单不要调用 `refund_order`。前端「我的」等场景隐藏退款入口，改为引导用户去 App Store 申请。

### refund_order（只表示任务已受理）

`POST https://api.weixin.qq.com/xpay/refund_order?access_token=ACCESS_TOKEN&pay_sig=PAY_SIG`

`pay_sig` 的 uri 是 `/xpay/refund_order`。调用 URL 只带 `access_token` 与 `pay_sig`，不要另造用户态签名 query。本接口不支持云调用。

`errcode = 0` 只表示退款任务启动成功，返回 `refund_order_id`、`refund_wx_order_id`、`pay_order_id`、`pay_wx_order_id`。接口要求随后调用 `query_order` 查**退款单**状态，直到文档所称的「退款完成」。它没有写这四个单号分别填进 `order_id` 还是 `wx_order_id`，也没有把「退款完成」固定成某一个 status 数字。不要把 status 5 和 8 写成所有 `order_type`、所有渠道下的同一种完成态。

`xpay_refund_notify` 只有在 `RetCode = 0` 且 `MchRefundId` / `WxRefundId` 对上该笔退款时，才表示这笔退款成功。`RetCode` 非 0 是失败通知。响应里的 `ErrCode` 只表示推送已收下。通知到达和查单结果暂时不一致时，公开文档没有对照处理示例；不能只因为通知到达就记完成。

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| openid | 是 | 下单时的用户 openid |
| order_id | 与 `wx_order_id` 二选一 | 下单 outTradeNo |
| wx_order_id | 与 `order_id` 二选一 | 微信侧支付单号 |
| refund_order_id | 是 | 本次退款单号，长度 [8,32]，仅字母、数字、`_`、`-` |
| left_fee | 是 | 当前剩余可退金额（分），必须来自最新的 `query_order` |
| refund_fee | 是 | 本次退款金额（分），须满足 `(0, left_fee]`。小于 `left_fee` 即部分退款 |
| biz_meta | 是 | 商家自定义数据，长度 [0,1024]，查单时原样返回 |
| refund_reason | 是 | `0` 暂无描述，`1` 产品问题，`2` 售后问题，`3` 用户主动退款，`4` 价格问题，`5` 其他 |
| req_from | 是 | `1` 人工客服，`2` 用户自己发起，`3` 其他 |
| env | 是 | `0` 正式，`1` 沙箱 |

控制流相关错误码（完整列表见接口文档，不要把广告金错误码当成退款状态）：

| 错误码 | 处理 |
| --- | --- |
| 268490014 | 退款进行中。文档只说稍后用**相同参数**重试。没有写参数不一致时返回什么 |
| 268490016 | `left_fee` 与实际不符，重新 `query_order` 确认。没有写确认后能否沿用原来的 `refund_order_id` |
| 268490013 | 禁止对核销状态的单退款。这不是「稍后重试」 |

同一 `refund_order_id` 在超时未知、已成功、已失败、或金额不同时的返回值，多次部分退款除 `(0, left_fee]` 以外的累计上限，以及并发退款时的锁规则，接口页都没有写。不要把 `268490004` 当成退款幂等成功码，它的说明范围是赠送、代币支付和广告金充值。这些缺口需要向微信开放平台确认，不要在业务代码里补一套未发布的重试矩阵。

## Common Errors

| 错误 | 原因 | 解法 |
| --- | --- | --- |
| `COIN_OR_PRODUCT_ID_CREATED_IN_RECENTLY` | 道具刚发布，平台同步延迟 | 等几分钟到半小时再试 |
| `PAYMENT_ILLEGAL_IN_SANDBOX` | 沙箱模式在真机预览下被拒 | 切现网（`env: 0` + 正式 AppKey） |
| 当前商户尚未开启 iOS 支付 | iOS 端 IAP 未开通 | MP 后台配置小程序简称 + 开通 IAP |

## On 微信云开发 (WeChat CloudBase)

用微信云开发承接时无需自建服务器/证书：云函数承担下单签名、回调处理、查单兜底，云数据库存订单。回调云函数收到的是平台已验签的事件，业务侧只做幂等，不要再实现消息推送 AES。自建 HTTP 才走上文「Inbound notify」里的 Token / EncodingAESKey。典型拆分：

- 下单云函数：生成业务单号、构造 signData、计算双签名，返回 payData
- 回调云函数：接收 `xpay_*` 推送，幂等校验后发放/回收道具（需在 MP 后台配置发货推送 URL 并订阅事件）
- 查单云函数：推送丢失时调 `query_order` 补发货，兼作订单/道具查询

配合 Nightly 微信开发者工具（≥ 2.02.2608312）与 `wechatide` CLI / IDE MCP，可自动完成云函数部署与消息推送订阅（见 `../miniprogram-development/SKILL.md` 的 DevTools 工作流）。

## Implementation Checklist

- [ ] 已开通虚拟支付，拿到 AppID / OfferID / 现网 AppKey
- [ ] 道具已创建**并发布**（留意同步延迟）
- [ ] iOS 支付：小程序简称已配置、IAP 已开通、客户端已校验微信 ≥ 8.0.68
- [ ] 签名实现与官方示例核对一致；`post_body` 与实际请求体逐字节一致
- [ ] 金额单位全程「分」，不换算；`env` 固定 0
- [ ] 发货推送已配置 URL，回调以 `wx_order_id` 幂等去重
- [ ] 自建 HTTP 入站走消息推送 Token / EncodingAESKey；云函数或集成中心网关路径不再对入站包算 `pay_sig`
- [ ] `query_order` 兜底以 `order.status === 2` 发货，不以字符串 `"paid"` 判断
- [ ] 推送应答与 MP 后台的数据格式一致（JSON 或 XML）；`refund_order` 的 `errcode = 0` 只表示受理
- [ ] 退款成功同时看退款单查询结果，以及 `xpay_refund_notify` 的 `RetCode = 0` 且退款单号匹配。通知到达本身不算完成
- [ ] 已向用户说明退款规则与费率（Android 1% / iOS 12%、个人主体月限额 10 万）
- [ ] 上线后小额真单验证：支付 → 推送 → 发货 → 后台账单金额一致

## Do Not

- Do not use 沙箱 AppKey or sandbox mode for production / real-device verification.
- Do not treat the frontend `wx.requestVirtualPayment` success callback as the fulfillment trigger.
- Do not reuse `outTradeNo` across orders.
- Do not authenticate an inbound xpay push with `pay_sig` or AppKey. Self-hosted HTTP uses message-push Token / EncodingAESKey; cloud functions and the Integration Center gateway already verified the event.
- Do not treat `query_order` `order.status` as the string `"paid"`. Fulfill on status `2`.
- Do not treat `refund_order` `errcode = 0`, or the mere arrival of `xpay_refund_notify`, as refund completion. The notify request's `RetCode` is the refund outcome (`0` success, non-zero failure) and must match that refund's `MchRefundId` / `WxRefundId`.
- Do not answer every xpay push with the XML `ErrCode` sample. JSON push mode requires the JSON sample; an empty body or `success` is also a documented success ack.
- Do not invent `query_order` argument mapping for `refund_order_id` / `refund_wx_order_id` / `pay_order_id` / `pay_wx_order_id`, HTTP status, `Content-Type`, or a refund idempotency matrix. Those are not in the published API pages.
- Do not attempt server-side refund for iOS orders (user-initiated via App Store only).
- Do not place AppKey / sessionKey in mini program client code.
- Do not mix this flow with Integration Center 微信支付 (`wx.requestPayment`) contracts.
