# Worktree Fix Procedure

## Why worktrees

Each issue gets its own isolated worktree so that:
- Fixes don't interfere with each other.
- The main checkout stays clean for other work.
- Each PR has a clean diff tied to exactly one issue.
- If a fix goes wrong, only that worktree is affected.

## Naming convention

```
Worktree directory: ../<repo-name>-audit-fix-<issue-number>
Branch name:        fix/<slug>-<issue-number>
```

Example: issue #101 about path traversal →
- Worktree: `../cloudbase-turbo-delploy-audit-fix-101`
- Branch: `fix/path-traversal-101`

## Pre-flight

Before starting any fix:

```bash
# 1. Note current branch and status
git branch --show-current
git status

# 2. Fetch latest
git fetch github

# 3. Verify no worktree conflicts
git worktree list
```

## Fix loop (per issue)

### Step 1 — Create worktree

```bash
git worktree add ../<repo>-audit-fix-<N> -b fix/<slug>-<N> github/main
cd ../<repo>-audit-fix-<N>
```

**Important:** All subsequent work happens inside this worktree directory.

### Step 2 — Reproduce

Confirm the issue exists:

```bash
cd mcp
npm ci
npm run build 2>&1 | grep -i error
npm run test 2>&1 | grep -i fail
```

For security issues, reproduce with a mental walkthrough or unit test that exercises the vulnerable path.

### Step 3 — Implement fix

Rules:
- **Minimal changes** — fix only what the issue describes.
- **Don't mix concerns** — no refactoring, no "while I'm here" improvements.
- **Follow existing patterns** — match the codebase's style and conventions.
- **Add tests when appropriate** — especially for security fixes and logic bugs.

### Step 4 — Verify locally

```bash
cd mcp
npm run build    # must pass cleanly
npm run test     # all tests must pass
```

If verification fails:
1. Check if failure is from your change or pre-existing.
2. If from your change, fix it.
3. If pre-existing, note it but don't fix it in this PR.

### Step 5 — Commit

```bash
git add <changed-files>
git commit -m 'fix(<scope>): 🔒 <english description>

Closes #<issue-number>'
```

Emoji conventions:
- 🔒 Security fixes
- 🛡️ Error handling improvements
- 🔧 Type safety / code quality fixes
- 🧹 Cleanup / dead code removal

### Step 6 — Push and create PR

```bash
git push github fix/<slug>-<N>

gh pr create \
  --title "fix(<scope>): 🔒 <summary>" \
  --body "## Changes

<description of what was fixed and how>

## Affected files

<list of changed files>

## Testing

- [x] Build passes locally
- [x] All tests pass locally
- [x] No new warnings introduced

Closes #<issue-number>" \
  --base main
```

Push to GitHub by default per current project convention:
```bash
git push github fix/<slug>-<N>
```

Only push to other remotes when the user explicitly asks for it.

### Step 7 — Clean up worktree

```bash
cd <original-repo-dir>
git worktree remove ../<repo>-audit-fix-<N>
```

If the worktree has uncommitted changes, force remove only if you're sure the work is pushed:
```bash
git worktree remove --force ../<repo>-audit-fix-<N>
```

## Multi-issue session

When fixing multiple issues:

1. Complete the full loop for issue A before starting issue B.
2. Track progress with a checklist.
3. If two issues touch the same file, note the potential merge conflict but keep them in separate worktrees/PRs anyway. The second PR can be rebased after the first merges.

## Handling failures

| Situation | Action |
|-----------|--------|
| Build fails after fix | Debug in the worktree, don't switch to main |
| Test fails (pre-existing) | Note in PR body, don't try to fix |
| Test fails (from your change) | Fix before pushing |
| Worktree creation fails | Check `git worktree list`, remove stale entries |
| Push fails | Check remote permissions, branch protection rules |
| PR creation fails | Verify branch was pushed, check `gh auth status` |

## Safety guardrails

- **Never work in the main checkout** during the fix phase.
- **Never force-push** unless explicitly asked.
- **Never amend** pushed commits.
- **Always verify** before pushing.
- **Always clean up** worktrees after PR creation.
- **One issue per worktree** — no exceptions.
