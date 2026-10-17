# Multi-Environment Deploy

## mode + envOverrides

Pass `mode` (e.g. `production`, `staging`) to merge the matching `envOverrides.<mode>`
block into the base config. When no `mode` is passed, the base config is used untouched
and `envOverrides` is not applied.

```jsonc
{
  "envId": "env-base",
  "functions": [ { "name": "api" } ],
  "envOverrides": {
    "staging":    { "envId": "env-staging" },
    "production": { "envId": "env-prod" }
  }
}
```

- `deployPlan({ mode: "staging" })` → effective `envId` becomes `env-staging`, and the
  merged config no longer carries the raw `envOverrides` block.
- `deployPlan({})` (no mode) → `envId` stays `env-base`, `envOverrides` untouched.

## envId resolution priority

```
explicit envId param  >  (merged) cloudbaserc envId  >  logged-in / bound environment
```

1. If the tool is called with an explicit `envId`, it wins over everything.
2. Otherwise the `envId` in the (mode-merged) config is used.
3. Otherwise the current MCP login / bound environment is used.
4. If none resolve, the tool errors:
   > 未能确定部署环境 ID：请在 cloudbaserc 配置 envId、通过 envId 参数指定，或先登录并绑定环境。

**Always confirm the resolved envId with the user before applying to production.** An
explicit `envId` param lets you deploy an `envId`-less config against a chosen environment
without editing the config file.

## Env-specific variables

The parser loads `.env`, `.env.local`, and `.env.<mode>` from the project root and renders
`{{env.*}}` / `{{tcb.*}}` template variables in the config. Use `.env.<mode>` to supply
per-environment values (keys, endpoints) without duplicating whole config blocks.

Keep all secrets in env files; never hard-code them in `cloudbaserc`.

## Typical multi-env flow

```
# preview staging
deployPlan({ mode: "staging" })
# apply staging
deployApply({ confirm: true, mode: "staging" })

# preview production (confirm envId with user first)
deployPlan({ mode: "production" })
# apply production
deployApply({ confirm: true, mode: "production" })
```
