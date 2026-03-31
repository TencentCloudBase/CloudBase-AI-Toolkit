---
name: codebase-audit
description: Perform a full codebase review, categorize findings by severity, file GitHub issues, then fix each issue in an isolated git worktree and submit PRs. Use this skill when the user asks to audit the codebase, do a comprehensive code review, find and fix security/quality/reliability issues, or run a proactive health check across the entire repository.
alwaysApply: false
---

# Codebase Audit → Issue → Worktree Fix → PR

End-to-end workflow: systematically review the entire codebase, report findings as GitHub issues, fix each issue in an isolated git worktree, and submit PRs — all in one session.

## When to use this skill

Use this skill when you need to:

- Perform a full code review / audit of the codebase
- Proactively find security vulnerabilities, logic bugs, or code quality problems
- Turn code review findings into tracked GitHub issues
- Fix each issue in isolation (worktree per issue) and submit PRs
- Run a periodic codebase health check with automated follow-through
- Audit and fix dependency security vulnerabilities (Dependabot alerts / npm audit)

**Do NOT use for:**

- Reviewing or fixing a single known bug (use `systematic-debugging` or direct fix)
- Triaging existing open PRs (use `pr-review-fix`)
- Processing attribution issues (use `mcp-attribution-worktree`)
- Feature development or refactoring unrelated to audit findings

## Workflow

### Phase 1 — Review

1. Read `references/review-strategy.md` for the review scope and checklist.
2. Use the `code-explorer` subagent to read ALL source files in the target directory (default: `mcp/src/`).
3. For each file, systematically check against the review checklist:
   - **Security**: path traversal, injection, unvalidated input, hardcoded secrets, improper error exposure
   - **Error handling**: missing try-catch, swallowed errors, error messages leaking internals
   - **Type safety**: `as any`, unsafe casts, missing null checks
   - **Logic bugs**: race conditions, incorrect conditionals, unreachable code
   - **Code quality**: dead code, duplication, overly complex functions
   - **Resource leaks**: unclosed connections, missing cleanup
   - **API design**: inconsistent validation, missing required field checks
4. Record every finding with: file path, line number(s), category, severity (Critical/High/Medium/Low), description, and suggested fix.
5. **Dependency scan**: Read `references/dependency-audit.md` and run the Dependabot alert fetch + `npm audit` to discover vulnerable dependencies. Record each finding using the dependency-audit format.

### Phase 2 — Analyze & Classify

1. Read `references/classification.md` for severity definitions and grouping rules.
2. Deduplicate findings — merge instances of the same pattern across files.
3. Group findings into **fix batches** — related issues that should be fixed together in one PR.
4. Assign severity and priority:
   - **P0 (Critical)**: Security vulnerabilities, data loss risks
   - **P1 (High)**: Logic bugs, error handling gaps that cause runtime failures
   - **P2 (Medium)**: Type safety, code quality issues affecting maintainability
   - **P3 (Low)**: Style, naming, minor cleanup
5. Present a structured audit report to the user and wait for confirmation before proceeding.

### Phase 3 — Create GitHub Issues

1. Read `references/issue-workflow.md` for issue creation guidelines.
2. For each fix batch (or individual Critical finding), create a GitHub issue:
   ```bash
   gh issue create --title "<type>(<scope>): <summary>" --body "<structured body>" --label "<severity>,<category>"
   ```
3. Issue body must include: affected files, line numbers, problem description, expected behavior, and suggested fix approach.
4. Link related issues when findings are connected.
5. Present the created issues to the user.

### Phase 4 — Worktree Fix

1. Read `references/worktree-fix.md` for the isolation and fix procedure.
2. For each issue (in priority order):
   a. Create an isolated worktree and branch:
      ```bash
      git worktree add ../<repo>-audit-fix-<issue-number> -b fix/<slug>-<issue-number> origin/main
      ```
   b. Work inside the worktree — never in the main checkout.
   c. Implement the fix, keeping changes minimal and focused.
   d. Verify locally: `cd mcp && npm run build && npm run test`
   e. Commit with conventional-changelog format:
      ```bash
      git commit -m 'fix(<scope>): 🔒 <english description>

      Closes #<issue-number>'
      ```
   f. Push and create PR:
      ```bash
      git push github fix/<slug>-<issue-number>
      gh pr create --title "fix(<scope>): 🔒 <summary>" --body "Closes #<issue-number>\n\n<description>" --base main
      ```
   g. Remove the worktree after PR is created:
      ```bash
      cd <original-dir>
      git worktree remove ../<repo>-audit-fix-<issue-number>
      ```
3. One worktree per issue. Never mix fixes across worktrees.
4. **Dependency fixes**: For dependency vulnerability batches, follow `references/dependency-audit.md` Step 4. These can be grouped into a single PR since they modify `package.json` / `package-lock.json`.

### Phase 5 — Verify & Report

1. Read `references/verification.md` for the verification checklist.
2. Check CI status for each PR:
   ```bash
   gh pr checks <number>
   ```
3. If CI fails, re-enter the worktree, fix, and push again.
4. Generate a final audit report summarizing:
   - Total findings by category and severity
   - Issues created (with links)
   - PRs submitted (with links)
   - Remaining items that need human decision

## Routing

| Task | Read |
| --- | --- |
| What to review and how to check each category | `references/review-strategy.md` |
| How to classify, deduplicate, and batch findings | `references/classification.md` |
| How to create well-structured GitHub issues | `references/issue-workflow.md` |
| How to create worktrees and fix issues in isolation | `references/worktree-fix.md` |
| How to verify fixes and generate the final report | `references/verification.md` |
| How to audit and fix dependency vulnerabilities | `references/dependency-audit.md` |

## Git safety rules

- **Never force-push** unless explicitly asked.
- **Never amend** commits that are already pushed.
- **Always work inside the worktree**, not the main checkout.
- **Always verify** build + test locally before pushing.
- **One worktree per issue** — never mix fixes.
- **Clean up worktrees** after PR creation.

## Commit conventions

Follow the project's conventional-changelog format:

```
fix(<scope>): 🔒 <english description>

Closes #<issue-number>
```

Scope examples: `security`, `deps`, `error-handling`, `type-safety`, `code-quality`, `cloudrun`, `database`, `functions`

## Minimum self-check

- Did I review ALL source files in the target scope, not just a sample?
- Did I categorize each finding with file, line, severity, and description?
- Did I present the audit report and get user confirmation before creating issues?
- Did I create a separate GitHub issue for each fix batch?
- Did I use an isolated worktree for each fix, not the main checkout?
- Did I verify build + test pass before pushing each fix?
- Did I clean up worktrees after creating PRs?
- Did I generate a final report with links to all issues and PRs?
- Did I check Dependabot alerts and npm audit for dependency vulnerabilities?
- Did I apply the correct fix strategy (upgrade / override / replace / dismiss) for each vulnerable dependency?
