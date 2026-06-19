# CloudBase WeChat Integration Overview

Official docs:

- `https://docs.cloudbase.net/integration/introduce/index.md`
- `https://docs.cloudbase.net/integration/usage/index.md`

## What Integration Center Provides

CloudBase Integration Center is a console-driven capability for connecting third-party services to CloudBase. For WeChat scenarios, it can generate HTTP cloud functions, inject configuration through managed environment variables, and handle platform-specific callback verification or decryption.

Use this skill for the application-side work around those integrations:

- generating client calls to the generated functions
- adding order persistence, idempotency, and fulfillment logic
- diagnosing callback, credential, and routing issues
- guiding the user through console setup without collecting secrets

## Agent Must Know

- Creation and credential binding are console-first unless official public API support is confirmed.
- Generated function names may vary. Examples such as `pay-common` and `offiaccount-common` are not a contract.
- Merchant secrets, private keys, APIv3 keys, AppSecret values, and certificates belong in CloudBase console configuration, not in source code.
- The payment callback or order-query result is the authoritative state for business fulfillment.
- Generated functions should be treated as platform-managed templates with safe business extensions, not as blank custom functions.

## Scenario Map

| User wording | Route |
| --- | --- |
| 小程序支付, 微信支付, `wx.requestPayment` | `mini-program-pay.md` |
| 公众号支付, JSAPI 支付, 微信内网页支付 | `official-account-jsapi-pay.md` |
| Native 支付, 扫码支付, 二维码支付 | `native-qr-pay.md` |
| 公众号授权, openid, userinfo, OAuth | `official-account-oauth.md` |
| 回调失败, 404, 凭证, openid 不匹配 | `troubleshooting.md` |

## Console-First Setup Checklist

1. Confirm the CloudBase environment ID.
2. Open Integration Center in the CloudBase console.
3. Choose the matching WeChat integration type.
4. Fill merchant or official-account credentials in the console form.
5. Record the generated function name and HTTP route paths.
6. Run a minimal call before adding business logic.
7. Add business data handling after the generated function works.

## Independent Distribution Notes

When this skill is installed alone:

- Use only the references in this directory plus the official docs above.
- If no CloudBase MCP tools are available, guide the user to inspect function logs and configuration in the console.
- Do not reference local repository paths that may not exist in the target platform.
