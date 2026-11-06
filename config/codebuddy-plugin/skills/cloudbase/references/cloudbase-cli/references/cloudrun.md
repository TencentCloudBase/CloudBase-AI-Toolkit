# CloudRun — CloudBase CLI

Deploy and manage containerized/server-rendered applications with traffic shifting and canary releases.
CloudRun = persistent containers; for event-triggered serverless, use `functions` instead.

## When to Use

- Deploying containerized or server-rendered applications to CloudBase
- Managing CloudRun services (init, deploy, list, delete)
- Setting up canary deployment or traffic shifting between versions
- Running function-based CloudRun services locally for testing
- Need persistent long-running services (web APIs, backends)

## Do NOT use for

- Serverless event-triggered functions — use `functions`
- Static file hosting — use `hosting`
- Web app deployment with framework auto-detection — use `app`
- Database operations — use `mysql` or `nosql`

---

## Workflow 1: Init and Deploy

### Step 1: Initialize project

```bash
# Initialize from template
tcb cloudrun init --service-name <serviceName> --template <templateName>

# Initialize in a specific directory
tcb cloudrun init --service-name <serviceName> --template <templateName> --target-path <path>
```

### Step 2: Deploy

> ⚠️ **Brand-new environment first-time deploy** — confirm CloudRun is initialized in the target env before the first deploy (console `环境 → 云托管 → 开通`, or `CreateCloudRunEnv` via the tcbr service). Deploying to an env with no 大租户 record silently lands in the legacy 小租户 path and creates wrong small-tenant services/versions.

```bash
# Basic deploy
tcb cloudrun deploy --service-name <serviceName> --env-id <envId>

# Container-based: specify port
tcb cloudrun deploy --service-name <serviceName> --port 8080 --env-id <envId>

# With online dependency installation
tcb cloudrun deploy --service-name <serviceName> --install-dependency true --env-id <envId>

# Deploy with canary mode (new version starts at 0% traffic)
tcb cloudrun deploy --service-name <serviceName> --traffic --env-id <envId>

# CI/CD: skip confirmation
tcb cloudrun deploy --service-name <serviceName> --force --env-id <envId>
```

> ⚠️ Without `--traffic` flag, the new version replaces the old one with 100% traffic immediately. Use `--traffic` when you want gradual rollout.

> ⚠️ `--force` skips the confirmation prompt but does NOT preview changes — it just skips the prompt.

### Step 3: Verify

```bash
# List all services
tcb cloudrun list --env-id <envId>

# Filter by name or type (the flag is --server-type, values: function | container)
tcb cloudrun list --service-name <serviceName> --env-id <envId>
tcb cloudrun list --server-type container --env-id <envId>
```

### Container-based Deploy Example (Node.js API)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 80
CMD ["node", "server.js"]
```

```bash
# Build and push image
docker build -t ccr.ccs.tencentyun.com/my-repo/api:v1.0.0 .
docker push ccr.ccs.tencentyun.com/my-repo/api:v1.0.0

# Deploy the container image (created on first run, updated afterwards)
tcb cloudrun deploy \
  --service-name api \
  --image-url ccr.ccs.tencentyun.com/my-repo/api:v1.0.0 \
  --port 80 \
  --env-id <envId>
```

> ⚠️ Container deploys go through **`tcb cloudrun deploy --image-url`** — that is the only
> image-deploy flag in this CLI. `tcb app deploy` is the **web-app** path (cloud build +
> hosting): it takes a *positional* service name and has no `--service-name` / `--image` /
> `--remark`. `--image` and `--remark` exist only on the deprecated `tcb run service:deploy`.

---

## Workflow 2: Traffic Shifting (Canary)

Traffic shifting enables canary releases, blue/green deployments, and instant rollbacks.

> ⚠️ The only command is **`tcb cloudrun traffic [action]`**, with options `-s/--service-name`,
> `--stable <0-100>` and `--canary <0-100>`. There is **no `traffic get`**, **no `traffic set`**
> subcommand, and **no `--version-weights`** flag.
> - no action + `--stable` / `--canary` → set the gray ratio
> - `traffic promote` → complete the gray release
> - `traffic rollback` → revert to the previous stable version

### View current traffic

```bash
# Per-version status (shows each version and its current traffic weight)
tcb cloudrun version detail --service-name <serviceName> --env-id <envId>

# Full service detail (traffic config is in the JSON payload)
tcb cloudrun detail --service-name <serviceName> --env-id <envId> --json
```

### Canary release (recommended pattern)

```bash
# 1. Deploy the new version in canary mode (starts at 0% traffic)
tcb cloudrun deploy \
  --service-name my-service \
  --image-url ccr.ccs.tencentyun.com/my-repo/app:v2.0.0 \
  --traffic \
  --env-id <envId>

# 2. Note the current stable version BEFORE shifting anything
tcb cloudrun version detail --service-name my-service --env-id <envId>

# 3. Shift 10% to the canary -> monitor ~15 min
tcb cloudrun traffic --service-name my-service --canary 10 --env-id <envId>

# 4. Shift 50% -> monitor
tcb cloudrun traffic --service-name my-service --canary 50 --env-id <envId>

# 5. Complete the rollout (canary becomes the only version)
tcb cloudrun traffic promote --service-name my-service --env-id <envId>
```

> ⚠️ `--stable` and `--canary` must total 100. Passing only one makes the CLI derive the other
> (`--canary 10` ⇒ stable 90); passing neither starts an interactive prompt.

> ⚠️ Always note the current stable version name BEFORE starting a rollout
> (`tcb cloudrun version detail`).

> ⚠️ `traffic promote` completes the gray release and drops the old stable version — irreversible.
> `traffic rollback` reverts to the previous stable version. Confirm with the user before either.

### Instant rollback

```bash
tcb cloudrun traffic rollback --service-name my-service --env-id <envId>
```

### Monitoring after traffic shift

```bash
# CloudRun logs go through the tcbr log service (--service is tcb|tcbr, NOT the service name)
tcb logs search --service tcbr --query '"error"' --timeRange 1h --env-id <envId>
tcb logs search --service tcbr --limit 50 --env-id <envId>
tcb app info my-service --env-id <envId>
```

Rollback triggers: error rate > 1%, P99 latency > 2x baseline, any crash/OOM in logs.

### Multi-environment Promotion (dev -> staging -> prod)

```bash
IMAGE=ccr.ccs.tencentyun.com/my-repo/my-service:v1.2.0

tcb cloudrun deploy --service-name svc --image-url $IMAGE --env-id dev-env-xxx
# test in dev...
tcb cloudrun deploy --service-name svc --image-url $IMAGE --env-id staging-env-xxx
# sign-off...
# NOTE: cloudrun deploy has no --dry-run; --wait blocks until the deployment finishes
tcb cloudrun deploy --service-name svc --image-url $IMAGE --env-id prod-env-xxx --wait
tcb cloudrun list --service-name svc --env-id prod-env-xxx   # verify
```

---

## Workflow 3: Local Development

```bash
# Run function-based service locally
tcb cloudrun run --env-id <envId>

# With file watching (this is the "hot reload" flag — there is no --hot-reload)
tcb cloudrun run -w --env-id <envId>
tcb cloudrun run --watch --env-id <envId>

# On specific port
tcb cloudrun run --port 3000 --env-id <envId>

# Agent mode (for AI agent debugging) — the flag is --run-mode, not --mode
tcb cloudrun run --run-mode agent --agent-id <agentId> --env-id <envId>

# Dry run (validate without starting; boolean flag, no value)
tcb cloudrun run --dry-run --env-id <envId>
```

> ⚠️ `tcb cloudrun run` only supports function-based services. Container-based services must be tested via Docker locally.

### Function-based vs Container-based

| Capability | Function-based | Container-based |
|-----------|---------------|----------------|
| `tcb cloudrun run` (local) | Supported | Not supported |
| Custom Dockerfile | No | Yes |
| Port configuration | Auto-detected | Must specify `--port` |
| Watch / hot reload | `-w` / `--watch` | Not supported |
| Agent mode | `--run-mode agent --agent-id <id>` | Not supported |

---

## Workflow 4: Download and Delete

```bash
# Download latest deployed code
tcb cloudrun download --service-name <serviceName> --target-path <path> --env-id <envId>

# Force overwrite existing directory
tcb cloudrun download --service-name <serviceName> --force --env-id <envId>

# Preview the deletion without executing it
tcb cloudrun delete --service-name <serviceName> --dry-run --env-id <envId>

# Delete a service (interactive confirmation)
tcb cloudrun delete --service-name <serviceName> --env-id <envId>

# Force delete (CI/CD)
tcb cloudrun delete --service-name <serviceName> --force --env-id <envId>
```

> ⚠️ Deletion removes all versions and traffic configuration and there is no undo — but
> **`--dry-run` IS supported** on `cloudrun delete` (it previews the deletion without executing).
> Always show that preview and get explicit confirmation first.

> ⚠️ `tcb cloudrun download` downloads the latest deployed code only, not a specific version. Does not include runtime config (env vars, secrets).

---

## Workflow 5: Versions, records and logs

### Version lifecycle

```bash
# Inspect one version (also shows its traffic weight)
tcb cloudrun version detail --service-name my-service --version-name my-service-001 --env-id <envId>

# Roll back to a previous version
tcb cloudrun version rollback --service-name my-service \
  --rollback-version-name my-service-001 \
  --current-version-name my-service-002 \
  --operator-remark "revert v2" --env-id <envId>

# Delete versions (comma-separated list)
tcb cloudrun version delete --service-name my-service \
  --version-names my-service-001,my-service-002 --env-id <envId>
```

`version rollback` flags: `--rollback-version-name` (target), `--current-version-name`, `--operator-remark`,
`--force`.

`version delete` flags: `--version-names <v1,v2>` (required), `--is-delete-server <true|false>`
(default false), `--is-delete-image <true|false>`, `--force`.

> ⚠️ `version rollback` and `traffic rollback` are **different operations**:
> `cloudrun traffic rollback` reverts the canary traffic split; `cloudrun version rollback` switches
> the service back to a named earlier version. Pick deliberately — both are hard to undo.
>
> ⚠️ `version delete` is irreversible and can remove the image too. Confirm the version list with the
> user first; never delete the version currently serving traffic.

### Deployment records

```bash
tcb cloudrun record list --service-name my-service --env-id <envId>
tcb cloudrun record list --service-name my-service --env-id <envId> --json
```

Use this to obtain the **BuildId** and **RunId** that the log commands need.

### Build / runtime logs

```bash
# Build logs (takes the service name + optional build id)
tcb cloudrun logs build --service-name my-service --env-id <envId>
tcb cloudrun logs build --service-name my-service --build-id 123456 --env-id <envId>

# Runtime logs (takes a RunId, NOT a service name)
tcb cloudrun logs process --run-id 123456 --env-id <envId>
```

> ⚠️ `logs process` takes `--run-id` only (`-e/--env-id` for the environment). It has **no**
> `--service-name`. Get the RunId from `tcb cloudrun record list` first.
>
> ℹ️ For querying/filtering CloudRun logs by content over a time window, use
> `tcb logs search --service tcbr` instead — see `logs.md`.

---

## Env Vars & Secrets Injection

> ⚠️ **`tcb secrets set` / `tcb secrets list` do not exist.** In this CLI version `tcb secrets`
> exposes exactly one subcommand — `get` — which returns short-lived credentials for the current
> login session (used to initialize `@cloudbase/manager-node` / `node-sdk` in your own scripts).
> It has nothing to do with configuring CloudRun runtime env vars:

```bash
tcb secrets get --env-id <envId>
tcb secrets get --json
```

> ⚠️ `tcb cloudrun deploy` has **no** env-var / secret flag. Its full option set is
> `--service-name`, `--port`, `--source`, `--image-url`, `--create-agent`, `--force`,
> `--install-dependency`, `--traffic`, `--vpc-config`, `--wait`, `--min-num`, `--max-num`,
> `--open-access-types` — nothing else.

**Where CloudRun env vars CAN be set** (the capability exists, `tcb cloudrun deploy` just doesn't expose it):

| Path | How | Status |
|------|-----|--------|
| Console | 环境 → 云托管 → 服务配置 → 环境变量 | ✅ recommended |
| `tcb run service:deploy --envParams "xx=a&yy=b"` | legacy CLI; a direct `EnvParams` flag | ⚠️ **deprecated** — "此命令将被移除" |
| `tcb run:deprecated version create\|update --env "xx=a&yy=b"` | hidden legacy namespace; also writes `EnvParams` | ⚠️ **deprecated** — "此命令将被移除" |
| `tcb api tcbr <Action> --body '{...}'` | raw Tencent Cloud API escape hatch; pass `serverConfig.EnvParams` | ✅ works, but you must supply the Action name + full payload yourself |
| `@cloudbase/manager-node` → `cloudrun.deploy({ serverConfig: { EnvParams } })` | in-app / CI scripts | ✅ |

> ⚠️ `EnvParams` is a **stringified JSON** value in the SDK/API (`'{"KEY":"value"}'`), while the legacy
> CLI flags take a `key=value&key2=value2` string. They are not interchangeable.
>
> ⚠️ The two `tcb run*` paths are deprecated legacy 云托管 commands — they also use the *old* deploy
> flags (`--custom_image` / `--containerPort` instead of `--image-url` / `--port`). Prefer the console
> or the SDK.
>
> ⚠️ **Never bake credentials into the image.** If you use `tcb api`, confirm the Action name against the
> official tcbr API docs first; a wrong payload mutates a live service.

---

## Command Quick Reference

```bash
tcb cloudrun init      --service-name <n> --template <t>     # Init project
tcb cloudrun deploy    --service-name <n> --env-id <id>      # Deploy code (add --image-url for images)
tcb cloudrun list      --env-id <id>                         # List services
tcb cloudrun detail    --service-name <n> --env-id <id>      # Service detail (includes traffic)
tcb cloudrun download  --service-name <n> --env-id <id>      # Download code
tcb cloudrun delete    --service-name <n> --env-id <id>      # Delete service
tcb cloudrun run       --env-id <id>                         # Local run (function only)
tcb cloudrun version detail   --service-name <n> --env-id <id>  # Per-version traffic
tcb cloudrun version rollback --service-name <n> --rollback-version-name <v> --env-id <id>
tcb cloudrun version delete   --service-name <n> --version-names <v1,v2> --env-id <id>
tcb cloudrun traffic          --service-name <n> --canary 10 --env-id <id>  # Set gray ratio
tcb cloudrun traffic promote  --service-name <n> --env-id <id>              # Complete gray release
tcb cloudrun traffic rollback --service-name <n> --env-id <id>              # Roll back canary
tcb cloudrun record list      --service-name <n> --env-id <id>              # BuildId / RunId
tcb cloudrun logs build       --service-name <n> [--build-id <id>] --env-id <id>
tcb cloudrun logs process     --run-id <id> --env-id <id>                   # no --service-name!
```

Key flags: `--force` (skip confirmation), `--traffic` (canary mode on deploy), `--port` (container port), `--image-url` (image deploy), `--source` (code directory), `-w` / `--watch` (local dev file watching), `--run-mode normal|agent` (local dev mode), `--target-path` (init/download destination), `--server-type function|container` (list filter), `--install-dependency true` (online install), `--wait` (block until the deployment finishes), `--stable` / `--canary` (traffic ratio, must total 100).

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Local run fails for container service | `tcb cloudrun run` is function-only | Use Docker to test container services locally |
| New version gets no traffic | Deployed with `--traffic` (canary mode) | Shift traffic explicitly with `tcb cloudrun traffic --canary <n>`, then `tcb cloudrun traffic promote` |
| Deploy prompt hangs in CI | Missing `--force` flag | Always use `--force` for non-interactive pipelines |
| Env var / secret not available in container | No `tcb secrets set` command exists; the value was never configured | Set it in the CloudBase console (or `tcbr` API / manager-node), then redeploy the service |
| Download missing config | Download only includes source code | Runtime config (env vars, secrets) not included |

---

## Self-Check

- [ ] `tcb` CLI installed, version >= 3.0.0
- [ ] Logged in (`tcb login`) and correct environment set (`tcb env use <envId>`)
- [ ] Service type determined: function-based or container-based
- [ ] For container: `--port` matches app's listening port; image built and pushed
- [ ] For canary: current stable version name noted before deploying
- [ ] For canary: traffic shifting plan ready (10% -> 50% -> 100%)
- [ ] Env vars / secrets configured in the console or via `tcbr` API (there is no `tcb secrets set`), never hardcoded in the image
- [ ] For CI/CD: `--force` flag added to skip confirmation
- [ ] Post-deploy: service endpoint tested and traffic distribution verified
