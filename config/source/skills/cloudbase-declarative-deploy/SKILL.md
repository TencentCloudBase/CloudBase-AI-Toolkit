---
name: cloudbase-declarative-deploy
description: CloudBase declarative deployment from a cloudbaserc config (声明式部署, 配置式部署, cloudbaserc 部署) through the deployApply / deployPlan MCP tools. Use when deploying database, functions, app, hosting, or gateway resources described in cloudbaserc.json/yaml as a single desired-state config, when a user wants a dry-run plan before applying, or when handling multi-environment deploys via mode / envOverrides. Covers plan-then-apply flow (deployPlan dry-run → deployApply confirm=true), envId resolution priority, only/skip filtering, concurrency, and continueOnError. Prefer deployPlan before deployApply; do not confuse with per-resource tcb CLI deploy or single-function deploy.
version: 1.0.0
alwaysApply: false
---

# CloudBase Declarative Deploy

Deploy a whole CloudBase project from one `cloudbaserc` config as **desired state**,
using the `deployPlan` (dry-run) and `deployApply` (apply) MCP tools. The orchestrator
applies resources in a fixed dependency order:

```
database → functions → app → hosting → gateway
```

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as
`../cloudbase-cli/SKILL.md`. If a referenced sibling file is missing, ask the user to
install the full CloudBase plugin — do not HTTP-fetch remote skill markdown.

**Cross-cutting protocols** (required before applying any deploy):
- Change Safety Protocol: `../cloudbase-platform/references/protocols/change-safety-protocol.md`
- Deployment Gate: `../cloudbase-platform/references/protocols/deployment-gate.md`

## When to use this skill

- The project has a `cloudbaserc.json` / `.yaml` / `.yml` / `.js` describing multiple
  resources, and the user wants to deploy them together as one config.
- The user asks for 声明式部署 / 配置式部署 / "deploy from cloudbaserc" / "deploy the whole project".
- The user wants to preview what a deploy will change before applying (dry-run plan).
- Multi-environment deploy: production/staging via `mode` + `envOverrides`.

## Do NOT use for

- Deploying a single cloud function or one static site via `tcb` CLI → `../cloudbase-cli/SKILL.md`.
- In-app SDK integration (web/miniprogram/node) → the matching SDK skill.
- Console UI operations.

## Core principles

1. **Plan before apply — always.**
   Run `deployPlan` first (dry-run, zero side effects). Read the per-resource action
   classification and show it to the user before calling `deployApply`.

2. **Apply requires explicit confirm.**
   `deployApply` will refuse unless `confirm=true` is passed. This is the destructive-write guard.

3. **Deployment Gate.**
   Before any apply, complete `cloudbase-platform/references/protocols/deployment-gate.md`
   and present the mandatory declaration.

4. **Conservative on existing resources by default.**
   `yes` defaults to `false` → existing resources are skipped, not overwritten. Only pass
   `yes=true` when the user explicitly wants to overwrite/update existing resources.

5. **database failure always aborts.**
   Even with `continueOnError=true`, a database-stage failure stops the whole deploy,
   because later resources depend on it.

6. **Resolve envId explicitly.**
   Never rely on implicit defaults silently — know which environment is targeted (see
   the priority table below) and confirm it with the user before applying.

## Plan action classification

`deployPlan` returns a list of resource entries. Each `status` means:

| status | meaning |
|--------|---------|
| `create` | new resource, will be created |
| `update` | exists, will be overwritten/updated |
| `skip` | no change needed |
| `conflict` | conflict detected — deploy will abort, must resolve first |
| `deploy` | direct overwrite upload |

If any entry is `conflict`, stop and resolve it before applying.

## envId resolution priority

```
explicit envId param  >  cloudbaserc `envId`  >  logged-in / bound environment
```

If none can be resolved, the tool errors out. Prefer confirming the resolved envId
with the user before applying to production.

## Two-step workflow (for a coding agent)

1. Ensure a `cloudbaserc` config exists under the project root (`cwd`).
2. Call `deployPlan` (optionally with `mode`, `envId`, `only`, `skip`). Read the plan.
3. Present the plan + Deployment Gate declaration to the user; get confirmation.
4. Call `deployApply` with `confirm=true` (plus `yes` / `concurrency` / `continueOnError`
   as needed). Reuse the same `mode` / `envId` / `only` / `skip` as the plan.
5. Report the applied result back to the user.

## Routing

| User task | Read |
|-----------|------|
| cloudbaserc resource fields & desired-state config shape | `references/config-schema.md` |
| deployPlan → deployApply two-step flow, parameters, safety | `references/plan-and-apply.md` |
| Multi-env (mode / envOverrides), envId priority, env vars | `references/multi-env.md` |

## Minimum self-check

- [ ] Ran `deployPlan` and read the action classification before `deployApply`?
- [ ] Resolved and confirmed the target `envId`?
- [ ] Completed the Deployment Gate declaration before applying?
- [ ] Passed `confirm=true` only after user confirmation?
- [ ] Left `yes=false` unless overwrite of existing resources was explicitly requested?
- [ ] Handled any `conflict` entries before applying?

## Reference index

All packaged reference files (required for skill lint reachability):

- [config-schema.md](references/config-schema.md)
- [plan-and-apply.md](references/plan-and-apply.md)
- [multi-env.md](references/multi-env.md)
