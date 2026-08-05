# Extended guide — auth-tool-cloudbase

> Moved from SKILL.md to satisfy Agent Skills Spec 500-line limit.

## Authentication Scenarios

### 1. Get Login Config

Preferred MCP tool path: `queryAppAuth(action="getLoginConfig")`

Recommended MCP request:

```json
{
  "action": "getLoginConfig"
}
```

`queryAppAuth` uses the currently selected environment and returns a short result by default:

```json
{
  "success": true,
  "envId": "your-full-env-id",
  "loginMethods": {
    "usernamePassword": true,
    "email": true,
    "anonymous": false,
    "phone": false
  }
}
```

Fallback API path: use the official login-config API. Do **not** use `lowcode/DescribeLoginStrategy` or `lowcode/ModifyLoginStrategy` as the default path.

Query current login configuration:
```js
{
    "params": { "EnvId": `env` },
    "service": "tcb",
    "action": "DescribeLoginConfig"
}
```

The underlying login strategy contains fields such as:

- `AnonymousLogin`
- `UserNameLogin`
- `PhoneNumberLogin`
- `EmailLogin`
- `SmsVerificationConfig`
- `MfaConfig`
- `PwdUpdateStrategy`

Parameter mapping for downstream Web auth code:

- `queryAppAuth(action="getLoginConfig")` and `manageAppAuth(action="patchLoginStrategy")` return `sdkStyle: "supabase-like"` plus `sdkHints`; treat that as the preferred frontend-auth calling guide
- `PhoneNumberLogin` controls phone OTP flows used by `auth-web-cloudbase` `auth.signInWithOtp({ phone })` and `auth.signUp({ phone })`
- `EmailLogin` controls email OTP flows used by `auth-web-cloudbase` `auth.signInWithOtp({ email })` and `auth.signUp({ email })`
- `UserNameLogin` controls username/password Web login flows used by `auth-web-cloudbase` `auth.signInWithPassword({ username, password })`; direct username/password `signUp` support is SDK/provider dependent and must be verified before use
- If the account identifier is a plain username string, do not route it through email-only helpers such as `signInWithEmailAndPassword`
- `UserNameLogin` also enables the broader password-login surface exposed by `auth.signInWithPassword({ username|email|phone, password })`
- `SmsVerificationConfig.Type = "apis"` requires both `Name` and `Method`
- `EnvId` is always the CloudBase environment ID, not the publishable key
- If the conversation only contains an environment alias, nickname, or other shorthand, resolve it to the canonical full `EnvId` first before generating auth config, SDK init examples, or console links

Internal behavior of `manageAppAuth(action="patchLoginStrategy")`:

1. Read the currently selected environment
2. Query the current login strategy
3. Merge the short `patch` into the writable strategy fields
4. Update through Manager SDK
5. Query again and return a short `loginMethods` result

---

### 2. Anonymous Login

> ⚠️ **Anonymous login is disabled by default.** Publishable `accessKey` alone does **not** create a gateway-authenticated anonymous session. Only enable anonymous login when the application explicitly requires unauthenticated client access (e.g. NoSQL CRUD demos) and you accept the associated security trade-offs. After enabling, Web clients using `@cloudbase/js-sdk` **3.x** must still call `await auth.signInAnonymously()` (or an equivalent authenticated session) **before** NoSQL `app.database()` CRUD — otherwise the gateway returns **401**. `checkLogin()` / `getSession()` alone do **not** create a usable write session. Anonymous users are also denied AI model invocation permissions by default.

Preferred MCP tool path: `manageAppAuth(action="patchLoginStrategy")`

To explicitly enable anonymous login (only when required):

```json
{
  "action": "patchLoginStrategy",
  "patch": {
    "anonymous": true
  }
}
```

The tool handles read-merge-write internally. The model does not need to build a full `ModifyLoginConfig` payload.

**Important**: Even after enabling anonymous login, anonymous users cannot call AI models by default. This permission must be explicitly granted separately if needed.

---

### 3. Username/Password Login

Preferred MCP tool path: `manageAppAuth(action="patchLoginStrategy")`

Recommended MCP request:

```json
{
  "action": "patchLoginStrategy",
  "patch": {
    "usernamePassword": true
  }
}
```

The tool handles read-merge-write internally. The model does not need to build a full `ModifyLoginConfig` payload.

---

### 4. SMS Login

Preferred MCP tool path: `manageAppAuth(action="patchLoginStrategy")`

Use `patch.phone = true/false` for the login method itself.

**Default SMS channel is ready out of the box.** After `patch.phone = true`, the CloudBase default SMS channel sends and receives verification codes without any extra setup — no SMS signature, template, or custom provider configuration is required. Frontend flow: `auth.getVerification({ phone_number })` to send the code, then `auth.signInWithSms({ verificationInfo, verificationCode, phoneNum })` to sign in. Note: SMS login is only supported in the `ap-shanghai` region, and phone numbers must include a country code (e.g. `+86 13800000000`).

Only when you need custom SMS templates, custom signatures, or a different SMS vendor should you configure a custom SMS channel (or raw API fields such as `SmsVerificationConfig`). Do not block SMS login on provider/signature setup — the default channel already works.

Short MCP example:

```json
{
  "action": "patchLoginStrategy",
  "patch": {
    "phone": true
  }
}
```

---

### 5. Email Login

Email has two layers of configuration:

- `ModifyLoginConfig.EmailLogin`: controls whether email/password login is enabled
- `ModifyProvider(Id="email")`: controls the email sender channel and SMTP configuration
- In Web auth code, this maps to `auth.signInWithOtp({ email })` and `auth.signUp({ email })`

Preferred MCP tool path:

- `manageAppAuth(action="patchLoginStrategy")` for `EmailLogin`
- `manageAppAuth(action="updateProvider")` for provider settings

Short MCP example:

```json
{
  "action": "patchLoginStrategy",
  "patch": {
    "email": true
  }
}
```

**Configure email provider (Tencent Cloud email)**:
```js
{
    "params": {
        "EnvId": `env`,
        "Id": "email",
        "On": "TRUE",
        "EmailConfig": { "On": "TRUE", "SmtpConfig": {} }
    },
    "service": "tcb",
    "action": "ModifyProvider"
}
```

**Disable email provider**:
```js
{
    "params": { "EnvId": `env`, "Id": "email", "On": "FALSE" },
    "service": "tcb",
    "action": "ModifyProvider"
}
```

**Configure email provider (custom SMTP)**:
```js
{
    "params": {
        "EnvId": `env`,
        "Id": "email",
        "On": "TRUE",
        "EmailConfig": {
            "On": "FALSE",
            "SmtpConfig": {
                "AccountPassword": "password",
                "AccountUsername": "username",
                "SecurityMode": "SSL",
                "SenderAddress": "sender@example.com",
                "ServerHost": "smtp.qq.com",
                "ServerPort": 465
            }
        }
    },
    "service": "tcb",
    "action": "ModifyProvider"
}
```

---

### 6. WeChat Login

Preferred MCP tool path:

- `queryAppAuth(action="listProviders")` or `queryAppAuth(action="getProvider")`
- `manageAppAuth(action="updateProvider")`

1. Get WeChat config:
```js
{
    "params": { "EnvId": `env` },
    "service": "tcb",
    "action": "GetProviders"
}
```
Filter by `Id == "wx_open"`, save as `WeChatProvider`.

2. Get credentials from [WeChat Open Platform](https://open.weixin.qq.com/cgi-bin/readtemplate?t=regist/regist_tmpl):
   - `AppID`
   - `AppSecret`

3. Update:
```js
{
    "params": {
        "EnvId": `env`,
        "Id": "wx_open",
        "On": "TRUE",  // "FALSE" to disable
        "Config": {
            ...WeChatProvider.Config,
            ClientId: `AppID`,
            ClientSecret: `AppSecret`
        }
    },
    "service": "tcb",
    "action": "ModifyProvider"
}
```

---

### 7. Google Login

Preferred MCP tool path:

- `queryAppAuth(action="getStaticDomain")`
- `queryAppAuth(action="listProviders")` or `queryAppAuth(action="getProvider")`
- `manageAppAuth(action="updateProvider")`

1. Get redirect URI (static hosting CDN domain):
```js
{
    "params": { "EnvId": `env` },
    "service": "tcb",
    "action": "DescribeStaticStore"
}
```
Prefer MCP: `queryAppAuth(action="getStaticDomain")` — use `cdnDomain` / `staticDomain` from the tool response (first store’s `CdnDomain`). Raw rows are in `staticStores`.

2. Configure at [Google Cloud Console](https://console.cloud.google.com/apis/credentials):
   - Create OAuth 2.0 Client ID
   - Set redirect URI: `https://{staticDomain}/__auth/`
   - Get `Client ID` and `Client Secret`

3. Enable:
```js
{
    "params": {
        "EnvId": `env`,
        "ProviderType": "OAUTH",
        "Id": "google",
        "On": "TRUE",  // "FALSE" to disable
        "Name": { "Message": "Google" },
        "Description": { "Message": "" },
        "Config": {
            "ClientId": `Client ID`,
            "ClientSecret": `Client Secret`,
            "Scope": "email openid profile",
            "AuthorizationEndpoint": "https://accounts.google.com/o/oauth2/v2/auth",
            "TokenEndpoint": "https://oauth2.googleapis.com/token",
            "UserinfoEndpoint": "https://www.googleapis.com/oauth2/v3/userinfo",
            "TokenEndpointAuthMethod": "CLIENT_SECRET_BASIC",
            "RequestParametersMap": {
                "RegisterUserSyncScope": "syncEveryLogin",
                "IsGoogle": "TRUE"
            }
        },
        "Picture": "https://qcloudimg.tencent-cloud.cn/raw/f9131c00dcbcbccd5899a449d68da3ba.png",
        "TransparentMode": "FALSE",
        "ReuseUserId": "TRUE",
        "AutoSignUpWithProviderUser": "TRUE"
    },
    "service": "tcb",
    "action": "ModifyProvider"
}
```

### 8. Provider Lifecycle Boundary

Use provider lifecycle APIs when the identity source itself needs to be created, updated, or removed.

Preferred MCP tool path:

- `queryAppAuth(action="listProviders")`
- `queryAppAuth(action="getProvider")`
- `manageAppAuth(action="addProvider")`
- `manageAppAuth(action="updateProvider")`
- `manageAppAuth(action="deleteProvider")`

Guidance:

- Use `addProvider` when the provider record does not exist yet and you need to create it with `providerType`, optional `providerId`, `displayName`, and `config`.
- Use `updateProvider` when the provider already exists and only its configuration or enablement state needs to change.
- Use `deleteProvider` when the provider must be removed entirely instead of only disabling it.

### 9. Client Configuration Boundary

Use client APIs for client metadata and token/session settings. Do not use them as a replacement for login strategy or provider management.

Preferred MCP tool path:

- `queryAppAuth(action="getClientConfig")`
- `manageAppAuth(action="updateClientConfig")`

Both tools should default to the current selected environment's default client. Only pass `clientId` when you intentionally want to inspect or modify a non-default client record.

**Query client config**:
```js
{
    "params": { "EnvId": `env`, "Id": `env` },
    "service": "tcb",
    "action": "DescribeClient"
}
```

**Update client config**:
```js
{
    "params": {
        "EnvId": `env`,
        "Id": `env`,
        "AccessTokenExpiresIn": 7200,
        "RefreshTokenExpiresIn": 2592000,
        "MaxDevice": 3
    },
    "service": "tcb",
    "action": "ModifyClient"
}
```

### 10. Publishable Key and API Key Boundary

Preferred MCP tool path:

- `queryAppAuth(action="getPublishableKey")`
- `manageAppAuth(action="ensurePublishableKey")`
- `queryAppAuth(action="listApiKeys")`
- `manageAppAuth(action="createApiKey")`
- `manageAppAuth(action="deleteApiKey")`

Use the shortcut pair `getPublishableKey` / `ensurePublishableKey` for the most common frontend-readiness flow.
Use the generic API key lifecycle actions when you need inventory, pagination, non-publishable keys, or explicit deletion.

**Query existing publishable key**:
```js
{
    "params": { "EnvId": `env`, "KeyType": "publish_key", "PageNumber": 1, "PageSize": 10 },
    "service": "tcb",
    "action": "DescribeApiKeyList"
}
```
`queryAppAuth(action="getPublishableKey")` should always force `KeyType="publish_key"` and return a short payload with `publishableKey`, `keyId`, `keyName`, `expireAt`, and `createdAt`.

**List API keys**:
```json
{
  "action": "listApiKeys",
  "keyType": "api_key",
  "pageNumber": 1,
  "pageSize": 20
}
```
Use `listApiKeys` for a general key inventory view. It supports optional `keyType`, `pageNumber`, and `pageSize`.

**Ensure publishable key exists**:
```js
{
    "params": { "EnvId": `env`, "KeyType": "publish_key" },
    "service": "tcb",
    "action": "CreateApiKey"
}
```
`manageAppAuth(action="ensurePublishableKey")` should first query the existing `publish_key`; if one already exists, return it directly; otherwise create it and return the new key. This keeps the MCP interface short and avoids requiring the model to reason about `KeyType` or whether a key already exists.

**Create a generic API key**:
```json
{
  "action": "createApiKey",
  "keyType": "api_key",
  "keyName": "server-prod",
  "expireIn": 86400
}
```
`createApiKey` defaults to `publish_key` when `keyType` is omitted, but it can also create `api_key` for generic service-side access.

The response carries a `created` flag verified against the server-side key inventory:

- `created: true` — a genuinely new key was issued.
- `created: false` — the backend returned an already-existing key (this is what happens for `publish_key`, which is unique per environment). In that case `keyName` / `expireIn` had no effect and a `warnings` array explains what was ignored.
- `created` absent — the inventory read failed, so creation could not be verified.

`keyName`, `expireAt`, and `createdAt` in the response are always the server-stored values, never an echo of the request parameters. Never treat a `created: false` result as a short-lived credential: it is the environment's long-lived publishable key, and revoking it affects all normal traffic. To provision a temporary credential, use `keyType: "api_key"` and confirm `created: true`.

**Delete an API key**:
```json
{
  "action": "deleteApiKey",
  "keyId": "api-key-id"
}
```
Use `deleteApiKey` only when you intentionally want to revoke that key token.

If creation fails, direct user to: "https://tcb.cloud.tencent.com/dev?envId=`env`#/env/apikey"

### 11. Custom Login Keys

Preferred MCP tool path: `manageAppAuth(action="createCustomLoginKeys")`

Use custom login keys when the application needs CloudBase custom auth integration and the standard provider setup is not enough.
