---
name: auth-web
description: Use when adding CloudBase Web authentication after providers have been checked with auth-tool / queryAppAuth.
---

# Web auth (DSH)

- Management login for MCP: `mcp__cloudbase__auth` device-code. Do not invent API Keys.
- App login providers: `mcp__cloudbase__queryAppAuth` / `manageAppAuth`.
- Web apps use CloudBase Web SDK auth APIs. Never mix with mini-program OPENID.
