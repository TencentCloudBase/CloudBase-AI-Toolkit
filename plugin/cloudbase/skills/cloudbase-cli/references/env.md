# Environment — CloudBase CLI

Full lifecycle for CloudBase environments (环境): create, inspect, change package, renew, destroy —
plus the per-environment sub-resources the CLI exposes under `tcb env`.

> The login → `tcb env use` → confirm envId basics live in `core.md`. That is the flow you run
> **before every task**. This reference is for everything that **changes** an environment.

## When to Use

- Creating a new environment (including PG-mode and platform-pool environments)
- Changing an environment's package (套餐变更) or renewing it
- Inspecting environment detail / resource configuration / usage
- Managing environment API Keys (`tcb env apikey`)
- Configuring login methods and MFA (`tcb env login`)
- Managing environment safe domains (`tcb env domain`) — this is the **same capability** as `tcb cors`

## Do NOT use for

- Picking / switching the working environment → `core.md`
- Resource-level operations inside an env (functions, storage, database) → their own references
- Custom domain binding, routing rules, CDN cache → `access.md`
- Migrating data out of a database → `mysql.md` / `nosql.md`

---

## `--platform-id`: environment vs platform pool

Several `tcb env` subcommands switch behaviour when `--platform-id <platformId>` is passed:
they then target the **platform resource pool** instead of a single environment.

| Command | Without `--platform-id` | With `--platform-id` |
|---------|------------------------|----------------------|
| `env create` | Create an environment (needs `--package` etc.) | Create an environment under the pool — **mutually exclusive** with `--package/--region/--duration/--auto-renew/--postgresql` |
| `env modify` | Change the environment package | Change **platform environment status** (`--status` / `--storage-status` / `--flexdb-status`) — mutually exclusive with `--package` |
| `env delete` | Destroy the environment | Destroy a platform-pool environment (the pool and its other environments are untouched) |
| `env usage` | Environment usage details | Pool usage by resource type, incl. credit consumption |

> ⚠️ Never mix the two modes: passing `--platform-id` together with `--package` is rejected.

---

## Workflow 1: Inspect

```bash
tcb env list --env-id <envId>            # env list supports pagination
tcb env list --limit 20 --offset 0
tcb env detail --env-id <envId>          # resource configuration detail
tcb env detail --env-id <envId> --json

# Resource metric usage (module-filtered)
tcb env info --env-id <envId>
tcb env info --env-id <envId> --type FLEXDB,SCF,COS
tcb env info --env-id <envId> --type SCF --start 2026-10-01 --end 2026-10-16
```

`env info --type` modules: `FLEXDB` (文档型数据库), `TDSQL` (MySQL), `SCF` (云函数), `EKS` (云托管),
`COS` (云存储), `AI`, `HOSTING` (静态托管), `Auth` (身份认证), `APIInvocation`, `HTTPInvocation`,
`VM` (云主机), `Workflow`, `Other`.

> ⚠️ `tcb env list` may return incomplete results under sub-account permissions. Prefer asking the
> user for the envId instead of auto-discovering it (see `core.md`).

### Usage / billing

```bash
# Environment mode — resource usage / billing summary
tcb env usage --env-id <envId>

# Platform pool mode — usage by resource type, with resource-point consumption
tcb env usage --platform-id <platformId> \
  --start-date 2026-10-01 --end-date 2026-10-16 \
  --resource-types Database,Function,Storage --need-details
```

`env usage` flags: `-e/--env-id`, `--platform-id`, `--start-date <YYYY-MM-DD>`, `--end-date <YYYY-MM-DD>`,
`--resource-types <types>`, `--need-details`. The last four are **platform-mode only**.

`--resource-types` values: `Database | Function | Storage | HOSTING | Log | Gateway | Cloudrun | Token | EO` (comma-separated, default = all).

> ⚠️ `--type <modules>` is **NOT** a flag of `env usage` — it belongs to `tcb env info` (per-module metric
> detail, using module ids like `FLEXDB,SCF,COS`). Passing `--type` to `env usage` fails as an unknown option.
> The two commands answer different questions: `env info` = resource metrics per module, `env usage` = billing / consumption.

---

## Workflow 2: Create

```bash
# Interactive: omit --package to pick from the printed package list
tcb env create

# Non-interactive / CI
tcb env create --alias staging --package baas_pf_standard --region ap-shanghai --yes
```

`--package` values: `baas_personal` (个人版) | `baas_pf_standard` (标准版) | `baas_pf_enterprise` (企业版)

Other flags:

| Flag | Meaning |
|------|---------|
| `--alias <alias>` | Environment alias |
| `-r, --region <region>` | Region, default `ap-shanghai` |
| `--duration <duration>` | Purchase duration in months: `1-12`, `24` (default `1`) |
| `--auto-renew` | Enable auto-renewal (default off) |
| `--postgresql` | Create the environment in **PG (PostgreSQL) mode** |
| `--platform-id <platformId>` | Create under a platform resource pool |

### PG mode

```bash
tcb env create --alias pg-demo --package baas_personal --postgresql --yes
```

> ⚠️ PG mode is a different data plane, not "one more database". Auth, storage, permissions and
> migrations all change (RLS, `pgstore`, `cloudbase/migrations/`). After creating a PG environment,
> switch to the `postgresql-development-cloudbase` skill — do not drive a PG environment through the
> NoSQL / MySQL references in this skill. See also `../postgresql-development-cloudbase/SKILL.md`.

### Shared COS bucket (cloud storage only)

```bash
tcb env create --alias tenant-a --package baas_personal --yes \
  --external-storage-bucket my-bucket-1250000000 \
  --external-storage-region ap-shanghai \
  --external-storage-base-path tenant-a
```

All three `--external-storage-*` flags must be passed together. They apply to **cloud storage only** —
the static hosting bucket is chosen by the platform and has no CLI flag. Use them only when the user
provides the bucket.

---

## Workflow 3: Change package / renew

```bash
# Change the environment package (套餐变更)
tcb env modify --package baas_pf_enterprise --env-id <envId>

# Renew
tcb env renew --duration 12 --env-id <envId>

# Platform-pool mode: enable/disable the environment and its services
tcb env modify --platform-id <platformId> \
  --status ENABLE --storage-status READONLY --flexdb-status ENABLE
```

`--status`: `ENABLE` | `DISABLE`
`--storage-status` / `--flexdb-status`: `ENABLE` (正常) | `DISABLE` (彻底禁用) | `READONLY` (只读)

> ⚠️ `--storage-status DISABLE` is "彻底禁用", not "read-only" — for a soft stop use `READONLY`.

---

## Workflow 4: Destroy

```bash
# 1. Preview first (ALWAYS)
tcb env delete --env-id <envId> --dry-run

# 2. Show the preview to the user, wait for explicit confirmation

# 3. Destroy
tcb env delete --env-id <envId> --yes

# Platform pool
tcb env delete --platform-id <platformId>
```

> ⚠️ Destroying an environment removes its resources. There is no undo. The `--dry-run` preview is
> mandatory — show it and wait for the user to say yes.

> ⚠️ `tcb env rename <newAlias> --env-id <envId>` only changes the alias, not the envId.

---

## Workflow 5: Environment API Keys (`tcb env apikey`)

```bash
tcb env apikey list --env-id <envId>
tcb env apikey list --env-id <envId> --type publish_key --limit 10 --offset 0

tcb env apikey create my-key --env-id <envId> --type api_key --expire 0
tcb env apikey delete <keyId> --env-id <envId>
tcb env apikey delete --key-id <keyId> --env-id <envId>   # use this form for ids starting with "-"
```

| Flag | Meaning |
|------|---------|
| `--type <type>` | `api_key` (default) or `publish_key` |
| `--expire <expire>` | Validity in **seconds**, minimum `7200`; `0` / omitted = never expires |
| `--limit` / `--offset` | Pagination for `list` (defaults 10 / 0) |
| `--key-id <keyId>` | Alternative to the positional arg for `delete` |

> ⚠️ An environment API Key grants **env-scoped privileges**. Never commit it, never paste it into a
> screenshot, never hardcode it. Prefer environment variables. See `core.md` for using it to log in
> (`tcb login --cloudbase-api-key <key> -e <envId>`).

---

## Workflow 6: Login methods & MFA (`tcb env login`)

```bash
tcb env login list --env-id <envId>
tcb env login get --env-id <envId>              # current login policy config
tcb env login create --env-id <envId>
tcb env login update --env-id <envId>

# Configure the login policy (partial-friendly: only pass what you change)
tcb env login set --env-id <envId> \
  --phone-number-login true \
  --email-login true \
  --anonymous-login false \
  --mfa-on TRUE --mfa-sms TRUE
```

`env login set` flags:

| Flag | Meaning |
|------|---------|
| `--phone-number-login <v>` | SMS phone login on/off (`true`/`false`) |
| `--email-login <v>` | Email login on/off |
| `--username-login <v>` | Username+password login on/off |
| `--anonymous-login <v>` | Anonymous login on/off |
| `--sms-type <type>` | SMS channel type (e.g. `default`) |
| `--sms-name <name>` / `--sms-method <method>` | Custom APIs SMS data source / method |
| `--sms-day-limit <n>` | Daily send cap (`-1` = unlimited) |
| `--mfa-on` / `--mfa-sms` / `--mfa-email` | MFA switches (`TRUE`/`FALSE`) |
| `--mfa-required-bind-phone <v>` | Force binding a phone number (`TRUE`/`FALSE`) |
| `--first-login-update <v>` | Force password change on first login (`true`/`false`) |
| `--period-update <v>` / `--period-value <v>` / `--period-type <v>` | Periodic password rotation |

> ⚠️ Note the inconsistent casing the CLI accepts: login switches are `true`/`false`, MFA switches are
> `TRUE`/`FALSE`. Do not assume one form works for the other.

> ⚠️ Turning on `--anonymous-login` opens the environment to unauthenticated access. Confirm with the
> user before enabling it, and make sure the `tcb policy` authorization policy (see `permission.md`)
> is reviewed at the same time.

---

## Workflow 7: Environment safe domains (`tcb env domain`)

```bash
tcb env domain list --env-id <envId>
tcb env domain create "example.com/example.cn" --env-id <envId>   # multiple split by SLASH
tcb env domain delete --env-id <envId>
```

> ⚠️ **`tcb env domain` and `tcb cors` are the same capability** (both call `getEnvAuthDomains` /
> `createEnvDomain` / `deleteEnvDomain`) — but they split multiple domains differently:
> - `tcb cors add "a.com,b.com"` → **comma**
> - `tcb env domain create "a.com/b.com"` → **slash**
>
> Pick one pair and stay consistent; do not mix the separator. For CORS flows and local-dev
> whitelisting, `access.md` uses `tcb cors`.

---

## Command Quick Reference

```bash
tcb env list [--limit N] [--offset N]        # List environments
tcb env detail --env-id <id>                 # Resource configuration detail
tcb env info --env-id <id> [--type M1,M2]    # Resource metric usage
tcb env usage --env-id <id>                  # Usage / billing
tcb env use <envId> | --unset                # Set / clear the global default env
tcb env create [...]                         # Create (--package/--region/--postgresql/...)
tcb env modify --package <pkg>               # Change package (or platform status)
tcb env renew --duration <months>            # Renew
tcb env rename <alias> --env-id <id>         # Change alias
tcb env delete --env-id <id> [--dry-run]     # Destroy
tcb env apikey list|create|delete            # Environment API Keys
tcb env login list|get|create|update|set     # Login methods / MFA
tcb env domain list|create|delete            # Safe domains (same as tcb cors)
```

**Global flags:** `-e/--env-id <envId>`, `--platform-id <platformId>`, `--json`, `--yes`, `--dry-run` (delete).

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "环境不存在" / env not found | Wrong envId, or wrong site (国内站 vs 国际站) | Confirm envId with the user; check `tcb login --intl` site |
| `--package` rejected on `env create` | Passed together with `--platform-id` | They are mutually exclusive — pick one mode |
| Package change not applied | Used `env create` flags on `env modify` | `env modify` takes `--package`, not the create-only flags |
| `env usage` returns nothing | Sub-account lacks billing permission, or wrong date range | Use platform mode dates, or ask the user |
| API Key immediately invalid | `--expire` below 7200 s | Minimum validity is `7200` seconds; use `0` for no expiry |
| Safe domain add silently partial | Mixed separators (`,` vs `/`) | `tcb cors` splits on `,`; `tcb env domain` splits on `/` |

---

## Self-Check

- [ ] Confirmed the target envId with the user (never auto-picked)?
- [ ] Checked whether the task is environment mode or `--platform-id` pool mode?
- [ ] For `env delete`: ran `--dry-run` and showed the preview before executing?
- [ ] For PG environments: handed over to the `postgresql-development-cloudbase` skill?
- [ ] For API Keys: never echoed the key into logs / commits?
- [ ] For login-policy changes: used the right casing (`true`/`false` vs `TRUE`/`FALSE`)?
- [ ] For safe domains: used one separator style consistently?
