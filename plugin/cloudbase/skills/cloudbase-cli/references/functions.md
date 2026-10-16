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
| Download deployed code | `tcb fn code download <name> [dest]` |
| Update config only (仅更新配置) | `tcb config update fn [name]` |
| Invoke remotely (调用函数) | `tcb fn invoke <name>` |
| Invoke with params | `tcb fn invoke <name> --params '{"key":"val"}'` |
| Run locally (本地调试) | `tcb fn run <name>` |
| View logs (查看日志) | `tcb logs search --query 'function_name:"<name>"'` |
| View log by RequestId | `tcb logs search --query 'request_id:("<requestId>")'` |
| Create trigger (创建触发器) | `tcb fn trigger create <functionName> --trigger-name <t> --cron <cron>` |
| List triggers | `tcb fn detail <name>` (triggers are shown in the detail output) |
| Delete trigger | `tcb fn trigger delete <functionName> <triggerName>` |
| List layers (层) | `tcb fn layer list` |
| Publish version (发布版本) | `tcb fn publish-version <name>` |
| List versions (版本列表) | `tcb fn list-function-versions <name>` |
| Copy to another env | `tcb fn copy <name> --env-id <target>` |
| Delete function | `tcb fn delete <name>` |

> Always run `tcb fn <subcommand> --help` first to check current syntax.

> ⚠️ **Renamed / deprecated (命令已改名或废弃，别再用旧写法):**
> - `tcb fn list-version` → **`tcb fn list-function-versions <name>`**
> - `tcb fn config update` → **`tcb config update fn [name]`** (deprecated; the new command additionally supports `--all`, `--timeout`, `--memory`, `--runtime`, `--handler`, `--vpc`)
> - `tcb fn log <name>` → **`tcb logs search`** (deprecated since v3.0.0; CLS query syntax, see Workflow 3)

> 🚫 **Two separate function command families still register and are NOT `tcb fn`.** They are
> **not recommended for use** — always answer with `tcb fn`:
> - **`tcb cloudfunction <deploy|download|run>`** — 云函数服务 (older service API; uses
>   `-s/--serviceName` + `--source`, not `fn`'s `--path` / `--dir` / `[name]` shape)
> - **`tcb cloudrunfunction <deploy|download|run>`** — 云函数 2.0 服务 (函数型云托管 lineage)
>
> Status: **not recommended** (product decision). They carry **no `[已废弃]` marker** and are absent from
> `tcb --help`, so this status is not discoverable from code — but do not propose them for new work, and
> do not offer them as an alternative to `tcb fn`. If the user already has working tooling on them, they
> still run; if they ask which to use, say `tcb fn`.
>
> ⚠️ Do not describe them as "deprecated" either — the CLI marks deprecation explicitly
> (`[已废弃]`, e.g. `tcb framework`, `tcb run`), and these are not marked.

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
# Push cloudbaserc.json function config to the cloud (no code upload)
tcb config update fn my-function

# Override individual fields from the CLI
tcb config update fn my-function --timeout 30 --memory 512

# Batch: push every function listed in cloudbaserc.json
tcb config update fn --all
```

> ⚠️ `tcb fn config update <name>` is **deprecated** — use `tcb config update fn`. The old form does not support `--all` / `--timeout` / `--memory` / `--runtime` / `--handler` / `--vpc`.

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

When you need the **deployed** code locally (e.g. to inspect what is actually running):

```bash
tcb fn code download my-function              # newest code into ./my-function
tcb fn code download my-function ./out
tcb fn code download my-function --fn-version 3   # a published version (default $LATEST)
tcb fn code download my-function --code-secret <secret>  # if code encryption is enabled
```

When only config changed (timeout, memory, env vars):

```bash
tcb config update fn my-function
```

Typical iteration cycle:

```bash
# 1. Edit code locally
# 2. Push code only
tcb fn code update my-function
# 3. Invoke to test
tcb fn invoke my-function --params '{"action":"test"}'
# 4. Check logs
tcb logs search --query 'function_name:"my-function"' --timeRange 30m
```

---

## Workflow 3: Debug and Investigate

### Step 1: Query Logs (查询日志)

`tcb fn log` is deprecated (since v3.0.0). Use `tcb logs search` (CLS query syntax):

```bash
# Recent logs (default: last 1h, 20 entries; --timeRange accepts 30m/1h/6h/1d or an absolute "start,end" range)
tcb logs search --query 'function_name:"my-function"'

# Wider window / more entries (limit max 100)
tcb logs search --query 'function_name:"my-function"' --timeRange 6h --limit 100

# Search for errors (full-text AND)
tcb logs search --query 'function_name:"my-function" AND "Error"'
tcb logs search --query 'function_name:"my-function" AND "timeout"'

# Failures only (aggregate by request_id; 202 = START/END middle state, must be excluded)
tcb logs search --query 'function_name:"my-function" | select request_id, max(status_code) as status_code, max(ret_msg) as ret_msg where status_code>200 AND status_code!=202 AND retry_num=0 group by request_id limit 10'

# Page through results: pass the Context returned by the previous call
tcb logs search --query 'function_name:"my-function"' --context "<context>"
```

Useful cloud-function fields in `--query`: `function_name`, `request_id`, `status_code` (200 = success), `src` (`system` = platform log, `app` = user-code log), `log` (message body), `namespace` (envId), `qualifier` (version, `$LATEST`), `retry_num`.

### Step 2: Get Detailed Log by RequestId

```bash
tcb logs search --query 'request_id:("abc-123-def-456")' --sort asc
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
# Deploy the trigger (reads functions[].triggers from cloudbaserc.json)
tcb fn trigger create daily-cleanup
# Or create one directly from the CLI
tcb fn trigger create daily-cleanup --trigger-name daily-timer --cron "0 0 2 * * * *"
# Verify: triggers appear in the function detail (there is no `fn trigger list`)
tcb fn detail daily-cleanup
# Delete a trigger — both args are POSITIONAL (there is no --name flag)
tcb fn trigger delete daily-cleanup daily-timer
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
tcb fn list-function-versions my-function
```

> ⚠️ **Traffic / concurrency (流量与并发) ARE available in the CLI** — do not tell users
> that the console is the only option:
> - Version traffic split: `tcb fn config-route <name> <version1> <traffic1> [version2] [traffic2]`
>   (read back with `tcb fn get-route <name>`)
> - Provisioned concurrency (预置并发): `tcb fn set-provisioned-concurrency <name> <version> <concurrency>`,
>   `tcb fn get-provisioned-concurrency <name> [version]`, `tcb fn delete-provisioned-concurrency <name> <version>`
> - Version lifecycle: `tcb fn delete-version <name> <version>`

### Layers (层)

Layers share dependencies across functions — useful for large libraries
(`puppeteer`, `ffmpeg`) that would exceed the code size limit. They can be managed through the CLI
**or** declared in `cloudbaserc.json`.

```bash
# Inspect
tcb fn layer list
tcb fn layer list --name my-function          # layers bound to one function
tcb fn layer list --layer my-layer            # a specific layer alias

# Create / remove
tcb fn layer create my-layer --file ./layer.zip --runtime Nodejs18.15,Nodejs16.13
tcb fn layer delete                            # delete a layer in this env (interactive pick)

# Bind / unbind
tcb fn layer bind my-function --layer my-layer --layer-version 1
tcb fn layer unbind my-function --layer my-layer
tcb fn layer sort my-function                  # re-order bound layers (path priority!)

# Download a layer's content
tcb fn layer download --dest ./layers
```

`--code-secret <codeSecret>` is available on `list` / `bind` / `unbind` / `sort` for functions whose
code is encrypted.

> ⚠️ **Order matters.** Layer contents are merged into `/opt` in binding order; on conflicts the
> **last** layer wins. Use `tcb fn layer sort <name>` to change priority rather than re-binding.

> ⚠️ A layer must be compatible with the function's runtime. `--runtime` is a comma-separated list;
> a layer built for a runtime the function does not use will not mount.

You can also declare layers in `cloudbaserc.json` (`layers` array) and let `tcb fn deploy` bind them.

### Function environment variables (`tcb fn env`)

```bash
# Pull the deployed environment variables of a function into a local file
tcb fn env pull my-function
tcb fn env pull my-function --output-file .env.local
```

This is the read side. To **write** env vars, edit `envVariables` in `cloudbaserc.json` and push with
`tcb config update fn <name>` — see *Secrets Injection* below for the merge caveat.

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
tcb config update fn my-function
# Verify
tcb fn detail my-function
tcb fn env pull my-function --output-file .env.local   # or dump them to a file
```

> 💡 For values you do not want in git, prefer CloudBase-managed configuration over a committed
> `cloudbaserc.json`. The CLI has no per-function secret store — `tcb secrets`
> only returns session credentials (see `cloudrun.md`).

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
tcb config update fn my-function
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
- [ ] Checked logs with `tcb logs search --query 'function_name:"<name>"'` for startup errors?
- [ ] Triggers working? (`tcb fn detail <name>` — triggers are listed there; there is no `fn trigger list`)

When updating env vars:

- [ ] Queried current vars first? (`tcb fn detail <name>`)
- [ ] Merged existing + new vars in config?
- [ ] Did NOT overwrite — all existing vars preserved?
