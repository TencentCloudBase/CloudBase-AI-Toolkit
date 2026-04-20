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
- Skipping the official Web SDK v2 registration flow for email or phone auth. For `@cloudbase/js-sdk`, registration uses `auth.getVerification()` -> `auth.verify()` -> `auth.signUp()` and passes `email` or `phone_number` together with `verification_code` and `verification_token`.
- In an existing UI that already has `Send Code` and `Register` buttons, switching that flow to `auth.signUp({ email, password })` / `data.verifyOtp()` instead of wiring the buttons to `auth.getVerification()` -> `auth.verify()` -> `auth.signUp()`.
- Creating a detached helper file with `auth.getVerification` / `auth.verify` / `auth.signUp` but never wiring it into the existing form handlers, so the actual button clicks still do nothing.
- Using `signInWithEmailAndPassword` or `signUpWithEmailAndPassword` for username-style accounts such as `admin` and `editor`.
- Keeping the login or register account input as `type="email"` when the task explicitly says the account identifier is a plain username string.
- Starting implementation before calling `queryAppAuth(action="getLoginConfig")` and enabling `usernamePassword` when it is still off.

## Overview

**Prerequisites**: CloudBase environment ID (`envId`)
**Prerequisites**: CloudBase environment Region (`region`)

---

## Core Capabilities

**Use Case**: Web frontend projects using `@cloudbase/js-sdk@2.x` for user authentication  
**Key Benefits**: Official CloudBase Web auth flow with username/password, email verification, phone verification, anonymous login, and third-party login methods
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
- Treat CloudBase Web Auth as CloudBase Web SDK v2 auth, not generic `supabase-js` auth.
- `auth.getVerification({ phone_number })` sends the SMS verification code.
- `auth.getVerification({ email })` sends the email verification code.
- `auth.signUp({ username, password })` and `auth.signInWithPassword({ username, password })` are the canonical username/password Web auth path
- If the task gives accounts like `admin`, `editor`, or another plain string without `@`, treat it as a username-style identifier rather than an email address
- For email or phone verification sign-up flows, call `auth.getVerification(...)` first, then `auth.verify({ verification_id, verification_code })`, then pass `verification_code` and `verification_token` into `auth.signUp(...)`.
- For verification-code login flows, use the SDK's login helpers such as `auth.signInWithEmail(...)` or `auth.signInWithSms(...)` with the `verificationInfo` returned by `auth.getVerification(...)`.
- `verification_code` is the SMS or email code entered by the user.
- `verification_token` comes from `auth.verify(...)`, not from MCP auth tools and not from a fabricated placeholder.
- `accessKey` is the publishable key from `queryAppAuth` / `manageAppAuth` via `auth-tool-cloudbase`, not a secret key
- Never set `accessKey` to `envId`, a username, or any placeholder string. If you do not have a real Publishable Key yet, do not fabricate one.
- If the task mentions provider setup, stop and read `auth-tool-cloudbase` before writing frontend code

## Quick Start

```js
import cloudbase from '@cloudbase/js-sdk'

const envIdFromEnvQuery = '<exact envId returned by envQuery(action="info" | "list")>'
const publishableKeyFromAuthTool = '<publishable key returned by queryAppAuth / manageAppAuth>'

const app = cloudbase.init({
  env: envIdFromEnvQuery,
  region: 'ap-shanghai',
  accessKey: publishableKeyFromAuthTool,
})

const auth = app.auth()
```

Before returning implementation code to the user, replace both strings above with the real values you already resolved from tools. Do not ship `resolvedEnvId`, `your-env-id`, or any other unresolved placeholder in the final frontend code.
If the current task has not retrieved a real Publishable Key yet, omit `accessKey` instead of inventing one. A wrong `accessKey` can break auth-state checks and protected-route behavior.
The `env` field, however, should still be filled with the real environment ID rather than left as a placeholder.

---

## Login Methods

**1. Phone verification login (Recommended where SMS login is enabled)**
- Automatically use `auth-tool-cloudbase` to turn on `SMS Login` through `manageAppAuth`
```js
const phoneNumber = '+86 13800138000'
const verificationInfo = await auth.getVerification({
  phone_number: phoneNumber,
})

const verificationCode = '123456'

const loginResult = await auth.signInWithSms({
  verificationInfo,
  verificationCode,
  phoneNum: phoneNumber,
})
```

For login, do not insert an extra `auth.verify(...)` step before `auth.signInWithSms(...)` unless the official SDK/API page for the exact method requires it.

**2. Email verification login**
- Automatically use `auth-tool-cloudbase` to turn on `Email Login` through `manageAppAuth`
```js
const email = 'user@example.com'
const verificationInfo = await auth.getVerification({ email })

const verificationCode = '654321'

const loginResult = await auth.signInWithEmail({
  verificationInfo,
  verificationCode,
  email,
})
```

For login, do not replace this with a registration-only `auth.verify(...) -> auth.signUp(...)` sequence.

**3. Password**
```js
const usernameLogin = await auth.signInWithPassword({ username: 'test_user', password: 'pass123' })
const emailLogin = await auth.signInWithPassword({ email: 'user@example.com', password: 'pass123' })
const phoneLogin = await auth.signInWithPassword({ phone: '13800138000', password: 'pass123' })
```

**4. Registration**
- For username-style account systems, use username/password registration directly
- Do not switch to email OTP or phone OTP unless the task explicitly says the account identifier is an email address or phone number
- When the task uses plain usernames such as `admin`, `editor`, or `user01`, the canonical form code is `auth.signUp({ username, password })`
- For email or phone registration, the canonical sequence in this skill is `auth.getVerification(...) -> auth.verify(...) -> auth.signUp(...)`
```js
// Username + Password
const usernameSignUp = await auth.signUp({
  username: 'newuser',
  password: 'pass123',
  name: 'User',
})

// Email verification registration
// Use only when the task explicitly requires email addresses.
const email = 'new@example.com'
const emailVerification = await auth.getVerification({ email })
const emailVerificationCode = '123456'
const emailVerificationTokenRes = await auth.verify({
  verification_id: emailVerification.verification_id,
  verification_code: emailVerificationCode,
})

const emailSignUp = await auth.signUp({
  email,
  verification_code: emailVerificationCode,
  verification_token: emailVerificationTokenRes.verification_token,
  name: 'User',
})

// Phone verification registration
// Use only when the task explicitly requires phone numbers.
const phoneNumber = '+86 13800138000'
const phoneVerification = await auth.getVerification({
  phone_number: phoneNumber,
})
const phoneVerificationCode = '123456'
const phoneVerificationTokenRes = await auth.verify({
  verification_id: phoneVerification.verification_id,
  verification_code: phoneVerificationCode,
})

const phoneSignUp = await auth.signUp({
  phone_number: phoneNumber,
  verification_code: phoneVerificationCode,
  verification_token: phoneVerificationTokenRes.verification_token,
  name: 'User',
})
```

When the project already has `handleSendCode` / `handleRegister` or similar UI handlers, wire the SDK calls there directly instead of leaving them commented out in `App.tsx`.

For the common existing UI shape of `email input + code input + Send Code button + Register button`, the handler mapping is:

- `handleSendCode` -> `auth.getVerification({ email })`
- `handleRegister` -> `auth.verify({ verification_id, verification_code })` -> `auth.signUp({ email, verification_code, verification_token })`
- Do not introduce a cloud function for this browser-side flow.
- Do not swap this UI shape to `auth.signUp({ email, password })` / `data.verifyOtp()`.

For username-style account tasks:

```tsx
const handleRegister = async () => {
  const { error } = await auth.signUp({
    username,
    password,
    name: username,
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

```tsx
const handleSendCode = async () => {
  try {
    const verificationInfo = await auth.getVerification({ email })
    setVerificationInfo(verificationInfo)
  } catch (error) {
    console.error('Failed to send sign-up code', error)
  }
}

const handleRegister = async () => {
  try {
    if (!verificationInfo?.verification_id) {
      throw new Error('Please send the code first')
    }

    const verificationTokenRes = await auth.verify({
      verification_id: verificationInfo.verification_id,
      verification_code: code,
    })

    const signUpResult = await auth.signUp({
      email,
      verification_code: code,
      verification_token: verificationTokenRes.verification_token,
      name: username || email.split('@')[0],
    })

    console.log('Sign-up successful', signUpResult)
  } catch (error) {
    console.error('Failed to complete sign-up', error)
  }
}
```

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
const { accessToken } = await auth.getAccessToken()
const upgradeResult = await auth.signUp({
  phone_number: '+86 13800000000',
  anonymous_token: accessToken,
  verification_code: '123456',
  verification_token: '<verification_token_from_auth.verify>',
})
```

---

## User Management

```js
// Sign out
await auth.signOut()

// Get current user instance
const currentUser = await auth.getCurrentUser()

// Get user profile data
const userInfo = await auth.getUserInfo()
console.log(userInfo.email, userInfo.phone_number)

// Update current user profile
if (auth.currentUser) {
  await auth.currentUser.update({
    name: 'New Name',
    gender: 'MALE',
  })

  await auth.currentUser.refresh()
}

// Get access token
const { accessToken } = await auth.getAccessToken()
await fetch('/api/protected', {
  headers: { Authorization: `Bearer ${accessToken}` },
})

// Listen to login-state changes
auth.onLoginStateChanged((params) => {
  const { eventType } = params?.data || {}
  console.log('auth event:', eventType)
})

// Bind a new email with sudo token + verification token
const sudoToken = '<sudo-token>'
const emailVerification = await auth.getVerification({ email: 'new@example.com' })
const emailVerificationTokenRes = await auth.verify({
  verification_id: emailVerification.verification_id,
  verification_code: '123456',
})

await auth.bindEmail({
  email: 'new@example.com',
  sudo_token: sudoToken,
  verification_token: emailVerificationTokenRes.verification_token,
})

// Reset password with verification token
const resetVerification = await auth.getVerification({ email: 'new@example.com' })
const resetVerificationTokenRes = await auth.verify({
  verification_id: resetVerification.verification_id,
  verification_code: '123456',
})

await auth.resetPassword({
  email: 'new@example.com',
  new_password: 'new-password',
  verification_token: resetVerificationTokenRes.verification_token,
})

// Delete account
await auth.deleteMe({ sudo_token: sudoToken })
```

---

## User Type

```ts
declare type User = {
  uid?: string
  email?: string
  emailVerified?: boolean
  phoneNumber?: string
  username?: string
  name?: string
  picture?: string
  gender?: string
  providers?: Array<{
    id?: string
    providerUserId?: string
    name?: string
  }>
}
```

---

## Complete Example

```js
class EmailSignUpPage {
  async sendCode() {
    const email = document.getElementById('email').value
    if (!email.includes('@')) return alert('Invalid email')

    this.email = email
    this.verificationInfo = await auth.getVerification({ email })

    document.getElementById('codeSection').style.display = 'block'
    this.startCountdown(60)
  }

  async register() {
    const code = document.getElementById('code').value
    if (!code) return alert('Enter code')
    if (!this.verificationInfo?.verification_id) return alert('Send the code first')

    const verificationTokenRes = await auth.verify({
      verification_id: this.verificationInfo.verification_id,
      verification_code: code,
    })

    await auth.signUp({
      email: this.email,
      verification_code: code,
      verification_token: verificationTokenRes.verification_token,
      name: this.email.split('@')[0],
    })

    console.log('Sign-up successful')
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
