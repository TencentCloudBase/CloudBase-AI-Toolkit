---
name: cloudbase-declarative-deploy
description: CloudBase declarative deployment from a cloudbaserc config (声明式部署, 配置式部署, cloudbaserc 部署) through the deployBuild / deployPlan / deployApply MCP tools. Use when deploying database, functions, app, hosting, or gateway resources described in cloudbaserc.json/yaml as a single desired-state config, when a user wants to build static hosting artifacts locally first (deployBuild), or wants a dry-run plan before applying (deployPlan), or when handling multi-environment deploys via mode / envOverrides. Covers build-plan-apply flow (deployBuild local build → deployPlan dry-run → deployApply confirm=true), hosting build-output neutralization, envId resolution priority, only/skip filtering, concurrency, and continueOnError. Prefer deployBuild (when hosting declares a buildCommand) and deployPlan before deployApply; do not confuse with per-resource tcb CLI deploy or single-function deploy.
version: 2.33.3
alwaysApply: false
---

# CloudBase Declarative Deploy

Deploy a whole CloudBase project from one `cloudbaserc` config as **desired state**,
using the `deployBuild` (local hosting build), `deployPlan` (dry-run) and `deployApply`
(apply) MCP tools. The orchestrator applies resources in a fixed dependency order:

```
database → functions → app → hosting → gateway
```

## Sibling skills (local only)

Sibling CloudBase skills ship beside this skill. Use local relative paths such as
`../cloudbase-cli/SKILL.md`.

Cloud-hosted MCP mode does not guarantee access to a local workspace filesystem or
stable relative paths. If a referenced sibling file is not available in cloud mode,
use this skill's embedded guidance as source of truth and ask the user for any
missing constraints (or to install the missing skill). Do **not** HTTP-fetch remote skill or protocol markdown into the agent context.

**Cross-cutting protocols** (required before applying any deploy):
- Change Safety Protocol: `../cloudbase-platform/references/protocols/change-safety-protocol.md`
- Deployment Gate: `../cloudbase-platform/references/protocols/deployment-gate.md`

## When to use this skill

- The project has a `cloudbaserc.json` / `.yaml` / `.yml` / `.js` describing multiple
  resources, and the user wants to deploy them together as one config.
- The user asks for 声明式部署 / 配置式部署 / "deploy from cloudbaserc" / "deploy the whole project".
- The user wants to preview what a deploy will change before applying (dry-run plan).
- The user wants to build the static hosting artifact locally first (declarative
  hosting deploys no longer build implicitly — see `deployBuild`).
- Multi-environment deploy: production/staging via `mode` + `envOverrides`.

## Do NOT use for

- Deploying a single cloud function or one static site via `tcb` CLI → `../cloudbase-cli/SKILL.md`.
- In-app SDK integration (web/miniprogram/node) → the matching SDK skill.
- Console UI operations.

## Cloud mode

`deployBuild` / `deployPlan` / `deployApply` in this skill are the **local-form declarative
executor**. In cloud-hosted MCP mode these tools are intentionally not registered
(filtered at tool registration), because that runtime has no local `cwd` /
filesystem-bound execution path.

If you are in cloud mode and do not see `deployBuild` / `deployPlan` / `deployApply` in the
tool list, this is expected behavior.

Use the cloud upload-channel path instead:

1. `queryApps(action=getUploadUrl)` to get `uploadUrl`, `uploadHeaders`, `unixTimestamp`
2. Upload source/build zip to `uploadUrl` with returned headers
   - If cloud build requires private/offline dependencies, package `node_modules` explicitly
   - For public dependencies, uploading `package.json` + lockfile is typically enough
3. `manageApps(action=deployApp, cosTimestamp=<unixTimestamp>, installCmd?, buildCmd?, deployCmd?)`
   - `installCmd` / `buildCmd` / `deployCmd` are pipeline declarations executed in cloud container
   - Agent passes data + declarations; it does not execute local shell commands

Planned cloud declarative path (incremental roadmap): upload `cloudbaserc` as a data
artifact, then run server-side plan/apply orchestration. `deployApply` remains the
local-form executor of the same declarative spec.

For parameter details, see `references/plan-and-apply.md` (`Cloud-hosted upload pipeline path`).

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

## Local workflow (build → plan → apply)

When `hosting` declares a `buildCommand`, declarative deploy is a three-step flow —
`deployApply` no longer runs the local build implicitly:

1. Ensure a `cloudbaserc` config exists under the project root (`cwd`).
2. **Build first** (only when `hosting` has a `buildCommand`): call
   `deployBuild({ cwd, mode? })` to produce the local artifacts (builds every hosting
   item; pure-static items without a build command are skipped automatically).
   - If the build artifacts are missing at apply time, `deployApply` fails with
     `BUILD_OUTPUT_NOT_FOUND` and directs you back to this step — call `deployBuild`
     first, then retry.
   - `deployBuild` needs no `envId` and no `confirm` (local build only, never touches
     cloud resources); if dependencies are not installed it fails with
     `DEPENDENCY_NOT_INSTALLED` and tells you to run install first.
3. Call `deployPlan` (optionally with `mode`, `envId`, `only`, `skip`). Read the plan.
4. Present the plan + Deployment Gate declaration to the user; get confirmation.
5. Call `deployApply` with `confirm=true` (plus `yes` / `concurrency` / `continueOnError`
   as needed). Reuse the same `mode` / `envId` / `only` / `skip` as the plan.
   A hosting item with existing build output is uploaded directly (the tool clears
   the build command and reports `hostingNeutralized: true`); rebuild with `deployBuild`
   after source changes so the upload is not stale.
6. Report the applied result back to the user.

For cloud-hosted MCP mode, do not ask for local `cwd`/filesystem reads; use the
`Cloud mode` upload-channel flow above.

## Build & pipeline execution

Use this mental model: **build → plan → apply**. The build executor depends on resource type.

| resource | typical build executor | deployment path |
|----------|------------------------|-----------------|
| `hosting` | `deployBuild` (local shell build, run **before** apply) | `deployApply` uploads the built output directly; missing output → `BUILD_OUTPUT_NOT_FOUND` |
| `app` (`framework=static`) | local prebuilt artifact | package upload + deploy record |
| `app` (non-static frameworks) | cloud pipeline | source zip upload + cloud build + deploy |
| `functions` | local zip / cloud build / image pipeline | depends on `buildStrategy` (`zip`/`cloud`/`local`/`image`) |

`deployBuild` builds every `hosting` item that has a `buildCommand` (framework mapping or
package.json auto-detection); it skips pure-static items. Build failures surface as
`BUILD_FAILED`, missing local dependencies as `DEPENDENCY_NOT_INSTALLED` (run install
first — `deployBuild` never installs dependencies for you).

Build command resolution follows declaration priority:

`explicit config` > `framework mapping defaults` > `package.json` auto-detection

`buildCommand` / `installCommand` / `deployCmd` are declarative intent in config.
Execution ownership depends on path:

- local-form paths: specific steps may run in local shell executor
- cloud-hosted paths: commands are executed by cloud pipeline container (staticCmd),
  or replaced by prebuilt artifact upload

So the answer to "can cloud mode run local CLI commands" is: execution authority is
moved from local shell to cloud pipeline; agent transmits declarations and artifacts.

## Routing

| User task | Read |
|-----------|------|
| cloudbaserc resource fields & desired-state config shape | `references/config-schema.md` |
| deployPlan → deployApply two-step flow, parameters, safety | `references/plan-and-apply.md` |
| Multi-env (mode / envOverrides), envId priority, env vars | `references/multi-env.md` |

## Minimum self-check

- [ ] Built the hosting artifacts first (`deployBuild`) when `hosting` declares a `buildCommand`?
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
