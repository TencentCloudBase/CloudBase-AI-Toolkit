# Functions — CloudBase CLI

Deploy, update, debug, and manage cloud functions (云函数) via `tcb fn` commands.
Covers both Event Functions (普通云函数) and HTTP Functions (HTTP 云函数).

## When to Use

- Deploy or update cloud functions from terminal / CI pipeline
- Query function logs, diagnose runtime errors
- Manage triggers (timer/定时触发器), layers, versions
- Inject secrets / environment variables
- Batch deploy via `cloudbaserc.json`

## Do NOT use for

- Calling functions from client code (web/miniprogram) → use `cloud-functions` skill
- CloudRun container deployments → use `references/cloudrun.md`
- SDK-based in-app function invocation → use `@cloudbase/js-sdk`
- Console UI operations

## Command Quick Reference

| Task | Command |
|------|---------|
| List all functions (列出函数) | `tcb fn list` |
| Function detail (查看详情) | `tcb fn detail <name>` |
| Deploy all functions | `tcb fn deploy --all` |
| Deploy single Event Function | `tcb fn deploy <name>` |
| Deploy HTTP Function | `tcb fn deploy <name> --httpFn` |
| Deploy HTTP + WebSocket | `tcb fn deploy <name> --httpFn --ws` |
| Deploy multiple | `tcb fn deploy fn1 fn2` |
| Update code only (仅更新代码) | `tcb fn code update <name>` |
| Update config only (仅更新配置) | `tcb fn config update <name>` |
| Invoke remotely (调用函数) | `tcb fn invoke <name>` |
| Invoke with params | `tcb fn invoke <name> --params '{"key":"val"}'` |
| Run locally (本地调试) | `tcb fn run <name>` |
| View logs (查看日志) | `tcb fn log <name>` |
| View log by RequestId | `tcb fn log <name> --reqId <id>` |
| Create trigger (创建触发器) | `tcb fn trigger create <name>` |
| Delete trigger | `tcb fn trigger delete <name> --name <trigger>` |
| List layers (层) | `tcb fn layer list` |
| Publish version (发布版本) | `tcb fn publish-version <name>` |
| Copy to another env | `tcb fn copy <name> --envId <target>` |
| Delete function | `tcb fn delete <name>` |

> Always run `tcb fn <subcommand> --help` first to check current syntax.

---

## Workflow 1: Deploy Functions

### Deploy All

```bash
# Reads cloudbaserc.json → deploys every function listed
tcb fn deploy --all
# Verify
tcb fn list
```

### Deploy Single Function

```bash
# Event Function（普通云函数）
tcb fn deploy my-function

# HTTP Function（HTTP 云函数）— requires scf_bootstrap
tcb fn deploy my-http-fn --httpFn

# Force overwrite existing
tcb fn deploy my-function --force
```

### Deploy Multiple (Selective)

```bash
tcb fn deploy func-a func-b func-c
```

### Config-Only Update (仅更新配置，不上传代码)

```bash
tcb fn config update my-function
```

> ⚠️ **Function type is locked after creation (函数类型创建后不可更改).**
> Cannot change Event → HTTP or vice versa. To switch: delete → recreate.

> ⚠️ **Runtime is locked after creation.** To change (e.g., Nodejs16 → Nodejs18):
> delete the function and create a new one.

### Deploy Modes

| Mode | Flag / Config | Use Case |
|------|--------------|----------|
| COS upload (default) | — | Code < 50 MB, standard deploy |
| ZIP package | `deployMode: "zip"` | Bundled dependencies |
| Image (镜像) | `deployMode: "image"` | Custom runtime, large dependencies |

> ⚠️ **Code encryption (代码加密)**: Once enabled, code cannot be downloaded in console.
> Enable only when you have source control in place.

> ⚠️ **`installDependency` conflict (依赖安装冲突):**
> If `installDependency: true`, the platform installs deps from `package.json` on deploy.
> Do NOT also upload `node_modules/` — they will conflict. Choose one approach.
> For HTTP Functions, `installDependency` is NOT supported; bundle `node_modules` yourself.

---

## Workflow 2: Incremental Update

When only code changed (no config changes):

```bash
tcb fn code update my-function
```

When only config changed (timeout, memory, env vars):

```bash
tcb fn config update my-function
```

Typical iteration cycle:

```bash
# 1. Edit code locally
# 2. Push code only
tcb fn code update my-function
# 3. Invoke to test
tcb fn invoke my-function --params '{"action":"test"}'
# 4. Check logs
tcb fn log my-function
```

---

## Workflow 3: Debug and Investigate

### Step 1: Query Logs (查询日志)

```bash
# Recent logs (default last 10 minutes)
tcb fn log my-function

# Filter by time range
tcb fn log my-function --offset 0 --limit 100

# Search for errors
tcb fn log my-function --keyword "Error"
tcb fn log my-function --keyword "timeout"

# Filter failures only
tcb fn log my-function --success false
```

### Step 2: Get Detailed Log by RequestId

```bash
tcb fn log my-function --reqId "abc-123-def-456"
```

### Step 3: Invoke and Inspect

```bash
# Remote invoke with test payload
tcb fn invoke my-function --params '{"action":"test"}'

# Local run for fast iteration（本地调试）
tcb fn run my-function --params '{"action":"test"}'
```

### Common Error Patterns

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `MODULE_NOT_FOUND` / 模块未找到 | Missing dependency | Check `package.json`; set `installDependency: true` or bundle `node_modules` |
| `Task timed out` / 超时 | Exceeds timeout | Increase `timeout` in config (max 900s); optimize code |
| `Memory size exceeded` / 内存溢出 | OOM kill | Increase `memorySize` (128–3072 MB); reduce payload |
| `Environment variable not found` | Var not set or overwritten | Check `tcb fn detail`; merge env vars on update |
| `Permission denied` / EACCES | VPC or IAM issue | Check VPC config and security group rules |
| `ECONNREFUSED` / network error | Downstream service issue | Verify VPC settings, security groups, endpoint URLs |

---

## Workflow 4: Triggers and Versions

### Timer Trigger (定时触发器 / Cron)

Config in `cloudbaserc.json`:

```jsonc
{
  "functions": [{
    "name": "daily-cleanup",
    "triggers": [{
      "name": "daily-timer",
      "type": "timer",
      "config": "0 0 2 * * * *"  // 每天凌晨2点 (2:00 AM daily)
    }]
  }]
}
```

```bash
# Deploy the trigger
tcb fn trigger create daily-cleanup
# List triggers
tcb fn trigger list daily-cleanup
# Delete a trigger
tcb fn trigger delete daily-cleanup --name daily-timer
```

> Cron format: `秒 分 时 日 月 星期 年` (7 fields — note the leading seconds field).

| Expression | Schedule |
|-----------|----------|
| `0 0 2 * * * *` | 每天 02:00 |
| `0 30 9 * * * *` | 每天 09:30 |
| `0 */5 * * * * *` | 每5分钟 |
| `0 0 2 1 * * *` | 每月1号 02:00 |
| `0 0 18 * * MON-FRI *` | 工作日 18:00 |

### Multi-Environment Cron Deploy Example

```bash
# Deploy cron function to dev, then staging
tcb env use env-dev-xxx
tcb fn deploy daily-cleanup
tcb fn trigger create daily-cleanup

tcb env use env-staging-xxx
tcb fn deploy daily-cleanup
tcb fn trigger create daily-cleanup
```

### Publish a Version

```bash
tcb fn publish-version my-function
tcb fn list-version my-function
```

> ⚠️ **Traffic / concurrency (流量与并发):** Traffic split between versions and
> reserved concurrency are configured via console or API, not CLI.

### Layers (层)

```bash
tcb fn layer list
```

Layers share dependencies across functions — useful for large libraries
(`puppeteer`, `ffmpeg`) that would exceed the code size limit.
Bind layers via `cloudbaserc.json` `layers` array.

---

## Secrets Injection

Inject secrets via environment variables — never hardcode credentials.

```jsonc
// cloudbaserc.json
{
  "functions": [{
    "name": "my-function",
    "envVariables": {
      "DB_HOST": "10.0.0.1",
      "API_KEY": "{{YOUR_API_KEY}}"  // 替换为实际密钥
    }
  }]
}
```

```bash
# Update env vars without redeploying code
tcb fn config update my-function
# Verify
tcb fn detail my-function
```

> ⚠️ **Env var update is a full replace, not a merge (环境变量更新为全量覆盖).**
> Always include ALL env vars in the config — omitting one will delete it.
> Workflow: `tcb fn detail <name>` → copy existing vars → add new → update config.

For CI/CD pipelines, use shell variable substitution:

```bash
export API_KEY="$CI_SECRET_API_KEY"
```

Access in code:

```javascript
const apiKey = process.env.API_KEY;
const dbUrl = process.env.DB_URL;
```

---

## cloudbaserc.json Function Config

```jsonc
{
  "envId": "your-env-id",
  "functionRoot": "cloudfunctions",  // 函数代码根目录
  "functions": [
    {
      "name": "my-event-fn",
      "handler": "index.main",        // ⚠️ format: filename.export
      "runtime": "Nodejs18.15",
      "timeout": 10,
      "memorySize": 256,
      "installDependency": true,       // 云端安装依赖 (Event only)
      "envVariables": { "NODE_ENV": "production" },
      "triggers": [],
      "ignore": ["node_modules/**", ".git/**"]
    },
    {
      "name": "my-http-fn",
      "handler": "index.main",
      "runtime": "Nodejs18.15",
      "timeout": 60,
      "memorySize": 512,
      "isHTTP": true                   // HTTP 云函数
    }
  ]
}
```

### Key Fields

| Field | Description | Default |
|-------|-------------|---------|
| `name` | 函数名称 (required) | — |
| `handler` | 入口，格式 `filename.export` | `index.main` |
| `runtime` | 运行时版本 | `Nodejs18.15` |
| `timeout` | 超时时间（秒，max 900） | `3` |
| `memorySize` | 内存（MB，128–3072，64 的倍数） | `256` |
| `installDependency` | 云端安装依赖（仅 Event Function） | `false` |
| `envVariables` | 环境变量 key-value | `{}` |
| `isHTTP` | 是否为 HTTP 云函数 | `false` |
| `triggers` | 触发器数组 | `[]` |
| `functionRoot` | 所有函数的代码根目录 | `functions` |
| `dir` | 单个函数的子目录（覆盖 name） | same as `name` |
| `ignore` | 部署时排除的文件 glob | `[]` |

> ⚠️ **`handler` format (入口格式):** Must be `filename.export` — e.g., `index.main`.
> Do NOT include file extension or directory path. Wrong: `src/index.main`, `index.js.main`.

> ⚠️ **`functionRoot` vs `dir`:** `functionRoot` is the parent directory for ALL functions.
> Each function folder name must match `name`. Use `dir` to override if the folder name
> differs: `"dir": "actual-folder-name"`.

### Supported Runtimes (运行时)

| Runtime | Value | Notes |
|---------|-------|-------|
| Node.js 18 | `Nodejs18.15` | ✅ Recommended |
| Node.js 16 | `Nodejs16.13` | ✅ Supported |
| Node.js 14 | `Nodejs14.18` | ⚠️ Maintenance |
| Node.js 12 | `Nodejs12.16` | ⚠️ Deprecated |
| Python 3.10 | `Python3.10` | HTTP Function only |
| Go 1.x | `Go1` | HTTP Function only |
| Java 11 | `Java11` | HTTP Function only |
| PHP 8 | `Php8.0` | HTTP Function only |

> HTTP Functions require `scf_bootstrap` file (executable, port 9000, LF line endings).

---

## Common Errors (Top-5)

### 1. `Function not exist` / 函数不存在

**Cause:** Name typo or function not yet deployed.
```bash
tcb fn list                    # verify name exists
tcb fn deploy my-function      # deploy if missing
```

### 2. `Module not found` / 模块未找到

**Cause:** Dependencies not installed in deployed environment.
```bash
# Event Function: enable cloud install
# cloudbaserc.json → "installDependency": true, exclude node_modules

# HTTP Function: bundle locally
npm install --production
tcb fn deploy my-http-fn --httpFn
```

### 3. `Execution timeout` / 执行超时

**Cause:** Function exceeds configured `timeout`.
```bash
tcb fn detail my-function      # check current timeout
# Increase in cloudbaserc.json → "timeout": 60
tcb fn config update my-function
```
Also check: infinite loops, unresolved promises, slow external API calls.

### 4. `Deploy timeout` / 部署超时

**Cause:** Large code package or slow network.
```bash
# Reduce package — add to cloudbaserc.json:
# "ignore": ["node_modules/**", "test/**", ".git/**", "*.md"]
# Or use installDependency: true to skip uploading node_modules
tcb fn deploy my-function
```

### 5. `HTTP 404 / CORS` — 访问不通

**Cause:** HTTP access not configured, path mismatch, or missing CORS headers.
```bash
tcb fn detail my-function      # verify HTTP access config
# Ensure HTTP Function listens on port 9000
# Ensure scf_bootstrap exists and is executable (chmod +x)
# For CORS: add Access-Control-Allow-Origin header in function code
```

---

## Self-Check

Before deploying:

- [ ] Confirmed target `envId` with the user? (`tcb env list`)
- [ ] `cloudbaserc.json` has correct `functionRoot` and function `name`?
- [ ] `handler` format is `filename.export` (no path, no `.js`)?
- [ ] `runtime` explicitly set (not relying on default)?
- [ ] HTTP Function has `scf_bootstrap` with `chmod +x`, port 9000, LF endings?
- [ ] `installDependency` consistent? (Event only; no `node_modules` in upload)
- [ ] Secrets in `envVariables`, not hardcoded?
- [ ] `ignore` excludes test files, docs, `.git`?

After deploying:

- [ ] Verified with `tcb fn detail <name>`?
- [ ] Tested with `tcb fn invoke <name>`?
- [ ] Checked logs with `tcb fn log <name>` for startup errors?
- [ ] Triggers working? (`tcb fn trigger list <name>`)

When updating env vars:

- [ ] Queried current vars first? (`tcb fn detail <name>`)
- [ ] Merged existing + new vars in config?
- [ ] Did NOT overwrite — all existing vars preserved?
