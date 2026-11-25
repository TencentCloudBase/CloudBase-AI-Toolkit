# Agent — CloudBase CLI

`tcb agent` manages CloudBase **Agents** — function-based (SCF) agents that are created, updated and
deleted together with their underlying cloud resources.

## When to Use

- Creating an Agent from a local code directory (pack + upload in one step)
- Listing / inspecting existing Agents and their underlying resource readiness
- Updating an Agent's code, runtime, timeout, memory or environment variables
- Deleting an Agent (and its underlying function / CloudRun resources)

## Do NOT use for

- Plain cloud functions → `functions.md`
- CloudRun container services → `cloudrun.md`
- Web app hosting → `app.md` / `hosting.md`
- The `cloudbase-agent` SDK (writing agent code) → `../cloudbase-agent/SKILL.md`

---

## Commands

```bash
tcb agent list --env-id <envId>
tcb agent list --limit 20 --offset 0 --env-id <envId>

tcb agent detail <agentId> --env-id <envId>
tcb agent detail <agentId> --env-id <envId> --json   # underlying resource readiness + config

tcb agent create --env-id <envId> \
  --name my-agent \
  --code ./my-agent \
  --runtime Nodejs20.19 \
  --timeout 7200 \
  --memory-size 512 \
  --install-dep \
  --ignore ".git,node_modules,.DS_Store" \
  --env "KEY1=VALUE1,KEY2=VALUE2"

tcb agent update <agentId> --env-id <envId> --code ./my-agent --timeout 3600

tcb agent delete <agentId> --env-id <envId> --dry-run   # preview
tcb agent delete <agentId> --env-id <envId> --yes
```

### `agent create` flags

| Flag | Meaning | Default |
|------|---------|---------|
| `--name <name>` | Agent name (**required**) | — |
| `--agent-id <agentId>` | Explicit id | auto-generated |
| `--code [path]` | Local code directory, packed and uploaded | current directory |
| `--runtime <runtime>` | e.g. `Nodejs20.19` | — |
| `--timeout <seconds>` | Execution timeout | `7200` (agents need long-lived connections) |
| `--memory-size <MB>` | `64`, or `128`-`3072` | `128` |
| `--install-dep` | Install dependencies in the cloud (needed when the upload excludes them) | off |
| `--ignore <patterns>` | Comma-separated excludes | `.git,node_modules,.DS_Store` |
| `--env <envVars>` | Environment variables, `KEY1=VALUE1,KEY2=VALUE2` | — |

### `agent update` flags

Same as create **except** `--name` and `--agent-id` (the id is positional): `--code`, `--runtime`,
`--timeout`, `--memory-size`, `--install-dep`, `--ignore`, `--env`.

> ⚠️ `agent delete` **also removes the underlying function / CloudRun resources** and is not
> recoverable. Always run `--dry-run` first, show the preview, and wait for explicit confirmation.

> ⚠️ `--env` is a comma-separated `KEY=VALUE` list on one line. Values containing commas need
> different handling — verify the parsed result with `tcb agent detail <agentId>` afterwards.

> ⚠️ Prefer injecting secrets through the environment/CI secret store rather than typing them into the
> command line (shell history + process list). Never commit them.

---

## Command Quick Reference

```bash
tcb agent list [--limit N] [--offset N]   # List agents
tcb agent detail <agentId>                # Detail + underlying resource status
tcb agent create --name <n> [...]         # Create (packs --code and uploads)
tcb agent update <agentId> [...]          # Update code / config
tcb agent delete <agentId> [--dry-run]    # Delete agent + underlying resources
```

**Global flags:** `-e/--env-id <envId>`, `--json`, `--yes`.

---

## Common Errors

| Error | Cause | Fix |
|-------|-------|-----|
| `--name is required` | `agent create` without `--name` | `agent update` takes the id positionally; `create` needs `--name` |
| Agent created but code missing | `--code` pointed at the wrong directory | Re-run `agent update <agentId> --code <dir>` |
| `MODULE_NOT_FOUND` at runtime | Dependencies not uploaded and not installed | Add `--install-dep` (or bundle `node_modules`) |
| Timeout too short | Agents hold long connections | Raise `--timeout` (default is already 7200 s) |
| Delete removed more than expected | `agent delete` also cleans the underlying function | Confirm with the user; use `--dry-run` first |

---

## Self-Check

- [ ] Confirmed the envId with the user?
- [ ] For `create`: passed `--name` and the correct `--code` directory?
- [ ] `--ignore` excludes `.git` / `node_modules` unless intentionally uploadable?
- [ ] Timeout large enough for the agent's connection pattern?
- [ ] For `delete`: ran `--dry-run` and got explicit approval?
- [ ] Secrets injected via env vars, not hardcoded in the command?
