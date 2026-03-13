# CloudBase Mini Program Integration

This reference supplements `SKILL.md` when a **WeChat Mini Program project explicitly uses CloudBase**.

## When to read this reference

Read this file when the task includes any of the following:

- `wx.cloud`
- CloudBase / Tencent CloudBase / 腾讯云开发 / 云开发
- CloudBase database, storage, or cloud functions
- CloudBase identity handling in mini programs
- CloudBase MCP or mcporter usage for mini program projects

Do **not** assume this reference applies to every mini program project.

## How to use this reference (for a coding agent)

1. **Confirm CloudBase is actually in scope**
   - Look for user intent, code, config, or dependency evidence that the project uses CloudBase

2. **Apply CloudBase-specific rules only after confirmation**
   - Use `wx.cloud` APIs on the mini program client side
   - Use CloudBase environment configuration and server-side identity handling where relevant

3. **Keep boundaries clear**
   - Use general mini program rules from `SKILL.md` for project structure and base workflows
   - Use this file only for CloudBase-specific capabilities and constraints

## 1. Environment Initialization

Mini programs using CloudBase should initialize `wx.cloud` once during app startup.

```js
App({
  onLaunch() {
    wx.cloud.init({
      env: "your-env-id",
      traceUser: true,
    });
  },
});
```

### Rules

- Obtain the environment ID via `envQuery` when available.
- Prefer a single app-level initialization instead of repeated page-level initialization.
- Use `traceUser: true` unless there is a clear reason not to.

## 2. Authentication Model

CloudBase mini programs are naturally login-free.

### Required behavior

- Do **not** generate login pages or login flows for CloudBase mini programs.
- Do **not** copy Web SDK authentication patterns into CloudBase mini programs.
- Retrieve user identity in cloud functions with `cloud.getWXContext().OPENID`.

```js
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
  };
};
```

### Recommended usage

- Use `OPENID` as the stable user identifier for per-user records.
- Perform user bootstrap logic inside cloud functions when needed.
- Keep privileged profile updates in cloud functions when business rules matter.

## 3. Client vs. Cloud Function Boundaries

Use the right CloudBase capability for the right job.

### Use `wx.cloud.database()` for:

- Client-safe reads
- User-scoped writes with correct security rules
- Simple collection CRUD where server orchestration is unnecessary

### Use `wx.cloud.callFunction()` for:

- Cross-collection operations
- Privileged or admin-only writes
- Multi-step orchestration
- Operations requiring `OPENID`-based trust on the server side
- Calls to third-party APIs or secret-bearing logic

### Use Cloud Storage APIs for:

- User-uploaded images and attachments
- Files that need access control
- Temporary file access through CloudBase file APIs

## 4. Database Permission Guidance

CloudBase database access is permission-controlled. Configure permissions before relying on client writes.

### Practical rules

- For user-owned content, prefer rules that only allow users to operate on their own documents.
- For system-managed data, prefer server-side writes via cloud functions.
- For cross-collection operations, prefer cloud functions by default.
- If security rules become complex, move write logic to cloud functions.

## 5. Cloud Functions for Mini Programs

### Initialization

Use dynamic current environment in mini program cloud functions:

```js
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
```

### Recommendations

- Keep function directories under `cloudfunctions`
- Include `package.json` for dependencies
- Prefer cloud-side dependency installation
- For permission-sensitive capabilities, redeploy once in WeChat Developer Tools if needed

## 6. Cloud Storage and Static Resources

- Store user-generated or private files in Cloud Storage
- Use Cloud Storage instead of bundling large dynamic files into the mini program package
- If local assets are referenced, ensure they exist in the project

## 7. AI Model Usage in CloudBase Mini Programs

When the mini program base library supports it, `wx.cloud.extend.AI` can be used directly.

### Guidance

- Keep prompts close to the business scenario
- Prefer streaming APIs for chat or long-form generation
- Move privileged orchestration or multi-model workflows to cloud functions when needed

## 8. CloudBase MCP via mcporter

When IDE MCP is not available, CloudBase MCP can be used through mcporter.

- You do **not** need to hard-code Secret ID / Secret Key / Env ID
- CloudBase MCP supports device-code login via the `auth` tool

Example:

```bash
npx mcporter config add cloudbase \
  --command "npx" \
  --arg "@cloudbase/cloudbase-mcp@latest" \
  --description "CloudBase MCP"
```

Common discovery commands:

- `npx mcporter list`
- `npx mcporter describe cloudbase`
- `npx mcporter list cloudbase --schema`
- `npx mcporter call cloudbase.help --output json`

## 9. Console References

After creating resources, provide console links using the actual `envId`.

- Overview: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/overview`
- Document Database: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/db/doc`
- MySQL Database: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/db/mysql`
- Cloud Functions: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/scf`
- Cloud Storage: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/storage`
- Identity Authentication: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/identity`
- Logs & Monitoring: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/logs`
- Environment Settings: `https://tcb.cloud.tencent.com/dev?envId=${envId}#/settings`

## 10. Anti-Patterns

Avoid these mistakes in CloudBase mini program projects:

- Generating login pages for CloudBase mini programs
- Copying Web SDK auth flows into CloudBase mini programs
- Putting privileged writes directly in client code without rule review
- Using cross-collection client logic when a cloud function should own it
