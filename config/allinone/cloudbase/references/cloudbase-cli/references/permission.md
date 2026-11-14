# Permission — CloudBase CLI

CloudBase access control has **four independent layers** — know which one to use before running any command.
Resource authorization itself is split in two, and conflating them is the most common mistake:

| Layer | Command | Controls |
|-------|---------|----------|
| **Resource Authorization — OPA Rego** | `tcb policy get` / `tcb policy set` | `authz.user.rego` + `authz.platform.extension.rego` — the layers the OPA engine actually evaluates |
| **Resource Authorization — legacy gateway entries** | `tcb policy list` | Old `authpolicy` per-resource entries; **only meaningful while the environment still runs the `authpolicy` engine** |
| **Resource Permission (legacy)** | `tcb permission get/set` — ⚠️ **offline** | Prints a migration notice and performs nothing. Do not use. |
| **Role** | `tcb role ...` | Policy bundles + member assignments (identity dimension) |
| **User** | `tcb user ...` | Account attributes only (name, email, status) — NOT role binding |

> ⚠️ **`tcb policy list` returning an empty list does NOT mean "this environment has no authorization policy".**
> On PG (PostgreSQL) environments, and on environments whose `authz_engine` is `opa`, the SDK short-circuits
> and never sends the request: it returns an empty list **plus `SkippedReason`** (`postgresql_env` /
> `opa_authz_engine`). The effective policy lives in the Rego layers — read it with `tcb policy get` /
> `tcb policy get --extension`. Reading the empty list as "no policy" is exactly how a real OPA `deny` gets
> misdiagnosed as "the route isn't opened".

> ⚠️ **`tcb permission get/set` has been taken offline.** These commands now only print
> "请迁移至新命令…" and execute no operation — they are not deprecated aliases, they do nothing.
> Any task that used to be done with `tcb permission` must go through `tcb policy`.

> ⚠️ Saving a Rego policy with `tcb policy set` **immediately disables legacy gateway authorization** —
> after that, the role/gateway policies no longer decide access. Role policies and the Rego policy are
> **two parallel systems with NO automatic sync**: audit both separately.

---

## When to Use

- Managing resource-level authorization (now: environment OPA Rego policy via `tcb policy`)
- Creating, updating, or deleting roles with policies and user assignments
- Managing user accounts (create, update status, delete)
- Auditing authorization state across policies and roles

## Do NOT use for

- Storage ACL rules (use `tcb-storage` `rules get/update`)
- CORS / domain / routing access (use `tcb-access`)
- CloudBase console access control (CLI-managed permissions only)

---

## Workflow 1: Manage Resource Authorization (`tcb policy`)

### Step 0 — Which command answers the question

| Environment engine | What decides access | Read it with | What `policy list` shows there |
|---|---|---|---|
| `authpolicy` (legacy gateway) | gateway entries, per resource × role | `policy list` | the real entry table |
| `opa` | `authz.user.rego` (custom) + `authz.platform.extension.rego` (platform-injected, read-only) | `policy get` / `get --extension` | an OPA guide, **never entries** |
| PostgreSQL (any engine) | the same Rego layers (PG is always treated as `opa`) | `policy get` / `get --extension` | a PG guide, **never entries** |

Writing `authz.user.rego` on an `authpolicy` environment **flips the engine to `opa` for good** — the legacy
entries stop deciding access and do not come back. There is **no `policy reset`** in the CLI today: to drop a
custom policy you overwrite it with `policy set`, or call the SDK's `clearEnvAuthzConfig` (clearing the key does
not roll the engine back either).

### Step 1 — `tcb policy list` (legacy gateway entries only)

```bash
tcb policy list --env-id <envId>
tcb policy list --resource-type policy --env-id <envId>
tcb policy list --json --env-id <envId>
```

| Situation | Output |
|---|---|
| PG environment | `当前为 PG（PostgreSQL）环境，无旧网关鉴权策略` + guide to `policy get` / `policy set` |
| `authz_engine=opa` | `当前环境已启用 OPA 鉴权引擎，旧网关鉴权策略不再生效` + the same guide |
| unrecognised skip reason | `当前环境不使用旧网关鉴权策略` + the same guide |
| real query, no entries | `未查询到旧网关鉴权策略` |
| real query with entries | 10-column table (策略ID / 资源 / 效果 / 角色 / 安全规则 …) + `共 N 条策略` |
| response without `Data` | `API_ERROR`: `查询网关鉴权策略列表失败：响应缺少策略数据` — never a silent empty list |

```jsonc
// tcb policy list --json (PG example) — SkippedReason is the field that matters
{
  "data": {
    "Data": { "PolicyList": [], "Total": "0" },
    "RequestId": "",
    "SkippedReason": "postgresql_env"        // 'postgresql_env' | 'opa_authz_engine' | absent
  }
}
```

> ⚠️ Decision rule: `SkippedReason` present ⇒ no request was sent, and the list proves nothing about this
> environment's authorization. Read `tcb policy get` before concluding anything (least of all "403 = route not
> opened"). Do **not** use `RequestId` as the signal: endpoints that go through an injected `requestFn`
> (local / IDE-injected) can return the inner response without `RequestId` even on a real query.

### Step 2 — `tcb policy get` (the Rego layers)

```bash
tcb policy get --env-id <envId>              # authz.user.rego — your custom policy
tcb policy get --extension --env-id <envId>  # authz.platform.extension.rego — platform-injected, read-only
tcb policy get --json --env-id <envId>
```

- There is **no `--scope` flag** and no "read both layers in one call" — issue two commands (two keys in scripts).
- The platform default layer (`authz.platform.rego`) is **not readable**; only the extension layer is.
- Nothing configured → `当前无用户自定义策略内容` / `当前无平台注入策略内容` (here the emptiness IS meaningful).

```jsonc
// tcb policy get --json
{ "data": { "Item": { "Key": "authz.user.rego", "Value": "package authz.user ..." }, "RequestId": "<id>" } }
```

> ⚠️ Parse `data.Item.Value`. An empty `Value` means that layer is empty — the policy in force elsewhere
> (platform default layer / legacy entries) still applies.

### Step 3 — `tcb policy set` (write `authz.user.rego`)

```bash
# Inline Rego (the only supported source — there is NO -f/--file flag)
tcb policy set 'package authz.user

default allow := false

# 放通匿名用户访问云函数
allow if {
  input.cloudbase.resource_type == "functions"
  input.subject.auth_type == "anonymous"
}' --env-id <envId>

# Shell substitution also works
tcb policy set "$(cat policy.rego)" --env-id <envId>
```

- Empty or whitespace-only content → `MISSING_PARAM` (`请提供 Rego 策略内容`). `tcb policy set -f …` is **not** a
  valid invocation — `-f` does not exist.
- Confirmation prompt: `设置后将启用 OPA Rego 鉴权，旧网关鉴权立即失效，确认执行？`; add `--yes` in CI.
- `--json` → `{ "data": { "AffectedRows": 1, "RequestId": "<id>" } }`.
- After a successful write the engine is `opa` no matter what it was; the CLI does **not** print the switch.
  Confirm it yourself with `tcb policy list --json` (`SkippedReason: "opa_authz_engine"` = switched).

> ⚠️ Show the policy to the user and get explicit approval before writing: it takes effect immediately, and on a
> legacy environment it permanently retires the gateway entries.

**Rego entry points seen in the CLI's own examples:**
- `package authz.user` + `default allow := false` — the rule set is the user policy
- `input.cloudbase.resource_type` — e.g. `"functions"` (resource type being accessed)
- `input.subject.auth_type` — e.g. `"anonymous"` (caller identity type)

> ⚠️ Verify field names against `tcb policy get` output and the official docs before authoring a
> non-trivial policy — an incorrect Rego policy takes effect immediately.

### Step 4 — Verify

```bash
tcb policy get --env-id <envId>              # custom layer now holds your text
tcb policy get --extension --env-id <envId>  # platform layer untouched
tcb policy list --json --env-id <envId>      # SkippedReason: opa_authz_engine → engine flipped
```

### Legacy level model (historical reference only — NOT settable via CLI)

The old `tcb permission set --level <level>` model used these levels. **`tcb permission` is offline**,
so these values can no longer be applied through the CLI — express the equivalent intent as Rego.

| Resource | Old levels |
|----------|--------|
| `table` | `readonly`, `private`, `adminwrite`, `adminonly` |
| `collection` | `readonly`, `private`, `adminwrite`, `adminonly`, `custom` |
| `function` | `custom` only |
| `storage` | `readonly`, `private`, `adminwrite`, `adminonly`, `custom` |

---

## Workflow 2: Manage Roles (`tcb role`)

### Step 1 — List and inspect

```bash
tcb role list --env-id <envId>
tcb role list --type custom --detail --env-id <envId>
tcb role get --id <roleId> --detail --env-id <envId>
```

> ⚠️ `role get` query conditions `--id` / `--identity` / `--name` are **mutually exclusive** — pass exactly one.

### Step 2 — Create or update (parameter sets differ!)

| Action | Policies param | Members param |
|--------|---------------|---------------|
| `role create` | `--policies` | `--users` |
| `role update` | `--add-policies` / `--remove-policies` | `--add-users` / `--remove-users` |

> ⚠️ Do NOT use `--add-policies` with `create`, or `--policies` with `update` — they will fail.

```bash
# Create with preset policy codes
tcb role create --name "developer" --identity dev_role \
  --policies '["FunctionsAccess","StoragesAccess"]' \
  --users "u1001,u1002" --env-id <envId>

# Update: add policies + members
tcb role update --id <roleId> \
  --add-policies '["CloudrunAccess"]' \
  --add-users "u1003" --yes --env-id <envId>

# Update: remove
tcb role update --id <roleId> \
  --remove-policies '["StoragesDeny"]' \
  --remove-users "u1002" --yes --env-id <envId>
```

**Preset policy codes:** `AdministratorAccess`, `FunctionsAccess`, `StoragesAccess`, `CloudrunAccess`, `FunctionsDeny`, `StoragesDeny`, `CloudrunDeny`

### Step 3 — Custom policy objects

Policies array can mix preset codes (strings) and custom objects:

```bash
tcb role update --id <roleId> --add-policies '[
  "FunctionsAccess",
  {
    "code": "api_guard",
    "name": "API Guard",
    "description": "Allow /api, deny /api/admin",
    "effect": "deny",
    "expression": {
      "version": "1.0",
      "statement": [
        {"action": "functions:/api/*", "resource": "*", "effect": "allow"},
        {"action": "functions:/api/admin/*", "resource": "*", "effect": "deny"}
      ]
    }
  }
]' --yes --env-id <envId>
```

**Policy object fields:** `code` (required), `name` (required), `description`, `effect` (`allow`|`deny`), `expression` (JSON object, NOT string) with `version` ("1.0") and `statement` array.

> ⚠️ `expression` must be a JSON **object**, not a string. When `allow` and `deny` both match, **deny wins**.

### Step 4 — System role constraints

| Role Type | Modify users | Modify policies | Modify name |
|-----------|:---:|:---:|:---:|
| 管理员 (Admin) | ✅ | ❌ | ❌ |
| 注册用户/组织成员/匿名用户/所有用户 | ❌ | ✅ | ❌ |
| Custom roles | ✅ | ✅ | ✅ |

### Step 5 — Delete roles

```bash
tcb role delete <roleId1> <roleId2> --yes --env-id <envId>   # max 100, custom only
```

---

## Workflow 3: Manage Users (`tcb user`)

```bash
# List (filters combinable)
tcb user list --name alice --email a@example.com --env-id <envId>

# Create
tcb user create alice --uid u1001 --type internalUser --status ACTIVE --env-id <envId>

# Update (NO --role parameter!)
tcb user update u1001 --status BLOCKED --env-id <envId>

# Delete (max 100)
tcb user delete u1001 u1002 --yes --env-id <envId>
```

> ⚠️ `tcb user update` has NO `--role` param. To assign roles, use `tcb role create --users` or `tcb role update --add-users`.

---

## Workflow 4: Audit & Revoke

```bash
# 1) Full role inventory
tcb role list --detail --env-id <envId> --json

# 2) Read the effective resource authorization policy (both Rego layers)
tcb policy get --env-id <envId>
tcb policy get --extension --env-id <envId>

# 2b) Legacy gateway entries — ONLY if this environment still runs `authpolicy`.
#     On PG / OPA environments this prints a guide instead of entries (see SkippedReason).
tcb policy list --json --env-id <envId>

# 3) Revoke temporary access
tcb role update --id <roleId> --remove-users "u_temp" --yes --env-id <envId>

# 4) Optional: block account
tcb user update u_temp --status BLOCKED --env-id <envId>
```

---

## Decision Guide

| Goal | Command |
|------|---------|
| Change a resource's authorization | `policy set` (OPA Rego) |
| Read the effective authorization | `policy get` + `policy get --extension` (never `policy list` on PG/OPA) |
| See the old gateway entries (authpolicy env only) | `policy list` |
| Explain a 403 / "permission denied" | `policy get --json` first; an empty `policy list` proves nothing |
| Manage access policies for an identity group | `role create/update` |
| Assign user to a role | `role create --users` (new) or `role update --add-users` (existing) |
| Change user profile/status | `user update` |
| Full audit | `role list --detail` + `policy get` + `policy get --extension` |

---

## Command Quick Reference

```bash
tcb policy list [--resource-type policy]   # LEGACY gateway entries; empty on PG/OPA (check SkippedReason!)
tcb policy get [--extension]               # Rego: user layer (default) / platform-injected layer (read-only)
tcb policy set '<regoContent>'             # Write authz.user.rego; flips authpolicy → opa, one-way, no -f flag

tcb role list                          # List roles
tcb role get                           # Get single role (--id/--identity/--name, pick ONE)
tcb role create                        # Create role (--policies, --users)
tcb role update                        # Update role (--add-*/-remove-*, --id required)
tcb role delete <roleIds...>           # Delete roles (custom only, max 100)

tcb user list                          # List users
tcb user create <name>                 # Create user
tcb user update <uid>                  # Update user (NO --role!)
tcb user delete <uids...>             # Delete users (max 100)
```

**Global flags:** `--env-id <envId>` (required), `--json` (machine output), `--yes` (skip confirmation for CI)

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| "请且仅传入一个查询条件" | `role get` with multiple or zero query conditions | Use exactly one of `--id`/`--identity`/`--name` |
| "permission set 命令已下线，不再执行实际操作" | `tcb permission set` is offline | Use `tcb policy set '<regoContent>'` |
| "permission get 命令已下线，不再执行实际操作" | `tcb permission get` is offline | Use `tcb policy get` / `tcb policy get --extension` |
| "当前为 PG（PostgreSQL）环境，无旧网关鉴权策略" | `policy list` on a PG env (no request sent) | Not an empty policy — read `policy get` / `get --extension` |
| "当前环境已启用 OPA 鉴权引擎，旧网关鉴权策略不再生效" | `policy list` on an OPA-env (`SkippedReason: opa_authz_engine`) | Read the Rego layers with `policy get` instead |
| "未查询到旧网关鉴权策略" | A real query returned zero legacy entries | Fine on `authpolicy`; on PG/OPA environments you end up in the guide branches instead |
| "当前无用户自定义策略内容" / "当前无平台注入策略内容" | That Rego layer has no value | Expected — `data.Item.Value` is empty; other layers may still apply |
| "查询网关鉴权策略列表失败：响应缺少策略数据" | SDK response carried no `Data` | Retry; if it persists upgrade `CloudBase CLI` — do not report "no policy" |
| "请提供 Rego 策略内容" | `tcb policy set` called with empty/whitespace content | Pass Rego inline or `"$(cat policy.rego)"` (no `-f`) |
| "设置 Rego 策略失败" | Invalid Rego syntax, or wrong envId | Validate the Rego policy; confirm `--env-id` |
| JSON parse error | `--policies`/`--add-policies` not valid JSON array | Validate JSON before execution |
| Role update silently fails | Violating system role constraints | Check system role table — admin can't change policies, etc. |

---

## Real-World Scenarios

### Scenario 1: Team Onboarding

```bash
tcb role list --type custom --env-id <envId>                           # confirm role exists
tcb role update --id <devRoleId> --add-users "<newUid>" --yes --env-id <envId>
tcb role get --id <devRoleId> --detail --env-id <envId>                # verify
```

### Scenario 2: Contractor Temporary Access + Revocation

```bash
# Grant
tcb role create --name "contractor-ro" --identity contractor_ro \
  --policies '["StoragesAccess"]' --env-id <envId>
tcb role update --id <roleId> --add-users "<contractorUid>" --yes --env-id <envId>

# Revoke on contract end
tcb role update --id <roleId> --remove-users "<contractorUid>" --yes --env-id <envId>
tcb user update <contractorUid> --status BLOCKED --env-id <envId>
```

### Scenario 3: Store RBAC (Owner / Manager / Clerk)

```bash
# Owner: full access + admin console
tcb role create --name "owner" --identity shop_owner \
  --policies '["FunctionsAccess",{"code":"owner_admin","name":"Admin Access","effect":"allow","expression":{"version":"1.0","statement":[{"action":"functions:/shop/admin/*","resource":"*","effect":"allow"}]}}]' \
  --env-id <envId>

# Clerk: POS only, deny refund
tcb role create --name "clerk" --identity shop_clerk \
  --policies '[{"code":"clerk_pos","name":"POS Only","effect":"allow","expression":{"version":"1.0","statement":[{"action":"functions:/shop/pos/*","resource":"*","effect":"allow"},{"action":"functions:/shop/pos/refund/*","resource":"*","effect":"deny"}]}}]' \
  --env-id <envId>

# Resource authorization baseline (separate from role policies!)
tcb policy get --env-id <envId>              # read the custom Rego layer before changing anything
tcb policy get --extension --env-id <envId>  # plus the platform-injected layer
```

> ⚠️ `tcb permission set --level ...` no longer works (offline). To change the resource baseline,
> author a Rego policy and apply it with `tcb policy set` — and review it with the user first, because
> saving disables the legacy gateway authorization immediately.

### Scenario 4: A 403 That "Has No Policy"

```bash
# 1) The trap: an empty legacy list on a PG / OPA environment proves nothing
tcb policy list --json --env-id <envId>
#    {"data":{"Data":{"PolicyList":[],"Total":"0"},"RequestId":"","SkippedReason":"opa_authz_engine"}}
#    ← SkippedReason present = no request was sent

# 2) Read the layers that actually decide access
tcb policy get --json --env-id <envId>
tcb policy get --extension --json --env-id <envId>

# 3) Only then attribute the 403 — to a Rego rule, not to "the route isn't open"
```

> ⚠️ Never answer "this environment has no authorization policy" from `policy list` alone. Empty list +
> `SkippedReason` present means the legacy API was skipped, not that nothing is enforced.
> In JSON, look for it explicitly instead of inferring a skip from `RequestId` being absent.

---

## Self-Check

- [ ] `tcb` >= 3.0.0 and logged in with correct environment
- [ ] Identified correct command: `policy` (resource authorization) vs `role` (identity) vs `user` (account)
- [ ] Did NOT use `tcb permission get/set` — those commands are **offline** and only print a migration notice
- [ ] Did NOT read an empty `policy list` as "no policy" — checked `SkippedReason` explicitly
- [ ] On PG / OPA environments, read authorization via `policy get` / `policy get --extension` (no `--scope` flag exists)
- [ ] `--json` parsed at `data.Item.Value` (`get`) and `data.SkippedReason` (`list`), not `data.scopes.*`
- [ ] For `policy set`: Rego passed positionally (no `-f`), valid syntax, engine flips to `opa` one-way, user confirmed
- [ ] For `role create`: using `--policies`/`--users` (NOT `--add-*`)
- [ ] For `role update`: using `--add-*`/`--remove-*` (NOT `--policies`), `--id` is set
- [ ] For `role get`: exactly ONE of `--id`/`--identity`/`--name`
- [ ] System role constraints checked before update
- [ ] Policy JSON: `expression` is object (not string), has `version` + `statement`
- [ ] `--yes` added for CI; `--json` added for programmatic parsing
- [ ] Audited BOTH role policies AND the Rego resource policy (they are independent)
