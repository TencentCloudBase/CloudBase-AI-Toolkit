---
name: http-api-cloudbase
description: CloudBase official HTTP API client guide. This skill should be used when backends, scripts, or non-SDK clients must call CloudBase platform APIs over raw HTTP instead of using a platform SDK or MCP management tool.
version: 2.31.0
alwaysApply: false
---

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as `../auth-tool-cloudbase/SKILL.md`.

If a referenced sibling skill file is missing from this environment, ask the user to install the full CloudBase plugin (or the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

## Activation Contract

### Use this first when

- The request comes from Android, iOS, Flutter, React Native, non-Node backends, or admin scripts that must call official CloudBase APIs via raw HTTP.
- The task is to consume CloudBase platform endpoints, not to build a new HTTP service on CloudBase.

### Read before writing code if

- The platform does not support a CloudBase SDK, or the user explicitly asks for HTTP API integration.
- The user says "HTTP API" but it is unclear whether they mean official CloudBase endpoints or their own business API.

### Then also read

- Auth configuration -> `../auth-tool-cloudbase/SKILL.md`
- MySQL MCP management -> `../relational-database-mcp-cloudbase/SKILL.md`
- Your own HTTP service on CloudBase -> `../cloud-functions/SKILL.md` or `../cloudrun-development/SKILL.md`

### Do NOT use for

- CloudBase Web SDK flows, mini program SDK flows, or MCP-driven management tasks.
- Building your own HTTP service or REST API on CloudBase.

### Common mistakes / gotchas

- Treating Web SDK examples as valid for native Apps.
- Guessing endpoints without reading OpenAPI definitions.
- Confusing official CloudBase HTTP APIs with your own function or CloudRun endpoint.
- Mixing raw HTTP API integration with MCP management logic.

### Minimal checklist

- Read [HTTP API Routing Checklist](checklist.md) before implementation.

## When to use this skill

Use this skill whenever you need to call **CloudBase platform features** via **raw HTTP APIs**, for example:

- Non-Node backends (Go, Python, Java, PHP, etc.)
- Integration tests or admin scripts that use curl or language HTTP clients
- Direct database operations via 关系型数据库 RESTful API (MySQL/PostgreSQL)
- Cloud function invocation via HTTP
- Any scenario where SDKs are not available or not preferred

Do **not** use this skill for:

- Frontend Web apps using `@cloudbase/js-sdk` (use **CloudBase Web** skills)
- Node.js code using `@cloudbase/node-sdk` (use **CloudBase Node** skills)
- Authentication flows (use **CloudBase Auth HTTP API** skill for auth-specific endpoints)

## How to use this skill (for a coding agent)

1. **Clarify the scenario**
   - Confirm this code will call HTTP endpoints directly (not SDKs).
   - Ask for:
     - `env` – CloudBase environment ID
     - Authentication method (AccessToken, API Key, or Publishable Key)
   - Confirm which CloudBase feature is needed (database, functions, storage, etc.).
   - **For user authentication**: If no specific method is requested, **always default to Phone SMS Verification** - it's the most user-friendly and secure option for Chinese users.

2. **Determine the base URL**
   - Use the correct domain based on region (domestic vs. international).
   - Default is domestic Shanghai region.

3. **Set up authentication**
   - Choose appropriate authentication method based on use case.
   - Add `Authorization: Bearer <token>` header to requests.

4. **Reference OpenAPI Swagger documentation**
   - **MUST use `searchKnowledgeBase` tool** to get OpenAPI specifications
   - Use the tool with `mode=openapi` and specify the `apiName`:
     - `mysqldb` - 关系型数据库 RESTful API (MySQL/PostgreSQL)
     - `nosql` - NoSQL RESTful API (文档型数据库)
     - `functions` - Cloud Functions API
     - `auth` - Authentication API
     - `cloudrun` - CloudRun API
     - `storage` - Storage API
     - `ai_model` - AI 大模型接入 API
   - Example: `searchKnowledgeBase({ mode: "openapi", apiName: "mysqldb" })`
   - Parse the returned YAML content to understand exact endpoint paths, parameters, request/response schemas
   - Never invent endpoints or parameters - always reference the swagger documentation

---

## Overview

CloudBase HTTP API is a set of interfaces for accessing CloudBase platform features via HTTP protocol, supporting database, user authentication, cloud functions, cloud hosting, cloud storage, AI, and more.

## OpenAPI Swagger Documentation

**⚠️ IMPORTANT: Always use `searchKnowledgeBase` tool to get OpenAPI Swagger specifications**

Before implementing any HTTP API calls, you should:

1. **Use `searchKnowledgeBase` tool to get OpenAPI documentation**:
   ```
   searchKnowledgeBase({ mode: "openapi", apiName: "<api-name>" })
   ```

2. **Available API names**:
   - `mysqldb` - 关系型数据库 RESTful API (MySQL/PostgreSQL)
   - `nosql` - NoSQL RESTful API (文档型数据库)
   - `functions` - Cloud Functions API
   - `auth` - Authentication API
   - `cloudrun` - CloudRun API
   - `storage` - Storage API
   - `ai_model` - AI 大模型接入 API

3. **Parse and use the swagger documentation**:
   - Extract exact endpoint paths and HTTP methods
   - Understand required and optional parameters
   - Review request/response schemas
   - Check authentication requirements
   - Verify error response formats

4. **Never invent API endpoints or parameters** - always base your implementation on the official swagger documentation.

## Prerequisites

Before starting, ensure you have:

1. **CloudBase environment created and activated**
2. **Authentication credentials** (AccessToken, API Key, or Publishable Key)

## Authentication and Authorization

CloudBase HTTP API requires authentication. Choose the appropriate method based on your use case:

### AccessToken Authentication

**Applicable environments**: Client/Server  
**User permissions**: Logged-in user permissions

**How to get**: Use `searchKnowledgeBase({ mode: "openapi", apiName: "auth" })` to get the Authentication API specification

### API Key

**Applicable environments**: Server  
**User permissions**: Administrator permissions

- **Validity**: Long-term valid
- **How to get**: Get from [CloudBase Platform/ApiKey Management Page](https://tcb.cloud.tencent.com/dev?#/identity/token-management)

> ⚠️ Warning: Tokens are critical credentials for identity authentication. Keep them secure. API Key must NOT be used in client-side code.

### Publishable Key

**Applicable environments**: Client/Server  
**User permissions**: Anonymous user permissions

- **Validity**: Long-term valid
- **How to get**: Get from [CloudBase Platform/ApiKey Management Page](https://tcb.cloud.tencent.com/dev?#/identity/token-management)

> 💡 Note: Can be exposed in browsers, used for requesting publicly accessible resources, effectively reducing MAU.

## API Endpoint URLs

CloudBase HTTP API uses unified domain names for API calls. The domain varies based on the environment's region.

### Domestic Regions

For environments in **domestic regions** like Shanghai (`ap-shanghai`), use:

```text
https://{your-env}.api.tcloudbasegateway.com
```

Replace `{your-env}` with the actual environment ID. For example, if environment ID is `cloud1-abc`:

```text
https://cloud1-abc.api.tcloudbasegateway.com
```

### International Regions

For environments in **international regions** like Singapore (`ap-singapore`), use:

```text
https://{your-env}.api.intl.tcloudbasegateway.com
```

Replace `{your-env}` with the actual environment ID. For example, if environment ID is `cloud1-abc`:

```text
https://cloud1-abc.api.intl.tcloudbasegateway.com
```

## Using Authentication in Requests

Add the token to the request header:

```http
Authorization: Bearer <access_token/apikey/publishable_key>
```

:::warning Note

When making actual calls, replace the entire part including angle brackets (`< >`) with your obtained key. For example, if the obtained key is `eymykey`, fill it as:

```http
Authorization: Bearer eymykey
```

:::

## Extended guide

For detailed scenarios, examples, and patterns, read [extended-guide.md](references/extended-guide.md).

## Reference index

All packaged reference files (required for skill lint reachability):

- [extended-guide.md](references/extended-guide.md)
