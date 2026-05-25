# PR Triage Rules

## Priority matrix

| CI Status | Review Status | Merge Status | Priority | Action |
|-----------|--------------|--------------|----------|--------|
| Failed | Changes Requested | Any | **P0** | Fix CI + address review |
| Failed | — | Any | **P1** | Fix CI first |
| Passing | Changes Requested | Any | **P2** | Address review feedback |
| Any | Any | Conflicting | **P3** | Resolve conflicts |
| Passing | Approved / None | Mergeable | **P4** | No action needed |

## Within the same priority, sort by

1. **Recency** — older PRs first (they've been blocking longer)
2. **Scope** — smaller PRs first (quicker wins, unblock faster)
3. **Author** — PRs from the same author grouped together (context locality)

## CI failure categories

### Build errors (most common)

Symptoms:
- TypeScript compilation errors (`TS2345`, `TS2322`, etc.)
- Webpack bundling failures
- Missing module or import errors

Quick check:
```bash
cd mcp && npm run build 2>&1 | grep -E "error TS|ERROR in|Module not found"
```

### Test failures

Symptoms:
- Vitest assertion failures
- Timeout errors
- Missing environment variables (tests skipped vs failed)

Quick check:
```bash
cd mcp && npm run test 2>&1 | grep -E "FAIL|AssertionError|Timeout"
```

### Lint / type-check errors

Symptoms:
- ESLint rule violations
- Prettier format mismatches

Quick check:
```bash
cd mcp && npx tsc --noEmit 2>&1 | head -30
```

## Review feedback categories

### Style / formatting
- Variable naming, code style preferences
- Low risk, quick fix

### Logic / correctness
- Bug in the implementation, wrong behavior
- Medium risk, requires careful fix + test

### Security
- Input validation, injection risks, auth issues
- High risk, must verify fix thoroughly

### Architecture / design
- Approach disagreement, refactoring suggestions
- May require discussion before fixing — present options to user

## Decision framework

For each PR, ask:

1. **Can I reproduce the failure locally?**
   - Yes → proceed to fix
   - No → investigate CI environment differences

2. **Is the fix straightforward?**
   - Yes → fix directly
   - No → present analysis and options to user

3. **Does the fix touch shared code?**
   - Yes → extra caution, verify no regression
   - No → safe to proceed

4. **Is there a review disagreement (architecture-level)?**
   - Yes → present both sides to user, don't auto-fix
   - No → implement the requested change
