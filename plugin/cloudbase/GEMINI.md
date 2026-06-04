# Tencent CloudBase

CloudBase is Tencent's Backend-as-a-Service platform. This extension provides
granular agent skills for:

- **AI Models** — DeepSeek, Hunyuan, and custom models via cloudbase-mcp
- **Authentication** — Email, OAuth, OIDC, WeChat login
- **NoSQL Database** — Document database with real-time watch, geolocation, aggregation
- **MySQL Database** — Relational database via cloudbase-mcp
- **Cloud Functions** — Serverless Node.js functions with HTTP and event triggers
- **Cloud Storage** — File upload/download with CDN delivery
- **CloudRun** — Containerized backend services (any language)
- **Web Development** — Vite/React/Vue frontend with CloudBase SDK
- **Mini Program** — WeChat Mini Program with CloudBase integration

Skills are auto-discovered from the `skills/` directory and activated based on
your project context. The `cloudbase` MCP server provides the tools to manage
CloudBase environments, deploy functions, query databases, and more.
