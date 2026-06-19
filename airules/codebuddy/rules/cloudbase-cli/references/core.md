# Core — CloudBase CLI

> Core foundation for all CloudBase CLI operations (云开发 CLI 核心基础).
> This reference covers authentication, environment setup, documentation queries, config, and error handling.

## When to Use

- **Any** CloudBase CLI operation (always start here)
- Authenticating with `tcb login` or switching environments with `tcb env use`
- Querying CLI docs with `tcb docs` or checking command help with `--help`
- Diagnosing CLI errors via exit codes

## Do NOT use for

- CloudBase SDK development (use `cloudbase-skills` repo)
- CloudBase MCP server operations (use MCP server docs)
- Tencent Cloud console-only operations (this reference is CLI-only)

---

## Workflow 1: Authentication

### Quick Commands

```bash
tcb login                      # Interactive login (device code, recommended)
tcb login --flow web           # Web authorization (same-machine only)
tcb login --apiKeyId <Id> --apiKey <Key>            # CI / non-interactive
tcb login --apiKeyId <Id> --apiKey <Key> --token <T> # Temp token (CI, more secure)
tcb logout                     # Clear local credentials
```

### Login Methods

**1. Device Code Authorization (default, recommended)**

```bash
tcb login
# Prints a device code + verification URL.
# Open URL in any browser (can be a different machine), enter code to authorize.
```

> Works in remote SSH, headless servers, WSL. Browser and CLI need **not** be on the same machine.

**2. Web Authorization (same-machine only)**

```bash
tcb login --flow web
# Opens browser on local machine; CLI receives token via local callback.
```

> ⚠️ Requires browser and CLI on the same machine. Falls back to key-based login if browser cannot open.

**3. CI / Non-Interactive Login**

```bash
# Permanent credentials
tcb login --apiKeyId $SECRET_ID --apiKey $SECRET_KEY

# Temporary token (shorter TTL, more secure for CI)
tcb login --apiKeyId $TMP_SECRET_ID --apiKey $TMP_SECRET_KEY --token $SESSION_TOKEN
```

> ⚠️ **Never hardcode credentials.** Always inject via environment variables.
> 不要把密钥硬编码在命令里，通过环境变量注入。

### Checking Login Status

```bash
tcb login
# If already logged in: prints "您已登录，无需再次登录！" and exits.
```

> ⚠️ Do **not** use `tcb env list` to check login status — sub-accounts may lack list permissions, causing misleading errors.

### Sub-account Policies (子账号策略)

Sub-accounts need these CAM policies to use the CLI:

| Policy | Purpose |
|--------|---------|
| `QcloudAccessForTCBRole` | TCB access to cloud resources |
| `QcloudAccessForTCBRoleInAccessCloudBaseRun` | TCB access to VPC/CVM for CloudRun |
| `QcloudCamReadOnlyAccess` | Required for web/device code login; without it, only API key login works |

> ⚠️ If sub-account device/web login fails, grant `QcloudCamReadOnlyAccess` or switch to `--apiKeyId / --apiKey`.

### Auth Troubleshooting

| Issue | Solution |
|-------|----------|
| `Not logged in` | Run `tcb login` |
| Cannot open browser / browser loop | Use default device code flow (no `--flow` flag) |
| Device code not working in CI | Use `--apiKeyId / --apiKey` credential login |
| Sub-account web/device login fails | Grant `QcloudCamReadOnlyAccess`, or use key login |
| Permission denied on resources | Check sub-account CAM policies for the specific TCB resource |

---

## Workflow 2: Environment Setup

### Core Principle

> 操作任何云开发资源前，必须先确认 envId。优先让用户明确告知 envId。

⚠️ **Always confirm envId before any operation** to avoid accidentally modifying production.
Ask the user to provide the envId directly — do not auto-discover.

### Login -> Environment Flow

```
tcb login
    |
Ask user: "Which environment? (please provide the envId)"
    |
User knows envId?
    +-- YES --> tcb env use <envId>
    +-- NO  --> tcb env list  <-- fallback only; sub-accounts may see limited results
                    |
                User selects --> tcb env use <envId>
```

### Basic Operations

```bash
tcb env use <envId>                          # Set default env for all subsequent commands
tcb env detail <envId>                       # View environment details
tcb env rename <newAlias> --env-id <envId> --yes  # Rename alias
tcb env create --alias <name> --package <packageId> --yes  # Create new env
```

> ⚠️ `tcb env list` may return incomplete results under sub-account permissions. Use only when user explicitly asks.

### Per-Command Override

```bash
tcb app deploy --env-id <envId>   # Override without changing default
```

### Multi-Environment Best Practices

- Use **separate envIds** for dev / staging / production — never share
- Before production operations: confirm envId with user + `--dry-run`
- When switching environments, explicitly confirm the new envId before proceeding

---

## Workflow 3: Documentation Query (tcb docs)

> **When in doubt, query first. Never guess command signatures.**
> 不确定参数时，先查，不要猜。猜错在生产环境上可能触发你不想要的操作。

### Commands

```bash
tcb docs list                    # List all top-level documentation modules
tcb docs read <module|path>      # Read module structure or specific document
tcb docs search "keyword"        # Search documents by keyword
```

### Standard Query Flow

```
tcb docs list
    |
Identify relevant module
    |
tcb docs read <moduleName>
    |
Browse document tree, find target path
    |
tcb docs read <path>             # e.g. "MySQL数据库.数据操作.字段类型"
    |
Read content --> construct command
```

Or shortcut: `tcb docs search "关键词"` --> review results --> `tcb docs read <path>`

### Decision Tree

```
User describes a task
    |
Know exact command + all flags?
    +-- NO  --> tcb docs list --> tcb docs read --> confirm flags
    +-- YES --> Destructive operation?
                    +-- YES --> --dry-run first
                    +-- NO  --> Execute directly
```

### Query docs when

- Unsure about subcommands or flags
- A command returned an error and you don't know why
- The user mentions a feature you haven't used before
- Combining multiple flags and want to verify compatibility
- About to perform a destructive or irreversible operation

### Skip docs when

- Simple read operation you've already run this session
- User provided all parameters and you've verified the syntax

### Anti-patterns

| Anti-pattern | Do instead |
|-------------|-----------|
| Guessing a flag name | `tcb docs list` -> `tcb docs read <module>` first |
| Running full deploy to "test" if it works | Use `--dry-run` |
| Repeating same failed command with same flags | Re-read docs, change flags |
| Assuming v2.x flag names still work | Query docs after version upgrade |
| Jumping to `tcb docs read <path>` without listing | Start with `tcb docs list` |

### --help First Rule (MANDATORY)

**Before using ANY `tcb` command for the first time, run `<command> --help` to check:**
- Parameter names and formats
- Required vs optional parameters
- Official API doc URLs (many commands include Tencent Cloud API links)
- Examples and usage patterns

```
Unsure about usage?
    |
tcb <command> --help
    |
Help shows API doc link?
    +-- YES --> web_fetch the doc --> understand data structure --> construct correctly
    +-- NO  --> tcb docs search "<keyword>" --> construct from docs
```

> ⚠️ **Real lesson**: `tcb db nosql execute --help` shows `MgoCommandParam` structure doc link.
> Without reading it, agents construct wrong `Command` field format (should be a JSON-encoded
> string of MongoDB shell syntax, NOT a raw array). **This mistake cost 10+ minutes. Don't repeat it.**

### --dry-run Safety Mechanism

> 所有破坏性操作必须先 `--dry-run` 预览，等用户确认后再执行。

```bash
tcb app deploy --dry-run     # Preview app version to be published
tcb fn deploy --dry-run      # Preview functions to be overwritten
```

Workflow: `--dry-run` -> show preview -> wait for user confirmation -> re-run without `--dry-run`.

⚠️ Never skip `--dry-run` for destructive operations (overwrite / delete / rollback).

---

## cloudbaserc.json Quick Reference

> Project config file in project root. Defines environment, functions, servers, and app settings.

### File Location

```
project-root/
+-- cloudbaserc.json          <-- Default
+-- .cloudbaserc.json         <-- Alternative (hidden)
+-- custom-config.json        <-- Use with --config-file flag
```

```bash
tcb app deploy --config-file config/staging.json
```

### Root Structure (`ICloudBaseConfig`)

```json
{
  "envId": "env-xxxxx",
  "functionRoot": "functions",
  "functions": [],
  "servers": [],
  "app": {}
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `envId` | string | **Yes** | CloudBase environment ID (`env-` prefix). Override with `--env-id` |
| `functionRoot` | string | No | Base directory for cloud functions. Default: `"functions"` |
| `functions` | array | No | Cloud function configs (see below) |
| `servers` | array | No | CloudRun service configs (see below) |
| `app` | object | No | Web app hosting config (see below) |

### `functions` Array — Essential Fields

Each entry is an `ICloudFunction`:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `name` | string | (required) | Function name, unique in env |
| `handler` | string | — | Entry point, e.g. `"index.main"` |
| `runtime` | string | auto-detected | `Nodejs18.15`, `Python3.9`, `Go1.8`, `Java11`, etc. |
| `timeout` | number | `3` | Execution timeout in seconds (1-900) |
| `memorySize` | number | `256` | Memory in MB (128-3008, multiples of 128) |
| `type` | string | `"Event"` | `"Event"` (background) or `"HTTP"` (web-accessible) |
| `envVariables` | object | `{}` | Runtime env vars (`process.env.*` / `os.environ[]`) |
| `triggers` | array | `[]` | Timer, COS, API Gateway triggers |
| `installDependency` | boolean | `true` | Auto-install deps before deploy |
| `vpc` | object | — | `{ vpcId, subnetId }` for VPC access |
| `dir` | string | `functionRoot/name` | Custom code directory |
| `ignore` | string[] | `[]` | Glob patterns to exclude from deploy |

> ⚠️ For sensitive values, use `tcb secrets` instead of `envVariables`.

**Minimal function example:**

```json
{
  "functions": [{
    "name": "my-function",
    "handler": "index.main",
    "runtime": "Nodejs18.15",
    "timeout": 30,
    "envVariables": { "NODE_ENV": "production" }
  }]
}
```

> For full function config (triggers, image deployment, concurrency, WebSocket, VPC) see `tcb-functions` skill.

### `servers` Array

```json
{
  "servers": [
    { "type": "node", "name": "api-service", "path": "services/api" }
  ]
}
```

> Only `"node"` type currently supported. For full CloudRun config see `tcb-cloudrun` skill.

### `app` Object — `ICloudAppConfig`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `serviceName` | string | (required) | Service name, unique in env, used in URLs |
| `framework` | string | auto-detected | `react`, `vue`, `nextjs`, `nuxt`, `static`, etc. |
| `root` | string | `"."` | App code directory (relative to project root) |
| `installCommand` | string | framework-dependent | Empty string `""` = skip |
| `buildCommand` | string | framework-dependent | Empty string `""` = skip build |
| `outputDir` | string | `"dist"` | Build output dir. For static hosting: `"./"` |
| `deployPath` | string | `/<serviceName>` | URL path. Only non-default values are saved to config |
| `envVariables` | object | `{}` | Build-time environment variables |
| `ignore` | string[] | `[]` | Files/dirs to exclude from deploy |

**Minimal app example:**

```json
{
  "app": {
    "serviceName": "web-app",
    "framework": "react",
    "buildCommand": "npm run build",
    "outputDir": "dist"
  }
}
```

### Config Priority (highest to lowest)

1. **CLI flags** (`--env-id`, `--deploy-path`, etc.)
2. **cloudbaserc.json**
3. **CLI defaults**

CI/CD environment variable overrides:

```bash
export TCB_ENV_ID=env-production    # Override envId
export TCB_FRAMEWORK=vue            # Override framework detection
```

### Config Best Practices

- **Commit** `cloudbaserc.json` to git for team consistency; **never** add secrets
- Use separate config files per environment (`cloudbaserc.production.json`)
- Add `cloudbaserc.*.json` to `.gitignore`
- Validate: `tcb app info --config-file cloudbaserc.json --json`

---

## Error Diagnosis (Exit Codes)

CloudBase CLI uses structured exit codes for CI/CD and agent error handling.

| Code | Meaning | Typical Scenario | Recovery |
|------|---------|-----------------|----------|
| 0 | Success | — | — |
| 1 | General error | Uncategorized exception | Check message, investigate |
| 2 | Auth failed | Not logged in, token expired | `tcb login` |
| 3 | Invalid input | Missing/malformed params | Check `--help`, fix params |
| 4 | Resource not found | Wrong envId, missing function/collection | Verify with `tcb env list` / `tcb fn list` |
| 5 | Cloud API error | Network timeout, SDK error | Retry with backoff |
| 6 | Local file error | `cloudbaserc.json` missing/corrupt | Check config, `tcb init` |

### Agent Error Handling Strategy

1. **Read exit code** (`$?`) to categorize
2. **Parse error message** for details (envId, param name, etc.)
3. **Targeted recovery:**
   - Code 2 -> `tcb login`
   - Code 3 -> Fix params (check docs, ask user)
   - Code 4 -> Verify resource exists
   - Code 5 -> Retry with exponential backoff
   - Code 6 -> Check/repair config
4. **Escalate to user** if recovery fails after 2-3 attempts

### CI/CD Script Pattern

```bash
tcb fn deploy || {
  code=$?
  case $code in
    2) echo "Auth failed"; tcb login && tcb fn deploy ;;
    5) echo "API error, retrying..."; sleep 30 && tcb fn deploy ;;
    *) echo "Unrecoverable (code $code)"; exit $code ;;
  esac
}
```

> Run `tcb help exit-codes` for source-level docs (requires CLI >= 3.0.0-alpha.9).

---

## Self-Check

> 每次 CLI 操作前的核心检查清单

### Environment Setup
- [ ] `tcb --version` >= 3.0.0
- [ ] `tcb login` completed (token valid)
- [ ] Target envId confirmed with user
- [ ] `tcb env use <envId>` executed

### Before Any Command
- [ ] Run `<command> --help` for any new command
- [ ] Check API doc links in help output (use `web_fetch` if available)
- [ ] Verify parameter names/formats match help

### Destructive Operations
- [ ] `--dry-run` to preview first
- [ ] Show preview to user
- [ ] Wait for explicit confirmation
- [ ] Re-run without `--dry-run` only after "yes"

### Error Handling
- [ ] Check exit code (`$?`)
- [ ] Apply targeted recovery per exit code table above
- [ ] Escalate to user after 2-3 failed attempts

### Common Global Flags

```bash
--env-id <envId>    # Temporarily override env (does not change `env use` setting)
--verbose           # Verbose logging (add when debugging)
--version           # Print tcb version (verify >= 3.0.0)
```
