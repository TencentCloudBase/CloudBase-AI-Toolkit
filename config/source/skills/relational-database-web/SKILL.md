---
name: relational-database-web-cloudbase
description: Use when building frontend Web apps that talk to CloudBase Relational Database via @cloudbase/js-sdk OR via the PG REST HTTP API – provides the canonical init pattern so you can then use Supabase-style queries from the browser.
version: 2.18.0
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/relational-database-web/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

# CloudBase Relational Database Web SDK

## Activation Contract

### Use this first when

- A browser or Web app must access CloudBase Relational Database through `@cloudbase/js-sdk` OR via the HTTP REST API for CloudBase PG.
- The task is specifically about frontend initialization and browser-side query usage.

### Read before writing code if

- You need to distinguish browser SDK usage from MCP database management or backend Node access.
- The request mentions Supabase migration, shared frontend DB client, or browser-side table queries.
- **The request mentions "CloudBase PG", "PostgreSQL", or "PG REST"** – in this case, you MUST use the HTTP REST API approach (see below).

### Then also read

- SQL management and MCP operations -> `../relational-database-tool/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/relational-database-tool/SKILL.md`)
- Web auth/login -> `../auth-web/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-web/SKILL.md`)
- General Web app setup -> `../web-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/web-development/SKILL.md`)
- HTTP API reference -> `../http-api/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/http-api/SKILL.md`)

### Do NOT use for

- MCP-based SQL provisioning, schema changes, or permissions management.
- Backend/Node service access.
- Document database operations.

### Common mistakes / gotchas

- Initializing SDKs in an MCP management flow.
- Treating `app` itself as the relational database client.
- Re-initializing CloudBase in every component.
- Mixing frontend browser access with admin-style schema mutations.
- **Using JS SDK `app.rdb()` when the task specifically requires CloudBase PG REST data plane** – use HTTP API `/v1/rdb/rest` endpoints instead.

### Minimal checklist

- Confirm the caller is a Web frontend.
- **Determine if the task requires CloudBase PG (PostgreSQL) REST API**: if yes, use the HTTP API approach with `/v1/rdb/rest` endpoints.
- If using JS SDK: Keep one shared CloudBase app and one shared relational DB client.
- Route provisioning/schema work to `relational-database-tool`.
- Handle auth separately before data access.

## Overview

This skill standardizes the **browser-side initialization pattern** for CloudBase Relational Database.

After initialization, use `db` with Supabase-style query patterns.

## Installation

```bash
npm install @cloudbase/js-sdk
```

## Canonical initialization

```javascript
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({
  env: "your-env-id"
});

const auth = app.auth();
// Handle login separately

const db = app.rdb();
```

## Initialization rules

- Initialize synchronously.
- Do not lazy-load the SDK with `import("@cloudbase/js-sdk")` unless the framework absolutely requires it.
- Create one shared `db` client and reuse it.
- Do not invent unsupported `cloudbase.init()` options.

## Quick routing

### Use this skill when

- you are wiring browser components to relational tables
- you are replacing a Supabase browser client with CloudBase
- you need a canonical shared frontend `db` client

### Use `relational-database-tool` instead when

- you need to create/destroy MySQL
- you need DDL or write-SQL administration
- you need to inspect or change table security rules through MCP

## Example: shared frontend DB client

```javascript
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({
  env: "your-env-id"
});

export const db = app.rdb();
```

## Example: Supabase-style query

```javascript
const { data, error } = await db
  .from("posts")
  .select("*")
  .order("created_at", { ascending: false });

if (error) {
  console.error("Failed to load posts", error.message);
}
```

## Example: insert / update / delete

```javascript
await db.from("posts").insert({ title: "Hello" });
await db.from("posts").update({ title: "Updated" }).eq("id", 1);
await db.from("posts").delete().eq("id", 1);
```

## Key principle

- `app.rdb()` gives you the relational database client.
- After that point, use Supabase-style query knowledge for table operations.
- Keep schema management and privileged administration outside browser code.

---

# CloudBase PG (PostgreSQL) REST Data Plane

## When to use the HTTP REST API approach

**IMPORTANT**: When the task explicitly mentions **"CloudBase PG"**, **"PostgreSQL"**, or **"PG REST"**, you MUST use the HTTP REST API approach instead of the JS SDK `app.rdb()`.

This is because CloudBase PG provides a PostgreSQL-compatible REST interface that should be accessed via HTTP endpoints.

## Base URL

```
https://{envId}.api.tcloudbasegateway.com
```

## PG REST Endpoints

| Operation | Method | Endpoint | Description |
|-----------|--------|----------|-------------|
| Query | GET | `/v1/rdb/rest/{table}` | Query records with filters |
| Insert | POST | `/v1/rdb/rest/{table}` | Insert new records |
| Update | PATCH | `/v1/rdb/rest/{table}` | Update existing records |
| Delete | DELETE | `/v1/rdb/rest/{table}` | Delete records |
| RPC | POST | `/v1/rdb/rest/rpc/{function}` | Call stored functions |

## Required Headers

```javascript
{
  "Authorization": "Bearer <access_token>",
  "Content-Type": "application/json",
  "Accept": "application/json"
}
```

## Query Parameters for GET

- `select`: Field selection (e.g., `*`, `id,name,created_at`)
- `limit`: Maximum records to return
- `offset`: Pagination offset
- `order`: Sort order (e.g., `created_at.desc`)
- Filter operators: `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `like`, `ilike`, `in`

## Example: Query records

```javascript
const response = await fetch(
  `https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/articles?select=*&status=eq.published&limit=10`,
  {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/json"
    }
  }
);
const data = await response.json();
```

## Example: Insert record

```javascript
const response = await fetch(
  `https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/articles`,
  {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      title: "My Article",
      content: "Article content",
      status: "draft"
    })
  }
);
const data = await response.json();
```

## Example: Update record

```javascript
const response = await fetch(
  `https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/articles?id=eq.${articleId}`,
  {
    method: "PATCH",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "Prefer": "return=representation"
    },
    body: JSON.stringify({
      title: "Updated Title",
      status: "published"
    })
  }
);
```

## Example: Delete record

```javascript
const response = await fetch(
  `https://${envId}.api.tcloudbasegateway.com/v1/rdb/rest/articles?id=eq.${articleId}`,
  {
    method: "DELETE",
    headers: {
      "Authorization": `Bearer ${accessToken}`
    }
  }
);
```

## Authentication for PG REST

You need an access token to call the PG REST endpoints. Use the CloudBase HTTP Auth API:

1. Sign in with username/password to get access_token:
   ```
   POST /auth/v1/signin
   Body: { "username": "user", "password": "pass" }
   ```

2. Use the returned `access_token` in the Authorization header for PG REST calls.

For complete HTTP API documentation, refer to `../http-api/SKILL.md`.
