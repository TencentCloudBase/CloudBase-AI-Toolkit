# Mini Program Virtual Payment (虚拟支付)

Official docs:

- `https://developers.weixin.qq.com/minigame/dev/wxcloud/guide/wechatpay/ai-virtualpayl-person.html`（AI 工具快速接入虚拟支付，含小游戏/小程序）
- `https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment`（企业/个体户接入指引）
- `https://developers.weixin.qq.com/miniprogram/dev/platform-capabilities/business-capabilities/virtual-payment/person`（个人主体接入指引）
- Client API: `https://developers.weixin.qq.com/miniprogram/dev/api/payment/wx.requestVirtualPayment.html`

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
| `xpay_goods_deliver_notify` | 道具发货通知 | 核心事件：幂等发货，返回 `<xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>`，否则平台重试（最多 15 次） |
| `xpay_coin_pay_notify` | 代币支付通知 | 更新代币余额 |
| `xpay_refund_notify` | 退款通知 | 更新订单状态、回收道具 |
| `xpay_complaint_notify` | 用户投诉通知 | 记录并人工跟进 |
| `xpay_subscribe_signing_result_notify` | 订阅签约结果 | 更新订阅状态 |
| `xpay_subscribe_pay_fail_notify` | 订阅支付失败 | 提示用户 |
| `xpay_subscribe_ios_refund_query_notify` | iOS 订阅退款问询 | **3 秒内**返回 `result_code`（0=建议退款，1=拒绝），否则 Apple 连续问询 3 次后标「不确定」 |

发货推送核心字段：`OpenId`（发给谁）、`OutTradeNo`（业务单号）、`WeChatPayInfo.MchOrderNo`（平台单号）、`GoodsInfo.ProductId` / `GoodsInfo.Quantity`（发什么、发多少）。

### Query order (查单兜底)

`POST /xpay/query_order`（带 pay_sig 签名）：

```json
{ "openid": "用户openid", "env": 0, "order_id": "业务单号 outTradeNo" }
```

> ⚠️ 参数名是 `order_id`（传 outTradeNo），不是 `out_trade_no`。建议每 5 分钟定时查一次未完成订单。

## Refunds & Settlement

| 终端 | 退款 | 结算周期 | 费率 |
| --- | --- | --- | --- |
| Android 等 | 开发者主动（MP 后台或 `refund_order` 接口） | T+3 | 1%（腾讯技术服务费） |
| iOS | ❌ 开发者无法主动退款；用户在 App Store → 购买记录申请，Apple 审批后推送 `xpay_refund_notify` | 约 45-60 天 | 12%（Apple 佣金） |

- 支付 180 天内退款平台退还手续费，超过 180 天不退。
- iOS 订单在前端「我的」等场景建议**隐藏退款入口**，改为引导用户去 App Store 申请。

## Common Errors

| 错误 | 原因 | 解法 |
| --- | --- | --- |
| `COIN_OR_PRODUCT_ID_CREATED_IN_RECENTLY` | 道具刚发布，平台同步延迟 | 等几分钟到半小时再试 |
| `PAYMENT_ILLEGAL_IN_SANDBOX` | 沙箱模式在真机预览下被拒 | 切现网（`env: 0` + 正式 AppKey） |
| 当前商户尚未开启 iOS 支付 | iOS 端 IAP 未开通 | MP 后台配置小程序简称 + 开通 IAP |

## On 微信云开发 (WeChat CloudBase)

用微信云开发承接时无需自建服务器/证书：云函数承担下单签名、回调处理、查单兜底，云数据库存订单。典型拆分：

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
- [ ] `query_order` 兜底查单已就绪
- [ ] 已向用户说明退款规则与费率（Android 1% / iOS 12%、个人主体月限额 10 万）
- [ ] 上线后小额真单验证：支付 → 推送 → 发货 → 后台账单金额一致

## Do Not

- Do not use 沙箱 AppKey or sandbox mode for production / real-device verification.
- Do not treat the frontend `wx.requestVirtualPayment` success callback as the fulfillment trigger.
- Do not reuse `outTradeNo` across orders.
- Do not attempt server-side refund for iOS orders (user-initiated via App Store only).
- Do not place AppKey / sessionKey in mini program client code.
- Do not mix this flow with Integration Center 微信支付 (`wx.requestPayment`) contracts.
