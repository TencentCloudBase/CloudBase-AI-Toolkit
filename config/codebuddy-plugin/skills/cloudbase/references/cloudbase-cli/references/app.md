# App — CloudBase CLI

> ⚠️ **Agent default: prefer MCP `manageApps` / `manageHosting`, or CLI `hosting.md` (local build + `tcb hosting deploy`).**
> `tcb deploy` in this file is an experimental all-in-one shorthand — use only when the user explicitly asks for it.

Deploy web applications with automatic framework detection, cloud build, and CDN hosting.
App = framework build + deploy; for pre-built static files only, use `hosting` instead.

## When to Use

- User **explicitly** asks for `tcb deploy` / zero-config cloud-build web deploy
- Managing web app versions, build status, or redeployment after that path was already chosen
- Deploying monorepo sub-projects with that experimental flow

## Do NOT use for

- Default agent fallback when MCP is missing — use `hosting` (or MCP when available)
- Pre-built static files without build step — use `hosting`
- Cloud functions — use `functions`
- Containerized long-running services — use `cloudrun`
- Database operations — use `mysql` or `nosql`

---

## Workflow 1: First Deploy (Zero Config)

```bash
# 1. Confirm target environment
tcb env list

# 2. Deploy from project root (auto-detects framework)
tcb deploy --env-id <envId>

# Or specify a service name
tcb deploy my-app --env-id <envId>
```

CLI auto-completes: detect framework -> infer build command + output dir -> upload to COS -> cloud build (~3-5 min) -> output access URL -> save config to `cloudbaserc.json`.

### Supported Frameworks

| Framework | Detection signal | Default build cmd | Default output dir |
|-----------|-----------------|-------------------|-------------------|
| React | `react-scripts` in package.json | `npm run build` | `build` |
| Vue | `@vue/cli-service` / `vite` | `npm run build` | `dist` |
| Vite | `vite` in devDependencies | `npm run build` | `dist` |
| Next.js | `next` in dependencies | `npm run build` | `.next` |
| Nuxt | `nuxt` in dependencies | `npm run build` | `.output` |
| Angular | `@angular/core` | `ng build` | `dist/<name>` |
| Static | No build tool detected | _(none)_ | `.` |

> ⚠️ If framework is not detected (`Cannot auto-detect project framework`), specify explicitly with `--framework react --build-command "npm run build" --output-dir dist`.

---

## Workflow 2: Redeployment

```bash
# Redeploy (reads saved config from cloudbaserc.json)
tcb deploy --env-id <envId>

# Force overwrite — skip confirmation prompt
tcb deploy my-app --env-id <envId> --force
```

> ⚠️ Overwrite creates a new version (e.g. `my-app-002 -> my-app-003`). Previous versions are preserved, never deleted.

### Monorepo Sub-project

```bash
# Option A: CLI flag (relative path only)
tcb deploy my-app --env-id <envId> --cwd ./packages/frontend

# Option B: cloudbaserc.json
# { "app": { "root": "packages/frontend" } }
```

> ⚠️ `--cwd` must be a relative path, not absolute. `root` in config is relative to `cloudbaserc.json`, not CWD.

---

## Workflow 3: Version Management

```bash
# List all versions
tcb app versions list my-app --env-id <envId>

# View latest version details
tcb app versions detail my-app --env-id <envId>

# View a specific version
tcb app versions detail my-app --version-name my-app-001 --env-id <envId>

# Extract fail reason (JSON mode)
tcb app versions detail my-app --env-id <envId> --json | jq '.data.failReason'
```

Build status values: `PENDING` (waiting) | `BUILDING` (in progress) | `SUCCESS` | `FAILED` (check `failReason`).

---

## Workflow 4: Deletion

```bash
# Preview deletion (always do this first)
tcb app delete my-app --env-id <envId> --dry-run

# Interactive confirmation
tcb app delete my-app --env-id <envId>

# Skip confirmation (CI/CD)
tcb app delete my-app --env-id <envId> --yes
```

> ⚠️ Deletion is irreversible — removes the app and all its versions.

---

## cloudbaserc.json App Config

Auto-saved after first deployment:

```json
{
  "envId": "env-xxx",
  "app": {
    "serviceName": "my-app",
    "framework": "react",
    "installCommand": "npm install",
    "buildCommand": "npm run build",
    "outputDir": "./dist",
    "deployPath": "/my-app",
    "root": "packages/frontend",
    "envVariables": { "REACT_APP_API": "https://api.example.com" },
    "ignore": ["tests/**", "docs/**"]
  }
}
```

| Field | Notes |
|-------|-------|
| `serviceName` | Auto-inferred from directory name if not specified |
| `installCommand` | ⚠️ Omitted = skipped in `--yes`/`--json` mode (unless `package.json` exists) |
| `buildCommand` | Auto-detected; omit to skip build |
| `outputDir` | ⚠️ Use `./dist` for builds, `./` for static-only. Always use `./` prefix |
| `deployPath` | Defaults to `/<serviceName>`. Only non-default values are saved to config |
| `envVariables` | ⚠️ Build-time only — injected during `npm run build`, NOT at runtime. Never put secrets here |
| `ignore` | Resolved from `cloudbaserc.json` location. `node_modules`/`.git` always excluded |

---

## Command Quick Reference

```bash
tcb deploy [name] --env-id <id>              # Deploy (shorthand)
tcb app deploy [name] --env-id <id>          # Deploy (full form)
tcb app list                                  # List all apps
tcb app info <name> --env-id <id>            # App details
tcb app versions list <name> --env-id <id>   # List versions
tcb app versions detail <name> --env-id <id> # Version details
tcb app delete <name> --env-id <id>          # Delete app
```

Key flags:

| Flag | Purpose |
|------|---------|
| `--framework <name>` | Override auto-detection |
| `--build-command <cmd>` | Override build command (empty string to skip) |
| `--output-dir <dir>` | Override output directory |
| `--deploy-path <path>` | CDN mount path (default: `/<serviceName>`) |
| `--cwd <path>` | Project directory for monorepo |
| `--force` | Skip overwrite confirmation |
| `--yes` | Skip all interactive prompts |
| `--json` | JSON output for CI/CD |
| `--verbose` | Verbose output for debugging |

### `--yes` / `--json` Auto-detection Logic

| Parameter | Auto-detection |
|-----------|----------------|
| `installCommand` | Has `package.json`? -> `npm install`; otherwise skip |
| `buildCommand` | Detect `build`/`pack`/`prebuild` script; otherwise skip |
| `outputDir` | Has build command? -> `./dist`; otherwise `./` |
| `deployPath` | Default `/<serviceName>` |

> ⚠️ `--yes` without `--env-id` hangs in CI — non-interactive mode cannot open the environment selector. Always pass both.

To skip build entirely in CI: `tcb deploy my-app --env-id env-xxx --build-command '' --output-dir './' --yes`

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Build failed (`FAILED`) | Wrong build command, missing deps, Node.js mismatch | Check `failReason` via `--json`; verify local build works; cloud uses Node 18 |
| Framework not detected | No framework signature in `package.json` | Specify `--framework`, `--build-command`, `--output-dir` explicitly |
| Directory not found | `--cwd` or `root` points to non-existent path | Verify path with `ls`; use relative path |
| Build timeout (5 min) | Large upload or slow build | Add `ignore` patterns; check for accidental `node_modules` upload |
| Name conflict prompt | App already exists | Use `--force` or `--yes` to skip; creates new version |
| URL unreachable after deploy | CDN propagation or bad `outputDir` | Wait 1-2 min; verify `outputDir` contains `index.html` |
| Env ID required | `--yes`/`--json` without `--env-id` | Always pass `--env-id` in non-interactive mode |

---

## ⚠️ 打包目录 ≠ 上传目录（大目录被整个打进 zip 的坑）

**`tcb app deploy` / `manageApps(deployApp)` 打包的是项目根目录（`localPath`），不是 `outputDir`！**
- 上传的只是 `outputDir`（如 `web/out`），但生成 `cloudapp-<ts>-<rand>.zip` 时会把**整个项目根**压缩进去
- 若项目根下有 `target/`（Rust）、`.next/`、`dist-old/`、`build/` 等大目录，会被整个打进 zip（实测 ato 项目 54GB target → 34GB zip，占满 /tmp/var/folders 磁盘）
- 默认 exclude 只有 `node_modules/**`、`.git/**`、`.DS_Store`、`**/.DS_Store`——**没有 `target/**` 等**

**规避**（三选一，推荐 ①+③）：
1. 部署时显式传 `--ignore "**/target/**"`（CLI）或 `ignore: ["**/target/**", ...]`（MCP deployApp）
2. 项目根 `cloudbaserc.json` 的 `app.ignore` 加 `**/target/**`（CLI 会合并）
3. 部署完成后删除残留：`rm -f /private/var/folders/*/*/T/cloudapp-*.zip`（部署进程异常时残留不清理会堆积）

**判断**：部署日志显示 "Project directory: xxx" 只代表 framework 检测目录，**不代表打包目录**；怀疑打包过大时先看生成的 zip 大小。

---

## Self-Check

- [ ] `tcb` CLI installed, version >= 3.0.0
- [ ] Logged in (`tcb login`) and correct environment set (`tcb env use <envId>`)
- [ ] Framework auto-detected correctly (or specified explicitly)
- [ ] `outputDir` uses `./` prefix and matches actual build output
- [ ] `envVariables` contain no secrets (build-time only, may leak into bundle)
- [ ] For monorepo: `root`/`--cwd` uses relative path
- [ ] For CI/CD: `--env-id` + `--yes` both specified
- [ ] For deletion: previewed with `--dry-run` first
- [ ] For redeployment: `cloudbaserc.json` config reviewed for correctness
