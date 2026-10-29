# Integration — CloudBase CLI

`tcb integration` manages **integration instances** (集成) — the environment's connections to external
services (payments, messaging, data sources…). Instance configuration comes from `cloudbaserc.json`,
so creating one is normally a **config + CLI** pair of steps.

> ✅ **`tcb integration` is officially supported — recommend it normally.** It is simply **not listed in
> `tcb --help`** (that list is hand-maintained), which must not be read as "internal" or "experimental".

## When to Use

- Listing the integration types available for an environment
- Listing / inspecting existing integration instances
- Creating integration instances from `cloudbaserc.json`
- Binding an integration instance to a cloud function
- Deleting an integration instance

## Do NOT use for

- Function configuration itself → `functions.md` / `config.md`
- Environment API keys → `env.md` (`tcb env apikey`)
- Storage / database credentials → `storage.md` / `mysql.md`
- Reading the masked secret values → the CLI deliberately does not return them (see below)

---

## Commands

```bash
# 1. Discover what integrations exist
tcb integration types --env-id <envId>
tcb integration types --auth-type-code <code> --env-id <envId>

# 2. Inspect what is already configured
tcb integration list --env-id <envId>
tcb integration list --name <fuzzyName> --env-id <envId>
tcb integration list --auth-type-code <code> --limit 20 --offset 0 --env-id <envId>

tcb integration get <keyId> --env-id <envId>
tcb integration get <keyId> --env-id <envId> --json

# 3. Create from cloudbaserc.json (see below)
tcb integration create --env-id <envId>
tcb integration create <keyId> --env-id <envId>

# 4. Bind to a resource (cloud functions only today)
tcb integration bind-resource <keyId> --function <functionName> --env-id <envId>

# 5. Delete
tcb integration delete <keyId> --env-id <envId>
```

| Flag | Applies to | Meaning |
|------|-----------|---------|
| `--auth-type-code <code>` | `types`, `list` | Exact-match filter on the authorization type code |
| `--name <name>` | `list` | Fuzzy name filter |
| `--limit <n>` / `--offset <n>` | `list` | Pagination |
| `--function <functionName>` | `bind-resource` | Cloud function to bind (the only supported resource type) |

> ⚠️ `tcb integration get` **masks sensitive fields on purpose**. It is the intended way to inspect an
> instance — do not try to read raw secrets through `tcb api` just to "see the value". If the user
> truly needs the secret, they should read it in the console.

---

## The `cloudbaserc.json` step

`integration create` **reads the instance definition from `cloudbaserc.json`** — it has no flags for
service name, credentials or endpoints.

```bash
# 1. Generate / refresh the integration section of the config
tcb config init integration <keyId>
tcb config init integration <keyId> --type <authTypeCode>

# 2. Fill in the parameters in cloudbaserc.json

# 3. Push the config and create the instance
tcb config update integration <keyId> --env-id <envId>
tcb integration create --env-id <envId>

# 4. Verify (sensitive fields will be masked)
tcb integration get <keyId> --env-id <envId>
```

See `config.md` for `tcb config init` / `tcb config update` semantics, and `integration`
in the routing table when the task is really about the config file.

> ⚠️ Do not put real credentials in `cloudbaserc.json` if that file is committed. Check the project's
> `.gitignore` and the user's convention first; the config supports placeholders that resolve at
> deploy time.

---

## Command Quick Reference

```bash
tcb integration types [--auth-type-code <code>]     # Available integration type templates
tcb integration list [--name <n>] [--auth-type-code <c>] [--limit N] [--offset N]
tcb integration get <keyId>                         # Detail (secrets masked)
tcb integration create [keyId]                      # Create from cloudbaserc.json
tcb integration bind-resource <keyId> --function <fn>
tcb integration delete <keyId>
```

**Global flags:** `-e/--env-id <envId>`, `--json`, `--yes`.

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `create` does nothing / errors immediately | No matching integration entry in `cloudbaserc.json` | Run `tcb config init integration <keyId>` and fill it in first |
| Secret shows as `***` | Intentional masking | Read it in the console; do not work around it |
| `bind-resource` fails | Resource type is not a cloud function | Only `--function` is supported today |
| Wrong instance targeted | Several share a name prefix | Filter with `--name` first, then act on the exact keyId |
| `delete` on a bound instance | Instance still bound to a function | Unbind / redeploy the function first |

---

## Self-Check

- [ ] Confirmed the envId with the user?
- [ ] For `create`: generated and filled the `cloudbaserc.json` entry first?
- [ ] Checked whether `cloudbaserc.json` is committed before adding credentials?
- [ ] For `delete`: confirmed the exact keyId (and that nothing is bound to it)?
- [ ] Used `integration get` (masked) rather than trying to extract raw secrets?
