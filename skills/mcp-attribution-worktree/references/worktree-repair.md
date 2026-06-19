# Worktree Repair

## Purpose

Use this reference when an attribution issue is real, actionable, and worth taking into a repo fix. This is the default next step for repairable MCP issues or repairable CloudBase skill-source issues, not an optional extra.

## Worktrunk requirement

This skill is designed around Worktrunk.

Prefer:

- `wt switch`
- `wt list`
- `wt remove`

Do not silently fall back to a shared checkout once you decide to repair an issue. If `wt` is unavailable, stop and report that Worktrunk is missing.

This keeps issue repair isolated and prevents cross-issue contamination.

## One issue, one worktree

Each actionable attribution issue gets:

- one dedicated branch
- one dedicated worktree
- one dedicated GitHub issue or PR trail when needed

Never repair two attribution issues in the same worktree.

## Suggested naming

Use a branch name that stays close to the issue:

```text
feature/attribution-<issue-slug>
```

Examples:

- `feature/attribution-envquery-hosting-fields`
- `feature/attribution-nosql-output-shape`

## Basic workflow

1. Confirm the issue is actionable from run evidence.
2. Check whether a matching GitHub issue or PR already exists.
3. If a GitHub issue or PR already exists, read its state first:
   - issue open or closed
   - PR open, merged, closed, or superseded
4. If a PR already exists, read its comments and review state before deciding whether to continue on that line or open a new iteration.
5. If needed, create a GitHub issue with a concise title and evidence summary.
6. Create a dedicated Worktrunk worktree.
7. Implement the fix inside that worktree only.
8. Run the smallest relevant validation for the touched code.
9. Commit and open or update a PR when the fix is ready.
10. If a real evaluation interface exists, run a fresh evaluation after the code change or PR update.
11. Patch the attribution with `owner=codex`, updated `notes`, `resolutionStatus`, and `externalUrl` when relevant.

Do not stop after step 4 for a repairable issue unless the environment prevents code work, PR creation, or real evaluation.

## Worktrunk commands

Create a worktree:

```bash
wt switch --create feature/attribution-<issue-slug>
```

Inspect active worktrees:

```bash
wt list
```

Clean up after merge:

```bash
wt remove
```

## GitHub issue workflow

Before creating a new GitHub issue:

- search for the same tool, module, or symptom
- prefer linking an existing issue instead of opening a duplicate

When creating a new issue, include:

- the attribution title
- the representative run
- the failing check or score signal
- the relevant MCP module
- the likely fix direction

Then copy the final GitHub issue URL into `externalUrl`.

## PR workflow

If you implement a fix:

- keep the change scoped to the single attribution issue
- mention the attribution issue ID and representative run in the PR body or commit context
- add the PR URL to `externalUrl` if that URL is the most direct closure link
- prefer opening the PR in the same session once validation passes

If the PR already exists:

- read its state, comments, and review state before changing direction
- prefer continuing the existing PR when the fix direction is still fundamentally correct
- start a new iteration only when review or new evidence shows the approach itself was wrong

Before changing the attribution to `resolved`, read the PR state, top-level comments, review comments, and review decisions again after the latest push or evaluation result. Do not close from a stale read.

Do not mark the attribution `resolved` until the closure link is real and the repair path is clear.

If real evaluation is available, do not treat PR creation alone as closure. Use the fresh evaluation result to decide whether another repair loop is needed.

## Status guidance during repair

### Before code work starts

Use `in_progress` if:

- the issue is confirmed
- you know which code path to change
- the worktree or GitHub issue is being prepared

### During code work

Keep `in_progress` while:

- the fix is being implemented
- validation is incomplete
- the PR is not open yet

### After closure

Use `resolved` when:

- there is an exact GitHub issue or PR link in `externalUrl`
- or the fix is already landed and the closure is explicit in `notes`
- and there is no newer unresolved PR comment, review comment, or review decision waiting on follow-up

## Evidence template for GitHub issue creation

Use a short structure like this:

```markdown
## Signal

- Attribution: <issueId>
- Run: <caseId>/<runId>
- Score / failure: <summary>

## Why this is actionable

- Relevant module:
- Current behavior:
- Expected behavior:

## Proposed direction

- <short fix direction>
```

## Final check

Before closing the attribution loop, verify:

- the worktree contains only this issue's changes
- the branch name is issue-specific
- `externalUrl` points to a real GitHub issue or PR
- `notes` explain why the current status is justified
- the agent did not stop at attribution state changes when repo repair was possible
- if a PR or issue already existed, the agent incorporated that context into the new iteration
- if the attribution was marked `resolved`, the agent re-read the latest PR comments and review state immediately before closing it
