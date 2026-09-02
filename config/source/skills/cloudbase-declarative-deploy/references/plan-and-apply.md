# Plan → Apply: deployPlan & deploy

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

Returns `{ cwd, mode, envId, plan }` where `plan` is a list of entries like:

```json
{ "type": "functions", "name": "fn-a", "status": "create", "action": "新建" }
```

See `SKILL.md` for the meaning of each `status` (create / update / skip / conflict / deploy).

## deploy (destructive write)

Applies the plan in dependency order: database → functions → app → hosting → gateway.

Parameters:

| param | type | notes |
|-------|------|-------|
| `confirm` | boolean | **required `true`**, otherwise the call is rejected |
| `cwd` | string? | project root; defaults to current working dir |
| `mode` | string? | env name; merges `envOverrides.<mode>` |
| `envId` | string? | overrides cloudbaserc `envId`; else config value or bound env |
| `only` | enum[]? | deploy only these resource types |
| `skip` | enum[]? | skip these resource types |
| `yes` | boolean? | on existing resource: `true`=overwrite/update; `false` (default)=skip conservatively |
| `concurrency` | int ≥ 1? | max parallelism for same-type resources; default 1 (serial) |
| `continueOnError` | boolean? | keep going after a non-database failure; database failure always aborts |

### Safety rules

- Without `confirm=true`, `deploy` throws and does nothing — this is intentional.
- `yes=false` (default) never overwrites existing resources in a non-interactive context.
- `concurrency` only parallelizes within one resource type; cross-type order is preserved.
- A database-stage failure aborts the whole deploy even with `continueOnError=true`.

## Recommended sequence

```
1. deployPlan({ cwd, mode?, envId?, only?, skip? })
2. Review plan; resolve any `conflict`; complete Deployment Gate declaration.
3. deploy({ confirm: true, cwd, mode?, envId?, only?, skip?, yes?, concurrency?, continueOnError? })
4. Report the returned result.
```

Keep `mode` / `envId` / `only` / `skip` identical between plan and apply so the applied
change matches the previewed plan.
