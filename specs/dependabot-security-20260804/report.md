# Dependabot Security Remediation (2026-08-04)

## Scope

Open alerts from https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/security/dependabot

Focus: core manifests (`pnpm-lock.yaml`, `package-lock.json`, `mcp/package-lock.json`).

## Fixed in this change

| Package | Action | Target |
|---------|--------|--------|
| brace-expansion | override (was pinned to vulnerable) | 1.1.18 / 2.1.4 / 5.0.9 |
| fast-uri | override | 3.1.5 |
| postcss | override | 8.5.25 |
| undici | override | 6.28.0 |
| body-parser | override | 2.3.0 |
| form-data | override | 2.5.6 |
| fast-xml-parser@4 | override | 4.5.5 |
| ws | direct + override | 8.21.0 / 7.5.11 |
| path-to-regexp@8 | override | 8.4.0 |
| serialize-javascript | override | 7.0.5 |
| picomatch | override | 2.3.2 / 4.0.4 |
| minimatch | override | 3.1.5 / 5.1.9 / 10.2.5 |
| vite@5 | override | 5.4.21 |
| adm-zip | direct + override | 0.6.0 |
| tough-cookie (mcp) | override | 4.1.4 exact |

## Intentionally deferred

| Package | Severity | Reason |
|---------|----------|--------|
| @modelcontextprotocol/sdk (>=1.26.0) | high | Upgrade strips/conflicts with custom `annotations.category`; needs dedicated type/compat work |
| vitest (>=3.2.6) | critical | Major bump from 2.x; vulns require Vitest UI server |
| decompress | critical/medium | No upstream patch; comes via `@cloudbase/toolbox` |
| examples/* axios/lodash.* | various | Example apps only; out of core package path |

## Verification

- `pnpm install` refreshed overrides into `pnpm-lock.yaml`
- npm lockfiles regenerated for root + `mcp/`
- `mcp` package `pnpm run build` succeeded

## Follow-ups

1. Dedicated PR: MCP SDK 1.26+ with `category` annotation typing preserved
2. Vitest 3.x migration (or dismiss UI-server advisory if UI unused in CI)
3. Upstream/`@cloudbase/toolbox` replacement for `decompress`
4. Example app dependency refresh (`examples/cloudbase-auth-endpoint-with-feishu`)
