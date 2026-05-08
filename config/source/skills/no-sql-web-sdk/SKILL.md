---
name: cloudbase-document-database-web-sdk
description: Use CloudBase document database Web SDK to query, create, update, and delete data. Supports complex queries, pagination, aggregation, realtime, and geolocation queries.
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/no-sql-web-sdk/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

# CloudBase Document Database Web SDK

## Activation Contract

### Use this first when

- A browser or Web app must read or write CloudBase document database data through `@cloudbase/js-sdk`.
- The request mentions `app.database()`, `db.collection()`, `.where()`, `.watch()`, pagination, aggregation, or geolocation queries in a Web frontend.

### Read before writing code if

- The task is clearly browser-side, but you still need to decide between Web SDK, Mini Program SDK, or backend access.
- The request touches login state, collection permissions, or realtime updates.

### Then also read

- Web login and caller identity -> `../auth-web/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-web/SKILL.md`)
- General Web app structure -> `../web-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/web-development/SKILL.md`)
- Mini Program database code -> `../no-sql-wx-mp-sdk/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/no-sql-wx-mp-sdk/SKILL.md`)

### Do NOT use for

- Mini Program code using `wx.cloud.database()`.
- Server-side or cloud-function database access.
- SQL / MySQL database operations.
- Pure resource-permission administration with no browser SDK code.

### SDK Code vs MCP Tools

**When to write SDK code (use this skill):**
- The task explicitly asks to "modify code" or "use SDK"
- The task asks to implement app/frontend logic
- The task mentions specific SDK methods like `db.collection().add()`, `.get()`, `.update()`
- The context shows an existing Web project with SDK initialization (e.g., `index.js` already has `cloudbase.init()`)

**When to use MCP tools instead:**
- The task asks to manage CloudBase resources (create collection, set permissions, etc.)
- The task involves admin/management operations without writing app code
- The task mentions tools like `writeNoSqlDatabaseContent`, `managePermissions`, etc.

**Key distinction:** If the user says "使用 JS SDK 执行 XX 操作" (use JS SDK to perform XX operation) or "修改代码" (modify code), write SDK code in the project files. Do not use MCP database write tools for app-level data operations.

### Common mistakes / gotchas

- Querying before the user is signed in when the collection rules require identity.
- Using `wx.cloud.database()` or Node SDK patterns in browser code.
- Initializing CloudBase lazily with dynamic imports instead of a shared synchronous app instance.
- Treating security rules as result filters rather than request validators.
- **Expecting a `CUSTOM` security rule to take effect immediately after you call `managePermissions(updateResourcePermission)`.** The backend caches rule evaluators for **2–5 minutes**; first writes after a rule change may silently fail or be rejected with `DATABASE_PERMISSION_DENIED` even when the expression is correct. Either (a) wait a few minutes and retry the same write before assuming the rule is wrong, or (b) verify the rule is live by reading `result.code` / `result.message` on every write and by doing a `get()` round-trip on the just-written `_id`; do not treat a resolved promise as success. See `security-rules.md` → "Propagation And Verification" for the full pattern.
- Misreading the return shape of `db.collection(...).add(...)`. In the CloudBase Web SDK, the created document ID is exposed at top-level `result._id`, not `result.id`, `result.data.id`, or `result.insertedId`.
- For CMS-style collections that need **app-level admin users** to edit/delete all records while editors can only edit/delete their own records, do not oversimplify the rule to `READONLY`. A validated pattern is a `CUSTOM` rule that reads role from `user_roles` by `auth.uid` and combines it with `doc.authorId == auth.uid`, while frontend writes can stay on `.doc(id).update()` / `.doc(id).remove()`.
- Forgetting pagination or indexes for larger collections.

### Minimal checklist

- Confirm this is browser-side document database work.
- Initialize CloudBase once and reuse the same `app` / `db` instance.
- Verify auth expectations before CRUD.
- Read the right companion reference file for the specific operation.

## Overview

This skill covers **browser-side document database usage** via `@cloudbase/js-sdk`.

Use it for:

- CRUD in a Web app
- complex queries and pagination
- aggregation
- realtime listeners with `watch()`
- geolocation queries

## Canonical initialization

```javascript
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({
  env: "your-env-id"
});

const db = app.database();
const _ = db.command;
```

Important rules:

- Sign in before querying if the collection rules require identity.
- Keep a single shared app/database instance.
- Do not hide initialization inside ad-hoc async loaders unless the framework truly requires it.

## Quick routing

- CRUD -> `./crud-operations.md`
- Complex queries -> `./complex-queries.md`
- Pagination -> `./pagination.md`
- Aggregation -> `./aggregation.md`
- Realtime listeners -> `./realtime.md`
- Geolocation -> `./geolocation.md`
- Security rules -> `./security-rules.md`

## Working rules for a coding agent

1. **Start from the auth model**
   - If the page relies on logged-in user identity, read the Web auth skill before writing database code.

2. **Keep browser code browser-native**
   - Use `app.database()` and collection references.
   - Do not mix in MCP management flows or SQL mental models.

3. **Respect security rules**
   - Collection rules can reject requests before data is read.
   - If the requirement is simple owner-only write access, `READONLY` can be enough.
   - If the requirement is “app-level admin can edit/delete all, editor only own”, use a `CUSTOM` rule. A validated CMS pattern is `get('database.user_roles.' + auth.uid).role == 'admin' || doc.authorId == auth.uid`.
   - For that CMS pattern, frontend writes can stay on `.doc(id).update()` / `.doc(id).remove()`.
   - Reuse whichever role collection already exists and can be addressed by `_id == auth.uid`. In this CMS pattern, `user_roles` keyed by uid is acceptable.
   - If the task fails with permission issues, inspect the rule model rather than assuming the query syntax is wrong.

4. **Return user-friendly errors**
   - Database errors must become readable UI or application errors, not silent failures.
   - For writes, do not treat a resolved promise as success by default. Check write result fields such as `updated` / `deleted` or surfaced `code` / `message`.

5. **Persist IDs from create operations correctly**
   - For Web SDK `.add(...)`, the newly created document ID is `result._id`.
   - Do not look for the ID under `result.id`, `result.data`, or other driver-specific fields.

## Quick examples

### Simple query

```javascript
const result = await db.collection("todos")
  .where({ completed: false })
  .get();
```

### Create and capture document ID

```javascript
const result = await db.collection("posts").add({
  title: "New article",
  content: "...",
  createdAt: new Date()
});

const articleId = result._id;
```

### Ordered pagination

```javascript
const result = await db.collection("posts")
  .orderBy("createdAt", "desc")
  .skip(20)
  .limit(10)
  .get();
```

### Field selection

```javascript
const result = await db.collection("users")
  .field({ name: true, email: true, _id: false })
  .get();
```

## Best practices

1. Define collection-level types or model wrappers in the app code.
2. Use meaningful collection naming conventions.
3. Select only required fields.
4. Add indexes for frequent filters or sort keys.
5. Pair frontend CRUD with explicit permission design.
6. Use pagination instead of unbounded reads.

## Error handling

```javascript
try {
  const result = await db.collection("todos").get();
  console.log(result.data);
} catch (error) {
  console.error("Database error:", error);
}
```

When the SDK returns an operation result, check error indicators and translate them into readable application behavior.
