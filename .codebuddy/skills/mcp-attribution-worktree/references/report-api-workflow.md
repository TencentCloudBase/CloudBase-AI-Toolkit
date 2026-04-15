# Report API Workflow

## Purpose

Use this reference to process MCP attribution issues through the local report API in a repeatable, auditable order, while treating attribution updates as one part of a larger repair loop rather than the final deliverable.

## Allowed endpoints

Use only these attribution endpoints for attribution state:

- `GET /api/attributions`
- `GET /api/attributions/:issueId`
- `GET /api/runs/:caseId/:runId/result`
- `GET /api/runs/:caseId/:runId/trace`
- `GET /api/runs/:caseId/:runId/evaluation-trace`
- `PATCH /api/attributions/:issueId`

Do not mutate attribution state through any other backend path.

## Baseline query

Start with:

```text
GET /api/attributions?category=tool&resolutionStatus=todo&limit=50
```

Then query explicit skills backlog too:

```text
GET /api/attributions?category=skill&resolutionStatus=todo&limit=50
```

Use the first query to get the focused MCP tool backlog.

Use the second query to get explicitly labeled skills backlog.
Do not run a broad uncategorized backlog query by default.

## Fallback query

Only if category labeling looks incomplete, or if the user explicitly asks for a full todo sweep, run:

```text
GET /api/attributions?resolutionStatus=todo&limit=100
```

Use this broader query only to discover candidates that may have been miscategorized.

Do not rely on the broad query as the default work source.

## Per-issue sequence

For each candidate issue:

1. Read issue detail with `GET /api/attributions/:issueId`.
2. Review the current `notes` and `externalUrl`.
3. If there is already a linked GitHub issue or PR, read it as existing repair context before touching run evidence.
4. Capture the state of the linked artifact:
   - issue open or closed
   - PR open, merged, closed, or superseded
   - latest comments, review comments, and review decisions
5. Only after that, review the `runs` array and pick one representative run.
6. Read:
   - `result`
   - `trace`
   - preferably `evaluation-trace`
7. Summarize the concrete failure signal.
8. Only then decide whether the issue is non-actionable or should proceed into repo repair.
9. Patch the issue with the current evidence.
10. If the issue is actionable in `mcp/src` or `config/source/skills`, continue into the worktree and PR workflow instead of stopping here.
11. If the issue already has a linked PR, use its current status plus later review or evaluation evidence to decide whether the same line of work should continue or whether a new iteration is needed.

## Existing-artifact preflight

Before starting a new iteration, always check:

1. current attribution `notes`
2. `externalUrl`
3. linked GitHub issue or PR state
4. latest comments and review decisions on the linked GitHub artifact

Do not skip this preflight just because the attribution already has a linked PR. The purpose is to decide whether the next action is:

- continue the same PR
- update the linked issue first
- start a new worktree and branch because the previous direction is stale or wrong

## Closure preflight

Do this again immediately before moving an attribution to `resolved`, even if you already completed the normal preflight earlier in the same session.

Check:

1. the latest linked GitHub issue or PR state
2. top-level PR comments
3. review comments
4. review decisions
5. issue comments when `externalUrl` points to an issue
6. whether any of the above arrived after the latest code push, PR update, or fresh evaluation result

If new unresolved feedback exists, do not mark the attribution `resolved`. Move it back to or keep it at `in_progress` and continue the repair loop.

## Working set rules

Build the default working set from two buckets:

1. issues returned by the focused `category=tool` query
2. issues returned by the focused `category=skill` query

Deduplicate by `issueId` before processing.

Only in fallback mode, add a third candidate bucket:

3. issues returned by the broader todo query that clearly map to:
   - `config/source/skills`
   - skill activation
   - skill content
   - skill routing
   - skill knowledge gaps

Fallback-mode candidates do not become real repair work automatically. They must first satisfy stronger evidence checks from `result`, `trace`, and `evaluation-trace`.

## Run selection policy

Prefer the run that is most useful for diagnosis:

1. latest failed run
2. lowest score run
3. highest-signal run with the clearest tool or evaluation failure

If there are multiple similar runs, read the most recent one first and only read more runs if the first run is ambiguous.

## What to inspect in each run

### Result

Check:

- overall status
- overall score
- failed tests or checks
- timeout or environment-level failures

### Trace

Check:

- actual conversation decisions
- which tools were called
- whether the tool choice matched the task
- tool call failures, retries, malformed arguments, or missing follow-up steps

### Evaluation trace

Use this to identify:

- the exact failed check name
- whether the failure is about missing evidence, incorrect value, or missing action
- whether the run failed because of MCP output, grader expectations, or external environment

## Patch policy

When patching an attribution:

- always set `owner` to `codex`
- keep `notes` concise and auditable
- only set `externalUrl` when you have a real GitHub issue or PR link
- do not modify unrelated fields

Treat PATCH as a checkpoint, not the entire job. For a real MCP defect, you will usually patch at least twice:

1. once after diagnosis, usually as `in_progress`
2. again after GitHub issue or PR linkage, usually with a stronger closure state

If real evaluation is available, you may patch a third time after the fresh evaluation result is known.

## Status rules

### `todo`

Keep `todo` when:

- no one has really investigated the issue yet
- the run evidence is incomplete or contradictory
- you cannot tell whether the issue is actionable in `mcp/src`

### `in_progress`

Use `in_progress` when:

- the issue is real and you are actively following it up
- a repo fix or external issue is needed but closure is not complete yet
- you have a strong direction but still need more validation

This is the default state for actionable issues before the PR or final closure link exists.

It is also the default state when a PR exists but review feedback or fresh evaluation still requires another iteration.

### `resolved`

Use `resolved` only when there is clear closure evidence, for example:

- an existing GitHub issue or PR already tracks the exact problem
- the fix is already implemented and verified
- the issue is clearly a duplicate of an already tracked and linked problem

Never mark `resolved` from intuition alone.

Do not mark `resolved` just because you understand the bug. Mark it only after you have explicit closure evidence.

Do not mark `resolved` from a stale artifact read. If a linked PR or issue exists, you must complete the closure preflight immediately before patching `resolved`.

If a post-PR evaluation interface is available, prefer using that fresh evaluation result as part of the closure evidence.

### `invalid`

Use `invalid` when evidence shows:

- the attribution is a false positive
- the failure is purely environment-related
- the grader expectation is wrong while MCP behavior is already correct
- the issue does not require repo action

## Notes template

Use a compact evidence record like this:

```text
run=<caseId>/<runId>; result=<status>; score=<score>; failed_check=<check>; tool_signal=<tool or module>; code_signal=<file or none>; conclusion=<short conclusion>
```

Add one more clause when needed:

```text
next=<missing evidence or next action>
```

## External URL policy

Set `externalUrl` only when you have an exact link to:

- a matching GitHub issue
- a matching PR

Do not put search results or speculative links into `externalUrl`.

## Red flags

Stop and keep the issue unclosed if any of these are true:

- you have not read at least one `result` and `trace`
- the only signal is the attribution title with no run evidence
- the failure is mixed across multiple unrelated problems
- you cannot tell whether the problem lives in MCP code, the environment, or the grader

Also stop short of `resolved` if you have not yet completed the GitHub issue / worktree / PR loop for an actionable repo bug.

Also stop short of `resolved` if there are newer PR comments, review comments, review decisions, or issue comments that have not been re-read after the latest push or evaluation.
