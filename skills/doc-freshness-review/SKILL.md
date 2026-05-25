---
name: doc-freshness-review
description: Use when auditing repository documentation for drift, stale statements, broken references, or README mismatches, especially across published docs under `doc/` and key entry surfaces such as `README.md`, `README-EN.md`, `README-ZH.md`, and `mcp/README.md` during periodic maintenance or before preparing corrective PRs.
alwaysApply: false
---

# Documentation Freshness Review

Review whether repository documentation still matches the current code, generated assets, and published entry points.

## When to use this skill

Use this skill when you need to:

- Audit published documentation under `doc/` for stale or wrong statements
- Check whether `README.md`, `README-EN.md`, `README-ZH.md`, or `mcp/README.md` drifted away from current behavior
- Verify that linked scripts, files, commands, and workflows still exist and still match the repo
- Run a periodic docs health check before opening corrective PRs
- Separate mechanical doc drift from product ambiguity that still needs human confirmation

**Do NOT use for:**

- Marketing copy polish without a freshness or correctness question
- API contract review that depends on CloudBase control-plane docs first
- Feature planning or architecture design
- Rewriting large docs from scratch when the main need is a targeted drift audit

## Workflow

### Phase 1 — Scope the surfaces

1. Read `references/review-scope.md` first.
2. Build the audit surface in two groups:
   - published documentation under `doc/`
   - README surfaces such as `README.md`, `README-EN.md`, `README-ZH.md`, and `mcp/README.md`
3. Note which code, scripts, generated files, or workflows those docs claim to describe.

### Phase 2 — Evidence-based comparison

1. Verify whether referenced files, scripts, commands, and workflow names still exist.
2. Compare the docs against the current implementation, generated outputs, and source-of-truth files.
3. Mark each mismatch as one of:
   - stale statement
   - missing or stale reference
   - outdated command
   - drift between published docs and README surfaces
   - drift between docs and actual implementation

### Phase 3 — Severity and action

1. Prefer concrete findings with exact file paths and the smallest useful rewrite direction.
2. If the fix is mechanical and low-risk, prepare the doc updates for a focused PR.
3. If the docs may be wrong because product behavior is unclear, write a report and issue instead of guessing.
4. If the drift originates from a CloudBase API contract problem, hand off to `api-contract-review` before updating the prose.

### Phase 4 — Follow-through

1. Keep report sections separate for:
   - published documentation
   - README surfaces
   - broken or missing references
2. Prefer one focused PR per coherent doc drift batch.
3. Route open-PR repair work to `pr-review-fix` after the doc finding is confirmed.

## Routing

| Task | Read |
| --- | --- |
| Review docs and README freshness scope | `references/review-scope.md` |
| Review CloudBase API contract drift before changing related prose | `api-contract-review` |
| Fix an already-open PR after confirming the doc drift | `pr-review-fix` |

## Evaluation prompts

### Should-trigger

1. Audit `doc/` and the main README files for stale commands, missing files, and broken references.
2. Review whether `mcp/README.md` still matches the current MCP tool behavior and linked files.
3. Help me prepare a corrective PR for docs that still reference scripts or workflows that no longer exist.

### Should-not-trigger

1. Review this TypeScript module for runtime validation gaps.
2. Compare CloudBase action parameters against the official control-plane docs.
3. Write a brand-new tutorial for a feature that does not exist yet.

## Minimum self-check

- Did I separately review published documentation and README surfaces?
- Can I point to exact file paths for every stale or broken reference?
- Did I compare the docs against current code, scripts, and generated outputs instead of relying on memory?
- If I recommend a fix, is it a small, reviewable doc batch suitable for a PR?
- If the underlying product behavior was unclear, did I stop at report or issue instead of rewriting confidently?
