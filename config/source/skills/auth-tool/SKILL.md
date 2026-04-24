---
name: auth-tool-cloudbase
description: CloudBase auth provider configuration and login-readiness guide. This skill should be used when users need to inspect, enable, disable, or configure auth providers, publishable-key prerequisites, login methods, SMS/email sender setup, or other provider-side readiness before implementing a client or backend auth flow.
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-tool/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

## Activation Contract

### Use this first when

- The task is to inspect, enable, disable, or configure CloudBase auth providers, login methods, publishable key prerequisites, SMS/email delivery, or third-party login readiness.
- An auth implementation cannot proceed until provider status and login configuration are confirmed.
- A CloudBase Web auth flow needs provider verification before `auth-web`.

### Read before writing code if

- The request mentions provider setup, auth console configuration, publishable key retrieval, login method availability, SMS/email sender setup, or third-party provider credentials.
- The task mixes provider configuration with Web, mini program, Node, or raw HTTP auth implementation.

### Then also read

- Web auth UI -> `../auth-web/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-web/SKILL.md`)
- Mini program native auth -> `../auth-wechat/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-wechat/SKILL.md`)
- Node server-side identity / custom ticket -> `../auth-nodejs/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-nodejs/SKILL.md`)
- Native App / raw HTTP auth client -> `../http-api/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/http-api/SKILL.md`)

### Do NOT use this as

- The default implementation guide for every login or registration request.
- A replacement for mini program native auth behavior when no provider change is involved.
- A replacement for Node-side caller identity, user lookup, or custom login ticket flows.
- A replacement for frontend integration, session handling, or client UX implementation.

### Common mistakes / gotchas

- Writing login UI before enabling the required provider.
- Treating any mention of "auth" as a provider-management task.
- Implementing Web login in cloud functions.
- Routing native App auth to Web SDK flows.
- In an existing application, looping on provider queries after readiness is already known instead of wiring the active login and register handlers.

### Minimal checklist

- Read [Authentication Activation Checklist](checklist.md) before auth implementation.

## Overview

Configure CloudBase authentication providers: Anonymous, Username/Password, SMS, Email, WeChat, Google, and more.

**Prerequisites**: CloudBase environment ID (`env`)

## MCP Tool Boundary

Keep these two auth domains separate:

- `auth`: MCP / management-side login only. Use it for `status`, `start_auth`, `set_env`, `logout`, and `get_temp_credentials`.
- `queryAppAuth` / `manageAppAuth`: app-side authentication configuration. Use them for login methods, provider settings, publishable key, static domain, client config, and custom login keys.

Preferred execution order for this skill:

1. Use `queryAppAuth` / `manageAppAuth` first when the needed action exists there.
2. Use `callCloudApi` only as a fallback or for debugging raw request shapes.
3. Do not route app-side provider configuration back to the MCP `auth` tool.
4. In existing projects with active login and register handlers, stop revisiting provider setup after the required login method and publishable key are confirmed. Move back to the active frontend handler and finish the actual user flow.

---

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
    "anonymous": true,
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
- `PhoneNumberLogin` controls phone OTP flows used by `auth-web` `auth.signInWithOtp({ phone })` and `auth.signUp({ phone })`
- `EmailLogin` controls email OTP flows used by `auth-web` `auth.signInWithOtp({ email })` and `auth.signUp({ email })`
- `UserNameLogin` controls username/password Web auth flows used by `auth-web` `auth.signUp({ username, password })` and `auth.signInWithPassword({ username, password })`
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

Preferred MCP tool path: `manageAppAuth(action="patchLoginStrategy")`

Recommended MCP request:

```json
{
  "action": "patchLoginStrategy",
  "patch": {
    "anonymous": true
  }
}
```

The tool handles read-merge-write internally. The model does not need to build a full `ModifyLoginConfig` payload.

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

If SMS provider behavior also needs to change, keep using provider-side or raw API configuration for the extra fields such as `SmsVerificationConfig`.

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
