# Permission — CloudBase CLI

CloudBase access control has **three independent layers** — know which one to use before running any command:

| Layer | Command | Controls |
|-------|---------|----------|
| **Resource Permission** | `tcb permission get/set` | Access level on a specific resource (table, collection, function, storage) |
| **Role** | `tcb role ...` | Policy bundles + member assignments (identity dimension) |
| **User** | `tcb user ...` | Account attributes only (name, email, status) — NOT role binding |

> ⚠️ Role policies and resource permissions are **two parallel systems with NO automatic sync**. Changing a role policy does NOT affect `permission get` results, and vice versa. Audit both separately.

## MCP Tool Equivalents (when CLI is disabled)

If the runtime environment shows CLI is disabled, use these MCP tools instead:

| CLI Command | MCP Tool Call |
|-------------|---------------|
| `tcb role list` | `queryPermissions(action="listRoles")` |
| `tcb role get --id <id>` | `queryPermissions(action="getRole", roleId="<id>")` |
| `tcb role get --identity <i>` | `queryPermissions(action="getRole", roleIdentity="<i>")` |
| `tcb role get --name <n>` | `queryPermissions(action="getRole", roleName="<n>")` |
| `tcb role create` | `managePermissions(action="createRole", roleName, roleIdentity, policies, memberUids)` |
| `tcb role update --add-users` | `managePermissions(action="addRoleMembers", roleId, memberUids)` |
| `tcb role update --add-policies` | `managePermissions(action="addRolePolicies", roleId, policies)` |
| `tcb role delete` | `managePermissions(action="deleteRoles", roleIds)` |
| `tcb permission get table:users` | `queryPermissions(action="getResourcePermission", resourceType="sqlDatabase", resourceId="users")` |
| `tcb permission set table:users --level readonly` | `managePermissions(action="updateResourcePermission", resourceType="sqlDatabase", resourceId="users", permission="READONLY")` |
| `tcb user list` | `queryPermissions(action="listUsers")` |
| `tcb user update <uid> --status BLOCKED` | `managePermissions(action="updateUser", uid="<uid>", userStatus="BLOCKED")` |

> ⚠️ Do NOT attempt `tcb` commands when CLI is disabled. Check the runtime capability notice to determine available interfaces.

---

## When to Use

- Managing resource-level access (table/collection/function/storage access levels)
- Creating, updating, or deleting roles with policies and user assignments
- Managing user accounts (create, update status, delete)
- Auditing permission state across resources and roles

## Do NOT use for

- Storage ACL rules (use `tcb-storage` `rules get/update`)
- CORS / domain / routing access (use `tcb-access`)
- CloudBase console access control (CLI-managed permissions only)

---

## Workflow 1: Manage Resource Permissions (`tcb permission`)

### Step 1 — Query current state

```bash
tcb permission get --env-id <envId>                        # all resource types
tcb permission get table --env-id <envId>                  # all tables
tcb permission get table:users,orders --env-id <envId>     # specific resources (max 100)
tcb permission get function --env-id <envId>               # functions
```

> ⚠️ Do NOT use `function:` (colon with empty resource) — returns empty results. Use `function` instead.

### Step 2 — Set permissions

```bash
# Fixed level
tcb permission set table:users --level readonly --env-id <envId>
tcb permission set storage:assets --level private --env-id <envId>

# Function (custom only, --rule required)
tcb permission set function --level custom \
  --rule '{"*":{"invoke":"auth != null && auth.loginType != '\''ANONYMOUS'\''"}}' \
  --env-id <envId>

# Rule without level => defaults to custom
tcb permission set collection:posts --rule '{"read": true, "write": false}' --env-id <envId>
```

**Combination rules:**
- Must provide at least `--level` or `--rule`
- `--rule` without `--level` => auto `custom`; `custom` level requires `--rule`
- `function` only supports `custom`
- ⚠️ `set` requires `type:resource` for table/collection/storage — only `function` can omit resource name

### Allowed levels by resource type

| Resource | Levels |
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

# 2) Spot-check critical resources
tcb permission get table:users,orders --env-id <envId>
tcb permission get function --env-id <envId>

# 3) Revoke temporary access
tcb role update --id <roleId> --remove-users "u_temp" --yes --env-id <envId>

# 4) Optional: block account
tcb user update u_temp --status BLOCKED --env-id <envId>
```

---

## Decision Guide

| Goal | Command |
|------|---------|
| Change a resource's access level | `permission set` |
| Manage access policies for an identity group | `role create/update` |
| Assign user to a role | `role create --users` (new) or `role update --add-users` (existing) |
| Change user profile/status | `user update` |
| Full audit | `role list --detail` + `permission get` on key resources |

---

## Command Quick Reference

```bash
tcb permission get [resourceArg]       # Query resource permissions
tcb permission set <resourceArg>       # Set resource permissions

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
| "资源类型不支持权限级别" | `permission set` level incompatible with resource type | Check allowed levels table above |
| "权限级别为 custom 时，需要提供 --rule" | Missing `--rule` with custom level | Add `--rule` JSON |
| JSON parse error | `--policies`/`--add-policies` not valid JSON array | Validate JSON before execution |
| Role update silently fails | Violating system role constraints | Check system role table — admin can't change policies, etc. |
| "不存在的命令" | Using `permission list` or `role detail` | Correct: `permission get` / `role get` |

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

# Resource baseline (separate from role policies!)
tcb permission set table:orders --level private --yes --env-id <envId>
tcb permission set function --level custom --rule '{"*":{"invoke":"auth != null"}}' --yes --env-id <envId>
```

---

## Self-Check

- [ ] `tcb` >= 3.0.0 and logged in with correct environment
- [ ] Identified correct command: `permission` (resource) vs `role` (identity) vs `user` (account)
- [ ] For `permission set`: resource format is `type:resource` (except `function`)
- [ ] For `role create`: using `--policies`/`--users` (NOT `--add-*`)
- [ ] For `role update`: using `--add-*`/`--remove-*` (NOT `--policies`), `--id` is set
- [ ] For `role get`: exactly ONE of `--id`/`--identity`/`--name`
- [ ] System role constraints checked before update
- [ ] Policy JSON: `expression` is object (not string), has `version` + `statement`
- [ ] `--yes` added for CI; `--json` added for programmatic parsing
- [ ] Audited BOTH role policies AND resource permissions (they are independent)
