# Verification & Final Report

## Post-push CI verification

After pushing each fix and creating a PR, verify CI:

```bash
# Wait ~2 minutes for CI to trigger
gh pr checks <number>
```

### CI status handling

| Status | Action |
|--------|--------|
| ✅ All checks pass | Mark PR as verified, move to next issue |
| ❌ Check failed | Re-enter worktree, diagnose, fix, push again |
| ⏳ Pending | Wait and re-check in 2 minutes |
| ⚠️ Some checks skipped | OK if skipped checks are env-dependent (e.g., cloud API tests) |

### Re-fix loop

If CI fails after your push:

1. Read the failure log:
   ```bash
   gh run list --branch fix/<slug>-<N> --limit 1 --json databaseId --jq '.[0].databaseId'
   gh run view <run-id> --log-failed 2>/dev/null | tail -100
   ```

2. Re-enter the worktree:
   ```bash
   cd ../<repo>-audit-fix-<N>
   ```

3. Fix, verify locally, commit, push again.
4. Maximum 3 retry loops per issue. If still failing, note it in the report.

## Final audit report

After all issues are processed, generate a comprehensive report:

```markdown
# Codebase Audit Report — <date>

## Executive summary

- Files reviewed: N
- Total findings: N (Critical: X, High: Y, Medium: Z, Low: W)
- GitHub issues created: N
- PRs submitted: N
- PRs verified (CI passing): N

## Issues & PRs

| Issue | PR | Title | Severity | Status |
|-------|-----|-------|----------|--------|
| #101 | #201 | Path traversal fixes | Critical | ✅ CI passing |
| #102 | #202 | Error handling gaps | High | ✅ CI passing |
| #103 | — | Architecture concern | Medium | 📋 Issue only (needs discussion) |

## Findings not actioned

These findings were identified but not fixed in this session:

| Finding | Reason |
|---------|--------|
| <description> | Requires architectural decision |
| <description> | Low priority, deferred |

## Recommendations

1. <Strategic recommendation based on patterns observed>
2. <Process improvement suggestion>
3. <Areas to watch in future audits>
```

## Report delivery

1. Save the report to the workspace (e.g., `specs/audit-<date>/report.md`).
2. Present it to the user via `open_result_view`.
3. Summarize key metrics in the chat message.

## Audit completeness checklist

Before declaring the audit complete:

- [ ] All files in scope were reviewed (not sampled)
- [ ] All Critical and High findings have GitHub issues
- [ ] All actionable issues have PRs submitted
- [ ] All PRs have CI verification (pass or documented failure)
- [ ] Worktrees are cleaned up
- [ ] Final report is generated and presented
- [ ] User has been informed of any findings that need human judgment
