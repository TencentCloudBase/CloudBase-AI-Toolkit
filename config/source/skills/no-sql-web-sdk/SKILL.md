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

### Common mistakes / gotchas

- Querying before the user is signed in when the collection rules require identity.
- Using `wx.cloud.database()` or Node SDK patterns in browser code.
- Initializing CloudBase lazily with dynamic imports instead of a shared synchronous app instance.
- For realtime UI, assuming the listener is ready immediately after calling `watch()`. Treat the first `onChange` snapshot whose `snapshot.type === 'init'` as the canonical initial data ready signal before rendering room state, enabling actions, or concluding that the query returned no rows.
- Treating security rules as result filters rather than request validators.
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

5. **Handle realtime initialization explicitly**
   - `.watch()` becomes usable only after the first `onChange` snapshot arrives.
   - Use the snapshot whose `type` is `init` as the canonical "initial data is ready" event.
   - If you also inspect `docChanges`, the initial payload may include `dataType: 'init'`, but do not treat the query as ready before that first init snapshot arrives.
   - Until that event arrives, keep loading state explicit and avoid enabling turn-based actions that depend on the queried documents.

## Quick examples

### Simple query

```javascript
const result = await db.collection("todos")
  .where({ completed: false })
  .get();
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
