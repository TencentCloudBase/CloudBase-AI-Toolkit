# WeChat Integration Troubleshooting

Official docs:

- `https://docs.cloudbase.net/integration/introduce/index.md`
- `https://docs.cloudbase.net/integration/usage/index.md`
- `https://docs.cloudbase.net/integration/wechat-pay-miniprogram/index.md`
- `https://docs.cloudbase.net/integration/wechat-pay-jsapi-h5/index.md`
- `https://docs.cloudbase.net/integration/wechat-pay-native/index.md`
- `https://docs.cloudbase.net/integration/wechat-official-oauth/index.md`

## First Checks

1. Confirm the scenario: Mini Program Pay, JSAPI Pay, Native Pay, or Official Account OAuth.
2. Confirm the CloudBase environment ID.
3. Confirm the actual generated function name.
4. Confirm the exact route path from Integration Center or generated function docs.
5. Check cloud function logs before changing code.
6. Check whether the issue is credential setup, route mismatch, callback delivery, or business logic.

## Common Symptoms

### 404 or route not found

Likely causes:

- wrong function name
- wrong HTTP path
- calling Mini Program payment path from the wrong client
- generated function was deleted or redeployed incorrectly

Actions:

- inspect the generated function routes
- confirm the call target uses the actual function name
- check CloudBase function logs and HTTP access logs

### Missing credentials or credential initialization errors

Likely causes:

- Integration Center form is incomplete
- merchant certificate/APIv3 key/private key was not configured
- function environment variables were removed or overwritten

Actions:

- re-check Integration Center credential configuration in the console
- do not paste secrets into code or chat
- restore generated environment variables if they were overwritten

### Openid mismatch

Likely causes:

- Mini Program openid used for Official Account JSAPI pay
- Official Account AppID does not match merchant binding
- user authorized a different app than the one used for payment

Actions:

- identify whether the flow needs Mini Program openid or Official Account openid
- verify AppID and merchant binding
- rerun OAuth or Mini Program call in the correct client context

### Payment succeeds in frontend but order is not fulfilled

Likely causes:

- business logic trusts frontend success only
- callback did not reach the generated function
- callback handler is not idempotent
- order status query is missing

Actions:

- use callback or query as the authoritative payment state
- add idempotent order update logic
- inspect payment callback logs
- verify `out_trade_no` maps to the application's order record

### Callback not received

Likely causes:

- merchant platform notification URL is wrong
- callback path does not match generated function route
- APIv3 key/certificate mismatch prevents verification/decryption
- function security or deployment issue

Actions:

- check Integration Center callback configuration
- check merchant platform callback settings
- inspect generated function logs
- retry with a low-value test order after fixing configuration

### `callHTTPFunction is not a function`

Likely causes:

- Mini Program base library or CloudBase SDK capability is too old
- the project is not initialized with `wx.cloud.init`
- the flow is running outside Mini Program runtime

Actions:

- confirm Mini Program runtime and base library support
- initialize CloudBase with the canonical full environment ID
- use the correct client flow for Web/JSAPI/Native scenarios

## Before Editing Generated Code

- Keep generated credential handling intact.
- Add business logic around generated handlers instead of replacing verification/decryption logic.
- Preserve callback idempotency and order lookup.
- Keep secrets out of source code.
