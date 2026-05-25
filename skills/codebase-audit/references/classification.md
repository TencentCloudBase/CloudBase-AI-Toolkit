# Classification & Batching

## Severity definitions

| Severity | Criteria | SLA |
|----------|----------|-----|
| **Critical** | Security vulnerability exploitable by external input; data loss or corruption risk; authentication/authorization bypass | Must fix immediately |
| **High** | Runtime errors in normal usage; error handling gaps causing silent failures; resource leaks under load | Fix in current session |
| **Medium** | Type safety holes; code quality issues affecting maintainability; API inconsistencies | Fix if time allows |
| **Low** | Style issues; naming; minor cleanup; documentation gaps | Defer or batch with other work |

## Deduplication rules

Many findings are instances of the **same pattern** across different files. Deduplicate aggressively:

1. **Same root cause**: If multiple files have the same type of issue (e.g., all using `as any` to bypass a shared type), merge into one finding with multiple locations.
2. **Same fix**: If the fix is identical across locations (e.g., adding null check before `.property`), group them.
3. **Related chain**: If fixing A automatically fixes B (e.g., fixing a shared utility also fixes all callers), note the dependency.

After deduplication, the finding list should be **actionable** — each entry represents one distinct thing to fix.

## Batching into fix groups

Group findings into fix batches for PR submission. Each batch becomes one GitHub issue and one PR.

### Batching rules

1. **Security findings** — one batch per vulnerability type (e.g., "path traversal" batch, "input validation" batch). Critical findings can be individual batches.
2. **Same-file fixes** — if 3+ findings are in the same file and related, batch them.
3. **Same-pattern fixes** — if the same fix pattern applies across 5+ files (e.g., adding error handling to all tool handlers), batch them.
4. **Independent fixes** — findings with no relationship get their own batch.

### Batch size limits

- Maximum 10 files changed per batch (keeps PRs reviewable).
- Maximum 1 Critical + related findings per batch (don't bury critical fixes).
- If a batch grows too large, split by subdirectory or by sub-pattern.

## Priority ordering

Within each severity level, prioritize by:

1. **Attack surface**: externally-reachable code (tool handlers, API endpoints) before internal utilities
2. **Usage frequency**: hot paths before rarely-executed branches
3. **Fix confidence**: straightforward fixes before ones requiring design decisions
4. **Blast radius**: fixes touching shared code (affects many callers) before isolated fixes

## Audit report format

Present findings to the user in this structure:

```markdown
# Codebase Audit Report — <date>

## Summary

- Total findings: N
- Critical: X | High: Y | Medium: Z | Low: W
- Unique patterns: N (after deduplication)
- Fix batches: N

## Critical findings

### [C1] <title>
- **Files**: <list>
- **Description**: <what and why>
- **Suggested fix**: <approach>
- **Batch**: #1

## High findings

### [H1] <title>
...

## Medium findings
...

## Low findings
...

## Proposed fix batches

| Batch | Issues | Severity | Files | Description |
|-------|--------|----------|-------|-------------|
| #1 | C1, H3 | Critical | 5 | Security: path traversal fixes |
| #2 | H1, H2 | High | 3 | Error handling in tool handlers |
| ... | ... | ... | ... | ... |

## Recommended action

1. Fix batch #1 first (Critical security)
2. Then batch #2 (High error handling)
3. ...
```

Wait for user confirmation before proceeding to issue creation.
