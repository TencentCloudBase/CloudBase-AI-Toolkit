# CI Pipeline Reference

## Project CI overview

This project uses GitHub Actions with the following workflows:

### `nightly-build.yaml` — Publish MCP Package to pkg.pr.new

**Triggers:**
- Push to `main`
- Pull requests targeting `main`
- Manual dispatch

**Job: `build-and-publish`**

| Step | Command | What it does |
|------|---------|-------------|
| Checkout | `actions/checkout@v4` | Clone repo with full history |
| Enable corepack | `corepack enable` | Enable package manager shims |
| Setup Node.js | `actions/setup-node@v4` (v22) | Install Node 22, cache npm |
| Install deps | `cd mcp && npm ci` | Clean install from lockfile |
| Build | `cd mcp && npm run build` | Webpack production build |
| Test | `cd mcp && npm run test` | Run vitest test suite |
| Publish | `cd mcp && npx pkg-pr-new publish --comment=off` | Publish preview package |

**Environment variables (test step):**
- `TENCENTCLOUD_SECRETID` — from secrets
- `TENCENTCLOUD_SECRETKEY` — from secrets
- `CLOUDBASE_ENV_ID` — from secrets

### Other workflows

| Workflow | Purpose |
|----------|---------|
| `npm-publish.yaml` | Publish to npm on tag push |
| Compat Check | Verify config compatibility |
| Sync to CNB | Mirror to CNB remote |

## Local reproduction

To match CI locally:

```bash
cd mcp
npm ci                    # not npm install — match lockfile exactly
npm run build             # webpack --config webpack/index.cjs --mode=production
npm run test              # vitest
```

## Build system

- **Bundler:** Webpack (config at `mcp/webpack/index.cjs`)
- **Mode:** Production
- **Source:** TypeScript in `mcp/src/`
- **Output:** Bundled JS

## Test system

- **Runner:** Vitest
- **Config:** `mcp/vitest.config.*`
- **Tests:** `tests/` directory
- **Environment-dependent tests:** Use `test.skipIf(!process.env.CLOUDBASE_ENV_ID)` pattern

## Common CI vs local differences

| Issue | CI behavior | Local behavior | Resolution |
|-------|------------|----------------|------------|
| Missing secrets | Tests using cloud APIs are skipped | Same if env vars not set | Use `test.skipIf` pattern |
| Node version | v22 | May differ | Check with `node -v`, use nvm if needed |
| npm ci vs install | Exact lockfile | May resolve differently | Always use `npm ci` to match |
| OS | Ubuntu (Linux) | macOS (Darwin) | Path separators, line endings |
