# Issue Creation Workflow

## Prerequisites

- `gh` CLI authenticated: `gh auth status`
- Remote `github` configured and reachable

## Issue template

Each fix batch maps to one GitHub issue.

### Title format

```
<type>(<scope>): <summary>
```

Examples:
- `fix(security): 🔒 Path traversal vulnerabilities in file operation tools`
- `fix(error-handling): 🛡️ Missing error handling in tool handlers`
- `fix(type-safety): 🔧 Unsafe type casts across database tools`
- `fix(code-quality): 🧹 Dead code and duplication in cloudrun module`

### Body structure

```markdown
## Problem

<1-2 sentence summary of what's wrong and why it matters>

## Affected files

| File | Lines | Issue |
|------|-------|-------|
| `mcp/src/tools/foo.ts` | 42-55 | Missing input validation |
| `mcp/src/tools/bar.ts` | 100-120 | Same pattern |

## Severity

**<Critical|High|Medium|Low>** — <one sentence justification>

## Suggested fix

<Concrete description of the fix approach. Include code snippets when helpful.>

## Acceptance criteria

- [ ] All affected files updated
- [ ] Build passes: `npm run build`
- [ ] Tests pass: `npm run test`
- [ ] No new `as any` or unsafe casts introduced
- [ ] <Additional criteria specific to this issue>

## Context

Found during codebase audit on <date>.
Related findings: #<other-issue-numbers> (if any)
```

## Creating the issue

```bash
gh issue create \
  --repo <owner>/<repo> \
  --title "fix(<scope>): 🔒 <summary>" \
  --body "$(cat /tmp/issue-body.md)" \
  --label "bug,<severity>"
```

Tips:
- Write the body to a temp file first to avoid shell escaping issues.
- Add labels: `bug` + severity (`critical`, `high`, `medium`, `low`) + category (`security`, `error-handling`, `type-safety`, `code-quality`).
- If labels don't exist yet, create them or skip labeling.

## Linking related issues

When findings are related (e.g., same root cause manifesting differently):

```bash
# Add a cross-reference in the body
"Related to #<number>"
```

## Batch creation

When creating multiple issues in one session:

1. Create issues in priority order (Critical first).
2. Track created issue numbers.
3. After all issues are created, present a summary table:

```markdown
## Issues created

| # | Title | Severity | Files |
|---|-------|----------|-------|
| #101 | fix(security): Path traversal | Critical | 5 |
| #102 | fix(error-handling): Missing catches | High | 3 |
```

4. Confirm with user before proceeding to fix phase.

## Rate limiting

GitHub API has rate limits. If creating many issues:
- Pause 2 seconds between issue creation calls.
- If rate-limited, wait and retry.
- Maximum 10 issues per session to keep things manageable.
