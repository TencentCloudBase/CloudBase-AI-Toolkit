# Site Onboarding — settle the site before the MCP handshake

First run only. The site (国内站 / 国际站) must be decided **before** MCP is installed and again **persisted** so the post-restart session reads the same answer. A wrong-site setup does not error — it looks like *"logged in, but no environments"* — so an un-orchestrated first run silently produces a broken session.

This file is the orchestration contract: **trigger → CLI-only bring-up → MCP config write → post-handshake takeover → failure fallback → acceptance.**

## Why this is not just "set an env var"

The site is four separate switches with **different names and different scopes**. Setting one does nothing for the others, and the mismatch is silent.

| Layer | Interface | Scope | Read it back with |
|-------|-----------|-------|-------------------|
| Project record (canonical) | `.cloudbase/project.json` → `site` / `region` | **project** — a checked-in copy travels to every worktree | `cat .cloudbase/project.json` |
| `tcb` CLI | `TCB_IS_INTL=true` / `tcb config set isIntl true` | **machine-global** | `tcb config get isIntl` |
| MCP local stdio | `TCB_SITE` + `TCB_REGION` | per-client `mcp.json` env | `auth action=status` / `queryEnv action=list` |
| MCP remote | none — the **hostname** decides | endpoint | 401 without credentials |

MCP resolution order (`mcp/src/utils/site-map.ts`):

```
explicit tool arg  >  TCB_SITE / TCB_REGION env  >  .cloudbase/project.json  >  cloudbaserc.json  >  domestic + ap-shanghai
```

Two consequences that drive the whole procedure:

- **`.cloudbase/project.json` is the only layer that is both project-scoped and readable by MCP.** That makes it the canonical record. `tcb config isIntl` is machine-global, so it can never be that record — persisting it globally means project B inherits project A's site.
- **Env beats the project record.** A stale `TCB_SITE` in `mcp.json` overrides a correct `.cloudbase/project.json`. When they disagree, fix the env var, not the record.

> ⚠️ A bare `TCB_REGION=ap-singapore` is **ambiguous** — that region belongs to both sites. MCP resolves it to `intl` and flags `ambiguous`. Always write `site` explicitly, never region alone.

## Trigger / skip

**Run onboarding** when all hold:

1. The task about to start needs CloudBase **management** (login, env binding, resource creation, deploy) — not pure in-app SDK coding.
2. No settled decision exists, or the existing decision contradicts observed evidence.

**Skip entirely** when any holds — do not re-run, do not re-ask:

- The MCP **remote** endpoint is in use (`tcb-api.cloud.tencent.com` / `tcb-api.tencentcloud.com`). The host decides the site; there is nothing to persist for that path.
- The project record exists **and** agrees with the CLI switch **and** with the client env (if any). This is the normal re-entry case — see §Maintain.
- The user already stated the site in this conversation. Record it, do not ask again.

## Stage 1 — decide and persist with Bash + `tcb` only

MCP tools are not loaded yet on a first run, so this stage may use **only Bash and the `tcb` CLI**.

```bash
# a) Read what is already decided — this is the idempotency gate.
#    A present project record means someone already chose: skip to (d), do not re-ask.
#    `tcb config get isIntl` always prints something (default false), so it is a
#    comparison input here — not a "has anyone chosen yet" signal.
cat .cloudbase/project.json 2>/dev/null
tcb config get isIntl 2>/dev/null
```

If nothing is decided, ask the user **once** — or infer from the console domain / envId / an existing error. Do not guess.

```bash
# b) Record the decision in the PROJECT. Merge-write: existing envId / lang survive,
#    re-running is a no-op. 'node' is guaranteed here — the tcb CLI is an npm package,
#    so if tcb runs, node runs.
node -e 'const fs=require("fs"),p=".cloudbase/project.json";fs.mkdirSync(".cloudbase",{recursive:true});let o={};try{o=JSON.parse(fs.readFileSync(p,"utf8"))}catch{}o.site=process.argv[1];o.region=process.argv[2];fs.writeFileSync(p,JSON.stringify(o,null,2)+"\n")' intl ap-singapore

# Domestic: same command with   domestic ap-shanghai
# Write only schema fields (site / region / envId / lang) — do not invent keys.
```

```bash
# c) The CLI switch. Default to a per-command variable; it leaves no machine-wide state.
TCB_IS_INTL=true tcb login
TCB_IS_INTL=true tcb env list

# Persist globally ONLY when the user confirms this whole machine is an international-site
# machine. It is global: every domestic-site project on this machine inherits it.
tcb config set isIntl true      # bool literal — `tcb config get isIntl` echoes true/false
```

```bash
# d) Confirm the site actually took effect before doing anything else.
tcb config get isIntl
TCB_IS_INTL=true tcb env list   # an empty list here is the wrong-site symptom, not "no environments"
```

> ⚠️ `tcb login` succeeding and `tcb env list` returning empty means **wrong site**. Check `isIntl` before re-authenticating, before assuming the account owns no environments, and before retrying the login.

## Stage 2 — write the MCP config

Full per-client configs live in `mcp-setup.md`. The onboarding-specific rules:

- **International → prefer the remote endpoint** (`https://tcb-api.tencentcloud.com/mcp/v1`). OAuth covers login, nothing site-specific is written, and the record in Stage 1 stays authoritative for the local paths.
- **Local stdio** is the only path where the site must be declared in the client config (`TCB_SITE` / `TCB_REGION`). Add it when the client does not guarantee `cwd` = project root — the local server reads `.cloudbase/project.json` from `WORKSPACE_FOLDER_PATHS ?? cwd`.
- **If MCP tools are already live**, prefer `auth action=set_env` and let it persist the binding for you:

  ```
  auth action=set_env envId=<full-env-id> site=intl region=ap-singapore
  ```

  `envId` is **required** — `set_env` cannot write `site` alone (it returns `INVALID_ARGS`). Only explicitly-passed values are persisted, so a plain `set_env envId=...` stays side-effect-free.

## Stage 3 — first-session guidance

Say this **once**, in one short paragraph — not per step:

1. Which site was chosen.
2. What was persisted (project record, and whether the CLI switch was made global).
3. That MCP tools only appear **after a restart / reload** of the client.
4. That this session does not wait: continue on `tcb` CLI now (`cloudbase-cli` domain skills), and the restart unlocks MCP next time.

## Stage 4 — maintain and dispatch (the part that gets missed)

Onboarding is not a one-shot banner. It owns what happens on the **second**, **third**, and **restarted** sessions.

### Re-entry gate

Before management work, run the cheap three-way consistency probe. If all sources agree — **proceed silently**. No announcement, no re-ask, no repeated onboarding banner.

```bash
cat .cloudbase/project.json 2>/dev/null                                # project record
tcb config get isIntl 2>/dev/null                                      # CLI switch
# MCP live?  auth action=status  → site / env candidates
```

### Conflict arbitration

Never guess and never silently pick one. Reconcile, then re-ask at most once.

| Observation | Verdict | Action |
|---|---|---|
| Record and CLI switch both absent | undecided | Ask the user once → Stage 1 |
| Record says `intl`, `tcb config get isIntl` is `false` | the **CLI** will hit the domestic site — mismatch | Warn; offer the per-command `TCB_IS_INTL=true` first, global `tcb config set` only with confirmation |
| `isIntl` is `true`, record has no `site` | MCP falls back to `domestic` → login succeeds, env list empty | Write `site`/`region` into the record (Stage 1b) |
| Client `mcp.json` has `TCB_SITE=intl`, record says `domestic` | env wins — this project runs intl | Correct the env var to match the intended site; the record is not authoritative over env |
| Record exists but `region` alone is `ap-singapore` with no `site` | ambiguous | Write `site` explicitly |

### Post-handshake takeover

After the restart, when CloudBase MCP tools appear, **do not assume the site carried over**:

1. `auth action=status` — is there a bound env, and which site is it on?
2. If the env list is empty but `TCB_IS_INTL=true tcb env list` returns environments, the MCP session is on the wrong site → fix per the arbitration table, then tell the user to reload once more.
3. If it matches, mark the onboarding complete and switch back to MCP-first. Do not re-run Stage 1.

### Failure fallback

**MCP unavailable is a routing decision, not a blocker.** When the MCP server cannot come up at all (install fails, client has no MCP support, tools never load, no `npm`/`npx`):

- Finish the MCP config for the **next** session and say so.
- Complete the current work **entirely through `tcb` CLI** — `cloudbase-cli` → `core.md`, then the single matching domain reference. Login, env creation, database, functions, hosting, deploy all have a documented CLI path.
- Never recommend `tcb deploy`. Never stall waiting for a restart. Never hand the user a console-only dead end.

## Acceptance

The onboarding is done when all five hold:

1. **CLI-only bring-up** — from a clean machine state with no MCP, the agent settles the site using Bash + `tcb` alone and leaves `.cloudbase/project.json` with `site` (+ `region`).
2. **MCP config written** — the client config for the selected site is in place, and a restart yields CloudBase MCP tools bound to that site.
3. **First session is guided** — the user is told the site, what was persisted, and that a restart is required; the session does not block on it.
4. **Maintained** — a re-entry with consistent sources skips silently; a planted conflict (record `intl` vs `isIntl=false`) is detected and reconciled, not ignored.
5. **CLI fallback is complete** — with MCP deliberately broken, the main flow (login → create env → deploy) still completes on the CLI.

Checkable forms:

```bash
# decision recorded, and it is a legal site value
test -f .cloudbase/project.json
node -e 'const s=require("./.cloudbase/project.json").site;process.exit(s==="intl"||s==="domestic"?0:1)'

# both sides readable, so they can be compared at all (mismatch → §Conflict arbitration)
node -e 'console.log(JSON.parse(require("fs").readFileSync(".cloudbase/project.json","utf8")).site)'
tcb config get isIntl
```

Item 5 (CLI fallback) is verified by breaking MCP on purpose — disable the server in the client config and confirm the main flow still completes; it cannot be asserted from a file.

## Related

- `mcp-setup.md` — per-client MCP configs, plugin install, target IDs.
- `tooling-fallback.md` — MCP-vs-CLI decision tree and the site switch table.
- `cloudbase-cli` skill — the CLI domain references used by the fallback path.
