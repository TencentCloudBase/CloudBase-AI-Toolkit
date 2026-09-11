# Build → Plan → Apply: deployBuild, deployPlan & deployApply

Three MCP tools implement the declarative flow. **Build first when hosting needs it,
then always run `deployPlan` before applying.**

## deployBuild (local hosting build)

Parses `cloudbaserc`, and for every `hosting` item that resolves a `buildCommand`
(explicit config > framework mapping > package.json auto-detection) executes that
command locally. It does **not** install dependencies and does **not** upload.

Parameters:

| param | type | notes |
|-------|------|-------|
| `cwd` | string? | project root; defaults to current working dir |
| `mode` | string? | env name; merges `envOverrides.<mode>` when matched |

Notes:

- Pure-static `hosting` items (no `buildCommand`) are skipped — nothing to build.
- No `envId` resolution and no login required: it never calls the cloud.
- A missing `node_modules` when `package.json` declares dependencies fails with
  `DEPENDENCY_NOT_INSTALLED` (run install first; `deployBuild` never installs for you).
- A failed build command fails with `BUILD_FAILED`.
- `deployApply` no longer runs hosting builds implicitly: after source changes, run
  `deployBuild` again so the uploaded artifact is fresh.

## deployPlan (read-only dry-run)

Parses `cloudbaserc`, validates it, resolves `envId`, and computes the plan **without
making any change**.

> `deployBuild` / `deployPlan` / `deployApply` are local-form tools. In cloud-hosted MCP
> mode they are intentionally not registered; use the cloud upload-channel fallback
> below.

Parameters:

| param | type | notes |
|-------|------|-------|
| `cwd` | string? | project root; defaults to current working dir |
| `mode` | string? | env name; merges `envOverrides.<mode>` when matched |
| `envId` | string? | overrides the cloudbaserc `envId`; else config value or bound env |
| `only` | (database\|functions\|app\|hosting\|gateway)[]? | compute plan for these only |
| `skip` | same enum[]? | skip these resource types |
| `yes` | boolean? | align with `deployApply` `yes`: recompute the effective action for existing functions. `false` (default) previews them as `skip`; `true` previews them as `update` |

Returns `{ cwd, mode, envId, yes, plan }` where `plan` is a list of entries like:

```json
{ "type": "functions", "name": "fn-a", "status": "create", "action": "新建" }
```

The plan is already reconciled to the *actual* action `deployApply` would take: with
`yes` unset, an already-existing function is reported as `skip` (with `declaredStatus:
"update"` preserved), so the preview never contradicts the execution.

See `SKILL.md` for the meaning of each `status` (create / update / skip / conflict / deploy).

## deployApply (destructive write)

Applies the plan in dependency order: database → functions → app → hosting → gateway.
This is the **local-form apply** (reads the local `cloudbaserc` and builds the upload
artifact locally); it is the execution counterpart of `deployPlan`.

Parameters:

| param | type | notes |
|-------|------|-------|
| `confirm` | boolean | **required `true`**, otherwise the call is rejected |
| `confirmDestructive` | boolean? | **required `true`** when a pending database migration contains destructive SQL (DROP/TRUNCATE/DELETE, ALTER…DROP/RENAME); otherwise the call is rejected and lists the offending migrations. No effect when no destructive migration is pending |
| `cwd` | string? | project root; defaults to current working dir |
| `mode` | string? | env name; merges `envOverrides.<mode>` |
| `envId` | string? | overrides cloudbaserc `envId`; else config value or bound env |
| `only` | enum[]? | deploy only these resource types |
| `skip` | enum[]? | skip these resource types |
| `yes` | boolean? | on existing resource: `true`=overwrite/update; `false` (default)=skip conservatively |
| `concurrency` | int ≥ 1? | max parallelism for same-type resources; default 1 (serial) |
| `continueOnError` | boolean? | keep going after a non-database failure; database failure always aborts |

### Safety rules

- Without `confirm=true`, `deployApply` throws and does nothing — this is intentional.
- A pending destructive database migration additionally requires `confirmDestructive=true`
  on top of `confirm=true`; back up or review first.
- `yes=false` (default) never overwrites existing resources in a non-interactive context.
- `concurrency` only parallelizes within one resource type; cross-type order is preserved.
- A database-stage failure aborts the whole deploy even with `continueOnError=true`.

## Build-first mental model

Do not model declarative deploy as only `plan → apply`. Operationally, use:

```text
build → plan → apply
```

Where build runs depends on resource and path:

- `hosting`: run `deployBuild` first (local build when `buildCommand` exists), then
  `deployApply` uploads the artifacts. A missing output aborts apply with
  `BUILD_OUTPUT_NOT_FOUND` and directs you back to `deployBuild`
- `app` (`framework=static`): local/prebuilt artifacts uploaded directly
- `app` (non-static): source package uploaded, cloud pipeline builds and deploys
- `functions`: path depends on `buildStrategy` (`zip`/`cloud`/`local`/`image`)

## Cloud-hosted upload pipeline path (not local-form deployPlan/deployApply)

In cloud-hosted MCP mode, `deployBuild` / `deployPlan` / `deployApply` are intentionally not
registered.
Treat this as an **execution-channel switch**, not a change in declarative intent.

Use this supported cloud path:

1. `queryApps(action=getUploadUrl)` to receive `uploadUrl`, `uploadHeaders`, `unixTimestamp`
2. Upload source/build package zip to `uploadUrl` using returned headers
3. `manageApps(action=deployApp, cosTimestamp=<unixTimestamp>, installCmd?, buildCmd?, deployCmd?)`

`installCmd` / `buildCmd` / `deployCmd` are pipeline declarations (staticCmd) executed by
cloud build container. Agent behavior in cloud mode is: pass artifact + declarations,
not run local shell commands.

### Packaging note: `node_modules`

Upload packaging strategy depends on path:

- `app` non-static (source upload → cloud build): may need to include `node_modules`
  for private/offline dependencies
- `app` static prebuilt artifact upload: normally exclude `node_modules`
- bare `uploadCode`-like defaults are often exclude-first; include explicitly when required

Rule of thumb: if cloud install can resolve dependencies from registry using lockfile,
you can upload source + lockfile; if dependencies are private/offline/non-resolvable,
package required modules explicitly.

Key constraints in cloud-hosted mode:

- No local `cwd` probing for deploy execution
- No local filesystem-bound build/apply executor
- Build runs in cloud pipeline or is replaced by prebuilt artifact upload

This path deploys by package artifact (not local path).

## Recommended sequence (local mode)

```
1. deployBuild({ cwd, mode? })                            # only when hosting has a buildCommand
2. deployPlan({ cwd, mode?, envId?, only?, skip?, yes? })
3. Review plan; resolve any `conflict`; complete Deployment Gate declaration.
4. deployApply({ confirm: true, cwd, mode?, envId?, only?, skip?, yes?, concurrency?, continueOnError?, confirmDestructive? })
5. Report the returned result.
```

If `deployApply` fails with `BUILD_OUTPUT_NOT_FOUND`, you skipped step 1: run
`deployBuild` (after installing dependencies if it reports `DEPENDENCY_NOT_INSTALLED`),
then retry apply.

Keep `mode` / `envId` / `only` / `skip` identical between plan and apply so the applied
change matches the previewed plan.
