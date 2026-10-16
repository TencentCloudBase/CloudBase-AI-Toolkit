# Permission — CloudBase CLI

CloudBase access control has **four independent layers** — know which one to use before running any command:

| Layer | Command | Controls |
|-------|---------|----------|
| **Resource Authorization (OPA Rego)** | `tcb policy list / get / set` | Environment-level Rego policy that the gateway evaluates for resource access |
| **Resource Permission (legacy)** | `tcb permission get/set` — ⚠️ **offline** | Prints a migration notice and performs nothing. Do not use. |
| **Role** | `tcb role ...` | Policy bundles + member assignments (identity dimension) |
| **User** | `tcb user ...` | Account attributes only (name, email, status) — NOT role binding |

> ⚠️ **`tcb permission get/set` has been taken offline.** These commands now only print
> "请使用 tcb policy …" and execute no operation — they are not deprecated aliases, they do nothing.
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

### Step 1 — Inspect the current policy

```bash
tcb policy list --env-id <envId>                    # legacy gateway authorization policy list
tcb policy list --resource-type policy --env-id <envId>
tcb policy get --env-id <envId>                     # the user-configured policy
tcb policy get --extension --env-id <envId>          # the policy configured specifically for this environment
```

> ⚠️ `tcb policy list` returns an **empty list for PG environments and OPA-engine environments** — that
> is expected, not an error. Use `tcb policy get` to read the effective policy in those environments.

### Step 2 — Set the Rego policy

```bash
# Inline Rego (quoted)
tcb policy set 'package authz.user

default allow := false

# 放通匿名用户访问云函数
allow if {
  input.cloudbase.resource_type == "functions"
  input.subject.auth_type == "anonymous"
}' --env-id <envId>

# From a file
tcb policy set "$(cat policy.rego)" --env-id <envId>
```

> ⚠️ `tcb policy set` asks for confirmation — saving **immediately disables legacy gateway authorization**.
> In CI/scripts add `--yes`. Show the policy to the user and get explicit approval before writing it.

**Rego entry points seen in the CLI's own examples:**
- `package authz.user` + `default allow := false` — the rule set is the user policy
- `input.cloudbase.resource_type` — e.g. `"functions"` (resource type being accessed)
- `input.subject.auth_type` — e.g. `"anonymous"` (caller identity type)

> ⚠️ Verify field names against `tcb policy get` output and the official docs before authoring a
> non-trivial policy — an incorrect Rego policy takes effect immediately.

### Step 3 — Verify

```bash
tcb policy get --env-id <envId>          # read back the policy you just wrote
tcb policy list --env-id <envId>         # confirm legacy list state
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

# 2) Read the effective resource authorization policy
tcb policy get --env-id <envId>
tcb policy get --extension --env-id <envId>
tcb policy list --env-id <envId>

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
| Read the effective authorization | `policy get` / `policy list` |
| Manage access policies for an identity group | `role create/update` |
| Assign user to a role | `role create --users` (new) or `role update --add-users` (existing) |
| Change user profile/status | `user update` |
| Full audit | `role list --detail` + `policy get` on the environment |

---

## Command Quick Reference

```bash
tcb policy list [--resource-type policy]   # List legacy gateway authorization policies
tcb policy get [--extension]               # Read the effective Rego policy
tcb policy set '<regoContent>'             # Set the user Rego policy (disables legacy gateway authz)

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
| "permission get 命令已下线，不再执行实际操作" | `tcb permission get` is offline | Use `tcb policy get` / `tcb policy list` |
| "请提供 Rego 策略内容" | `tcb policy set` called without an argument | Pass Rego inline or `"$(cat policy.rego)"` |
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
tcb policy get --env-id <envId>          # read the effective Rego policy before changing anything
```

> ⚠️ `tcb permission set --level ...` no longer works (offline). To change the resource baseline,
> author a Rego policy and apply it with `tcb policy set` — and review it with the user first, because
> saving disables the legacy gateway authorization immediately.

---

## Self-Check

- [ ] `tcb` >= 3.0.0 and logged in with correct environment
- [ ] Identified correct command: `policy` (resource authorization) vs `role` (identity) vs `user` (account)
- [ ] Did NOT use `tcb permission get/set` — those commands are **offline** and only print a migration notice
- [ ] For `policy set`: policy is valid Rego; legacy gateway authorization is disabled immediately; user confirmed
- [ ] For `role create`: using `--policies`/`--users` (NOT `--add-*`)
- [ ] For `role update`: using `--add-*`/`--remove-*` (NOT `--policies`), `--id` is set
- [ ] For `role get`: exactly ONE of `--id`/`--identity`/`--name`
- [ ] System role constraints checked before update
- [ ] Policy JSON: `expression` is object (not string), has `version` + `statement`
- [ ] `--yes` added for CI; `--json` added for programmatic parsing
- [ ] Audited BOTH role policies AND the Rego resource policy (they are independent)
