# Issue #850 / #851 + PR #852 / #853 merge review

Date: 2026-08-03

## Latest items

| Item | Title | Verdict |
|------|-------|---------|
| Issue [#850](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/issues/850) | P1: `applyMigration` false success | Valid product bug |
| Issue [#851](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/issues/851) | P2: `createApiKey` false success | Valid product bug |
| PR [#852](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/pull/852) | AI fix for #850 | Merged |
| PR [#853](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/pull/853) | AI fix for #851 | Merged |

## Merge decision

Both PRs were mergeable and address real false-success UX bugs that mislead AI agents.

### PR #853 (createApiKey) — merged as-is
- Detects key reuse via before/after inventory
- Returns server-side `keyName`/`expireAt` instead of echoing request params
- Adds `created` + `warnings` when `keyName`/`expireIn` are ignored
- Unit tests cover created=true / created=false / inventory-failure paths (28/28 pass)

### PR #852 (applyMigration) — hardened then merged
- Original AI fix: verify remote migration history after Push, fail with `MIGRATION_NOT_APPLIED`
- Residual risk: Push returns TaskId (async); single immediate list could false-negative
- ATO hardening before merge: retry list up to 4 times with 1.5s delay; fail closed only after retries
- Unit tests 38/38 pass (fake timers on fail paths)

## Residual gaps (not blocking merge)

1. **#850 root cause** still unknown: why `PushPGUserMigrations` returns TaskId but never lands. This PR is fail-closed detection, not a backend fix.
2. **#851** does not make `publish_key` multi-key / expireIn work if the platform only supports one publishable key per env — it correctly surfaces that limitation.
3. Suggested follow-up: investigate PushPGUserMigrations request payload / task status API for true apply failures.

## Actions taken

1. Reviewed diffs + CI (CodeQL green; Compat/Publish were `action_required` only)
2. Local vitest on both PR heads
3. Squash-merged #853 then #852 (after rebase onto main; added retry hardening to #852)
4. Issues auto-closed via `Fixes #N` in PR bodies
