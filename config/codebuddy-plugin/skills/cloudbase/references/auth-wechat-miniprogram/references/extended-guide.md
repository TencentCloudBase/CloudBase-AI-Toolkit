# Extended guide — auth-wechat-miniprogram

> Moved from SKILL.md to satisfy Agent Skills Spec 500-line limit.

## Scenarios – WeChat Mini Program auth patterns

### Scenario 1: Initialize CloudBase in Mini Program

Use this in your Mini Program's `app.js` or entry point:

```js
// app.js
App({
  onLaunch: function () {
    // Initialize CloudBase
    wx.cloud.init({
      env: 'your-env-id',  // Your CloudBase environment ID
      traceUser: true      // Optional: track user access in console
    })
  }
})
```

**Key points:**

- Call `wx.cloud.init()` once when the Mini Program launches
- Set `env` to your CloudBase environment ID
- `traceUser: true` enables user access tracking in CloudBase console (optional but recommended)

---

### Scenario 2: Get user identity in a cloud function

Use this when you need to know **who is calling** your cloud function:

```js
// Cloud function: cloudfunctions/getUserInfo/index.js
const cloud = require('wx-server-sdk')

// Initialize cloud with dynamic environment
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  // Get user identity - this is automatically injected by WeChat
  const { OPENID, APPID, UNIONID } = cloud.getWXContext()

  console.log('User identity:', { OPENID, APPID, UNIONID })

  // Use OPENID for user-specific operations
  // For example: query user data, check permissions, etc.

  return {
    openid: OPENID,
    appid: APPID,
    unionid: UNIONID  // May be undefined if not available
  }
}
```

**Key points:**

- Use `cloud.getWXContext()` to get user identity
- `OPENID` is always available and uniquely identifies the user
- `APPID` identifies the Mini Program
- `UNIONID` is only available when:
  - The Mini Program is bound to a WeChat Open Platform account
  - The user has authorized the Mini Program
- These values are **verified and trustworthy** - no need to validate them
- Use `cloud.DYNAMIC_CURRENT_ENV` to automatically use the current environment

**Best practices:**

- Store `OPENID` in your database to associate data with users
- Use `OPENID` for authorization and access control
- Use `UNIONID` when you need to identify users across multiple Mini Programs or Official Accounts
- Never expose `OPENID` to other users (it's a private identifier)

---

### Scenario 3: Call cloud function from Mini Program

Use this in your Mini Program to call a cloud function and get user identity:

```js
// In Mini Program page
Page({
  onLoad: function() {
    this.getUserInfo()
  },

  getUserInfo: function() {
    wx.cloud.callFunction({
      name: 'getUserInfo',  // Cloud function name
      data: {},             // Optional parameters
      success: res => {
        console.log('User info from cloud function:', res.result)
        // res.result contains { openid, appid, unionid }

        // Use the user info
        this.setData({
          openid: res.result.openid
        })
      },
      fail: err => {
        console.error('Failed to get user info:', err)
      }
    })
  }
})
```

**Key points:**

- Use `wx.cloud.callFunction()` to call cloud functions
- User identity is automatically passed to the cloud function
- No need to manually send user credentials
- Handle both success and error cases

---

### Scenario 4: Test authentication - Simple test function

**Cloud function (cloudfunctions/test/index.js):**

```js
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

exports.main = async (event, context) => {
  // Get verified user identity - automatically injected by WeChat
  const { OPENID, APPID, UNIONID } = cloud.getWXContext()

  console.log('User identity:', { OPENID, APPID, UNIONID })

  return {
    success: true,
    message: 'Authentication successful',
    identity: {
      openid: OPENID,
      appid: APPID,
      unionid: UNIONID || 'Not available'
    },
    timestamp: new Date().toISOString()
  }
}
```

**Mini Program code:**

```js
// pages/index/index.js
Page({
  data: {
    userIdentity: null
  },

  onLoad: function() {
    this.testAuth()
  },

  testAuth: function() {
    console.log('Testing authentication...')

    wx.cloud.callFunction({
      name: 'test',
      success: res => {
        console.log('Authentication test result:', res.result)

        this.setData({
          userIdentity: res.result.identity
        })

        wx.showToast({
          title: 'Auth successful',
          icon: 'success'
        })
      },
      fail: err => {
        console.error('Authentication test failed:', err)
        wx.showToast({
          title: 'Auth failed',
          icon: 'error'
        })
      }
    })
  }
})
```

**Key points:**

- No explicit login API call needed
- User identity is automatically available in cloud function
- `OPENID` is always present and verified
- `UNIONID` may be undefined if not available
- Use this pattern to verify authentication is working correctly

---

## Best practices

### 1. Always use cloud.DYNAMIC_CURRENT_ENV

```js
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
```

This ensures the cloud function uses the correct environment automatically.

### 2. Store OPENID for user identification

- Use `OPENID` as the primary user identifier
- Store it in your database to associate data with users
- Never expose `OPENID` to other users

### 3. Handle UNIONID availability

```js
const { OPENID, UNIONID } = cloud.getWXContext()

if (UNIONID) {
  // User has UNIONID - can be used for cross-app identification
  console.log('UNIONID available:', UNIONID)
} else {
  // UNIONID not available - use OPENID only
  console.log('Using OPENID only:', OPENID)
}
```

### 4. Use OPENID for user-specific operations

- Use `OPENID` to identify and authorize users
- Store `OPENID` when you need to associate data with users
- Use `OPENID` in queries to ensure users only access their own data

### 5. Error handling

Always handle errors when calling cloud functions:

```js
wx.cloud.callFunction({
  name: 'myFunction',
  success: res => {
    // Handle success
  },
  fail: err => {
    console.error('Cloud function error:', err)
    // Show user-friendly error message
    wx.showToast({
      title: 'Operation failed',
      icon: 'error'
    })
  }
})
```

### 6. Initialize CloudBase early

Initialize CloudBase in `app.js` `onLaunch`:

```js
App({
  onLaunch: function () {
    wx.cloud.init({
      env: 'your-env-id',
      traceUser: true
    })
  }
})
```

---

## Common patterns

### Pattern 1: Get and return user identity

```js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { OPENID, APPID, UNIONID } = cloud.getWXContext()

  return {
    openid: OPENID,
    appid: APPID,
    unionid: UNIONID || null
  }
}
```

### Pattern 2: Use OPENID for authorization

```js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext()

  // Check if user is authorized
  if (OPENID === event.resourceOwnerId) {
    // User is authorized to access this resource
    return { authorized: true }
  } else {
    return { authorized: false, error: 'Unauthorized' }
  }
}
```

### Pattern 3: Handle UNIONID availability

```js
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

exports.main = async (event, context) => {
  const { OPENID, UNIONID } = cloud.getWXContext()

  if (UNIONID) {
    // Can use UNIONID for cross-app user identification
    console.log('User has UNIONID:', UNIONID)
  } else {
    // Fall back to OPENID only
    console.log('Using OPENID only:', OPENID)
  }

  return { openid: OPENID, hasUnionId: !!UNIONID }
}
```

---

## v3 Web SDK Mini Program methods

If the Mini Program uses `@cloudbase/js-sdk` (Web SDK v3) instead of `wx-server-sdk`, the following auth methods are available:

### signInWithOpenId

WeChat OpenID silent login — automatically uses the current WeChat login state:

```js
import cloudbase from "@cloudbase/js-sdk"

const app = cloudbase.init({
  env: "your-env-id",
  region: "ap-shanghai",
})
const auth = app.auth

// OpenID silent login (default: use wx.cloud mode)
const { data, error } = await auth.signInWithOpenId()
if (error) {
  console.error('OpenID login failed:', error.message)
} else {
  console.log('Logged in with OpenID:', data.user?.id)
}

// For non-wx.cloud mode, pass useWxCloud: false
// const { data, error } = await auth.signInWithOpenId({ useWxCloud: false })
```

### signInWithPhoneAuth

WeChat phone number authorization login — requires the user to authorize phone number via the Mini Program button:

```js
// Step 1: In Mini Program page, use <button open-type="getPhoneNumber">
// to get the encrypted phone code

// Step 2: Pass the phoneCode to signInWithPhoneAuth
const { data, error } = await auth.signInWithPhoneAuth({
  phoneCode: '<encrypted-phone-code-from-wechat>',
})
if (error) {
  console.error('Phone auth failed:', error.message)
} else {
  console.log('Logged in with phone:', data.user)
}
```

**Important:**
- These methods are from `@cloudbase/js-sdk`, **not** `wx-server-sdk` or `wx.cloud`
- They provide an alternative auth path for Mini Programs using the v3 Web SDK
- For the standard `wx.cloud` + cloud function path, use the scenarios above instead
- `signInWithPhoneAuth` requires the user to tap a `<button open-type="getPhoneNumber">` in the Mini Program

---

## Summary

WeChat Mini Program authentication with CloudBase is **simple and secure**:

1. **No explicit login needed** - authentication is automatic
2. **User identity is verified** - `OPENID`, `APPID`, and `UNIONID` are trustworthy
3. **Easy to use** - just call `cloud.getWXContext()` in cloud functions
4. **Secure by default** - WeChat handles all authentication verification

**Key takeaways:**

- Initialize CloudBase with `wx.cloud.init()` in Mini Program
- Use `cloud.getWXContext()` to get user identity in cloud functions
- Use `OPENID` for user identification and authorization
- Handle `UNIONID` availability appropriately
- No explicit login API calls needed - authentication is automatic

For more complex authentication scenarios or integration with other systems, consider using CloudBase custom login in combination with WeChat authentication.
