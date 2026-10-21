# Sandbox — CloudBase CLI

CloudBase **Sandbox** (沙箱) runs isolated tool environments (browser automation, code interpreter,
custom images) as short-lived instances. `tcb sandbox` manages the tool *definitions*, the running
*instances*, and the *API keys* used to reach them.

## When to Use

- Creating / updating a reusable sandbox **tool** (image, network mode, resources, mounts)
- Starting, pausing, resuming, stopping sandbox **instances**
- Fetching an instance's access token
- Managing sandbox **API keys** for programmatic access

## Do NOT use for

- Deploying application code → `functions.md` / `cloudrun.md` / `app.md`
- Environment-level resources → `env.md`
- Generic cloud API escape hatch → `tcb api` (`core.md`)

---

## Tool definitions (`tcb sandbox tool`)

```bash
tcb sandbox tool list --env-id <envId>
tcb sandbox tool list --limit 50 --offset 0 --filter "Name=my-tool" --env-id <envId>

tcb sandbox tool create my-tool --env-id <envId> \
  -t browser \
  --network-mode PUBLIC \
  -d "headless browser sandbox" \
  --timeout 30m

tcb sandbox tool update <toolId> --env-id <envId> -d "new description"
tcb sandbox tool delete <toolId> --env-id <envId>
```

`tool create` flags:

| Flag | Meaning |
|------|---------|
| `-t, --tool-type <type>` | `browser` \| `code-interpreter` \| `custom` |
| `--network-mode <mode>` | `PUBLIC` \| `VPC` \| `SANDBOX` |
| `-d, --description <desc>` | Description (max 200 chars) |
| `--timeout <timeout>` | Default timeout, `5m` / `300s` / `1h` style, max 24h |
| `--tags <key=value>` | Extra tags, repeatable |
| `--client-token <token>` | Idempotency token (max 64 chars) |
| `--role-arn <arn>` | Role ARN |
| `--storage-mounts <json>` | `StorageMount[]` JSON (each needs `Name` / `StorageSource`) |
| `--custom-configuration <json>` | `CustomConfiguration` JSON (`Image` / `ImageRegistryType` / `Command` / `Args` / `Env` / `Ports` / `Resource…`) |
| `--log-configuration <json>` | `LogConfiguration` JSON |
| `--subnet-ids <id>` | VPC subnet id — **only** when `--network-mode VPC`, exactly one |
| `--security-group-ids <ids...>` | Security groups — only with `--network-mode VPC`, duplicates de-duplicated |

`tool update` accepts a subset: `-d/--description`, `--tags`, `--network-mode`, `--subnet-ids`,
`--security-group-ids`, `--custom-configuration`.

> ⚠️ `--timeout` accepts human forms (`5m`, `300s`, `1h`) — unlike `tcb monitor --period`, which takes
> seconds. Do not mix the two conventions up.

---

## Instances (`tcb sandbox instance`)

```bash
# Start — pick the tool by id or by name (exactly one)
tcb sandbox instance start --tool-name my-tool --env-id <envId>
tcb sandbox instance start --tool-id <toolId> --timeout 1h \
  --auth-mode TOKEN --metadata purpose=test --env-id <envId>

tcb sandbox instance list --env-id <envId>
tcb sandbox instance list --tool-id <toolId> --limit 20 --offset 0 --env-id <envId>
tcb sandbox instance list --instance-ids <id1>,<id2> --env-id <envId>

tcb sandbox instance update <instanceId> --timeout 2h --metadata stage=warm
tcb sandbox instance pause  <instanceId> --env-id <envId>
tcb sandbox instance resume <instanceId> --env-id <envId>
tcb sandbox instance token  <instanceId> --env-id <envId>   # access token for the instance
tcb sandbox instance stop   <instanceId> --env-id <envId>
```

`instance start` flags: `--tool-id` **or** `--tool-name` (mutually exclusive, one required),
`--timeout <t>`, `--auth-mode DEFAULT|TOKEN|NONE`, `--client-token <token>`,
`--mount-options <json>` (`MountOption[]`, each needs `Name`), `--custom-configuration <json>`,
`--metadata key=value` (repeatable).

`instance list` flags: `--instance-ids <ids...>` (max 100), `--tool-id <id>`, `--filter Name=Values`
(repeatable; multiple conditions AND, multiple values in one condition OR), `--offset`, `--limit`
(default 20, max 100).

> ⚠️ `instance update --timeout` **restarts the timeout clock** from the moment you set it — it is not
> "extend by N". Minimum 30s, maximum 24h.
>
> ⚠️ `instance token` returns a live access credential. Do not print it into logs, commits, or the
> conversation transcript; hand it to the user, not into a file under version control.

---

## API keys (`tcb sandbox apikey`)

```bash
tcb sandbox apikey list --env-id <envId>
tcb sandbox apikey create my-key --env-id <envId>
tcb sandbox apikey delete <keyId> --env-id <envId>
```

> ⚠️ `sandbox apikey delete` is **irreversible**. Confirm the keyId with the user and check
> `sandbox apikey list` first.
>
> ⚠️ A sandbox API key grants programmatic access. Treat it like any other credential: env vars only,
> never in the repo.

---

## Command Quick Reference

```bash
tcb sandbox tool list                    # List tool definitions
tcb sandbox tool create <toolName>       # Create a tool (-t browser|code-interpreter|custom)
tcb sandbox tool update <toolId>
tcb sandbox tool delete <toolId>

tcb sandbox instance start               # --tool-id | --tool-name
tcb sandbox instance list
tcb sandbox instance update <instanceId>
tcb sandbox instance pause|resume <instanceId>
tcb sandbox instance token <instanceId>
tcb sandbox instance stop <instanceId>

tcb sandbox apikey list
tcb sandbox apikey create [name]
tcb sandbox apikey delete <keyId>
```

**Global flags:** `-e/--env-id <envId>`, `--json`, `--yes`.

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `instance start` rejects the target | Both `--tool-id` and `--tool-name`, or neither | Pass exactly one |
| `--subnet-ids` / `--security-group-ids` rejected | `--network-mode` is not `VPC` | Set `--network-mode VPC` first |
| Timeout value rejected | Passed seconds-only value where a duration is expected (or vice versa) | `sandbox` uses `5m` / `300s` / `1h`; `monitor` uses seconds |
| Instance already stopped | `stop` on a paused/stopped instance | Re-check with `instance list` |
| Key still valid after deletion | Deleted a different keyId | `sandbox apikey list` before deleting |

---

## Self-Check

- [ ] Confirmed the envId with the user?
- [ ] For `start`: exactly one of `--tool-id` / `--tool-name`?
- [ ] For VPC tool configs: subnet / security group only used with `--network-mode VPC`?
- [ ] Treated the instance token and API key as secrets (no logs, no commits)?
- [ ] For `apikey delete` / `tool delete`: confirmed with the user (irreversible)?
