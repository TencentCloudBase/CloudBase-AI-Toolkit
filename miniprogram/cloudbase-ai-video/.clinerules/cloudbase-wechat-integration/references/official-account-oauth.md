# Official Account OAuth

Official docs:

- `https://docs.cloudbase.net/integration/wechat-official-oauth/index.md`
- `https://docs.cloudbase.net/integration/usage/index.md`

## When To Use

Use this reference for WeChat Official Account OAuth, openid retrieval, userinfo retrieval, token refresh, OAuth config inspection, or preparation for Official Account JSAPI payment.

## Agent Must Know

- Official Account openid is different from Mini Program openid.
- OAuth credentials should be configured through CloudBase Integration Center, not embedded in frontend code.
- The generated official-account function name may differ from example names such as `offiaccount-common`.
- OAuth route names must be confirmed from the generated function and official docs.

## Minimal Contract

Common generated OAuth routes include:

- `/oauth/config`
- `/oauth/token`
- `/oauth/refresh`
- `/oauth/userinfo`
- `/oauth/verify`

Typical flow:

1. Get OAuth config or construct the authorization URL according to the generated function contract.
2. Redirect the user to WeChat authorization.
3. Exchange the returned code for token/openid through the generated function.
4. Optionally fetch userinfo if the scope and product requirement allow it.
5. Store only the user identifiers and business-safe profile fields required by the app.

Example exchange shape:

```js
async function exchangeOfficialAccountCode(code) {
  const response = await fetch("/api/wechat/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await response.json();
  if (!data.openid) {
    throw new Error("Missing Official Account openid");
  }
  return data;
}
```

Use the actual generated function path or an application backend wrapper instead of copying this path literally.

## Implementation Checklist

- Confirm the target is an Official Account web scenario.
- Confirm OAuth callback domain and redirect URI are configured.
- Confirm the generated function name and OAuth routes.
- Decide whether the product needs only openid or also userinfo.
- Store tokens securely if refresh is required.
- For JSAPI pay, pass the Official Account openid into the payment order creation flow.

## Do Not

- Do not expose AppSecret in browser code.
- Do not confuse Official Account openid with Mini Program openid.
- Do not request userinfo scope unless the product actually needs profile data.
