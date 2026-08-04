# PG Environment Function Permission Gap — Verification Report

**Task:** fb332a2b  
**Date:** 2026-08-04  
**Env under test:** `ai-native-d1ggefhgb8c27e3e8` (RuntimeMode=`postgresql`)  
**Workspace test dir:** `/tmp/pg-scf-perm-test`

## Verdict

Customer feedback is **confirmed**. In PostgreSQL environments:

1. Platform APIs `ModifyResourcePermission` / `DescribeResourcePermission` return  
   `The current API does not support PostgreSQL type environments.`
2. MCP `managePermissions` / `queryPermissions` for `resourceType=function` previously surfaced that error and **could not** change function security rules.
3. Function security rules still exist and are enforced on the SDK `callFunction` path. The working control-plane entry is `ModifySecurityRule` / `DescribeSecurityRule`.
4. Guess that "default denies anonymous" is **directionally correct** for SDK/callFunction (docs recommend `"auth.loginType != 'ANONYMOUS' && auth != null"`). HTTP Access Service with gateway `EnableAuth=false` is a **separate** gate and can still return 200 even when function security rules are restrictive.

## Reproduction steps (executed)

| Step | Action | Result |
|------|--------|--------|
| 1 | `envQuery info` on `ai-native-*` | `RuntimeBackends.postgresql=true` |
| 2 | Create HTTP function `atoPgPermProbe` under `/tmp/pg-scf-perm-test` | Success |
| 3 | `queryPermissions(getResourcePermission, function)` | **FAIL** PG unsupported |
| 4 | `managePermissions(updateResourcePermission, function, CUSTOM)` | **FAIL** PG unsupported |
| 5 | `callCloudApi ModifySecurityRule` with `{"*":{"invoke":true}}` | **OK** |
| 6 | `callCloudApi DescribeSecurityRule` | Returns applied rule |
| 7 | `manageGateway createRoute` + anonymous HTTP GET | **200** (gateway auth off) |
| 8 | Same DescribeResourcePermission against NoSQL env `ai-9gra12b5b6a3c966` | **OK** (API works on non-PG) |

## Root cause

```
Agent → managePermissions(resourceType=function)
     → manager-node permission.modifyResourcePermission
     → tcb ModifyResourcePermission
     → ❌ rejected on PostgreSQL environments

Needed path:
Agent → ModifySecurityRule / DescribeSecurityRule
     → env-level JSON {"*":{"invoke":...},"<fn>":{"invoke":...}}
```

This is a **platform API gap**, not an MCP-only invent. MCP previously had no fallback, so agents got stuck exactly where the customer reported ("卡在设置权限").

## Distinction: gateway auth vs function security rules

- Gateway `auth=false` / `EnableAuth=false`: path-level gateway auth.
- Function security rules (`ModifySecurityRule`): env-level invoke ACL for client `callFunction` (and related client paths). Docs: not applied to admin invoke / timers.
- Observed: with `EnableAuth=false`, anonymous HTTP to WEB_SCF still returned 200 after setting `"*":{"invoke":false}` — so "can't call cloud function" in PG is often the **permission-tool blockage** (agent can't finish the documented post-create step), not necessarily HTTP gateway denial.

## Fix shipped

`mcp/src/tools/permissions.ts` PG fallback for `resourceType=function`:

1. First attempt (same as before): `ModifyResourcePermission` / `DescribeResourcePermission`
2. On PG rejection, **align with CLI `tcb policy`**:
   - write → Manager SDK `permission.modifyEnvAuthzConfig({ key: "authz.user.rego", value })`
   - read → Manager SDK `permission.describeEnvAuthzConfig({ key: "authz.user.rego" })`
3. `securityRule='{"invoke":true}'` is translated into a CLI-style public-functions Rego allow for `anonymous` + `unauthenticated`
4. Raw Rego starting with `package authz.user` is passed through

Live-verified on PG env via `callCloudApi` `ModifyEnvConfig` / `DescribeEnvConfig` (same CAPI the SDK wraps).

### Not the same as ModifySecurityRule

Earlier investigation also proved `ModifySecurityRule` works on PG, but CLI's official migration path is OPA (`tcb policy`), so MCP now follows that.

## Follow-up (2026-08-04 ATO re-check)

- Published npm MCP still returns `ModifyResourcePermission` PG unsupported on `ai-native-*` — fix not released yet.
- Env Meta confirms `authz_engine=opa`.
- Related: HTTP gateway route create → first HTTP 200 in **~1s** on the same env; MCP/skill wait copy reduced from “30s–3min” accordingly (same task).

