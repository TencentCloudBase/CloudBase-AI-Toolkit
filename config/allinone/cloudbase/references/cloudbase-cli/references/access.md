# Access — CloudBase CLI

Four modules for configuring external access to CloudBase environments:

| Module | Commands | Purpose |
|--------|----------|---------|
| **CORS / safe domains** | `tcb cors list/add/rm` — or `tcb env domain list/create/delete` | Security domains for cross-origin access |
| **Domains** | `tcb domains ls/add/edit/rm` + `tcb domains cache purge/task` | Bind/unbind custom domains with TLS, purge CDN cache |
| **Routes** | `tcb routes list/add/edit/delete` | Map request paths to backend services (**environment level only**) |
| **Platform pool** | the `--platform-id` flag on `env` / `domains` only | Target a platform resource pool instead of one environment |

> ⚠️ Routes require the domain to exist first — use the system default domain or bind one via `tcb domains add` before creating routes.

> ⚠️ `tcb cors` and `tcb env domain` are the **same capability** (both manage 环境安全域名) but split
> multiple values differently: `tcb cors add "a.com,b.com"` uses a **comma**, while
> `tcb env domain create "a.com/b.com"` uses a **slash**. Pick one pair and stay consistent.

> ⚠️ **Platform-pool mode: `tcb routes` does NOT support it.** Only `tcb env …` and `tcb domains …`
> accept `--platform-id <platformId>`.
>
> `tcb routes list --platform-id pf-xxx` fails with `error: unknown option '--platform-id'`. This is a
> **deliberate CLI contract** (pinned by a test in the CLI repo that asserts routes commands contain no
> `--platform-id`), not an oversight.
>
> Platform-level domains **and their routes** are managed through `tcb domains * --platform-id`, which
> covers the route APIs too — e.g. `tcb domains ls --platform-id pf-xxx`. `tcb routes` stays
> environment-scoped: `tcb routes delete <domain> -p <path>` even points you to `tcb domains rm` when
> you need domain-level operations.
>
> In platform mode pass `--platform-id` **instead of** `-e/--env-id` — the two are mutually exclusive
> (`-e <envId> 与 --platform-id <platformId> 不能同时使用`). Confirm with the user which one they mean.

---

## When to Use

- Configuring CORS security domains for cross-origin access
- Binding, editing, or unbinding custom domains (incl. TLS) to a CloudBase environment
- Purging the CDN cache of a bound domain
- Creating, editing, or deleting routing rules (path -> service mapping)
- Setting up a complete domain + routing + CORS workflow
- Doing the **domain** part against a platform resource pool (`tcb domains … --platform-id`) — for
  platform routes, use the same `tcb domains` commands, never `tcb routes`

## Do NOT use for

- Storage ACL permissions (use `references/storage.md`)
- Resource authorization policies / roles / users (use `references/permission.md`)
- Static file hosting deployment (use `references/hosting.md`)
- Web app deployment (use `references/app.md`)
- Environment API keys / login policy / env lifecycle (use `references/env.md`)

---

## Workflow 1: CORS Configuration

### Step 1 — List current security domains

```bash
tcb cors list -e <envId> --json
```

### Step 2 — Add domains

```bash
# Single domain
tcb cors add api.example.com -e <envId> --yes

# Multiple domains (comma-separated, no protocol prefix)
tcb cors add localhost:3000,dev.example.com,app.example.com -e <envId> --yes
```

> ⚠️ CORS domains do NOT auto-include subdomains — each subdomain must be added separately.

### Step 3 — Remove domains

```bash
tcb cors rm old.example.com -e <envId> --yes
```

### Step 4 — Verify

```bash
tcb cors list -e <envId> --json
```

**Parameters:** `<domain>` (no `https://` prefix, comma-separated for multiple), `-e/--env-id`, `--yes`, `--json`, `--dry-run`

> ⚠️ Use the kebab-case `--env-id`. `--envId` still resolves as a hidden deprecated alias but prints a
> deprecation warning on every call.

---

## Workflow 2: Custom Domain Binding

### Step 1 — Check existing domains

```bash
tcb domains ls -e <envId> --json
```

### Step 2 — Bind domain (SSL cert required)

```bash
# Direct connection (default)
tcb domains add api.example.com --certid <certId> -e <envId> --yes

# CDN-accelerated
tcb domains add cdn.example.com --certid <certId> --access-type CDN -e <envId> --yes

# Custom CNAME
tcb domains add custom.example.com --certid <certId> --access-type CUSTOM --custom-cname <cname> -e <envId> --yes
```

**Access types:** `DIRECT` (default, request goes straight to CloudBase), `CDN` (CDN-accelerated), `CUSTOM` (custom CNAME target)

### Step 3 — Configure DNS

After binding, set a CNAME record pointing your domain to the CloudBase endpoint returned in the response.

### Step 4 — Verify binding

```bash
tcb domains ls -e <envId> --filter "Domain=api.example.com" --json
```

### Step 5 — Unbind domain

> ⚠️ If the domain has routes bound, you MUST delete all routes first, then unbind the domain.

```bash
# Check for routes on this domain
tcb routes list -e <envId> --filter "Domain=api.example.com" --json

# Delete routes first (if any)
tcb routes delete api.example.com -e <envId> -p /api/users --yes

# Then unbind domain
tcb domains rm api.example.com -e <envId> --yes
```

**Parameters:** `<domain>`, `--certid` (required for add), `--access-type`, `--custom-cname`, `--disable`, `--filter`, `--offset/--limit`

---

## Workflow 3: Routing Rules

### Step 1 — List routes

```bash
tcb routes list -e <envId> --json
tcb routes list -e <envId> --filter "Domain=api.example.com" --json
```

### Step 2 — Create routes

```bash
# Single route
tcb routes add -e <envId> --data '{
  "domain": "api.example.com",
  "routes": [{
    "path": "/api/users",
    "upstreamResourceType": "CBR",
    "upstreamResourceName": "user-service"
  }]
}' --yes

# Multiple routes in one call
tcb routes add -e <envId> --data '{
  "domain": "api.example.com",
  "routes": [
    {"path": "/api/users", "upstreamResourceType": "CBR", "upstreamResourceName": "user-service"},
    {"path": "/api/orders", "upstreamResourceType": "CBR", "upstreamResourceName": "order-service"},
    {"path": "/api/fn", "upstreamResourceType": "SCF", "upstreamResourceName": "my-function"}
  ]
}' --yes
```

> ⚠️ If the path already exists under that domain, `routes add` will fail — use `routes edit` instead.

**`upstreamResourceType` values:** `CBR` (CloudBase Run), `SCF` (Cloud Function), `STATIC_STORE` (Static Hosting), `WEB_SCF` (Web Cloud Function), `LH` (Lighthouse)

### Step 3 — Edit routes (incremental update)

`routes edit` is an **incremental update** — only pass `domain`, `path` (to locate), and the fields you want to change:

```bash
# Enable auth on existing route
tcb routes edit -e <envId> --data '{
  "domain": "api.example.com",
  "routes": [{"path": "/api/users", "enableAuth": true}]
}' --yes

# Add QPS rate limiting
tcb routes edit -e <envId> --data '{
  "domain": "api.example.com",
  "routes": [{
    "path": "/api/users",
    "qpsPolicy": {"qpsTotal": 500, "qpsPerClient": {"limitBy": "ClientIP", "limitValue": 50}}
  }]
}' --yes
```

> ⚠️ No need to repeat `upstreamResourceType`/`upstreamResourceName` when editing — only changed fields required.

### Step 4 — Delete routes

```bash
tcb routes delete api.example.com -e <envId> -p /api/users --yes
```

> ⚠️ `-p <path>` is **required** for `routes delete` — omitting it will error.

### Route JSON fields

| Field | Required | Description |
|-------|:--------:|-------------|
| `domain` | ✅ | System default or custom-bound domain |
| `routes[].path` | ✅ | Route path (no wildcards) |
| `routes[].upstreamResourceType` | ✅ (add) | Backend service type |
| `routes[].upstreamResourceName` | ✅ (add) | Backend service name |
| `routes[].enable` | | Enable route (default: true) |
| `routes[].enableAuth` | | Enable auth (default: false) |
| `routes[].enableSafeDomain` | | Enable CORS domain check (default: true) |
| `routes[].pathRewrite.prefix` | | Path rewrite prefix |
| `routes[].qpsPolicy.qpsTotal` | | Total QPS limit (max 500) |

---

## Workflow 4: Edit a bound domain

```bash
# Inspect first
tcb domains ls -e <envId> --filter "Domain=api.example.com"

# Preview the change
tcb domains edit api.example.com -e <envId> --disable --dry-run

# Apply
tcb domains edit api.example.com -e <envId> --disable
tcb domains edit api.example.com -e <envId> --enable
tcb domains edit api.example.com -e <envId> --certid <newCertId> --access-type CDN
```

`domains edit` flags: `--certid`, `--access-type DIRECT|CDN|CUSTOM|EO`, `--custom-cname`
(pairs with `--access-type CUSTOM`), `--enable` / `--disable`, `--dry-run`, `--platform-id`.

> ⚠️ `--enable` and `--disable` are mutually exclusive final states, not toggles — pass exactly the one
> you mean.
>
> ⚠️ `--custom-cname` only makes sense with `--access-type CUSTOM`.

---

## Workflow 5: Purge CDN / EdgeOne cache

```bash
# Purge exact URLs (default granularity)
tcb domains cache purge https://api.example.com/a.js https://api.example.com/b.css -d api.example.com -e <envId>

# Purge a directory prefix (a target ending in "/" is auto-detected as prefix)
tcb domains cache purge https://api.example.com/assets/ -d api.example.com -e <envId>
tcb domains cache purge https://api.example.com/assets/ -d api.example.com -t prefix -e <envId>

# Purge an entire host
tcb domains cache purge https://api.example.com -d api.example.com -t host -e <envId>

# CI: block until the refresh finishes
tcb domains cache purge https://api.example.com/a.js -d api.example.com -w -e <envId>

# Check submitted tasks
tcb domains cache task -d api.example.com -e <envId>
tcb domains cache task <taskId> -d api.example.com -e <envId>
tcb domains cache task -d api.example.com -t prefix --limit 20 --offset 0 -e <envId>
```

| Flag | Meaning |
|------|---------|
| `-d, --domain <domain>` | The HTTP access-service domain (required) |
| `-t, --type <type>` | Granularity: `url` (exact, default) / `prefix` (directory) / `host` (whole domain) |
| `-c, --cache-type <cacheType>` | `cdn` / `eo` — auto-detected from how the domain is bound; normally omit |
| `-w, --wait` | (`purge` only) block until the refresh completes — use in CI |

> ⚠️ The purge targets are **positional**, the domain comes from `-d`. A target ending in `/` is
> automatically treated as `prefix`, so you usually do not need `-t`.

---

## Workflow 6: HTTP access services (`tcb service`) — ⚠️ NOT RECOMMENDED

> 🚫 **`tcb service` is not recommended for use.** Treat `tcb routes` + `tcb domains` as the supported
> path for HTTP access and do not propose `tcb service` for new work.
>
> | Situation | What to do |
> |-----------|-----------|
> | New task: bind a path / configure HTTP access | Use `tcb routes` (env-level) or `tcb domains` (domain + platform-level) |
> | User asks "how do I do X" and X touches HTTP access | Answer with `tcb routes` / `tcb domains` |
> | User already has a working `tcb service` script | It still runs — say it is not the recommended path and offer the `routes` equivalent if they want to move |
> | User asks point-blank whether `tcb service` is usable / removed | It is still registered and functional, but **not recommended** |
>
> ⚠️ **Do not call it "removed" or "deleted", and do not claim a `[已废弃]` marker exists — neither is
> true.** The code carries no deprecation marker, the module still has a dedicated e2e suite in the
> release pipeline, and `tcb service --help` still works. The "not recommended" status is a **product-level
> decision that is NOT encoded in the CLI source**, so it will not show up in any code or `--help` audit.
> Do not use "no code marker" as evidence that a command is still endorsed.

`tcb service` manages **HTTP 访问服务** — path→function bindings plus service-level on/off and auth
switches. (The module directory in the CLI source is `gateway`, but the command name is `service`; there
is no `tcb gateway` command.)

Reference information only — the commands below work, but prefer the `routes` / `domains` equivalents:

| | `tcb service` (not recommended) | `tcb routes` / `tcb domains` (supported) |
|---|---|---|
| Backend | legacy API-gateway layer (path → function / CloudRun) | `*HTTPServiceRoute*` API |
| Upstreams | cloud function / CloudRun | cloud function, CloudRun, static hosting, … |
| Extras | service on/off switch, auth switch | path rewrite, auth, safe-domain check, QPS policy, platform mode via `tcb domains --platform-id` |

```bash
# Inspect
tcb service list --env-id <envId>
tcb service list -d api.example.com -e <envId>          # filter by domain
tcb service list -p api -e <envId>                      # filter by service path
tcb service list --service-id <id> -e <envId>

# Create: bind a path to a cloud function
tcb service create -p api -f my-function -e <envId>

# Delete: by path, by service id, or by function name
tcb service delete -p api -e <envId>
tcb service delete --service-id <id> -e <envId>
tcb service delete --name my-function -e <envId>        # all services of that function

# Toggle the HTTP access service itself
tcb service switch -e <envId>

# Toggle HTTP access **authentication**
tcb service auth switch -e <envId>

# Custom domains attached to HTTP access services
tcb service domain list -e <envId>
tcb service domain list -d api.example.com -e <envId>
tcb service domain unbind <domain> -e <envId>
```

| Command | Flags |
|---------|-------|
| `service list` | `-d/--domain`, `-p/--service-path`, `--service-id` |
| `service create` | `-p/--service-path <path>`, `-f/--function <functionName>` |
| `service delete` | `-p/--service-path`, `-i/--service-id`, `-n/--name <functionName>` |
| `service switch` / `service auth switch` | interactive on/off toggle |
| `service domain list` | `-d/--domain` |
| `service domain unbind <domain>` | — |

> ⚠️ **`tcb service domain bind` does not exist.** The command is declared in the CLI source but has no
> `@ICommand()` decorator (`// 暂时无法支持`), so it never registers. To attach a custom domain, use
> `tcb domains add <domain> --certid <certId>` instead.

> ⚠️ `tcb service` is **not listed in `tcb --help`** (that list is hand-maintained). It is registered and
> functional — but not recommended, see the box at the top of this workflow.
>
> ⚠️ If you do touch it: `service switch` / `service auth switch` change the on/off state of a live access
> path or its authentication. Toggling auth off can expose an endpoint publicly — confirm with the user first.

### Migrating off `tcb service`

| What you want | `tcb service` (avoid) | Preferred equivalent |
|---------------|----------------------|----------------------|
| Bind a path to a cloud function | `service create -p <path> -f <fn>` | `routes add --data '{"domain":"<d>","routes":[{"path":"/<p>","upstreamResourceType":"SCF","upstreamResourceName":"<fn>"}]}'` |
| List bindings | `service list` | `routes list` |
| Remove a binding | `service delete -p <path>` | `routes delete <domain> -p <path>` |
| Manage the attached domain | `service domain list/unbind` | `domains ls` / `domains rm` |
| Toggle authentication | `service auth switch` | route-level `enableAuth` in the `routes add/edit --data` payload |
| Toggle the gateway itself | `service switch` | no direct equivalent — confirm with the user |

> ⚠️ Use the route JSON fields documented in *Workflow 3* (`domain`, `routes[].path`,
> `upstreamResourceType`, `upstreamResourceName`, `enableAuth`, …). Do not guess field names.

---

## Complete Scenario: Domain + Routes + CORS

```bash
ENV_ID="env-xxx"
DOMAIN="api.example.com"
CERT_ID="cert-abc123"

# 1. Add CORS for frontend
tcb cors add app.example.com -e $ENV_ID --yes

# 2. Bind custom domain
tcb domains add $DOMAIN --certid $CERT_ID -e $ENV_ID --yes

# 3. Configure DNS CNAME (manual step)

# 4. Create routes
tcb routes add -e $ENV_ID --data "{
  \"domain\": \"$DOMAIN\",
  \"routes\": [
    {\"path\": \"/api/users\", \"upstreamResourceType\": \"CBR\", \"upstreamResourceName\": \"user-service\"},
    {\"path\": \"/api/fn\", \"upstreamResourceType\": \"SCF\", \"upstreamResourceName\": \"my-function\"}
  ]
}" --yes

# 5. Verify everything
tcb cors list -e $ENV_ID --json
tcb domains ls -e $ENV_ID --filter "Domain=$DOMAIN" --json
tcb routes list -e $ENV_ID --filter "Domain=$DOMAIN" --json
```

### Teardown (reverse order)

```bash
# Delete routes first
tcb routes delete $DOMAIN -e $ENV_ID -p /api/users --yes
tcb routes delete $DOMAIN -e $ENV_ID -p /api/fn --yes

# Unbind domain
tcb domains rm $DOMAIN -e $ENV_ID --yes

# Remove CORS entry
tcb cors rm app.example.com -e $ENV_ID --yes
```

---

## Command Quick Reference

```bash
# CORS / safe domains
tcb cors list -e <envId> [--json]
tcb cors add <domain> -e <envId> --yes          # comma-separated for multiple
tcb cors rm <domain> -e <envId> --yes [--dry-run]
# same capability, slash-separated instead of comma
tcb env domain list -e <envId>
tcb env domain create "a.com/b.com" -e <envId>
tcb env domain delete -e <envId>

# Domains
tcb domains ls -e <envId> [--json] [--filter "Domain=xxx"] [--limit N] [--offset N]
tcb domains add <domain> --certid <certId> -e <envId> --yes [--access-type CDN] [--disable]
tcb domains edit <domain> -e <envId> [--certid <id>] [--access-type CDN] [--enable|--disable] [--dry-run]
tcb domains rm <domain> -e <envId> --yes [--dry-run]
# CDN / EdgeOne cache
tcb domains cache purge <targets...> -d <domain> [-t url|prefix|host] [-w]
tcb domains cache task [taskId] -d <domain> [-t <type>] [--limit N] [--offset N]

# Routes
tcb routes list -e <envId> [--json] [--filter "Domain=xxx"] [--limit N] [--offset N]
tcb routes add -e <envId> --data '<json>' --yes
tcb routes edit -e <envId> --data '<json>' --yes       # incremental update
tcb routes delete <domain> -e <envId> -p <path> --yes [--dry-run]

# HTTP access services — ⚠️ NOT RECOMMENDED, prefer routes/domains (hidden family — no `tcb gateway`)
tcb service list [-d <domain>] [-p <path>] [--service-id <id>]
tcb service create -p <path> -f <functionName>
tcb service delete [-p <path>] [--service-id <id>] [--name <functionName>]
tcb service switch                             # toggle the access service (interactive)
tcb service auth switch                        # toggle access authentication
tcb service domain list [-d <domain>]
tcb service domain unbind <domain>             # NOTE: `service domain bind` does not exist

# Platform resource pool (instead of -e)
#   add --platform-id <platformId> to: env <cmd>, domains ls|add|edit|rm
#   NOT to routes <cmd> — routes is environment-only by contract
```

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `域名 xxx 不存在` | Route references unbound domain | Use system default domain, or `domains add` first |
| `域名下有路由绑定` | Trying to unbind domain with routes | Delete all routes on that domain first |
| `路径 xxx 已存在` | Duplicate path on `routes add` | Use `routes edit` to modify existing route |
| `请提供 -p 参数` | `routes delete` missing path | Add `-p <path>` parameter |
| `域名 xxx 已存在` | Duplicate CORS/domain add | Skip, or remove then re-add |
| `证书 xxx 不存在` | Invalid cert ID | Get correct ID from Tencent Cloud SSL console |
| `域名未备案` | Domain lacks ICP filing | Complete ICP filing first |
| `error: unknown option '--platform-id'` | `tcb routes` does not support platform mode (by contract) | Use `tcb domains * --platform-id` — it manages platform domains **and** their routes |
| User asks whether `tcb service` is still OK | It runs, but it is **not recommended** | Answer "not recommended", and give the `tcb routes` / `tcb domains` equivalent — do not say it is removed |
| `-e <envId> 与 --platform-id <platformId> 不能同时使用` | Both target flags supplied | Pass exactly one — `-e` for environment mode, `--platform-id` for pool mode |
| `PlatformId 不存在或无权访问` | Wrong platform pool id, or no access to it | Verify the pool id and the account's access with the user |
| `缺少环境 ID 或平台版资源池 ID` | Neither `-e` nor `--platform-id` supplied | Pass one of them explicitly |

---

## Self-Check

- [ ] `tcb` >= 3.0.0 and logged in with correct environment
- [ ] CORS: domain format has no protocol prefix (`api.example.com`, not `https://api.example.com`)
- [ ] Domains: SSL certificate ID is ready (`--certid`)
- [ ] Domains: domain has ICP filing completed
- [ ] Routes: target domain exists (system default or custom-bound)
- [ ] Routes: using `routes add` for new paths, `routes edit` for existing paths
- [ ] Routes: `--data` JSON is valid and includes `domain` + `routes[].path`
- [ ] Unbind sequence: delete routes first, then unbind domain
- [ ] For platform pools: used `tcb domains *  --platform-id` (never `tcb routes`), and passed exactly one of `-e` / `--platform-id`
- [ ] Added `--yes` for CI; `--json` for programmatic parsing
