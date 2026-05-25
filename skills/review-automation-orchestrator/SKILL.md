---
name: review-automation-orchestrator
description: Use when running or scheduling periodic repository review cycles that must dispatch the correct reviewer, aggregate findings, and escalate outcomes into reports, issues, or corrective PRs across API contracts, documentation freshness, code quality, and CloudBase skill quality.
alwaysApply: false
---

# Review Automation Orchestrator

Coordinate recurring repository review work without turning one skill into every reviewer at once.

## When to use this skill

Use this skill when you need to:

- Run a periodic repository review across several quality dimensions
- Decide which specialized review skill should own each finding type
- Aggregate review results into one report with clear escalation
- Convert high-confidence, low-risk findings into corrective PRs when feasible
- Configure or run a scheduled review cycle without duplicating the underlying reviewer logic

**Do NOT use for:**

- Acting as the primary reviewer for API contracts, docs, or code quality by itself
- Replacing the existing CloudBase skill review flow under `skill-authoring`
- Fixing a single known issue without a broader review cycle
- Merging PRs or making final release decisions

## Workflow

### Phase 1 — Define the run

1. Clarify whether the run is one-time or periodic.
2. Define the review surfaces and target outputs:
   - report only
   - issue + report
   - fix + PR
3. Read `references/escalation-matrix.md` before dispatching work.

### Phase 2 — Dispatch to the right reviewer

Route by finding type, not by convenience:

- CloudBase API contract correctness → `api-contract-review`
- Published docs and README drift → `doc-freshness-review`
- Broad code hygiene and proactive repository health → `codebase-audit`
- Existing open PR triage and repair → `pr-review-fix`
- CloudBase source skill quality under `config/source/skills` → `skill-authoring`, then load `references/repo-skill-review.md` and `references/cloudbase-skill-review.md`

Do not create a redundant top-level CloudBase skill reviewer when the existing `skill-authoring` flow already covers it.

### Phase 3 — Normalize findings

1. Deduplicate overlaps between reviewers.
2. Normalize each finding with:
   - scope
   - severity
   - confidence
   - smallest useful fix batch
   - recommended action from the escalation matrix
3. Keep reports readable: separate API, docs, code, and skill findings.

### Phase 4 — Escalate

1. Use `report only` for lower-confidence or lower-impact findings.
2. Use `issue + report` for confirmed but broader or riskier problems.
3. Use `fix + PR` when the finding is confirmed, mechanically fixable, and small enough for a focused review.
4. Prefer concrete PRs over issue-only churn when the path is already clear and low-risk.

### Phase 5 — Scheduling discipline

1. If the user asks for recurrence, create automation that runs the review cycle and stores the task prompt separately from schedule details.
2. Keep the scheduled prompt short and routing-focused.
3. Do not duplicate reviewer checklists inside the automation definition.

## Routing

| Task | Read |
| --- | --- |
| Decide escalation from severity and confidence | `references/escalation-matrix.md` |
| Review CloudBase API contract correctness | `api-contract-review` |
| Review doc and README drift | `doc-freshness-review` |
| Run broad repository code review | `codebase-audit` |
| Repair existing PRs after review | `pr-review-fix` |
| Review CloudBase source skills | `skill-authoring` |

## Evaluation prompts

### Should-trigger

1. Run a weekly repository review that checks CloudBase API contracts, docs freshness, and skill quality, then decide what should become PRs.
2. Help me set up a periodic review flow that routes findings to the right reviewer and escalates only the high-confidence fixes.
3. Aggregate findings from code, docs, and CloudBase skill review into one actionable maintenance report.

### Should-not-trigger

1. Review this one MCP tool for parameter casing errors.
2. Audit `doc/` for stale links and missing files.
3. Rewrite a CloudBase source skill description to improve its trigger wording.

## Minimum self-check

- Did I dispatch each finding class to the correct specialized reviewer?
- Did I reuse `skill-authoring` for CloudBase skill review instead of inventing a duplicate flow?
- Did I normalize findings by severity, confidence, and smallest useful fix batch?
- Did I choose report, issue, or PR based on evidence rather than habit?
- If the run is periodic, did I keep the automation prompt focused on routing instead of embedding whole checklists?
