---
name: pr-review-fix
description: Periodically analyze open pull requests for CI failures, code review feedback, and quality issues, then fix them in batch. Use this skill when the user asks to check PR status, triage CI failures, fix review comments, analyze open PRs, or run a scheduled PR health check across the repository.
alwaysApply: false
---

# PR Review & Fix

Systematically analyze open pull requests for CI failures, code review feedback, and code quality issues — then fix them efficiently.

## When to use this skill

Use this skill when you need to:

- Check the status of all open PRs (CI, reviews, conflicts)
- Triage and fix CI build/test failures on PR branches
- Address code review feedback (reviewer comments, requested changes)
- Run a scheduled health check across all open PRs
- Fix multiple PRs in a single session without losing context

**Do NOT use for:**

- Creating new PRs or new features
- Merging PRs (that's a manual decision)
- General code refactoring unrelated to PR feedback
- Reviewing code as a reviewer (this skill is for *responding* to reviews)

## Workflow

### Phase 1 — Discovery

1. Read `references/discovery.md` for the full discovery procedure.
2. Fetch the list of open PRs from GitHub:
   ```bash
   gh pr list --state open --json number,title,headRefName,statusCheckRollup,reviewDecision,mergeable --limit 30
   ```
3. For each PR, classify its health status:
   - **🔴 CI Failed** — at least one required check failed
   - **🟡 Changes Requested** — reviewer left requested changes
   - **🟢 Healthy** — CI passing + approved or no review yet
   - **⚪ Conflict** — merge conflicts detected

### Phase 2 — Triage

1. Read `references/triage.md` for prioritization rules.
2. Prioritize by severity: CI failures > review changes > conflicts.
3. For each failing PR, identify root cause category:
   - **Build error** — TypeScript/webpack compilation failure
   - **Test failure** — vitest/jest test assertion or timeout
   - **Lint/type error** — ESLint, type-check, or format issues
   - **Review feedback** — code style, logic, security, or design concerns
4. Present a summary table to the user before proceeding to fixes.

### Phase 3 — Fix

1. Read `references/fix-workflow.md` for the fix procedure.
2. For each PR to fix (in priority order):
   a. Stash current work: `git stash`
   b. Check out the PR branch: `git checkout -B <branch> github/<branch>`
   c. Reproduce the issue locally (build, test, or lint)
   d. Apply the fix
   e. Verify locally: build → test → lint
   f. Commit with conventional-changelog format: `fix(<scope>): 🔧 <description>`
   g. Push: `git push github <branch>`
   h. Return to original branch: `git checkout <original> && git stash pop`
3. After all fixes, present a completion summary.

### Phase 4 — Verify

1. After pushing fixes, wait 1-2 minutes for CI to trigger.
2. Check CI status for each fixed PR:
   ```bash
   gh pr checks <number>
   ```
3. If CI still fails, loop back to Phase 3 for that PR.

## Routing

| Task | Read |
| --- | --- |
| Discover and list open PR status | `references/discovery.md` |
| Prioritize which PRs to fix first | `references/triage.md` |
| Execute fixes on PR branches | `references/fix-workflow.md` |
| Understand project CI pipeline | `references/ci-pipeline.md` |
| Common fix patterns and recipes | `references/fix-recipes.md` |

## Git safety rules

- **Never force-push** to a PR branch unless explicitly asked.
- **Never amend** commits that are already pushed.
- **Always stash** before switching branches.
- **Always verify** build + test locally before pushing.
- **One commit per fix session** — keep the diff reviewable.

## Commit conventions

Follow the project's conventional-changelog format:

```
fix(<scope>): 🔧 <english description>
```

Where `<scope>` is the affected module (e.g., `cloudrun`, `security`, `code-quality`, `test`).

## Minimum self-check

- Did you fetch the latest remote state before analyzing?
- Did you reproduce the failure locally before attempting a fix?
- Did you verify build + test pass after applying the fix?
- Did you switch back to the original branch after each fix?
- Did you present a clear summary of what was fixed and what remains?
