# Plan → Apply: deployPlan & deployApply

Two MCP tools implement the declarative flow. **Always run `deployPlan` first.**

## deployPlan (read-only dry-run)

Parses `cloudbaserc`, validates it, resolves `envId`, and computes the plan **without
making any change**.

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

## Recommended sequence

```
1. deployPlan({ cwd, mode?, envId?, only?, skip?, yes? })
2. Review plan; resolve any `conflict`; complete Deployment Gate declaration.
3. deployApply({ confirm: true, cwd, mode?, envId?, only?, skip?, yes?, concurrency?, continueOnError?, confirmDestructive? })
4. Report the returned result.
```

Keep `mode` / `envId` / `only` / `skip` identical between plan and apply so the applied
change matches the previewed plan.
