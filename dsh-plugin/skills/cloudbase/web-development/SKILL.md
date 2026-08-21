---
name: web-development
description: Use when implementing a CloudBase Web frontend (React/Vue/Vite) after the product direction is clear — SDK init, static hosting, browser verification.
---

# Web development (DSH)

- New projects: `mcp__cloudbase__downloadTemplate` with `template="react"` or `vue` first.
- Auth: CloudBase Web SDK only. Do not use mini-program OPENID on Web.
- Deploy: `mcp__cloudbase__manageHosting` `action=upload` after a local production build. CDN may cache for a few minutes; append a random query string to preview URLs.
- History-mode SPA: set the static hosting 404 document to `index.html`.
