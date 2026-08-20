---
name: auth-web-cloudbase
description: CloudBase Web Authentication Quick Guide for frontend integration after auth-tool has already been checked. Provides concise and practical Web authentication solutions with multiple login methods and complete user management.
version: 2.31.0
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
- **Assuming publishable `accessKey` alone is enough for NoSQL CRUD.** With `@cloudbase/js-sdk` **3.x**, call **`await auth.signInAnonymously()`** (or an equivalent authenticated session such as password/OTP/OAuth) **before** any NoSQL `app.database()` `get` / `add` / `update` / `watch`. Skipping this yields **gateway 401**. `checkLogin()` / `getSession()` alone do **not** create a usable write session.
- **Copying old CloudBase auth snippets from training data.** Do not use `auth.getLoginState()`, `auth.hasLoginState()`, `auth.getCurrentUser()`, or `auth.toDefaultLoginPage()` as the default Web flow. Use the Web SDK v3 auth methods in this file and provider readiness from `auth-tool-cloudbase`.
  
  Note: anonymous login is **disabled by default** for new environments and inactive existing environments — enable it via `auth-tool-cloudbase` before calling `signInAnonymously()`. Always use `auth.getSession()` for auth guards.

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
- `verifyOtp({ token })` expects the SMS or email code in `token`
- `accessKey` is the publishable key from `queryAppAuth` / `manageAppAuth` via `auth-tool-cloudbase`, not a secret key
- **`accessKey` alone does not create a gateway-authenticated anonymous session.** Publishable `accessKey` initializes the SDK; it does **not** replace an explicit login for NoSQL CRUD. With `@cloudbase/js-sdk` **3.x**, call `await auth.signInAnonymously()` (or an equivalent authenticated session) **before** `app.database()` `get` / `add` / `update` / `watch` — otherwise the gateway returns **401**. Separately: the deprecated `auth.getLoginState()` may still return a misleading `uid` without login; use `auth.getSession()` for route guards (`data.session === undefined` when not logged in). `checkLogin()` / `getSession()` alone do **not** create a usable write session.
- Never set `accessKey` to `envId`, a username, or any placeholder string. If you do not have a real Publishable Key yet, do not fabricate one.
- If the task mentions provider setup, stop and read `auth-tool-cloudbase` before writing frontend code

## Quick Start

```js
// npm install @cloudbase/js-sdk
import cloudbase from '@cloudbase/js-sdk'

const app = cloudbase.init({
  env: 'your-full-env-id', // Canonical full CloudBase environment ID resolved from envQuery or the console, not an alias or shorthand
  region: 'ap-shanghai',  // CloudBase environment Region, default 'ap-shanghai'
  accessKey: 'publishable key', // required, get from auth-tool-cloudbase
  // ⚠️ accessKey alone ≠ anonymous login. For NoSQL CRUD call await auth.signInAnonymously()
  // (or real login) first — otherwise gateway 401. Use auth.getSession() for route guards;
  // deprecated getLoginState() may return a misleading uid without a real session.
  auth: { detectSessionInUrl: true }, // required
})

const auth = app.auth

// Before NoSQL app.database() CRUD (js-sdk 3.x + publishable key):
// const { error } = await auth.signInAnonymously()
// if (error) throw error
```

If the current task has not retrieved a real Publishable Key, omit `accessKey` instead of inventing one. A wrong `accessKey` can break auth-state checks and protected-route behavior.

---

## Extended guide

For detailed scenarios, examples, and patterns, read [extended-guide.md](references/extended-guide.md).

## Reference index

All packaged reference files (required for skill lint reachability):

- [extended-guide.md](references/extended-guide.md)
