---
name: auth-web-cloudbase
description: CloudBase Web Authentication Quick Guide for frontend integration after auth-tool has already been checked. Provides concise and practical Web authentication solutions with multiple login methods and complete user management.
version: 2.33.2
alwaysApply: false
---

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../auth-tool-cloudbase/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

## Activation Contract

### Use this first when

- The task is a CloudBase Web login, registration, session, or user profile flow built with `@cloudbase/js-sdk` and the auth provider setup has already been checked.

### Read before writing code if

- The user needs a login page, auth modal, session handling, or protected Web route. Read `auth-tool-cloudbase` first to ensure providers are enabled, then return here for frontend integration.

### Then also read

- `../auth-tool-cloudbase/SKILL.md` for provider setup
- `../web-development/SKILL.md` for Web project structure and deployment

### Do not start here first when

- The request is a Web auth flow but provider configuration has not been verified yet.
- In that case, activate `auth-tool-cloudbase` before `auth-web-cloudbase`.

### Do NOT use for

- Mini program auth, native App auth, or server-side auth setup.

### Common mistakes / gotchas

- Skipping publishable key and provider checks.
- Replacing built-in Web auth with cloud function login logic.
- Reusing this flow in Flutter, React Native, or native iOS/Android code.
- Creating a detached helper file with `auth.signUp` / `verifyOtp` but never wiring it into the existing form handlers, so the actual button clicks still do nothing.
- Using `signInWithEmailAndPassword` or `signUpWithEmailAndPassword` for username-style accounts such as `admin` and `editor`.
- Keeping the login or register account input as `type="email"` when the task explicitly says the account identifier is a plain username string.
- Starting implementation before calling `queryAppAuth(action="getLoginConfig")` and enabling `usernamePassword` when it is still off.
- **Writing `auth.signInWithPassword(...)` or `auth.signUp(...)` code without first confirming the provider is enabled via MCP.** Before writing any sign-in or sign-up code in the browser, call `queryAppAuth(action="listProviders")` to verify the target provider (e.g. `email`, `phone`, `usernamePassword`) has `On: "TRUE"`. For email-based sign-up (`auth.signUp({ email, password })`), additionally confirm SMTP is configured — otherwise the provider may throw `"provider email not found"` or similar errors. For username/password login, use `auth.signInWithPassword({ username, password })`; registration is best done through the management API (`manageAppAuth(action="createUser")`) or by confirming email provider readiness first.
- **Treating `auth.getUser()` or deprecated `auth.getLoginState()` as proof of real login.** When the SDK is initialized with `accessKey`, the deprecated `getLoginState()` may still return an object with a valid `uid` even without any login — causing route guards that check `!!loginState` or `!!uid` to incorrectly pass. That misleading `uid` is **not** a gateway-authenticated session. Use `auth.getSession()` instead: it returns `data.session === undefined` when no real login has occurred. Only `!!data.session` from `getSession()` is a reliable authentication check.
- **Assuming publishable `accessKey` alone is enough for NoSQL CRUD.** NoSQL `app.database()` `get` / `add` / `update` / `watch` requires a gateway-authenticated **session**: use a real login (password / OTP / OAuth). Anonymous login is a demo-only escape hatch for explicitly-public, non-user data — it is disabled by default, denied AI model permissions, and must never stand in for real auth in user-scoped apps. Skipping any login yields **gateway 401**. `checkLogin()` / `getSession()` alone do **not** create a usable write session.
- **Copying old CloudBase auth snippets from training data.** Do not use `auth.getLoginState()`, `auth.hasLoginState()`, `auth.getCurrentUser()`, or `auth.toDefaultLoginPage()` as the default Web flow. Use the Web SDK v3 auth methods in this file and provider readiness from `auth-tool-cloudbase`.
- **Calling a standalone `auth.verifyOtp({ token })` for OTP login.** CloudBase Web SDK v3 returns `verifyOtp` as a callback on the `signInWithOtp` / `signUp` result: send the code first, keep the returned `data`, then call `data.verifyOtp({ token })`. A standalone `auth.verifyOtp({ token })` without `messageId` fails with `"messageId is required"` — seeing that error means the callback form was skipped. See `references/extended-guide.md` for the full send → save callback → verify flow.
  
  Note: anonymous login is **disabled by default** for new environments and inactive existing environments. Do not enable it to work around permission errors — enable via `auth-tool-cloudbase` only when the app explicitly serves public non-user data (e.g. NoSQL read-only demos). Always use `auth.getSession()` for auth guards.

## Overview

**Prerequisites**: CloudBase environment ID (`env`)
**Prerequisites**: CloudBase environment Region (`region`)

---

## Core Capabilities

**Use Case**: Web frontend projects using `@cloudbase/js-sdk@latest` for user authentication  
**Key Benefits**: **Supabase-compatible Auth API** — all methods return `{ data, error }`, supports phone, email, anonymous (disabled by default), username/password, OAuth, and third-party login methods

> 📌 **Supabase API Compatibility**: CloudBase Web SDK v3 auth module is designed with Supabase-like API ergonomics. If you are familiar with `supabase-js` auth patterns, the same mental model applies:
> - All methods return `Promise<{ data, error }>` — always check `error` first
> - `signInWithPassword`, `signInWithOtp`, `signUp`, `signOut`, `getSession`, `getUser` follow the same naming as Supabase
> - `onAuthStateChange(callback)` provides reactive auth state observation (events: `INITIAL_SESSION`, `SIGNED_IN`, `SIGNED_OUT`, `TOKEN_REFRESHED`, `USER_UPDATED`, `PASSWORD_RECOVERY`, `BIND_IDENTITY`)
> - Session management via `getSession()` / `refreshSession()` / `setSession()` mirrors Supabase patterns
> 
> **Key differences from Supabase**:
> - **OTP verification**: Supabase uses a standalone `auth.verifyOtp({ phone, token, type })` call; CloudBase returns `verifyOtp` as a callback on `data` — call `data.verifyOtp({ token })` from the `signInWithOtp` / `signUp` result
> - **`accessKey`** replaces Supabase's `anonKey`; environment uses `env` + `region` instead of Supabase's `url`
> - **`signInWithIdToken`** for direct third-party token login (similar to Supabase's same-named method)

Use npm installation for modern Web projects. In React, Vue, Vite, and other bundler-based apps, install and import `@cloudbase/js-sdk` from the project dependencies instead of using a CDN script.

## Prerequisites

- Automatically use `auth-tool-cloudbase` to check app-side auth readiness via `queryAppAuth` / `manageAppAuth`, then get the `publishable key` and configure login methods.
- **Publishable key readiness (do not skip):** call `queryAppAuth(action="getPublishableKey")`. If it is empty, call `manageAppAuth(action="ensurePublishableKey")` first — new environments may not have one provisioned, and skipping this step leaves the frontend without a data-plane credential, surfacing later as gateway auth failures instead of an obvious missing-key error.
- **Persist the key, don't hoard it in conversation:** after retrieval, write the publishable key to `.env.local` as `VITE_PUBLISHABLE_KEY` (create the file if missing) and read it in client code via `import.meta.env.VITE_PUBLISHABLE_KEY`. Never hardcode the key into source files, and never ask the user to fetch it from the console — fall back to the console link below only if both MCP calls fail.
- If `auth-tool-cloudbase` failed, let user go to `https://tcb.cloud.tencent.com/dev?envId={env}#/env/apikey` to get `publishable key` and `https://tcb.cloud.tencent.com/dev?envId={env}#/identity/login-manage` to set up login methods

### Parameter map

- For username-style identifiers, the required precondition is `loginMethods.usernamePassword === true` from `queryAppAuth(action="getLoginConfig")`. If it is false, enable it with `manageAppAuth(action="patchLoginStrategy", patch={ usernamePassword: true })` before wiring frontend auth code.
- If the conversation only provides an environment alias, nickname, or other shorthand, resolve it with `envQuery(action="list", alias=..., aliasExact=true)` first and use the returned canonical full `EnvId` for SDK init, console links, and generated config. Do not pass alias-like short forms directly into `cloudbase.init({ env })`.
- Treat CloudBase Web Auth as **Supabase-like**, not “every `supabase-js` auth example is valid unchanged”
- When `queryAppAuth` / `manageAppAuth` returns `sdkStyle: "supabase-like"` and `sdkHints`, follow those method and parameter hints first
- `auth.signInWithOtp({ phone })` and `auth.signUp({ phone })` use the phone number in a `phone` field, not `phone_number`
- `auth.signInWithOtp({ email })` and `auth.signUp({ email })` use `email`
- `auth.signInWithPassword({ username, password })` is the canonical Web login path for username/password accounts
- Treat direct Web `auth.signUp({ username, password })` as conditional. Verify `sdkHints` and the installed SDK first; some versions only support `signUp` for OTP/provider-token flows and will not create username/password users.
- If the task gives accounts like `admin`, `editor`, or another plain string without `@`, treat it as a username-style identifier rather than an email address
- `data.verifyOtp({ token })` — the `verifyOtp` callback on the `signInWithOtp` / `signUp` result `data` — expects the SMS or email code in `token`; do not invent a standalone `auth.verifyOtp({ token })` call, which additionally requires `messageId`
- `accessKey` is the publishable key from `queryAppAuth` / `manageAppAuth` via `auth-tool-cloudbase`, not a secret key
- **`accessKey` alone does not create a gateway-authenticated session.** Publishable `accessKey` initializes the SDK; it does **not** replace a login for NoSQL CRUD. Any `app.database()` `get` / `add` / `update` / `watch` needs a session — prefer a real login (password / OTP / OAuth); `signInAnonymously()` only for explicitly-public demo data (disabled by default, denied AI model permissions). Otherwise the gateway returns **401**. Separately: the deprecated `auth.getLoginState()` may still return a misleading `uid` without login; use `auth.getSession()` for route guards (`data.session === undefined` when not logged in). `checkLogin()` / `getSession()` alone do **not** create a usable write session.
- Never set `accessKey` to `envId`, a username, or any placeholder string. If you do not have a real Publishable Key yet, do not fabricate one.
- If the task mentions provider setup, stop and read `auth-tool-cloudbase` before writing frontend code

## Quick Start

SDK init reference: [docs.cloudbase.net/api-reference/webv3/initialization.md](https://docs.cloudbase.net/api-reference/webv3/initialization.md)（URL 加 `.md` 可取 raw markdown 原文）

```js
// npm install @cloudbase/js-sdk
import cloudbase from '@cloudbase/js-sdk'

const app = cloudbase.init({
  env: 'your-full-env-id', // Canonical full CloudBase environment ID resolved from envQuery or the console, not an alias or shorthand
  region: 'ap-shanghai',  // CloudBase environment Region, default 'ap-shanghai'
  accessKey: 'publishable key', // required, get from auth-tool-cloudbase
  // ⚠️ accessKey alone ≠ a login session. NoSQL CRUD needs a session —
  // real login preferred; signInAnonymously() only for public demo data.
  // Use auth.getSession() for route guards; deprecated getLoginState()
  // may return a misleading uid without a real session.
  auth: { detectSessionInUrl: true }, // required
})

const auth = app.auth

// NoSQL app.database() CRUD requires a session (js-sdk 3.x + publishable key).
// Real login (see cookbook). Anonymous, only for public non-user demos:
// const { error } = await auth.signInAnonymously()
// if (error) throw error
```

If the current task has not retrieved a real Publishable Key, omit `accessKey` instead of inventing one. A wrong `accessKey` can break auth-state checks and protected-route behavior.

## Auth code cookbook (official v3 API — copy these, do not re-derive from .d.ts)

Every method returns the unified shape `{ data, error }` — branch on `error` first and surface `error.message`. The auth API is identical in traditional and PG environments. Source: [official auth docs](https://docs.cloudbase.net/api-reference/webv3/authentication.md)（raw markdown, cross-check snippets there when in doubt）.

**Default auth UI contract:** when the user asks for 登录/注册/账号体系/user system without restricting the method, the login page must make ALL of these reachable (tabs or separate forms): password sign-in, OTP sign-in, verified sign-up (code + password), and forgot-password (whenever password sign-in exists). Never ship OTP-only or password-only UI unless explicitly asked. Never reveal whether an identifier is already registered in user-facing copy — route existing users to login with neutral wording.

**Password sign-in** (username-style or email identifiers both go here):

```js
const { data, error } = await auth.signInWithPassword({ username, password })
// email accounts: auth.signInWithPassword({ email, password })
if (error) { /* show error.message */ } else { /* data.user */ }
```

**Anonymous sign-in — demo-only, not a default.** NoSQL `app.database()` CRUD needs some session (PG anon reads work with accessKey alone). Prefer a real login; reach for anonymous ONLY when the app explicitly serves public non-user data and the user accepts the trade-off — it is disabled by default, denied AI model permissions, and its `uid` must never own user-scoped rows:

```js
const { error } = await auth.signInAnonymously()
```

**Registration — verification code is MANDATORY.** There is no password-only signup: `signUp` itself sends a code, and `data.verifyOtp` must complete it. Smart flow: existing identifier → plain login; new identifier → register + auto-login. Phone/SMS is 上海地域 only — prefer email:

```js
const { data, error } = await auth.signUp({ email, password }) // or { phone, password }
if (error) throw error
// user types the code from their inbox...
const { data: login, error: verifyErr } = await data.verifyOtp({ token: code })
// login.user / login.session — signed in on both paths
```

**OTP sign-in (no password)** — same shape as `signUp`, auto-creates the user by default (`shouldCreateUser: false` to refuse unknown users). Requires 邮箱/短信验证码登录 enabled in console → 身份认证/登录方式:

```js
const { data, error } = await auth.signInWithOtp({ email }) // or { phone }
const { data: login, error: verifyErr } = await data.verifyOtp({ token: code })
```

**Forgot password** — email code → set new password → auto sign-in (emits `PASSWORD_RECOVERY`):

```js
const { data, error } = await auth.resetPasswordForEmail(email)
if (error) throw error
const { data: login, error: resetErr } = await data.updateUser({ nonce: code, password: newPassword })
```

**OTP closure vs standalone `verifyOtp` — do not mix.** The `data.verifyOtp` returned by `signUp` / `signInWithOtp` / `resetPasswordForEmail` has the message ID bound (pass only `{ token }`). The standalone `auth.verifyOtp(...)` requires `messageId` and **only logs in — it never registers**. Always use the returned closure.

**Session check / route guard** — always `getSession()`, never the deprecated `getLoginState()`:

```js
const { data } = await auth.getSession()
const session = data?.session // undefined === not logged in
```

**Auth state listener** (wire this once at app bootstrap):

```js
auth.onAuthStateChange((event, session) => {
  // event: INITIAL_SESSION | SIGNED_IN | SIGNED_OUT | PASSWORD_RECOVERY
  //        | TOKEN_REFRESHED | USER_UPDATED | BIND_IDENTITY
})
```

**Sign out:**

```js
const { error } = await auth.signOut()
```

**Mandatory auth gate before user-scoped data.** Before reading/writing user-owned PG rows or Storage objects, check the session and show login when absent — never "fix" data errors by silently calling `signInAnonymously`:

```js
const { data } = await auth.getSession()
if (!data?.session) { navigate('/login'); return }
```

**Completion Bar** — before calling the auth task done, the generated source must have ALL of:

- [ ] `signInWithPassword` (when password login is part of the UI)
- [ ] a verification-code path: `signUp` + `data.verifyOtp` and/or `signInWithOtp`
- [ ] auth gate before user-scoped DB/Storage calls (rule above)
- [ ] `onAuthStateChange` wired at bootstrap (route guard reacts to `SIGNED_OUT`)
- [ ] errors surfaced from `error.message`, no invented error text
- [ ] NO `signInAnonymously` as a fallback for permission errors, no mock/localStorage sessions

---

## Extended guide

For detailed scenarios, examples, and patterns, read [extended-guide.md](references/extended-guide.md).

## Reference index

All packaged reference files (required for skill lint reachability):

- [extended-guide.md](references/extended-guide.md)
