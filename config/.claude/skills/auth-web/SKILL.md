---
name: auth-web-cloudbase
description: CloudBase Web Authentication Quick Guide for frontend integration after auth-tool has already been checked. Provides concise and practical Web authentication solutions with multiple login methods and complete user management.
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-web/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

## Activation Contract

### Use this first when

- The task is a CloudBase Web login, registration, session, or user profile flow built with `@cloudbase/js-sdk` and the auth provider setup has already been checked.

### Read before writing code if

- The user needs a login page, auth modal, session handling, or protected Web route. Read `auth-tool` first to ensure providers are enabled, then return here for frontend integration.

### Then also read

- `../auth-tool/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-tool/SKILL.md`) for provider setup
- `../web-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/web-development/SKILL.md`) for Web project structure and deployment

### Do not start here first when

- The request is a Web auth flow but provider configuration has not been verified yet.
- In that case, activate `auth-tool-cloudbase` before `auth-web-cloudbase`.

### Do NOT use for

- Mini program auth, native App auth, or server-side auth setup.

### Common mistakes / gotchas

- Skipping publishable key and provider checks.
- Replacing built-in Web auth with cloud function login logic.
- Reusing this flow in Flutter, React Native, or native iOS/Android code.
- Using the v1 API (`auth.getVerification()` -> `auth.verify()` -> `auth.signUp()` with `verification_code` / `verification_token`). The v2 SDK uses `auth.signInWithOtp()` -> `data.verifyOtp({ token })` for login and `auth.signUp()` -> `data.verifyOtp({ token })` for registration. The `token` parameter is the verification code the user enters, not a separate verification token.
- Calling `auth.getVerification()` / `auth.verify()` / `auth.signInWithSms()` — these are v1 methods that do not exist in the v2 SDK. Use `auth.signInWithOtp({ phone })` -> `data.verifyOtp({ token })` instead.
- Using `auth.signInWithEmailAndPassword` or `auth.signUpWithEmailAndPassword` for username-style accounts such as `admin` and `editor`. Use `auth.signInWithPassword({ username, password })` instead.
- Keeping the login or register account input as `type="email"` when the task explicitly says the account identifier is a plain username string.
- Starting implementation before calling `queryAppAuth(action="getLoginConfig")` and enabling `usernamePassword` when it is still off.
- Leaving placeholder env IDs like `your-env-id` or `resolvedEnvId` in the final code. Always use the real `envId` from `envQuery`.
- Using `app.auth()` as a function call — in v2, `auth` is a property: `const auth = app.auth`.

## Overview

**Prerequisites**: CloudBase environment ID (`envId`)
**Prerequisites**: CloudBase environment Region (`region`)

---

## Core Capabilities

**Use Case**: Web frontend projects using `@cloudbase/js-sdk@2.x` for user authentication
**Key Benefits**: Compatible with `supabase-js` API, supports phone, email, anonymous, username/password, and third-party login methods
For React, Vite, Vue, Webpack, and other modern bundler projects, install the SDK from npm: `npm install @cloudbase/js-sdk`.

Only mention the CDN build for static HTML or no-build demos. If the task explicitly says not to use CDN, do not suggest the CDN path at all.

## Prerequisites

- Use `envQuery(action="info")` first to read the current CloudBase environment ID before any auth setup.
- If the MCP session is not bound yet or `envQuery(action="info")` cannot identify the target environment, use `envQuery(action="list")` to choose the real environment ID, then immediately call `auth(action="set_env")` with that exact `envId` so `queryAppAuth` / `manageAppAuth` operate on the correct app.
- When generating frontend code or `.env` examples, copy the exact environment ID returned by `envQuery` into the final snippet before you hand it back. Do not leave `your-env-id`, `resolvedEnvId`, or any other unresolved placeholder, and do not confuse `envId` with `accessKey` or `clientId`.
- Automatically use `auth-tool-cloudbase` to check app-side auth readiness: `queryAppAuth(action="getLoginConfig")` for login methods, `manageAppAuth(action="patchLoginStrategy")` when a required method is off, and `queryAppAuth(action="getPublishableKey")` or `manageAppAuth(action="ensurePublishableKey")` for the publishable key.
- If `auth-tool-cloudbase` failed after you already resolved the real `envId`, let the user go to `https://tcb.cloud.tencent.com/dev?envId=${exactEnvIdFromEnvQuery}#/env/apikey` to get the publishable key and `https://tcb.cloud.tencent.com/dev?envId=${exactEnvIdFromEnvQuery}#/identity/login-manage` to set up login methods.

Recommended tool order for Web auth setup:

1. `envQuery(action="info")`
2. If needed, `envQuery(action="list")`, keep the selected `envId`, and call `auth(action="set_env")` with it
3. `queryAppAuth(action="getLoginConfig")`
4. `manageAppAuth(action="patchLoginStrategy", patch={ ... })` when the required login method is off
5. `queryAppAuth(action="getPublishableKey")` or `manageAppAuth(action="ensurePublishableKey")`

### Parameter map

- For username-style identifiers, the required precondition is `loginMethods.usernamePassword === true` from `queryAppAuth(action="getLoginConfig")`. If it is false, enable it with `manageAppAuth(action="patchLoginStrategy", patch={ usernamePassword: true })` before wiring frontend auth code.
- All v2 auth methods return `{ data, error }` — always destructure both.
- **Phone OTP login**: `auth.signInWithOtp({ phone })` sends the SMS code, then `data.verifyOtp({ token })` verifies it. The `token` is the verification code the user enters.
- **Email OTP login**: `auth.signInWithOtp({ email })` sends the email code, then `data.verifyOtp({ token })` verifies it.
- **Phone/email registration**: `auth.signUp({ phone })` or `auth.signUp({ email })` sends the verification code, then `data.verifyOtp({ token })` completes registration and auto-logs in.
- **Username/password login**: `auth.signInWithPassword({ username, password })` is the canonical path. If the task gives accounts like `admin`, `editor`, or another plain string without `@`, treat it as a username-style identifier rather than an email address.
- `accessKey` is the publishable key from `queryAppAuth` / `manageAppAuth` via `auth-tool-cloudbase`, not a secret key.
- Never set `accessKey` to `envId`, a username, or any placeholder string. If you do not have a real Publishable Key yet, do not fabricate one.
- If the task mentions provider setup, stop and read `auth-tool-cloudbase` before writing frontend code.
- **SMS verification codes only support the Shanghai region** (`ap-shanghai`).

## Quick Start

```js
import cloudbase from '@cloudbase/js-sdk'

const envIdFromEnvQuery = '<exact envId returned by envQuery(action="info" | "list")>'
const publishableKeyFromAuthTool = '<publishable key returned by queryAppAuth / manageAppAuth>'

const app = cloudbase.init({
  env: envIdFromEnvQuery,
  region: 'ap-shanghai',
  accessKey: publishableKeyFromAuthTool,
  auth: { detectSessionInUrl: true },
})

const auth = app.auth
```

Before returning implementation code to the user, replace both strings above with the real values you already resolved from tools. Do not ship `resolvedEnvId`, `your-env-id`, or any other unresolved placeholder in the final frontend code.
If the current task has not retrieved a real Publishable Key yet, omit `accessKey` instead of inventing one. A wrong `accessKey` can break auth-state checks and protected-route behavior.
The `env` field, however, should still be filled with the real environment ID rather than left as a placeholder.

Note: `auth` is a **property** on the app instance (`app.auth`), not a function call. Do not write `app.auth()`.

---

## Login Methods

**1. Phone OTP (Recommended where SMS login is enabled)**
- Automatically use `auth-tool-cloudbase` to turn on `SMS Login` through `manageAppAuth`
```js
const { data, error } = await auth.signInWithOtp({ phone: '13800138000' })
if (error) {
  console.error('Send code failed:', error.message)
  return
}
// User enters the code, then verify
const { data: loginData, error: loginError } = await data.verifyOtp({ token: '123456' })
if (loginError) {
  console.error('Login failed:', loginError.message)
} else {
  console.log('Login successful:', loginData.user)
}
```

For phone login, the flow is: `auth.signInWithOtp({ phone })` -> `data.verifyOtp({ token })`. Do not call `auth.getVerification()`, `auth.verify()`, or `auth.signInWithSms()` — these are v1 methods that do not exist in the v2 SDK.

**2. Email OTP**
- Automatically use `auth-tool-cloudbase` to turn on `Email Login` through `manageAppAuth`
```js
const { data, error } = await auth.signInWithOtp({ email: 'user@example.com' })
if (error) {
  console.error('Send code failed:', error.message)
  return
}
const { data: loginData, error: loginError } = await data.verifyOtp({ token: '654321' })
if (loginError) {
  console.error('Login failed:', loginError.message)
} else {
  console.log('Login successful:', loginData.user)
}
```

For email login, the flow is: `auth.signInWithOtp({ email })` -> `data.verifyOtp({ token })`. Do not replace this with `auth.getVerification()` -> `auth.signInWithEmail()`.

**3. Password**
```js
const { data, error } = await auth.signInWithPassword({ username: 'test_user', password: 'pass123' })
const { data, error } = await auth.signInWithPassword({ email: 'user@example.com', password: 'pass123' })
const { data, error } = await auth.signInWithPassword({ phone: '13800138000', password: 'pass123' })
```

**4. Registration (Smart: auto-login if user exists)**
- Only supports email and phone OTP registration
- Automatically use `auth-tool-cloudbase` to turn on `Email Login` or `SMS Login` through `manageAppAuth`
```js
// Email OTP sign-up
const { data, error } = await auth.signUp({ email: 'new@example.com' })
if (error) {
  console.error('Send code failed:', error.message)
  return
}
const { data: loginData, error: loginError } = await data.verifyOtp({ token: '123456' })

// Phone OTP sign-up
const { data, error } = await auth.signUp({ phone: '13800138000' })
if (error) {
  console.error('Send code failed:', error.message)
  return
}
const { data: loginData, error: loginError } = await data.verifyOtp({ token: '123456' })
```

For registration, the flow is: `auth.signUp({ phone/email })` -> `data.verifyOtp({ token })`. The `signUp` call sends the verification code; `data.verifyOtp({ token })` completes registration and auto-logs in. Do not call `auth.getVerification()` -> `auth.verify()` -> `auth.signUp()` with `verification_code`/`verification_token` — that is the v1 API.

When the project already has `handleSendCode` / `handleLogin` or similar UI handlers, wire the SDK calls there directly instead of leaving them commented out.

For the common existing UI shape of `phone input + code input + Send Code button + Login button`, the handler mapping is:

- `handleSendCode` -> `auth.signInWithOtp({ phone })` and store `data.verifyOtp` in a ref
- `handleLogin` -> call the stored `verifyOtp({ token: code })`
- Do not introduce a cloud function for this browser-side flow.
- Do not use `auth.getVerification()` / `auth.verify()` / `auth.signInWithSms()`.

Example wiring for an existing React form with `handleSendCode` and `handleLogin`:

```tsx
const verifyOtpRef = useRef<((params: { token: string }) => Promise<unknown>) | null>(null)

const handleSendCode = async () => {
  if (!phone) return
  setLoading(true)
  try {
    const { data, error } = await auth.signInWithOtp({ phone })
    if (error) throw error
    verifyOtpRef.current = data.verifyOtp
    setCodeSent(true)
  } catch (error) {
    console.error('Send code failed:', error)
  } finally {
    setLoading(false)
  }
}

const handleLogin = async () => {
  if (!phone || !code || !verifyOtpRef.current) return
  setLoading(true)
  try {
    const { data, error } = await verifyOtpRef.current({ token: code })
    if (error) throw error
    console.log('Login successful:', data.user)
  } catch (error) {
    console.error('Login failed:', error)
  } finally {
    setLoading(false)
  }
}
```

For username-style account tasks:

```tsx
const handleRegister = async () => {
  const { error } = await auth.signUp({
    username,
    password,
  })
  if (error) throw error
}

const handleLogin = async () => {
  const { error } = await auth.signInWithPassword({
    username,
    password,
  })
  if (error) throw error
}
```

Do not use email OTP or email-only helpers for these flows unless the task explicitly says the account identifier is an email address. The corresponding form field should stay `type="text"` rather than `type="email"` for username-style account identifiers.

**5. Anonymous**
- Automatically use `auth-tool-cloudbase` to turn on `Anonymous Login` through `manageAppAuth`
```js
const { data, error } = await auth.signInAnonymously()
```

**6. OAuth (Google/WeChat)**
- Automatically use `auth-tool-cloudbase` to turn on `Google Login` or `WeChat Login` through `manageAppAuth`
```js
const { data, error } = await auth.signInWithOAuth({ provider: 'google' })
window.location.href = data.url // Auto-complete after callback
```

**7. Custom Ticket**
```js
await auth.signInWithCustomTicket(async () => {
  const res = await fetch('/api/ticket')
  return (await res.json()).ticket
})
```

**8. Upgrade Anonymous**
```js
const { data, error } = await auth.getSession()
const { data: signUpData, error: signUpError } = await auth.signUp({
  phone: '13800000000',
  anonymous_token: data.session.access_token,
})
const { data: loginData, error: loginError } = await signUpData.verifyOtp({ token: '123456' })
```

---

## User Management

```js
// Sign out
const { data, error } = await auth.signOut()

// Get user
const { data, error } = await auth.getUser()
console.log(data.user.email, data.user.phone, data.user.user_metadata?.nickName)

// Update user (except email, phone)
const { data, error } = await auth.updateUser({ nickname: 'New Name', gender: 'MALE', avatar_url: 'url' })

// Update user (email or phone)
const { data, error } = await auth.updateUser({ email: 'new@example.com' })
const { data: verifyData, error: verifyError } = await data.verifyOtp({ email: "new@example.com", token: "123456" })

// Change password (logged in)
const { data, error } = await auth.resetPasswordForOld({ old_password: 'old', new_password: 'new' })

// Reset password (forgot)
const { data, error } = await auth.reauthenticate()
const { data: updateData, error: updateError } = await data.updateUser({ nonce: '123456', password: 'new' })

// Link third-party
const { data, error } = await auth.linkIdentity({ provider: 'google' })

// View/Unlink identities
const { data, error } = await auth.getUserIdentities()
const { data: unlinkData, error: unlinkError } = await auth.unlinkIdentity({ provider: data.identities[0].id })

// Delete account
const { data, error } = await auth.deleteMe({ password: 'current' })

// Listen to state changes
const { data, error } = auth.onAuthStateChange((event, session, info) => {
  // INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY, BIND_IDENTITY
})

// Get access token
const { data, error } = await auth.getSession()
fetch('/api/protected', { headers: { Authorization: `Bearer ${data.session?.access_token}` } })

// Refresh user
const { data, error } = await auth.refreshUser()
```

---

## User Type

```ts
declare type User = {
  id: any
  aud: string
  role: string[]
  email: any
  email_confirmed_at: string
  phone: any
  phone_confirmed_at: string
  confirmed_at: string
  last_sign_in_at: string
  app_metadata: {
    provider: any
    providers: any[]
  }
  user_metadata: {
    name: any
    picture: any
    username: any
    gender: any
    locale: any
    uid: any
    nickName: any
    avatarUrl: any
    location: any
    hasPassword: any
  }
  identities: any
  created_at: string
  updated_at: string
  is_anonymous: boolean
}
```

---

## Complete Example

```js
class PhoneLoginPage {
  async sendCode() {
    const phone = document.getElementById('phone').value
    if (!/^1[3-9]\d{9}$/.test(phone)) return alert('Invalid phone')

    const { data, error } = await auth.signInWithOtp({ phone })
    if (error) return alert('Send failed: ' + error.message)

    this.verifyOtp = data.verifyOtp
    document.getElementById('codeSection').style.display = 'block'
    this.startCountdown(60)
  }

  async verifyCode() {
    const code = document.getElementById('code').value
    if (!code) return alert('Enter code')

    const { data, error } = await this.verifyOtp({ token: code })
    if (error) return alert('Verification failed: ' + error.message)

    console.log('Login successful:', data.user)
    window.location.href = '/dashboard'
  }

  startCountdown(seconds) {
    let countdown = seconds
    const btn = document.getElementById('resendBtn')
    btn.disabled = true

    const timer = setInterval(() => {
      countdown--
      btn.innerText = `Resend in ${countdown}s`
      if (countdown <= 0) {
        clearInterval(timer)
        btn.disabled = false
        btn.innerText = 'Resend'
      }
    }, 1000)
  }
}
```
