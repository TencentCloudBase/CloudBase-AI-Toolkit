# PR Discovery Procedure

## Prerequisites

- `gh` CLI authenticated and configured
- Remote `github` configured and reachable

## Step-by-step

### 1. Fetch latest remote refs

```bash
git fetch github --prune
```

### 2. List open PRs with status

```bash
gh pr list --state open --json number,title,headRefName,statusCheckRollup,reviewDecision,mergeable,updatedAt --limit 30
```

Key fields:
- `statusCheckRollup`: array of check results — look for `conclusion: "FAILURE"` or `conclusion: "ACTION_REQUIRED"`
- `reviewDecision`: `APPROVED`, `CHANGES_REQUESTED`, `REVIEW_REQUIRED`, or empty
- `mergeable`: `MERGEABLE`, `CONFLICTING`, or `UNKNOWN`

### 3. Classify each PR

Build a health table:

| # | Title | Branch | CI | Review | Merge | Priority |
|---|-------|--------|----|--------|-------|----------|
| 458 | Fix security ... | fix/security-455 | 🔴 | 🟡 | ✅ | P0 |
| 459 | Code quality ... | fix/code-quality-456 | 🔴 | — | ✅ | P1 |

Priority mapping:
- **P0**: CI failed + changes requested (both blocking)
- **P1**: CI failed only
- **P2**: Changes requested only (CI passing)
- **P3**: Merge conflict only
- **P4**: Healthy (no action needed)

### 4. Deep-dive for failing PRs

For each P0/P1 PR, gather failure details:

```bash
gh pr checks <number>
```

If checks show failure, try to get the log:

```bash
gh run view <run-id> --log-failed 2>/dev/null | tail -100
```

If GitHub Actions logs are not publicly accessible, reproduce locally instead (see `fix-workflow.md`).

### 5. Check for review comments

```bash
gh pr view <number> --json reviews,comments --jq '.reviews[] | select(.state == "CHANGES_REQUESTED") | .body'
```

Also check inline review comments:

```bash
gh api repos/{owner}/{repo}/pulls/<number>/comments --jq '.[] | {path: .path, line: .line, body: .body}'
```

### 6. Present discovery summary

Output a structured summary to the user:

```
## Open PR Health Check — <date>

Total open PRs: N
- 🔴 CI Failed: X
- 🟡 Changes Requested: Y  
- ⚪ Merge Conflict: Z
- 🟢 Healthy: W

### PRs requiring action (sorted by priority):
1. PR #NNN — <title> — CI failed (build error) + changes requested
2. PR #NNN — <title> — CI failed (test failure)
...
```

Wait for user confirmation before proceeding to fix phase.
