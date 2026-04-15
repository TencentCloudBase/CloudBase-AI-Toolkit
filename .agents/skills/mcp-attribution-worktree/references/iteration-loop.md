# Iteration Loop

## Purpose

Use this reference when an attribution issue already has a linked GitHub issue or PR, or when a new review or evaluation result arrives after the first repair attempt.

## Core rule

Treat GitHub issues, PRs, review comments, and fresh evaluation results as part of the same repair loop.

Do not assume that:

- the first PR is final
- opening a PR is enough to mark the attribution closed
- an existing `externalUrl` means no more work is needed

## Existing artifact first

When an attribution already has `externalUrl` or notes pointing to previous work:

1. Read that issue or PR first.
2. Capture its current state first:
   - issue open or closed
   - PR open, merged, closed, or superseded
3. Read comments, review comments, review decisions, and any follow-up discussion.
4. Compare that feedback with the latest attribution run evidence.
5. Decide whether to continue the same approach or redirect it.

Do not start a new branch, worktree, or diagnosis pass until this check is complete.

## Closure sweep

Before you change an attribution from `in_progress` to `resolved`, repeat the artifact check one more time even if you already did it at the start of the iteration.

You must re-read:

1. the latest top-level PR comments
2. review comments
3. review decisions
4. linked issue comments when relevant

Treat any newer unresolved feedback as a new iteration signal. Do not close the attribution off an older snapshot of the PR.

## Continue vs restart

### Continue the same PR

Prefer continuing the same PR when:

- review feedback asks for corrections, tightening, or missing edge cases
- the overall repair direction is still correct
- the next change is an iteration, not a different root-cause theory

### Start a new iteration path

Prefer a new worktree or branch when:

- review or fresh evaluation shows the first direction was wrong
- the repair target moved from `mcp/src` to `config/source/skills`, or vice versa
- the PR became too mixed or too far from the new diagnosis
- the linked PR is closed, stale, or superseded and continuing it would hide the new root cause

## Post-PR evaluation

If a real evaluation interface exists:

1. run a fresh evaluation after the PR or branch update
2. inspect the resulting run and failed checks
3. decide whether:
   - the issue is now closed
   - the issue needs another iteration
   - the issue turned out to be grader or environment noise

Use that new evaluation as stronger closure evidence than static reasoning alone.

## Attribution state during iteration

### Keep `in_progress`

Keep the attribution `in_progress` while:

- a PR exists but review feedback is unresolved
- a fresh evaluation still fails
- the next iteration is already clear

### Move to `resolved`

Move to `resolved` only when:

- the PR or linked issue provides explicit closure
- and any available fresh evaluation no longer shows the original failure mode
- and the closure sweep found no newer unresolved PR comments, review comments, review decisions, or issue comments

### Move to `invalid`

Move to `invalid` when later review or evaluation shows:

- the original attribution was wrong
- the real failure was environment or grader noise
- no repo or skill-source change is actually needed

## Notes guidance

When iterating, append evidence like this:

```text
iteration=<n>; prior=<issue or PR link>; new_signal=<review or eval summary>; conclusion=<continue or redirect>
```

This keeps the attribution auditable across multiple rounds.

## Mandatory iteration checklist

Before each new iteration:

1. read attribution `notes`
2. read `externalUrl`
3. inspect linked issue or PR state
4. read comments and review decisions
5. decide continue vs restart
6. only then inspect the next representative run

Before `resolved`, repeat steps 2-4 after the latest push or evaluation result so the closure decision is based on a fresh artifact read rather than an older preflight snapshot.
