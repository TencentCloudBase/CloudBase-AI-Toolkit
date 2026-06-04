---
name: cloudbase-wechat-integration
description: CloudBase WeChat integration guide for Mini Program WeChat Pay, Official Account JSAPI Pay, Native QR-code Pay, Official Account OAuth, openid handling, payment callbacks, and CloudBase Integration Center generated functions. This skill should be used when users ask to add, debug, or extend WeChat payment or official-account flows on CloudBase.
version: 2.21.0
alwaysApply: false
---

# CloudBase WeChat Integration

This skill routes WeChat payment and official-account work through CloudBase Integration Center. It gives the agent the stable execution contract and points to official `index.md` docs for console details that may change.

## Standalone Install Note

This skill is designed to work when distributed independently on platforms such as OpenClaw. If sibling CloudBase skills are unavailable, use the references in this skill directory plus the official `index.md` documentation links in each reference file.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloudbase-wechat-integration/SKILL.md`
- CloudBase Integration Center overview: `https://docs.cloudbase.net/integration/introduce/index.md`
- CloudBase Integration Center usage: `https://docs.cloudbase.net/integration/usage/index.md`
- When cloud function deployment or log operations are needed and no sibling skill is available, use the current platform's CloudBase MCP tools or CloudBase console instead of guessing unsupported APIs.

## Activation Contract

### Use this first when

- The user asks about WeChat Pay, 小程序支付, 微信支付, JSAPI 支付, 公众号支付, Native 扫码支付, 二维码支付, refund callbacks, payment callbacks, `wx.requestPayment`, `WeixinJSBridge`, `openid`, or Official Account OAuth in a CloudBase app.
- The task mentions CloudBase Integration Center, 集成中心, generated payment functions, `pay-common`, `offiaccount-common`, or callback routing for WeChat payment.
- The user needs to extend a CloudBase Integration Center generated function with order persistence, idempotency, fulfillment, or payment-status sync.

### Then also read

- Mini Program structure and preview work -> `../miniprogram-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/miniprogram-development/SKILL.md`; if unavailable, use the current mini program platform docs and the mini-program payment reference in this skill)
- Web frontend work -> `../web-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/web-development/SKILL.md`; if unavailable, use the JSAPI or Native references in this skill)
- Cloud function runtime, logs, deployment, or gateway work -> `../cloud-functions/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloud-functions/SKILL.md`; if unavailable, use CloudBase console/MCP function tools and the generated-function guidance in this skill)

### Do NOT use for

- Generic CloudBase Web Auth or Mini Program native identity work that does not involve WeChat payment or official-account OAuth.
- General CloudBase cloud function development unrelated to Integration Center generated functions.
- Creating or managing Integration Center instances through guessed MCP tools, guessed Manager SDK methods, or undocumented Cloud API actions.
- Storing merchant secrets, private keys, APIv3 keys, AppSecret values, or certificates in app source code, generated examples, README files, commits, or prompts.

## Operating Rules

1. Treat Integration Center creation as a console-first workflow unless a public Manager SDK or Cloud API contract is confirmed in official docs.
2. Use official `index.md` docs for console UI steps and credential fields; do not copy stale console screenshots or invent field names.
3. Never ask the user to paste secrets into chat. Tell them to configure merchant and official-account credentials in the CloudBase console Integration Center form.
4. Do not assume generated function names are fixed. `pay-common` and `offiaccount-common` are examples; ask for or inspect the actual function name before writing calls.
5. Treat frontend payment success as UI feedback only. The authoritative payment state must come from server-side query results or payment callbacks.
6. When extending generated functions, preserve credential environment variables and generated callback verification/decryption logic. Add business logic around order checks, persistence, idempotency, and fulfillment.
7. Before changing payment or callback code, identify the target scenario and load only the matching reference file.

## Routing

| Task | Read | Why |
| --- | --- | --- |
| Capability selection, console-first boundaries, independent distribution | `references/overview.md` | Establishes the Integration Center model and safety rules |
| Mini Program WeChat Pay, `wx.cloud.callHTTPFunction`, `wx.requestPayment` | `references/mini-program-pay.md` | Covers Mini Program openid injection, order creation, and callback expectations |
| Official Account JSAPI pay, H5 inside WeChat, `WeixinJSBridge.invoke` | `references/official-account-jsapi-pay.md` | Covers official-account openid and JSAPI invocation |
| Native QR-code pay for PC/Web checkout | `references/native-qr-pay.md` | Covers `code_url`, QR rendering, and polling/query flow |
| Official Account OAuth, openid/userinfo retrieval | `references/official-account-oauth.md` | Covers OAuth routes generated by the official-account integration |
| 404, missing credentials, openid mismatch, callback failures, logs | `references/troubleshooting.md` | Provides diagnosis steps before changing code |

## Quick Workflow

1. Classify the scenario: Mini Program Pay, JSAPI Pay, Native Pay, Official Account OAuth, generated-function extension, or troubleshooting.
2. Load the matching reference and the official `index.md` docs linked there.
3. Confirm the actual CloudBase environment ID and generated function name.
4. Generate or modify only the required client/backend code; keep merchant credentials in Integration Center configuration.
5. Add order-status query, callback idempotency, and amount/order validation when payment state affects business data.
6. Verify through function logs, callback logs, and an end-to-end payment sandbox or low-value production test as appropriate.

## Minimum Self-Check

- Did I avoid guessing undocumented Integration Center management APIs?
- Did I use the actual generated function name instead of assuming `pay-common`?
- Did I keep all merchant secrets and certificates out of source code and chat?
- Did the payment flow rely on callback/query state rather than only frontend success?
- Did I load only the scenario reference needed for the user's task?
