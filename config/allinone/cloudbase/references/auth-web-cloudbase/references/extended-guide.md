# Extended guide — auth-web-cloudbase

> Moved from SKILL.md to satisfy Agent Skills Spec 500-line limit.

## Login Methods

> ⚠️ **OTP verification must go through the `data.verifyOtp({ token })` callback returned by `signInWithOtp` / `signUp`.** Do NOT invent a standalone `auth.verifyOtp({ token })` call — the standalone form additionally requires `messageId` and fails with `"messageId is required"` when it is missing. The full flow is three steps: send code → keep the returned `data` (or its `verifyOtp` callback) → verify with `data.verifyOtp({ token })`.

**1. Phone OTP (Recommended)**
- Automatically use `auth-tool-cloudbase` to turn on `SMS Login` through `manageAppAuth`
- Send the phone number to `auth.signInWithOtp({ phone, ... })`, then call the returned `verifyOtp({ token })`.
- `signInWithOtp` can automatically create a new user if the user does not exist; control this via `shouldCreateUser` parameter (default `true`).
```js
const { data, error } = await auth.signInWithOtp({ phone: '13800138000' })
const { data: loginData, error: loginError } = await data.verifyOtp({ token: '123456' })
```

**2. Email OTP**
- Automatically use `auth-tool-cloudbase` to turn on `Email Login` through `manageAppAuth`
```js
const { data, error } = await auth.signInWithOtp({ email: 'user@example.com' })
const { data: loginData, error: loginError } = await data.verifyOtp({ token: '654321' })
```

**3. Password**

All auth methods return `{ data, error }`. Always check `error` first:
```js
// Login — returns { data: { user, session }, error: null } on success
// Supports optional is_encrypt for password encryption (default false)
const { data, error } = await auth.signInWithPassword({ username: 'test_user', password: 'pass123' })
if (error) {
  // Handle login failure (wrong password, user not found, provider not enabled)
  console.error('Login failed:', error.message)
  return false
}
// data.user.id is the uid; data.session contains the active session
const uid = data.user.id

// Also works with email or phone:
// await auth.signInWithPassword({ email: 'user@example.com', password: 'pass123' })
// await auth.signInWithPassword({ phone: '13800138000', password: 'pass123' })
// Optional: encrypt password during transmission
// await auth.signInWithPassword({ email: 'user@example.com', password: 'pass123', is_encrypt: true })
```

**Checking login state (for route guards / auth checks):**
```js
// Use auth.getSession() — NOT the deprecated getLoginState().
//
// Why: getLoginState() may return an object with uid even when only accessKey is
// present (no real login), causing route guards to incorrectly treat the caller
// as authenticated. That misleading uid is NOT a gateway session for NoSQL CRUD.
// getSession() returns data.session === undefined when no real login exists,
// making the check reliable and simple.
const { data, error } = await auth.getSession()

if (!data?.session) {
  // No real login — redirect to sign-in page
  window.location.href = '/login'
  return
}

// Also reject anonymous sessions (when signInAnonymously() was called explicitly)
if (data.session.user?.is_anonymous) {
  // Anonymous user — not allowed for protected routes
  window.location.href = '/login'
  return
}

// data.session contains: access_token, refresh_token, expires_in, user
// data.session.user contains the authenticated user info
const currentUser = data.session.user

// Optional: further verify identity type from the session user if needed
const hasVerifiedIdentity = Boolean(
  currentUser.phone_confirmed_at ||
  currentUser.email_confirmed_at ||
  currentUser.user_metadata?.username
)

// ❌ Do NOT use auth.getLoginState() — it's deprecated and returns
//    misleading data (uid/loginState) even without real login
// ❌ Do NOT use auth.getUser(), !!loginState, or !!loginState.uid as auth checks
```

**4. Registration**
- For username-style account systems, verify whether direct username/password signup is supported before wiring the form
- Username/password login can use plain identifiers such as `admin` or `editor`, but raw signup APIs may enforce stricter username patterns or be disabled
- Do not switch to email OTP or phone OTP unless the task explicitly says the account identifier is an email address or phone number
- If direct username signup is unsupported, create users through a backend or management API boundary; never put secret keys in browser code
```js
// Username + Password login
const login = await auth.signInWithPassword({
  username: 'editor',
  password: 'editor123',
})

// Email Otp
// Use only when the task explicitly requires email addresses.
// Email Otp
const emailSignUp = await auth.signUp({ email: 'new@example.com', nickname: 'User' })
const emailVerifyResult = await emailSignUp.data.verifyOtp({ token: '123456' })

// Phone Otp
// Use only when the task explicitly requires phone numbers.
// Phone Otp
const phoneSignUp = await auth.signUp({ phone: '13800138000', password: 'pass123', nickname: 'User' })
const phoneVerifyResult = await phoneSignUp.data.verifyOtp({ token: '123456' })
```

When the project already has `handleSendCode` / `handleRegister` or similar UI handlers, wire the SDK calls there directly instead of leaving them commented out in `App.tsx`.

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
  const { data, error } = await auth.signInWithPassword({
    username,
    password,
  })
  if (error) throw error
  // Login succeeded — data.user.id is the uid
  return true
}
```

Do not use email OTP or email-only helpers for these flows unless the task explicitly says the account identifier is an email address. The corresponding form field should stay `type="text"` rather than `type="email"` for username-style account identifiers.

```tsx
const handleSendCode = async () => {
  try {
    const { data, error } = await auth.signUp({
      phone,
      password: password || undefined,
    })
    if (error) throw error
    verifyOtpRef.current = data.verifyOtp
  } catch (error) {
    console.error('Failed to send sign-up code', error)
  }
}

const handleRegister = async () => {
  try {
    if (!verifyOtpRef.current) throw new Error('Please send the code first')

    const { error } = await verifyOtpRef.current({ token: code })
    if (error) throw error
  } catch (error) {
    console.error('Failed to complete sign-up', error)
  }
}
```

**5. Anonymous**

> ⚠️ **Anonymous login is disabled by default for new environments.** Publishable `accessKey` alone does **not** create a gateway-authenticated anonymous session. With `@cloudbase/js-sdk` **3.x**, you **must** call `await auth.signInAnonymously()` (or an equivalent authenticated session) **before** NoSQL `app.database()` CRUD — otherwise the gateway returns **401**. `checkLogin()` / `getSession()` alone do **not** create a usable write session. For production protected apps, prefer verified login methods; use anonymous only when the demo/product explicitly needs unauthenticated client CRUD.

- Required for minimal NoSQL Web demos that skip real login (list/add guestbook, todo, etc.)
- Automatically use `auth-tool-cloudbase` to turn on `Anonymous Login` through `manageAppAuth` (must be explicitly enabled first)
```js
// Anonymous login is disabled by default — must be explicitly enabled via auth-tool
const { data, error } = await auth.signInAnonymously()
if (error) throw error
// Now NoSQL CRUD is allowed (js-sdk 3.x + publishable key)
// await app.database().collection('messages').get()
// Optional: pass provider_token to associate anonymous session with third-party identity
// const { data, error } = await auth.signInAnonymously({ provider_token: 'xxx' })
```

**6. OAuth (Google/WeChat/GitHub)**
- Automatically use `auth-tool-cloudbase` to turn on `Google Login` or `WeChat Login` through `manageAppAuth`
- Supported providers: `google`, `wechat`, `github`, `facebook`, `apple`
- By default, OAuth callback is auto-handled when `auth.detectSessionInUrl: true` is set in init
```js
const { data, error } = await auth.signInWithOAuth({ provider: 'google' })
if (error) throw error
// Auto-redirect to OAuth provider; after callback SDK auto-completes login
window.location.href = data.url

// For non-redirect flows (popup / custom UX), use skipBrowserRedirect + type:
// await auth.signInWithOAuth({
//   provider: 'github',
//   options: { skipBrowserRedirect: true, type: 'sign_in' }
// })
// Then use data.url manually (e.g. window.open(data.url))

// For binding additional identity to existing user: type: 'bind_identity'
```

**Manual OAuth callback handling:**
- If `detectSessionInUrl` is not set, call `verifyOAuth` manually after redirect:
```js
const urlParams = new URLSearchParams(window.location.search)
const { data, error } = await auth.verifyOAuth({
  provider: 'google',
  code: urlParams.get('code'),
  state: urlParams.get('state'),
})

**7. Custom Ticket**
```js
await auth.signInWithCustomTicket(async () => {
  const res = await fetch('/api/ticket')
  return (await res.json()).ticket
})
```

**8. ID Token (Third-party token validation)**
```js
// Direct login with a third-party JWT/OAuth token (e.g. from native SDK)
const { data, error } = await auth.signInWithIdToken({
  provider: 'wechat', // or 'google', 'github', etc.
  token: '<jwt-or-oauth-token>',
})
```

**9. Upgrade Anonymous**
```js
const sessionResult = await auth.getSession()
const upgradeResult = await auth.signUp({
  phone: '13800000000',
  anonymous_token: sessionResult.data.session.access_token,
})
await upgradeResult.data.verifyOtp({ token: '123456' })
```

---

## User Management

```js
// Sign out
const signOutResult = await auth.signOut()

// Get user profile only after auth.getSession() has returned a real session
const sessionResult = await auth.getSession()
if (!sessionResult.data?.session) throw new Error('Not signed in')
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
const updateEmailResult = await auth.updateUser({ email: 'new@example.com' })
const verifyEmailResult = await updateEmailResult.data.verifyOtp({
  email: 'new@example.com',
  token: '123456',
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
const deleteResult = await auth.deleteUser({ password: 'current' })

// Listen to state changes
const authStateSubscription = auth.onAuthStateChange((event, session, info) => {
  // INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, PASSWORD_RECOVERY, BIND_IDENTITY
})

// Get access token
const sessionResult = await auth.getSession()
await fetch('/api/protected', {
  headers: { Authorization: `Bearer ${sessionResult.data.session?.access_token}` },
})

// Refresh session (extend token validity)
const refreshResult = await auth.refreshSession() // uses current refresh_token
// or with explicit token: await auth.refreshSession(refresh_token)

// Set session manually (e.g. from external auth flow or SSR hydration)
const setResult = await auth.setSession({ refresh_token: '<token-from-server>' })

// Refresh user (sync latest user data from server)
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

    const { data, error } = await auth.signInWithOtp({ phone })
    if (error) return alert('Send failed: ' + error.message)

    this.verifyOtp = data.verifyOtp
    document.getElementById('codeSection').style.display = 'block'
    this.startCountdown(60)
  }

  async verifyCode() {
    const code = document.getElementById('code').value
    if (!code) return alert('Enter code')
    if (!this.verifyOtp) return alert('Send the code first')

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
