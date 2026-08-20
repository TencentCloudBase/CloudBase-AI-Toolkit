---
name: auth-wechat-miniprogram
description: CloudBase WeChat Mini Program native authentication guide. This skill should be used when users need mini program identity handling, OPENID/UNIONID access, or `wx.cloud` auth behavior in projects where login is native and automatic.
version: 2.31.0
alwaysApply: false
---

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../auth-tool-cloudbase/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

## Activation Contract

### Use this first when

- The task is about WeChat Mini Program auth behavior, `wx.cloud` identity, `OPENID` / `UNIONID`, or how a mini program caller is identified in CloudBase.
- The project is a CloudBase mini program and the auth question is about native mini program identity rather than provider configuration.

### Read before writing code if

- The request mentions mini program login, user identity in cloud functions, or `wx.cloud` auth assumptions.
- The user expects a Web-style login page or explicit token exchange in a mini program; route them back to native mini program auth behavior.

### Then also read

- Mini program project implementation -> `../miniprogram-development/SKILL.md`
- Cloud function implementation -> `../cloud-functions/SKILL.md`

### Do NOT use for

- Web-based WeChat login or Web auth UI.
- Provider enable/disable or auth console setup.
- Generic Node-side auth flows outside mini program identity handling.

### Common mistakes / gotchas

- Generating a Web-style login page for a `wx.cloud` mini program.
- Treating mini program auth as a provider-configuration problem.
- Forgetting that caller identity is injected in cloud functions automatically.

## When to use this skill

Use this skill for **WeChat Mini Program (小程序) authentication** in a CloudBase project.

Use it when you need to:

- Implement identity-aware WeChat Mini Program flows with CloudBase
- Access user identity (openid, unionid) in cloud functions
- Understand how WeChat authentication integrates with CloudBase
- Build Mini Program features that require user identification

**Key advantage:** WeChat Mini Program authentication with CloudBase is **seamless and automatic** - no complex OAuth flows needed. When a Mini Program calls a cloud function, the user's `openid` is automatically injected and verified by WeChat.

**Do NOT use for:**

- Web-based WeChat login (use the **auth-web** skill)
- Server-side auth with Node SDK (use the **auth-nodejs** skill)
- Non-WeChat authentication methods (use appropriate auth skills)

---

## How to use this skill (for a coding agent)

1. **Confirm CloudBase environment**
   - Ask the user for:
     - `env` – CloudBase environment ID
     - Confirm the Mini Program is linked to the CloudBase environment

2. **Understand the authentication flow**
   - WeChat Mini Program authentication is **native and automatic**
   - No explicit login API calls needed in most cases
   - User identity is automatically available in cloud functions
   - CloudBase handles all authentication verification

3. **Pick a scenario from this file**
   - For basic user identity in cloud functions, use **Scenario 2**
   - For Mini Program initialization, use **Scenario 1**
   - For calling a cloud function from the Mini Program and receiving user identity, use **Scenario 3**
   - For testing authentication, use **Scenario 4**

4. **Follow CloudBase API shapes exactly**
   - Use `wx-server-sdk` in cloud functions
   - Use `wx.cloud` in Mini Program client code
   - Treat method names and parameter shapes in this file as canonical

5. **If you're unsure about an API**
   - Consult the official CloudBase Mini Program documentation
   - Only use methods that appear in official documentation

---

## Core concepts

### How WeChat Mini Program authentication works with CloudBase

1. **Automatic authentication:**
   - When a Mini Program user calls a cloud function, WeChat automatically injects the user's identity
   - No need for complex OAuth flows or token management
   - CloudBase verifies the authenticity of the identity

2. **User identifiers:**
   - `OPENID` – Unique identifier for the user in this specific Mini Program
   - `APPID` – The Mini Program's App ID
   - `UNIONID` – (Optional) Unique identifier across all apps under the same WeChat Open Platform account
     - Only available when the Mini Program is bound to a WeChat Open Platform account
     - Useful for identifying the same user across multiple Mini Programs or Official Accounts

3. **Security:**
   - The `openid`, `appid`, and `unionid` are **verified and trustworthy**
   - WeChat has already completed authentication
   - Developers can directly use these identifiers without additional verification

4. **No explicit login required:**
   - Users are automatically authenticated when they use the Mini Program
   - No need to call login APIs in most cases
   - Identity is available immediately in cloud functions

---

## Extended guide

For detailed scenarios, examples, and patterns, read [extended-guide.md](references/extended-guide.md).

## Reference index

All packaged reference files (required for skill lint reachability):

- [extended-guide.md](references/extended-guide.md)
