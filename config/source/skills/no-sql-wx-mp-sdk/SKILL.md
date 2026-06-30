---
name: cloudbase-document-database-in-wechat-miniprogram
description: Use CloudBase document database WeChat MiniProgram SDK to query, create, update, and delete data. Supports complex queries, pagination, aggregation, and geolocation queries.
version: 2.23.6
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/no-sql-wx-mp-sdk/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

# CloudBase Document Database WeChat Mini Program SDK

## Activation Contract

### Use this first when

- A WeChat Mini Program must access CloudBase document database through `wx.cloud.database()`.
- The request mentions Mini Program collection CRUD, pagination, aggregation, or geolocation queries.

### Read before writing code if

- The task is Mini Program database work but you still need to separate it from Web SDK, cloud functions, or SQL tasks.
- The request depends on built-in user identity, `_openid`, or Mini Program-side permissions.

### Then also read

- Mini Program project rules and CloudBase integration -> `../miniprogram-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/miniprogram-development/SKILL.md`)
- Mini Program auth and identity flow -> `../auth-wechat/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-wechat/SKILL.md`)
- Browser-side document database code -> `../no-sql-web-sdk/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/no-sql-web-sdk/SKILL.md`)

### Do NOT use for

- Browser/Web code using `@cloudbase/js-sdk`.
- Server-side or cloud-function database access.
- MySQL / relational database work.

### Common mistakes / gotchas

- Copying Web SDK code into Mini Program pages.
- Manually writing `_openid` during create or update operations.
- Assuming built-in Mini Program identity means security rules can be ignored.
- Mixing collection CRUD and backend-wide admin workflows in the same client path.

### Minimal checklist

- Confirm the caller is a Mini Program page/component or Mini Program-side logic.
- Initialize `wx.cloud` correctly before database calls.
- Verify whether the collection rules rely on `auth.openid` / `_openid`.
- Read the specific companion reference file for the operation you need.

## Overview

This skill covers **Mini Program-side document database access** through `wx.cloud.database()`.

Use it for:

- collection CRUD in Mini Program pages
- query composition and pagination
- aggregation
- geolocation queries

Mini Program CloudBase access comes with built-in identity, but database operations are still constrained by collection permissions and security rules.

## Canonical initialization

```javascript
const db = wx.cloud.database();
const _ = db.command;
```

To target a specific environment:

```javascript
const db = wx.cloud.database({
  env: "test"
});
```

Important notes:

- Users are authenticated through the Mini Program CloudBase context.
- In cloud functions, caller identity is available through `wxContext.OPENID`.
- In client-side collection rules, ownership checks usually use `auth.openid` / `doc._openid`.

## Quick routing

- CRUD -> `./crud-operations.md`
- Complex queries -> `./complex-queries.md`
- Pagination -> `./pagination.md`
- Aggregation -> `./aggregation.md`
- Geolocation -> `./geolocation.md`
- Security rules -> `./security-rules.md`

## Working rules for a coding agent

1. **Keep Mini Program code Mini Program-native**
   - Use `wx.cloud.database()`.
   - Do not substitute browser SDK initialization patterns.

2. **Respect ownership fields**
   - `_openid` is system-managed for SDK writes.
   - Never set or override `_openid` manually in `.add()`, `.set()`, or `.update()` payloads.

3. **Remember that security rules validate requests**
   - If a rule requires ownership conditions, the query shape must match that rule model.
   - Permission errors usually mean the rule/query relationship is wrong, not only that the user is logged out.

4. **Route admin-style operations to backend flows**
   - If the task needs privileged global access, use backend tools or functions instead of exposing that path directly in Mini Program client code.

## Quick examples

### Basic collection access

```javascript
const todos = db.collection("todos");
const result = await todos.where({ completed: false }).get();
```

### Document reference

```javascript
const todo = db.collection("todos").doc("todo-id");
const result = await todo.get();
```

## Best practices

1. Create clear collection naming conventions.
2. Use typed wrappers or model helpers in app code where possible.
3. Design rules around real ownership and sharing patterns.
4. Use pagination instead of large unbounded reads.
5. Keep admin/operations logic in backend code, not Mini Program direct access.
