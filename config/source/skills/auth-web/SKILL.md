---
name: auth-web-cloudbase
description: CloudBase Web Authentication Quick Guide for frontend integration after auth-tool has already been checked. Provides concise and practical Web authentication solutions with multiple login methods and complete user management.
version: 2.18.1
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
- Creating a detached helper file with `auth.getVerification` / `auth.verify` / `auth.signUp` but never wiring it into the existing form handlers, so the actual button clicks still do nothing.
- Treating email OTP registration as a one-step API or rebuilding the verification call inside the register handler, so the register button state never matches the real sign-up progress.
- Using `signInWithEmailAndPassword` or `signUpWithEmailAndPassword` for username-style accounts such as `admin` and `editor`.
- Keeping the login or register account input as `type="email"` when the task explicitly says the account identifier is a plain username string.
- Starting implementation before calling `queryAppAuth(action="getLoginConfig")` and enabling `usernamePassword` when it is still off.

## Overview

**Prerequisites**: CloudBase environment ID (`env`)
**Prerequisites**: CloudBase environment Region (`region`)

---

## Core Capabilities

**Use Case**: Web frontend projects using `@cloudbase/js-sdk@2.x` for user authentication  
**Key Benefits**: Supabase-like Auth API shape, supports phone, email, anonymous, username/password, and third-party login methods
**Official `@cloudbase/js-sdk` CDN**: `https://static.cloudbase.net/cloudbase-js-sdk/latest/cloudbase.full.js`

Prefer `npm install @cloudbase/js-sdk` in modern bundler projects. If the workspace already has `package.json`, `src/App.tsx`, Vite, React, or another existing form implementation, treat it as an in-place repair task and do not switch that flow to a CDN script. Use the CDN form only for static HTML, no-build demos, or low-friction examples that do not already have a bundler pipeline.

## Prerequisites

- Automatically use `auth-tool-cloudbase` to check app-side auth readiness via `queryAppAuth` / `manageAppAuth`, then get the `publishable key` and configure login methods.
- If `auth-tool-cloudbase` failed, let user go to `https://tcb.cloud.tencent.com/dev?envId={env}#/env/apikey` to get `publishable key` and `https://tcb.cloud.tencent.com/dev?envId={env}#/identity/login-manage` to set up login methods

### Parameter map

- For username-style identifiers, the required precondition is `loginMethods.usernamePassword === true` from `queryAppAuth(action="getLoginConfig")`. If it is false, enable it with `manageAppAuth(action="patchLoginStrategy", patch={ usernamePassword: true })` before wiring frontend auth code.
- Treat CloudBase Web Auth as **Supabase-like**, not “every `supabase-js` auth example is valid unchanged”
- When `queryAppAuth` / `manageAppAuth` returns `sdkStyle: "supabase-like"` and `sdkHints`, follow those method and parameter hints first
- Phone and email verification flows use the Web SDK v2 sequence `auth.getVerification(...) -> auth.verify(...) -> auth.signIn(...)` or `auth.signUp(...)`
- `auth.getVerification({ phone_number })` and `auth.signUp({ phone_number, verification_code, verification_token, ... })` use `phone_number`
- `auth.getVerification({ email })` and `auth.signUp({ email, verification_code, verification_token, ... })` use `email`
- `auth.signUp({ username, password })` and `auth.signInWithPassword({ username, password })` are the canonical username/password Web auth path
- If the task gives accounts like `admin`, `editor`, or another plain string without `@`, treat it as a username-style identifier rather than an email address
- `auth.verify({ verification_id, verification_code })` returns the required `verification_token`
- Email OTP registration is a three-step flow: call `auth.getVerification({ email })` in the send-code action, store the returned `verification_id`, then call `auth.verify(...)` and `auth.signUp(...)` from the register action
- When the task explicitly forbids CDN usage, or the project already uses React / Vite / another bundler, install `@cloudbase/js-sdk` from npm and keep the existing module-based import path
- `accessKey` is the publishable key from `queryAppAuth` / `manageAppAuth` via `auth-tool-cloudbase`, not a secret key
- Never set `accessKey` to `envId`, a username, or any placeholder string. If you do not have a real Publishable Key yet, do not fabricate one.
- If the task mentions provider setup, stop and read `auth-tool-cloudbase` before writing frontend code

## Quick Start

```js
import cloudbase from '@cloudbase/js-sdk'

const app = cloudbase.init({
  env: `env`, // CloudBase environment ID
  region: `region`,  // CloudBase environment Region, default 'ap-shanghai'
  accessKey: 'publishable key', // required, get from auth-tool-cloudbase
  auth: { detectSessionInUrl: true }, // required
})

const auth = app.auth({ persistence: 'local' })
```

If the current task has not retrieved a real Publishable Key, omit `accessKey` instead of inventing one. A wrong `accessKey` can break auth-state checks and protected-route behavior.

---

## Login Methods

**1. Phone OTP (Recommended)**
- Automatically use `auth-tool-cloudbase` to turn on `SMS Login` through `manageAppAuth`
```js
const verificationInfo = await auth.getVerification({ phone_number: '+86 13800138000' })
const verificationResult = await auth.verify({
  verification_id: verificationInfo.verification_id,
  verification_code: '123456',
})
const loginResult = await auth.signIn({
  username: '+86 13800138000',
  verification_token: verificationResult.verification_token,
})
```

**2. Email OTP**
- Automatically use `auth-tool-cloudbase` to turn on `Email Login` through `manageAppAuth`
```js
const verificationInfo = await auth.getVerification({ email: 'user@example.com' })
const loginResult = await auth.signInWithEmail({
  verificationInfo,
  verificationCode: '654321',
  email: 'user@example.com',
})
```

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
```js
// Username + Password
const usernameSignUp = await auth.signUp({
  username: 'newuser',
  password: 'pass123',
  nickname: 'User',
})

// Email Otp
// Use only when the task explicitly requires email addresses.
// Email Otp
const emailVerification = await auth.getVerification({ email: 'new@example.com' })
const emailVerificationToken = await auth.verify({
  verification_id: emailVerification.verification_id,
  verification_code: '123456',
})
const emailSignUp = await auth.signUp({
  email: 'new@example.com',
  verification_code: '123456',
  verification_token: emailVerificationToken.verification_token,
  name: 'User',
})

// Phone Otp
// Use only when the task explicitly requires phone numbers.
// Phone Otp
const phoneVerification = await auth.getVerification({ phone_number: '+86 13800138000' })
const phoneVerificationToken = await auth.verify({
  verification_id: phoneVerification.verification_id,
  verification_code: '123456',
})
const phoneSignUp = await auth.signUp({
  phone_number: '+86 13800138000',
  verification_code: '123456',
  verification_token: phoneVerificationToken.verification_token,
  name: 'User',
})
```

When the project already has `handleSendCode` / `handleRegister` or similar UI handlers, wire the SDK calls there directly instead of leaving them commented out in `App.tsx` or moving them into a detached helper that the real buttons never call.

For username-style account tasks:

```tsx
const handleRegister = async () => {
  const { error } = await auth.signUp({
    username,
    password,
    nickname: username,
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
    const verificationInfo = await auth.getVerification({
      email,
    })
    setSignUpData(verificationInfo) // keep verification_id in component state for the register action
  } catch (error) {
    console.error('Failed to send sign-up code', error)
  }
}

const canRegister = !!signUpData?.verification_id && code.trim().length > 0

const handleRegister = async () => {
  try {
    if (!signUpData?.verification_id) throw new Error('Please send the code first')

    const verificationTokenRes = await auth.verify({
      verification_id: signUpData.verification_id,
      verification_code: code,
    })

    await auth.signUp({
      email,
      verification_code: code,
      verification_token: verificationTokenRes.verification_token,
      name: email.split('@')[0],
    })
  } catch (error) {
    console.error('Failed to complete sign-up', error)
  }
}
```

For split-button register forms, the register button should derive its enabled state from `!!signUpData?.verification_id`, the current code input, and any loading flag. The register action must verify the code first, then call `auth.signUp({ email, verification_code, verification_token, ... })`. Do not skip `auth.verify`, do not substitute `verification_id` where `verification_token` is required, and do not leave the register button bound to a stale helper that never updates real registration state.

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
const sessionResult = await auth.getSession()
const verificationInfo = await auth.getVerification({ phone_number: '+86 13800000000' })
const upgradeVerification = await auth.verify({
  verification_id: verificationInfo.verification_id,
  verification_code: '123456',
})
await auth.signUp({
  phone_number: '+86 13800000000',
  anonymous_token: sessionResult.data.session.access_token,
  verification_code: '123456',
  verification_token: upgradeVerification.verification_token,
})
```

---

## User Management

```js
// Sign out
const signOutResult = await auth.signOut()

// Get user
const userResult = await auth.getUser()
console.log(
  userResult.data.user.email,
  userResult.data.user.phone,
  userResult.data.user.user_metadata?.nickName,
)

// Update user (except email, phone)
const updateProfileResult = await auth.updateUser({
  nickname: 'New Name',
  gender: 'MALE',
  avatar_url: 'url',
})

// Update user (email or phone)
const sudoRes = await auth.sudo({ password: 'current' })
const verificationInfo = await auth.getVerification({ email: 'new@example.com' })
const verifyEmailToken = await auth.verify({
  verification_id: verificationInfo.verification_id,
  verification_code: '123456',
})
await auth.bindEmail({
  email: 'new@example.com',
  sudo_token: sudoRes.sudo_token,
  verification_token: verifyEmailToken.verification_token,
})

// Change password (logged in)
const resetPasswordResult = await auth.resetPasswordForOld({
  old_password: 'old',
  new_password: 'new',
})

// Reset password (forgot)
const reauthResult = await auth.reauthenticate()
const forgotPasswordResult = await reauthResult.data.updateUser({
  nonce: '123456',
  password: 'new',
})

// Link third-party
const linkIdentityResult = await auth.linkIdentity({ provider: 'google' })

// View/Unlink identities
const identitiesResult = await auth.getUserIdentities()
const unlinkIdentityResult = await auth.unlinkIdentity({
  provider: identitiesResult.data.identities[0].id,
})

// Delete account
const deleteMeResult = await auth.deleteMe({ password: 'current' })

// Listen to state changes
const authStateSubscription = auth.onAuthStateChange((event, session, info) => {
  // INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY, BIND_IDENTITY
})

// Get access token
const sessionResult = await auth.getSession()
await fetch('/api/protected', {
  headers: { Authorization: `Bearer ${sessionResult.data.session?.access_token}` },
})

// Refresh user
const refreshUserResult = await auth.refreshUser()
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

    const verificationInfo = await auth.getVerification({ phone_number: `+86 ${phone}` })

    this.verificationInfo = verificationInfo
    document.getElementById('codeSection').style.display = 'block'
    this.startCountdown(60)
  }

  async verifyCode() {
    const code = document.getElementById('code').value
    if (!code) return alert('Enter code')
    if (!this.verificationInfo?.verification_id) return alert('Send the code first')

    const verificationTokenRes = await auth.verify({
      verification_id: this.verificationInfo.verification_id,
      verification_code: code,
    })
    const loginResult = await auth.signIn({
      username: `+86 ${document.getElementById('phone').value}`,
      verification_token: verificationTokenRes.verification_token,
    })

    console.log('Login successful:', loginResult)
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
