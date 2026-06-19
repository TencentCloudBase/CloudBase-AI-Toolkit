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
tcb cloudrun init --service-name <serviceName> --template <templateName> --target <path>
```

### Step 2: Deploy

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

# Filter by name or type
tcb cloudrun list --service-name <serviceName> --env-id <envId>
tcb cloudrun list --service-type container --env-id <envId>
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

# Deploy
tcb app deploy \
  --service-name api \
  --image ccr.ccs.tencentyun.com/my-repo/api:v1.0.0 \
  --env-id <envId> \
  --remark "v1.0.0 initial"
```

> ⚠️ Use `--remark` for meaningful version tracking (e.g. `"v1.2.3 feat: add auth"`). Avoid vague remarks like `"update"`.

---

## Workflow 2: Traffic Shifting (Canary)

Traffic shifting enables canary releases, blue/green deployments, and instant rollbacks.

### View current traffic

```bash
tcb cloudrun traffic get --service-name <serviceName> --env-id <envId>
```

### Canary release (recommended pattern)

```bash
# 1. Deploy new version at 0% traffic
tcb app deploy \
  --service-name my-service \
  --image ccr.ccs.tencentyun.com/my-repo/app:v2.0.0 \
  --env-id <envId> \
  --remark "v2.0.0 canary"

# 2. Get new version name
tcb app versions list my-service --env-id <envId>

# 3. Shift 10% -> monitor ~15 min
tcb cloudrun traffic set \
  --service-name my-service --env-id <envId> \
  --version-weights <newVersion>=10,<stableVersion>=90

# 4. Shift 50% -> monitor
tcb cloudrun traffic set \
  --service-name my-service --env-id <envId> \
  --version-weights <newVersion>=50,<stableVersion>=50

# 5. Full rollout
tcb cloudrun traffic set \
  --service-name my-service --env-id <envId> \
  --version-weights <newVersion>=100
```

> ⚠️ Always note the current stable version name BEFORE starting a rollout. Run `tcb app versions list` first.

> ⚠️ `traffic promote` sets canary to 100% and removes the stable version — this is irreversible. `traffic rollback` does the opposite.

### Instant rollback

```bash
tcb cloudrun traffic set \
  --service-name my-service --env-id <envId> \
  --version-weights <stableVersion>=100
```

### Monitoring after traffic shift

```bash
tcb logs search --service my-service --level error --env-id <envId>
tcb logs search --service my-service --limit 50 --env-id <envId>
tcb app info my-service --env-id <envId>
```

Rollback triggers: error rate > 1%, P99 latency > 2x baseline, any crash/OOM in logs.

### Multi-environment Promotion (dev -> staging -> prod)

```bash
IMAGE=ccr.ccs.tencentyun.com/my-repo/my-service:v1.2.0

tcb app deploy --service-name svc --image $IMAGE --env-id dev-env-xxx
# test in dev...
tcb app deploy --service-name svc --image $IMAGE --env-id staging-env-xxx
# sign-off...
tcb app deploy --service-name svc --image $IMAGE --env-id prod-env-xxx --dry-run
tcb app deploy --service-name svc --image $IMAGE --env-id prod-env-xxx \
  --remark "v1.2.0 promoted from staging"
```

---

## Workflow 3: Local Development

```bash
# Run function-based service locally
tcb cloudrun run --env-id <envId>

# With hot reload
tcb cloudrun run --hot-reload true --env-id <envId>

# On specific port
tcb cloudrun run --port 3000 --env-id <envId>

# Agent mode (for AI agent debugging)
tcb cloudrun run --mode agent --agent-id <agentId> --env-id <envId>

# Dry run (validate without starting)
tcb cloudrun run --dry-run true --env-id <envId>
```

> ⚠️ `tcb cloudrun run` only supports function-based services. Container-based services must be tested via Docker locally.

### Function-based vs Container-based

| Capability | Function-based | Container-based |
|-----------|---------------|----------------|
| `tcb cloudrun run` (local) | Supported | Not supported |
| Custom Dockerfile | No | Yes |
| Port configuration | Auto-detected | Must specify `--port` |
| Hot reload | `--hot-reload true` | Not supported |
| Agent mode | Supported | Not supported |

---

## Workflow 4: Download and Delete

```bash
# Download latest deployed code
tcb cloudrun download --service-name <serviceName> --target <path> --env-id <envId>

# Force overwrite existing directory
tcb cloudrun download --service-name <serviceName> --force --env-id <envId>

# Delete a service (interactive confirmation)
tcb cloudrun delete --service-name <serviceName> --env-id <envId>

# Force delete (CI/CD)
tcb cloudrun delete --service-name <serviceName> --force --env-id <envId>
```

> ⚠️ Deletion removes all versions and traffic configuration. There is no undo or `--dry-run` for CloudRun delete.

> ⚠️ `tcb cloudrun download` downloads the latest deployed code only, not a specific version. Does not include runtime config (env vars, secrets).

---

## Secrets Injection

```bash
# Set secrets (injected as env vars at container startup)
tcb secrets set DATABASE_URL "mysql://..." --env-id <envId>
tcb secrets set API_SECRET "..." --env-id <envId>

# List configured secrets
tcb secrets list --env-id <envId>
```

> ⚠️ Secrets are shared across ALL services in the environment, not per-service.

> ⚠️ Changing a secret does NOT auto-restart running services — you must redeploy.

---

## Command Quick Reference

```bash
tcb cloudrun init      --service-name <n> --template <t>    # Init project
tcb cloudrun deploy    --service-name <n> --env-id <id>     # Deploy service
tcb cloudrun list      --env-id <id>                        # List services
tcb cloudrun download  --service-name <n> --env-id <id>     # Download code
tcb cloudrun delete    --service-name <n> --env-id <id>     # Delete service
tcb cloudrun run       --env-id <id>                        # Local run (function only)
tcb cloudrun traffic get  --service-name <n> --env-id <id>  # View traffic
tcb cloudrun traffic set  --service-name <n> --env-id <id> --version-weights ...  # Set traffic
```

Key flags: `--force` (skip confirmation), `--traffic` (canary mode on deploy), `--port` (container port), `--hot-reload true` (local dev), `--install-dependency true` (online install), `--remark` (version label), `--dry-run` (preview deploy).

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| Local run fails for container service | `tcb cloudrun run` is function-only | Use Docker to test container services locally |
| New version gets no traffic | Deployed with `--traffic` (canary mode) | Explicitly shift traffic with `tcb cloudrun traffic set` |
| Deploy prompt hangs in CI | Missing `--force` flag | Always use `--force` for non-interactive pipelines |
| Secret not available in container | Secret set after deploy | Redeploy the service after changing secrets |
| Download missing config | Download only includes source code | Runtime config (env vars, secrets) not included |

---

## Self-Check

- [ ] `tcb` CLI installed, version >= 3.0.0
- [ ] Logged in (`tcb login`) and correct environment set (`tcb env use <envId>`)
- [ ] Service type determined: function-based or container-based
- [ ] For container: `--port` matches app's listening port; image built and pushed
- [ ] For canary: current stable version name noted before deploying
- [ ] For canary: traffic shifting plan ready (10% -> 50% -> 100%)
- [ ] Secrets stored via `tcb secrets set`, not hardcoded
- [ ] For CI/CD: `--force` flag added to skip confirmation
- [ ] Post-deploy: service endpoint tested and traffic distribution verified
