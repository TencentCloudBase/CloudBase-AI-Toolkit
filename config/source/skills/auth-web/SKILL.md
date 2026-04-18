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
- `auth.signInWithOtp({ phone })` and `auth.signUp({ phone })` use the phone number in a `phone` field, not `phone_number`
- `auth.signInWithOtp({ email })` and `auth.signUp({ email })` use `email`
- `auth.signUp({ username, password })` and `auth.signInWithPassword({ username, password })` are the canonical username/password Web auth path
- Email and phone registration are OTP flows: call `auth.signUp({ email|phone, ... })`, then complete the signup with the returned `data.verifyOtp({ token })`
- For email signup, the canonical sequence is: `auth.signUp({ email, ... })` to send the code, persist the returned `data` signup handle, then call `signupHandle.verifyOtp({ token })` with only the verification code
- Do not describe email registration as `auth.signUp({ email, password })`; for email-based password login, use `auth.signInWithPassword({ email, password })` after the account already exists
- If the task gives accounts like `admin`, `editor`, or another plain string without `@`, treat it as a username-style identifier rather than an email address
- `verifyOtp({ token })` expects the SMS or email code in `token`
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

**2. Email OTP**

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

- For username-style account systems, use username/password registration directly
- Do not switch to email OTP or phone OTP unless the task explicitly says the account identifier is an email address or phone number
- When the task uses plain usernames such as `admin`, `editor`, or `user01`, the canonical form code is `auth.signUp({ username, password })`
- Email and phone signup are always two-step OTP flows: first call `auth.signUp({ email|phone, ... })` to send the code, then keep the returned `data` object and call `data.verifyOtp({ token })` to finish registration
- The `verifyOtp` callback returned from `auth.signUp({ email|phone, ... })` already carries the signup context. In the second step, send only the verification code as `verifyOtp({ token })`; do not rebuild the signup payload
- In split UI handlers, `auth.signUp({ email, ... })` is the "send code" step and `signupHandle.verifyOtp({ token })` is the "complete registration" step
- Do not write email registration as `auth.signUp({ email, password })`; email/password is a sign-in flow for an existing account, not the signup payload shown here
- If the UI splits "send code" and "complete registration" into different handlers, persist the returned sign-up handle from step 1 and reuse it in step 2

```js
// Username + Password
const usernameSignUp = await auth.signUp({
  username: "newuser",
  password: "pass123",
  nickname: "User",
});

// Email OTP signup.
// Use only when the task explicitly requires email addresses.
const emailSignUp = await auth.signUp({
  email: "new@example.com",
  nickname: "User",
});
const emailSignupHandle = emailSignUp.data; // Required for the follow-up verify step.
const emailVerifyResult = await emailSignupHandle.verifyOtp({
  token: "123456",
});

// Phone OTP signup.
// Use only when the task explicitly requires phone numbers.
const phoneSignUp = await auth.signUp({
  phone: "13800138000",
  nickname: "User",
});
const phoneVerifyResult = await phoneSignUp.data.verifyOtp({ token: "123456" });
```

When the project already has `handleSendCode` / `handleRegister` or similar UI handlers, wire the SDK calls there directly instead of leaving them commented out in `App.tsx`.

For username-style account tasks:

```tsx
const handleRegister = async () => {
  const { error } = await auth.signUp({
    username,
    password,
    nickname: username,
  });
  if (error) throw error;
};

const handleLogin = async () => {
  const { error } = await auth.signInWithPassword({
    username,
    password,
  });
  if (error) throw error;
};
```

Do not use email OTP or email-only helpers for these flows unless the task explicitly says the account identifier is an email address. The corresponding form field should stay `type="text"` rather than `type="email"` for username-style account identifiers.

```tsx
const handleSendCode = async () => {
  try {
    const { data, error } = await auth.signUp({
      email,
      nickname: username || email.split("@")[0],
    });
    if (error) throw error;

    // Keep the returned sign-up handle for the follow-up verifyOtp step.
    setSignUpData(data);
  } catch (error) {
    console.error("Failed to send sign-up code", error);
  }
};

const handleRegister = async () => {
  try {
    if (!signUpData?.verifyOtp) throw new Error("Please send the code first");

    const { error } = await signUpData.verifyOtp({ token: code });
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
