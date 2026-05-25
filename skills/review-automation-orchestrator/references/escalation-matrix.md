# Review Escalation Matrix

## Purpose

Use this matrix to decide whether a periodic review finding should stay in a report, become an issue, or be fixed in a PR.

## Decision matrix

| Confidence | Impact / Risk | Preferred action |
| --- | --- | --- |
| Low or unclear | Any | report only |
| High | Broad, risky, or cross-module | issue + report |
| High | Narrow, mechanical, low-risk | fix + PR |

## Heuristics

### report only

Use this when:

- the evidence is incomplete
- the product contract is still unclear
- the reviewer can see drift but cannot prove the correct replacement yet

### issue + report

Use this when:

- the finding is confirmed
- the repair spans several modules or needs human coordination
- the change could alter public behavior or compatibility

### fix + PR

Use this when:

- the finding is confirmed
- the fix is small, focused, and reviewable
- the reviewer can update code, tests, or docs without guessing
- the PR is more useful than creating another tracking issue

## Bias for action

Routine findings should go to reports.
Higher-value, high-confidence, low-risk findings should go beyond issue churn toward a concrete PR when feasible.
