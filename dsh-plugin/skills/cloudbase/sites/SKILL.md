---
name: cloudbase-sites
description: Use when the user wants to vibe-code a full-stack web app inside DeepSeek Harness — scaffold from CloudBase templates, local Vite preview, PostgreSQL tables, and one-click static hosting deploy with a real domain.
---

# CloudBase Sites (DSH)

Closed loop for "build me a web app" inside DeepSeek Harness.

## Mandatory sequence

1. Call `mcp__cloudbase__auth` `action=status`. If not signed in, `action=start_auth` `authMode=device`. Never pass an API Key.
2. Call `mcp__cloudbase__downloadTemplate` with `template="react"` (or `vue`) into the workspace. Do not scaffold files by hand.
3. Start the Vite dev server locally and tell the user the preview URL.
4. Create PostgreSQL tables with `mcp__cloudbase__managePgDatabase` (`action=execute`, `confirm=true`). Verify with `mcp__cloudbase__queryPgDatabase`.
5. Build the frontend (`pnpm build` / `npm run build`).
6. Deploy with `mcp__cloudbase__manageHosting` `action=upload` pointing at `dist/`. Return the **real domain** from the tool result. There is no hosting rollback API — do not offer a rollback button.
7. Mini Program publish is P2 and not available. Say so explicitly; do not fail silently.

## Product language

Never say FLEXDB / SCF / TDSQL / EnvId / Region in user-facing text. Say 文档型数据库 / 云函数 / 数据库 / 环境 ID / 地域.
