---
description: CloudBase DeepSeek Harness plugin package
globs: *
alwaysApply: true
---

# @cloudbase/dsh-plugin

This directory is the npm package that plugs CloudBase into DeepSeek Harness.

## Source of truth

- Host entry: `src/server/index.ts` (`apply`, `cloudbaseData` typert object)
- Client entry: `src/client/index.ts` (slots: toolview / turnTail / details)
- MCP patch: `cordis.patch.yml` — **never** pass `CLOUDBASE_API_KEY`
- Product names: `src/server/term-map.ts` (no FLEXDB / SCF / TDSQL in UI)

## Build

```bash
npm test
npm run build
```

Client bundle **must** wrap `window.__ModuleLoader__.load({id, factory})`. Do not ship bare ESM for the web client.

## Compatibility

DSH `>=0.1.0-rc.6 <0.2.0`. Runtime dependencies must stay empty; CodeMirror and esbuild are build-time only.
