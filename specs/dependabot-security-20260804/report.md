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
| decompress | override alias | `npm:@xhmikosr/decompress@11.1.3` (via `@cloudbase/toolbox`) |

## Intentionally deferred / dismissed

| Package | Severity | Reason |
|---------|----------|--------|
| lodash.set (via `@cloudbase/database` in example) | high | No patched `lodash.set` release (`first_patched: null`); node-sdk@4 would drop it but adds floating `@cloudbase/js-sdk: latest` + major API risk. **Dismissed** Dependabot `#210` / `#235` as `tolerable_risk` (2026-08-04); real fix needs upstream `@cloudbase/database` to replace modular `lodash.set` (used in realtime `virtual-websocket-client`) |

## Follow-up completed: @modelcontextprotocol/sdk

| Package | Action | Target |
|---------|--------|--------|
| @modelcontextprotocol/sdk | direct pin (root + mcp) | 1.30.0 |
| zod (mcp peer for SDK) | direct pin | 3.25.76 |

Notes:
- Addresses Dependabot high alert requiring SDK `>=1.26.0`.
- SDK `ToolAnnotations` became a closed/`$strip` schema; CloudBase keeps `annotations.category` via `ToolAnnotations` intersection + `ExtendedMcpServer.registerTool`.
- Official SDK Client strips unknown annotation keys on `tools/list` parse; `registerTool` wrappers mirror category into `_meta.category` for Client consumers while the wire payload still includes `annotations.category`.
- Covered by `mcp/src/annotations-category.test.ts`.
- Removed duplicate caret SDK entry from `mcp` `devDependencies`.
- Bumped mcp `zod` to `3.25.76` (exact) to satisfy SDK peer `^3.25 || ^4.0`.

## Follow-up completed: vitest

| Package | Action | Target |
|---------|--------|--------|
| vitest | direct pin (root + mcp) | 3.2.7 |

Notes:
- Addresses GHSA-5xrq-8626-4rwp / CVE-2026-47429 (Vitest UI/API server RCE/file read when UI listening).
- Removed unused `mcp` `test:ui` script; `@vitest/ui` remains uninstalled.
- `mcp/vitest.config.js`: replaced deprecated `threads: false` with `pool: "forks"` + `fileParallelism: false`.

## Follow-up completed: example feishu auth endpoint

Both `examples/cloudbase-auth-endpoint-with-feishu/package.json` and `cloudfunctions/auth-service/package.json` plus lockfiles:

| Package | Override target |
|---------|-----------------|
| axios | 0.33.0 |
| body-parser | 1.20.6 (express@4 line; not root's 2.x) |
| lodash.unset | 4.18.0 |
| uuid | 11.1.1 |

Verification: `tsc` build OK; `npm audit --registry=https://registry.npmjs.org` leaves only `lodash.set` (deferred above).

## Follow-up completed: decompress Zip Slip (GHSA-h39j-r5qq-r9mm / CVE-2026-10732)

| Package | Action | Target |
|---------|--------|--------|
| decompress | override alias (root `pnpm.overrides` + `overrides`, `mcp` `overrides`) | `npm:@xhmikosr/decompress@11.1.3` |

Notes:
- Upstream `decompress` has no patched release (`<=4.2.1` all vulnerable; `first_patched_version: null`).
- `@cloudbase/toolbox@0.8.1` pulls `decompress` only via `lib/zip.js`; this repo uses `AuthSupervisor` from the same package.
- Alias is a drop-in fork used by other ecosystems; verified `AuthSupervisor` loads and toolbox `unzip` works; lockfiles no longer reference `decompress@4.2.1`.
- Prefer upstream toolbox eventually dropping `decompress` so the override can be removed.

## Verification

- `pnpm install` refreshed overrides into `pnpm-lock.yaml`
- npm lockfiles regenerated for root + `mcp/`
- `mcp` package `pnpm run build` succeeded

## Follow-ups

1. ~~Dedicated PR: MCP SDK 1.26+ with `category` annotation typing preserved~~ → done (pin `1.30.0` + category type extension)
2. ~~Vitest 3.x migration (or dismiss UI-server advisory if UI unused in CI)~~ → done (pin 3.2.7 + remove `test:ui`)
3. ~~Upstream/`@cloudbase/toolbox` replacement for `decompress`~~ → mitigated via `@xhmikosr/decompress` override; keep watching for toolbox upstream
4. ~~Example app dependency refresh~~ → done (patchable alerts cleared; lodash.set Dependabot `#210`/`#235` dismissed `tolerable_risk`)
5. Upstream: `@cloudbase/database` replace abandoned `lodash.set@4.3.2` (and prefer patched `lodash` / safe path helpers) so example can drop the dismiss
