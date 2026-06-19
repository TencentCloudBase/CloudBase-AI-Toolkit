# HTTP API Routing Checklist

Use this checklist when the request comes from Android, iOS, Flutter, React Native, backend scripts, or any environment that is not using a CloudBase SDK.

## Required checks

1. Confirm the caller really needs raw HTTP APIs rather than Web SDK or MCP tools.
2. Confirm environment ID, region, and gateway base URL.
3. Choose the auth mechanism: AccessToken, API Key, or Publishable Key.
4. Query the matching OpenAPI definition before writing request code.
5. For database work, confirm which REST API is needed:
   - **关系型数据库 REST** (MySQL / PostgreSQL): `https://{envId}.api.tcloudbasegateway.com/v1/rdb/rest/{table}` — PostgREST 风格
   - **NoSQL REST**: `https://{envId}.api.tcloudbasegateway.com/v1/database/instances/{instance}/databases/{database}/` — EJSON 格式
6. For AI model access, confirm the calling pattern:
   - **SDK 方式** (Node/Web/微信小程序): 走各端 SDK，不需要裸调 HTTP
   - **HTTP API 方式**: `https://{envId}.api.tcloudbasegateway.com/...` — 参考 OpenAPI `ai_model`
7. Verify the OpenAPI spec is available in `searchKnowledgeBase` before writing code:
   - `mysqldb` — 关系型数据库 REST
   - `nosql` — NoSQL REST
   - `ai_model` — AI 大模型接入
   - `auth` / `functions` / `cloudrun` / `storage` — 其他

## Do not route here when

- The user is building a Web frontend with `@cloudbase/js-sdk`.
- The user is building a CloudBase mini program with `wx.cloud`.
- The task is MCP-driven database management rather than raw HTTP calls.
- The user is calling AI models from Node/Web/微信 — use `ai-model-*` skills instead; only use HTTP API for unsupported runtimes.

## Done criteria

- SDK support boundary is explicit.
- The correct REST API variant (关系型 / NoSQL / AI) has been identified.
- OpenAPI source has been checked (`searchKnowledgeBase` with the right `apiName`).
- The auth method and request base URL are fixed before code generation.
