---
name: api-contract-review
description: Use when auditing CloudBase cloud API wrappers, MCP tools, generated action metadata, or related docs for outdated or incorrect action names, parameters, casing, request shapes, or missing contract tests, especially during periodic quality review or before preparing corrective PRs.
alwaysApply: false
---

# API Contract Review

Review CloudBase cloud API integrations for contract correctness before the repository ships stale, guessed, or undocumented behavior.

## When to use this skill

Use this skill when you need to:

- Review CloudBase cloud API wrappers or MCP tools for outdated or incorrect action or interface names
- Check whether request parameters, casing, nesting, or request shape drifted away from documentation
- Audit whether a CloudBase API change is backed by the right contract tests
- Run a periodic API correctness review before opening corrective PRs
- Separate confirmed contract bugs from vague "maybe this API changed" speculation

**Do NOT use for:**

- General code smell review without a contract-correctness question
- Regular SDK usage that does not touch CloudBase control-plane or documented API contracts
- Guessing undocumented behavior from naming intuition
- Shipping a fix when the documentation still does not support the proposed action or parameter shape

## Workflow

### Phase 1 — Scope and evidence

1. Read `references/review-checklist.md` first.
2. Identify the review surface:
   - `mcp/src/tools/*`
   - related tests
   - generated action metadata
   - user-facing docs that describe the same API behavior
3. Record the exact action, interface, or payload being reviewed before forming conclusions.

### Phase 2 — Documentation-first verification

Before judging any implementation, you must read the relevant official documentation first.

Required entry points:

- CloudBase API overview: `https://cloud.tencent.com/document/product/876/34809`
- Dependency-resource API docs when relevant: `https://cloud.tencent.com/document/product/876/34808`
- CloudBase Manager SDK docs before approving direct Cloud API usage: `https://docs.cloudbase.net/api-reference/manager/node/introduction`

Verify the documented contract, not your memory:

- exact action or interface name
- required and optional parameters
- parameter casing and nesting
- request shape
- auth model and caller context
- response shape, task model, and documented limits

If the docs do not clearly support the action, parameter, or behavior, treat the implementation as unverified and stop short of guessing.

### Internal parameters

Some parameters are internal to Tencent Cloud and not publicly documented. These parameters are valid but will not appear in the official API documentation.

Known internal parameters:

- `EnvTypes` in `DescribeEnvs` — filters environments by type (e.g., `["weda", "baas"]`). This parameter is not in the public documentation but is accepted by the backend.

When you encounter a parameter that:
1. Does not appear in official documentation
2. But is confirmed by the team as valid internal behavior

Mark it as an **internal parameter** in your review report, not as a contract bug.

### Internal parameters

Some parameters are internal to Tencent Cloud and not publicly documented. These parameters are valid but will not appear in the official API documentation.

Known internal parameters:

- `EnvTypes` in `DescribeEnvs` — filters environments by type (e.g., `["weda", "baas"]`). This parameter is not in the public documentation but is accepted by the backend.

When you encounter a parameter that:
1. Does not appear in official documentation
2. But is confirmed by the team as valid internal behavior

Mark it as an **internal parameter** in your review report, not as a contract bug.

### Phase 3 — Repository cross-check

1. Compare implementation, tests, generated metadata, and user-facing docs against the documented contract.
2. Mark each mismatch as one of:
   - outdated action or interface name
   - wrong parameter mapping
   - wrong parameter casing or nesting
   - undocumented request shape
   - missing contract test
   - stale public documentation
3. Prefer nearby targeted tests over broad assumptions.

### Phase 4 — Escalation and follow-through

1. If the contract bug is confirmed and the fix is low-risk, prepare the code, test, and doc updates needed for a focused PR.
2. Any change to a CloudBase cloud API wrapper or call is incomplete without tests that would fail on the previous wrong contract.
3. If the issue is serious but still ambiguous, write a report and open an issue instead of shipping a guessed fix.
4. Route broad code hygiene findings to `codebase-audit`. Route open-PR repair work to `pr-review-fix` after the contract finding is confirmed.

## Routing

| Task | Read |
| --- | --- |
| Review CloudBase API contract correctness | `references/review-checklist.md` |
| Run a broad code audit after contract review | `codebase-audit` |
| Repair an already-open PR after confirming the contract fix | `pr-review-fix` |

## Evaluation prompts

### Should-trigger

1. Audit `mcp/src/tools` for CloudBase API actions whose parameter casing or nesting no longer matches the official docs.
2. Review this MCP tool and tell me whether it guessed a CloudBase action name instead of proving it from documentation.
3. Help me prepare a corrective PR for a documented CloudBase API mismatch and make sure the tests would fail on the old payload.

### Should-not-trigger

1. Review this React component for accessibility issues.
2. Help me polish the README introduction copy.
3. Fix an open PR that only has lint failures and no API contract question.

## Minimum self-check

- Did I read the relevant official docs before judging the code?
- Can I point to the exact documented action or interface name?
- Did I verify parameter casing, nesting, and request shape instead of inferring them?
- Did I identify the nearest tests that should prove the contract?
- If I recommend a fix, did I require targeted tests and a focused PR path?
- If the docs were still unclear, did I stop at report or issue instead of guessing?
