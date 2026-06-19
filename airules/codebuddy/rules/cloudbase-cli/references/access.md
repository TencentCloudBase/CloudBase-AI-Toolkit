# Access — CloudBase CLI

Three independent modules for configuring external access to CloudBase environments:

| Module | Commands | Purpose |
|--------|----------|---------|
| **CORS** | `tcb cors list/add/rm` | Security domains for cross-origin access |
| **Domains** | `tcb domains ls/add/rm` | Bind/unbind custom domains with TLS |
| **Routes** | `tcb routes list/add/edit/delete` | Map request paths to backend services |

> ⚠️ Routes require the domain to exist first — use the system default domain or bind one via `tcb domains add` before creating routes.

---

## When to Use

- Configuring CORS security domains for cross-origin access
- Binding or unbinding custom domains to a CloudBase environment
- Creating, editing, or deleting routing rules (path -> service mapping)
- Setting up a complete domain + routing + CORS workflow

## Do NOT use for

- Storage ACL permissions (use `tcb-storage`)
- Role-based access control / user permissions (use `tcb-permission`)
- Static file hosting deployment (use `tcb-hosting`)
- Web app deployment (use `tcb-app`)

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

**Parameters:** `<domain>` (no `https://` prefix, comma-separated for multiple), `-e/--envId`, `--yes`, `--json`, `--dry-run`

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
# CORS
tcb cors list -e <envId> [--json]
tcb cors add <domain> -e <envId> --yes          # comma-separated for multiple
tcb cors rm <domain> -e <envId> --yes

# Domains
tcb domains ls -e <envId> [--json] [--filter "Domain=xxx"]
tcb domains add <domain> --certid <certId> -e <envId> --yes [--access-type CDN]
tcb domains rm <domain> -e <envId> --yes

# Routes
tcb routes list -e <envId> [--json] [--filter "Domain=xxx"]
tcb routes add -e <envId> --data '<json>' --yes
tcb routes edit -e <envId> --data '<json>' --yes       # incremental update
tcb routes delete <domain> -e <envId> -p <path> --yes
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
- [ ] Added `--yes` for CI; `--json` for programmatic parsing
