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
- Creating a detached helper file with `auth.signUp` / `verifyOtp` but never wiring it into the existing form handlers, so the actual button clicks still do nothing.
- Using `signInWithEmailAndPassword` or `signUpWithEmailAndPassword` for username-style accounts such as `admin` and `editor`.
- Keeping the login or register account input as `type="email"` when the task explicitly says the account identifier is a plain username string.
- Starting implementation before calling `queryAppAuth(action="getLoginConfig")` and enabling `usernamePassword` when it is still off.

## Overview

**Prerequisites**: CloudBase environment ID (`env`)
**Prerequisites**: CloudBase environment Region (`region`)

---

## Core Capabilities

**Use Case**: Web frontend projects using `@cloudbase/js-sdk@2.24.0+` for user authentication  
**Key Benefits**: Supabase-like Auth API shape, supports phone, email, anonymous, username/password, and third-party login methods
**Official `@cloudbase/js-sdk` CDN**: `https://static.cloudbase.net/cloudbase-js-sdk/latest/cloudbase.full.js`

Use the same CDN address as `web-development`. Prefer npm installation in modern bundler projects, and use the CDN form for static HTML, no-build demos, or low-friction examples.

## Prerequisites

- Automatically use `auth-tool-cloudbase` to check app-side auth readiness via `queryAppAuth` / `manageAppAuth`, then get the `publishable key` and configure login methods.
- If `auth-tool-cloudbase` failed, let user go to `https://tcb.cloud.tencent.com/dev?envId={env}#/env/apikey` to get `publishable key` and `https://tcb.cloud.tencent.com/dev?envId={env}#/identity/login-manage` to set up login methods

### Parameter map

- For username-style identifiers, the required precondition is `loginMethods.usernamePassword === true` from `queryAppAuth(action="getLoginConfig")`. If it is false, enable it with `manageAppAuth(action="patchLoginStrategy", patch={ usernamePassword: true })` before wiring frontend auth code.
- Treat CloudBase Web Auth as **Supabase-like**, not “every `supabase-js` auth example is valid unchanged”
- When `queryAppAuth` / `manageAppAuth` returns `sdkStyle: "supabase-like"` and `sdkHints`, follow those method and parameter hints first
- `auth.signUp({ email|phone, password, username?, ... })` starts the documented public signup flow for email or phone registration and returns a `verifyOtp({ token })` callback in `data`
- `auth.signInWithPassword({ username, password })` is the canonical username/password login path after the user has already been created and bound to a username during an email or phone verification signup flow
- Email and phone registration are verification-code flows. Follow the installed Web SDK docs and complete the flow through the returned `data.verifyOtp({ token })` callback unless that SDK version documents a different surface.
- For email signup, collect the address, password, and optional username up front, then pass them to `auth.signUp(...)` before asking the user for the verification code.
- If the email account should support later password login, include `password` in the initial sign-up payload before finishing the verification flow.
- If the task gives accounts like `admin`, `editor`, or another plain string without `@`, treat it as a username-style identifier rather than an email address
- The `verifyOtp({ token })` callback returned by `auth.signUp(...)` completes the signup after the user enters the received verification code
- `accessKey` is the publishable key from `queryAppAuth` / `manageAppAuth` via `auth-tool-cloudbase`, not a secret key
- Never set `accessKey` to `envId`, a username, or any placeholder string. If you do not have a real Publishable Key yet, do not fabricate one.
- If the task mentions provider setup, stop and read `auth-tool-cloudbase` before writing frontend code

## Quick Start

```js
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({
  env: `env`, // CloudBase environment ID
  region: `region`, // CloudBase environment Region, default 'ap-shanghai'
  accessKey: "publishable key", // required, get from auth-tool-cloudbase
  auth: { detectSessionInUrl: true }, // required
});

const auth = app.auth({ persistence: "local" });
```

If the current task has not retrieved a real Publishable Key, omit `accessKey` instead of inventing one. A wrong `accessKey` can break auth-state checks and protected-route behavior.

---

## Login Methods

**1. Phone OTP (Recommended)**

- Automatically use `auth-tool-cloudbase` to turn on `SMS Login` through `manageAppAuth`

```js
const { data, error } = await auth.signInWithOtp({ phone: "13800138000" });
const { data: loginData, error: loginError } = await data.verifyOtp({
  token: "123456",
});
```

**2. Email OTP Login**

- Automatically use `auth-tool-cloudbase` to turn on `Email Login` through `manageAppAuth`

```js
const { data, error } = await auth.signInWithOtp({ email: "user@example.com" });
const { data: loginData, error: loginError } = await data.verifyOtp({
  token: "654321",
});
```

**3. Password**

```js
const usernameLogin = await auth.signInWithPassword({
  username: "test_user",
  password: "pass123",
});
const emailLogin = await auth.signInWithPassword({
  email: "user@example.com",
  password: "pass123",
});
const phoneLogin = await auth.signInWithPassword({
  phone: "13800138000",
  password: "pass123",
});
```

**4. Registration**

- Username/password is a login method, not a standalone self-service signup shortcut
- For username-style account systems, first verify how the user record will be created. CloudBase public Web signup still requires an email or phone verification flow, and `username` is bound during that verified signup.
- Do not promise a browser-only `auth.signUp({ username, password })` registration path. The documented public Web flow is `auth.signUp({ email|phone, password, username?, ... }) -> data.verifyOtp({ token })`.
- When the task uses plain usernames such as `admin`, `editor`, or `user01`, keep the login input as plain text and use `auth.signInWithPassword({ username, password })` for login after the account has been provisioned or bound through the documented signup flow
- Do not switch to email OTP or phone OTP unless the task explicitly requires email addresses or phone numbers for the account identifier.
- For email signup, put `password` and optional `username` on the initial `auth.signUp(...)` call when the new account should later use password login.
- If the UI splits "send code" and "complete registration" into different handlers, persist the `verifyOtp` callback returned by `auth.signUp(...)`, then call it from the completion handler with the user-entered code.

Email signup sequence at a glance:

1. Call `auth.signUp({ email, password, username? })`.
2. Store the returned `data.verifyOtp` callback.
3. Call `data.verifyOtp({ token })` after the user receives and enters the verification code.
4. Treat the account as created only after `verifyOtp(...)` succeeds. The documented flow auto-signs the user in on success.

```js
// Email signup.
// Use only when the task explicitly requires email addresses.
const { data: emailSignUpData, error: emailSignUpError } = await auth.signUp({
  email: "new@example.com",
  password: "pass123",
  username: "newuser",
});
if (emailSignUpError) throw emailSignUpError;
const emailVerificationCode = "123456";
const { error: emailVerifyError } = await emailSignUpData.verifyOtp({
  token: emailVerificationCode,
});
if (emailVerifyError) throw emailVerifyError;

// Phone OTP signup.
// Use only when the task explicitly requires phone numbers.
const { data: phoneSignUpData, error: phoneSignUpError } = await auth.signUp({
  phone: "13800138000",
  password: "pass123",
  username: "phone_user",
});
if (phoneSignUpError) throw phoneSignUpError;
const phoneVerificationCode = "123456";
const { error: phoneVerifyError } = await phoneSignUpData.verifyOtp({
  token: phoneVerificationCode,
});
if (phoneVerifyError) throw phoneVerifyError;
```

When the project already has `handleSendCode` / `handleRegister` or similar UI handlers, wire the SDK calls there directly instead of leaving them commented out in `App.tsx`.

For username-style account tasks where the required test users already exist:

```tsx
const handleLogin = async () => {
  const { error } = await auth.signInWithPassword({
    username,
    password,
  });
  if (error) throw error;
};
```

If the task also requires a self-service registration UI for username-style accounts, do not fabricate a direct `auth.signUp({ username, password })` path. Instead, confirm that the repo accepts an email or phone signup that binds `username`, then wire the documented `signUp(...)->verifyOtp(...)` flow into the active handlers.

- admin-side provisioning through documented management capabilities such as environment user creation APIs or existing backend/admin setup

Do not use email OTP or email-only helpers for these flows unless the task explicitly says the account identifier is an email address. The corresponding form field should stay `type="text"` rather than `type="email"` for username-style account identifiers.

```tsx
const handleSendCode = async () => {
  try {
    const { data, error } = await auth.signUp({
      email,
      password,
      username: username || email.split("@")[0],
    });
    if (error) throw error;

    // Keep the callback for the follow-up completion step.
    setVerifyOtpCallback(() => data.verifyOtp);
  } catch (error) {
    console.error("Failed to send sign-up code", error);
  }
};

const handleRegister = async () => {
  try {
    if (!verifyOtpCallback) throw new Error("Please send the code first");

    const { error } = await verifyOtpCallback({ token: code });
    if (error) throw error;
  } catch (error) {
    console.error("Failed to complete sign-up", error);
  }
};
```

**5. Anonymous**

- Automatically use `auth-tool-cloudbase` to turn on `Anonymous Login` through `manageAppAuth`

```js
const { data, error } = await auth.signInAnonymously();
```

**6. OAuth (Google/WeChat)**

- Automatically use `auth-tool-cloudbase` to turn on `Google Login` or `WeChat Login` through `manageAppAuth`

```js
const { data, error } = await auth.signInWithOAuth({ provider: "google" });
window.location.href = data.url; // Auto-complete after callback
```

**7. Custom Ticket**

```js
await auth.signInWithCustomTicket(async () => {
  const res = await fetch("/api/ticket");
  return (await res.json()).ticket;
});
```

**8. Upgrade Anonymous**

```js
const sessionResult = await auth.getSession();
const upgradeResult = await auth.signUp({
  phone: "13800000000",
  anonymous_token: sessionResult.data.session.access_token,
});
await upgradeResult.data.verifyOtp({ token: "123456" });
```

---

## User Management

```js
// Sign out
const signOutResult = await auth.signOut();

// Get user
const userResult = await auth.getUser();
console.log(
  userResult.data.user.email,
  userResult.data.user.phone,
  userResult.data.user.user_metadata?.nickName,
);

// Update user (except email, phone)
const updateProfileResult = await auth.updateUser({
  nickname: "New Name",
  gender: "MALE",
  avatar_url: "url",
});

// Update user (email or phone)
const updateEmailResult = await auth.updateUser({ email: "new@example.com" });
const verifyEmailResult = await updateEmailResult.data.verifyOtp({
  email: "new@example.com",
  token: "123456",
});

// Change password (logged in)
const resetPasswordResult = await auth.resetPasswordForOld({
  old_password: "old",
  new_password: "new",
});

// Reset password (forgot)
const reauthResult = await auth.reauthenticate();
const forgotPasswordResult = await reauthResult.data.updateUser({
  nonce: "123456",
  password: "new",
});

// Link third-party
const linkIdentityResult = await auth.linkIdentity({ provider: "google" });

// View/Unlink identities
const identitiesResult = await auth.getUserIdentities();
const unlinkIdentityResult = await auth.unlinkIdentity({
  provider: identitiesResult.data.identities[0].id,
});

// Delete account
const deleteMeResult = await auth.deleteMe({ password: "current" });

// Listen to state changes
const authStateSubscription = auth.onAuthStateChange((event, session, info) => {
  // INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY, BIND_IDENTITY
});

// Get access token
const sessionResult = await auth.getSession();
await fetch("/api/protected", {
  headers: {
    Authorization: `Bearer ${sessionResult.data.session?.access_token}`,
  },
});

// Refresh user
const refreshUserResult = await auth.refreshUser();
```

---

## User Type

```ts
declare type User = {
  id: any;
  aud: string;
  role: string[];
  email: any;
  email_confirmed_at: string;
  phone: any;
  phone_confirmed_at: string;
  confirmed_at: string;
  last_sign_in_at: string;
  app_metadata: {
    provider: any;
    providers: any[];
  };
  user_metadata: {
    name: any;
    picture: any;
    username: any;
    gender: any;
    locale: any;
    uid: any;
    nickName: any;
    avatarUrl: any;
    location: any;
    hasPassword: any;
  };
  identities: any;
  created_at: string;
  updated_at: string;
  is_anonymous: boolean;
};
```

---

## Complete Example

```js
class PhoneLoginPage {
  async sendCode() {
    const phone = document.getElementById("phone").value;
    if (!/^1[3-9]\d{9}$/.test(phone)) return alert("Invalid phone");

    const { data, error } = await auth.signInWithOtp({ phone });
    if (error) return alert("Send failed: " + error.message);

    this.verifyOtp = data.verifyOtp;
    document.getElementById("codeSection").style.display = "block";
    this.startCountdown(60);
  }

  async verifyCode() {
    const code = document.getElementById("code").value;
    if (!code) return alert("Enter code");
    if (!this.verifyOtp) return alert("Send the code first");

    const { data, error } = await this.verifyOtp({ token: code });
    if (error) return alert("Verification failed: " + error.message);

    console.log("Login successful:", data.user);
    window.location.href = "/dashboard";
  }

  startCountdown(seconds) {
    let countdown = seconds;
    const btn = document.getElementById("resendBtn");
    btn.disabled = true;

    const timer = setInterval(() => {
      countdown--;
      btn.innerText = `Resend in ${countdown}s`;
      if (countdown <= 0) {
        clearInterval(timer);
        btn.disabled = false;
        btn.innerText = "Resend";
      }
    }, 1000);
  }
}
```
