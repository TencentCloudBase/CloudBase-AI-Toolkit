# Sub-agent Orchestration

## Purpose

Use this reference when you are dispatching one or more sub-agents to process MCP attribution issues.

The goal is to keep each worker issue-scoped, audit-friendly, and resistant to premature closure.

## Core rule

One sub-agent owns exactly one attribution issue.

Do not give one worker multiple issues.
Do not mix worktrees, evidence, or PR context across issues.

## Dispatcher responsibilities

The parent agent or dispatcher must:

1. fetch the backlog
2. deduplicate issues
3. assign one issue per worker
4. include the exact `issueId` and title in the worker prompt
5. require the worker to read the skill plus the relevant references first
6. require the worker to report back:
   - attribution conclusion
   - current attribution status
   - worktree and branch
   - GitHub issue or PR URL
   - latest evaluation case and run when relevant
   - touched files
   - remaining blockers

The dispatcher must not assume a worker is done just because it returned a PR URL.

## Worker contract

Every worker prompt should explicitly require this sequence:

1. read attribution detail
2. read current `notes`
3. read `externalUrl` when present
4. read linked GitHub issue or PR state
5. read top-level PR comments, review comments, and review decisions when a PR exists
6. only then read representative run `result` and `trace`
7. decide actionable vs invalid
8. if actionable, use `wt` to create an isolated worktree
9. implement the fix and run the smallest relevant validation
10. create or update the GitHub issue or PR
11. run a real evaluation when available
12. perform a closure sweep before changing anything to `resolved`
13. patch attribution only through the report API

## Required worker prompt clauses

Include clauses like these in every worker prompt:

- "You are responsible for exactly one issue."
- "Do not process any other issue."
- "Do not use the shared checkout for code edits."
- "Use Worktrunk for any repairable issue."
- "Read PR comments, review comments, and review decisions before deciding next steps."
- "Before marking the attribution `resolved`, re-read the latest PR comments, review comments, review decisions, and issue comments after the latest push or evaluation result."
- "If unresolved newer feedback exists, keep the attribution `in_progress`."
- "Update attribution only through `http://127.0.0.1:5174/api/...`."
- "`owner` must be `codex`."

## Recommended worker output format

Ask workers to return:

```text
issue conclusion:
attribution status:
worktree / branch:
GitHub issue / PR:
evaluation caseId / runId / result:
modified files:
remaining blockers:
```

This makes it easy for the dispatcher to apply closure-sweep checks consistently.

## Closure-sweep rule for dispatchers

Even if a worker says the issue is closed:

1. reopen the linked PR or issue yourself
2. check whether there are newer comments or review signals
3. only then accept a `resolved` recommendation

If the dispatcher finds newer unresolved feedback, override the worker's closure and move the issue back to `in_progress`.

## Failure modes to guard against

- worker reads run evidence but skips PR comments
- worker closes after a passing evaluation without re-reading the PR
- worker treats a PR URL as sufficient closure
- worker continues an old PR without checking whether review changed the direction
- worker edits code in the shared checkout instead of a worktree
- worker handles multiple issues in one prompt and contaminates context

## Minimal dispatcher checklist

- Did each worker get exactly one `issueId`?
- Did each worker prompt require preflight before run diagnosis?
- Did each worker prompt require closure sweep before `resolved`?
- Did I independently verify any worker-proposed `resolved` state against the latest PR or issue feedback?
