---
name: mcp-attribution-worktree
description: Triage, repair, and close MCP attribution issues from the local report API with evidence-driven decisions and isolated Worktrunk worktrees. Use this skill when Codex needs to process `tool` attribution issues and skills-related attribution issues, inspect related runs, decide whether the issue is actionable in `mcp/src` or `config/source/skills`, update attribution fields as `owner=codex`, and then complete the fix loop through GitHub issue tracking, worktree-based code changes, PR submission, and follow-up iteration when the problem is repairable.
---

# MCP Attribution Worktree

Process MCP and skills-related attribution issues as an auditable maintenance workflow instead of ad-hoc debugging.

## What this skill does

Use this skill to:

- fetch pending MCP and skills-related attribution issues from the local report API
- inspect issue detail plus representative runs before making any status decision
- map failures back to concrete `mcp/src` tools, `config/source/skills`, or classify them as environment / grader / duplicate noise
- update attribution issues with concise evidence, `owner=codex`, and links to external GitHub work
- isolate each actionable repair in its own Worktrunk worktree and branch
- carry actionable issues through repo repair and PR creation instead of stopping at issue state updates
- continue from existing GitHub issues or PRs when later review or evaluation feedback shows the first direction was incomplete or wrong
- run a real post-PR evaluation when an evaluation interface is available, and use that result to decide whether another repair loop is needed

## Do not use this skill for

- generic bug fixing without attribution evidence
- unrelated attribution categories that do not map to `mcp/src` or `config/source/skills`
- bulk repo changes unrelated to a specific attribution issue
- direct database or backend mutation outside the documented report API endpoints

## Workflow

1. Start with focused `tool` and `skill` backlog queries.
2. Process one issue at a time. Never mix evidence, notes, or worktrees across issues.
3. Run the existing-artifact preflight before choosing the representative run: read issue detail, current notes, existing `externalUrl`, and the state of any linked GitHub issue or PR. If a GitHub issue or PR already exists, treat it as part of the current state, not a finished endpoint.
4. Read at least one run's `result` and `trace`. Prefer to also read `evaluation-trace`.
5. Check the relevant implementation in `mcp/src` or `config/source/skills` before deciding whether the issue is actionable.
6. When the failure is caused by model misunderstanding, prefer repairs that translate repo-specific behavior into concepts the model already knows well. Reuse familiar abstractions, canonical API names, and one safe example instead of adding long product-specific explanations.
7. If the issue is actionable in repo code or skills content, do not stop at attribution triage. Open or link the matching GitHub issue, create a dedicated Worktrunk worktree, implement the fix, validate it, and prepare a PR.
8. If review comments, review decisions, or later evidence show the direction is wrong, start another focused iteration from the existing GitHub issue or PR context and continue improving instead of treating the first PR as final.
9. Update attribution fields through the report API after you have the right evidence, and update them again when the GitHub issue, PR, or evaluation result becomes available.
10. Before changing an attribution to `resolved`, run a closure preflight on the linked GitHub artifact again: reread the latest PR comments, review comments, review decisions, and issue comments after the most recent code push or evaluation result.
11. When a real evaluation interface exists, run a post-PR evaluation and use the result plus the closure preflight to decide whether to continue iterating or mark the issue closed.
12. Only stop after the issue is either clearly non-actionable or has been carried through the repair loop as far as the current environment allows.

## Common requests

- "Automatically process the pending MCP attribution issues."
- "Look at the tool and skills attribution backlog, fix the real issues, and update attribution with evidence."
- "Find valuable MCP attribution problems and fix them in isolated worktrees."
- "For each tool issue, decide whether it is a real `mcp/src` bug or just evaluation noise."
- "Continue iterating on the existing issue or PR after review comments."
- "After opening the PR, run a real evaluation and fix the next round if it still fails."

## Routing

| Task | Read |
| --- | --- |
| Run the report API triage flow and update attribution fields across tool and skills-related issues | `references/report-api-workflow.md` |
| Decide whether an issue is valuable and map it to `mcp/src` or `config/source/skills` | `references/value-triage.md` |
| Create GitHub issues, use Worktrunk, and repair the repo in isolation | `references/worktree-repair.md` |
| Continue from review feedback or real evaluation results after a PR already exists | `references/iteration-loop.md` |
| Trigger real evaluation runs and interpret the result | `references/evaluation-verification.md` |
| Dispatch one issue per worker and enforce closure-sweep rules in sub-agent prompts | `references/subagent-orchestration.md` |

## Model-oriented repair heuristic

When attribution evidence shows the model is failing because a tool or skill exposes repo-specific semantics in an unfamiliar way, prefer repairs that reduce translation work for the model.

- Map the behavior to concepts the model already knows well, such as MongoDB `updateOne` or `updateMany`, HTTP methods, SQL CRUD verbs, filesystem path conventions, or common SDK idioms.
- Keep model-facing guidance short and high-signal. One canonical safe example is usually better than a long product-specific explanation.
- Explicitly name dangerous defaults or footguns when they are easy for the model to miss, such as replacement vs partial update, destructive writes, ambiguous path resolution, or auth-sensitive side effects.
- Prefer changing the tool description, parameter description, skill wording, or generated docs when that is enough to correct the model's mental model. Do not jump to implementation changes if the real gap is contract clarity.
- Do not assume the model will infer hidden semantics from traces, backend behavior, or evaluator expectations. If a safe rule matters, state it directly where the model sees it.

## Operating rules

- Only update attribution issues through the local report API.
- Treat `owner` as fixed: always set it to `codex` when you patch an attribution.
- Before any new iteration, always inspect the latest attribution `notes`, `externalUrl`, linked GitHub issue or PR status, and any available PR comments or review decisions.
- Before moving any issue to `resolved`, always perform a fresh closure sweep on the linked issue or PR after the latest push or evaluation has completed. Do not rely on an earlier preflight.
- Do not change `resolutionStatus` until you have read at least one related run's `result` and `trace`.
- Do not mark an issue `resolved` without clear closure evidence such as an existing GitHub issue, PR, merged fix, or a verified duplicate that already has external tracking.
- Do not mark an issue `resolved` if there are unread or unaddressed PR comments, review comments, review decisions, or issue comments that arrived after the last time you inspected the linked artifact.
- Keep `notes` short but auditable. Include the representative run, the main failing signal, and the code or tool signal that supports the conclusion.
- If the evidence is incomplete, keep the issue `todo` or move it to `in_progress` and explicitly state what is still missing.
- For a real and repairable issue in `mcp/src` or `config/source/skills`, the default expectation is full follow-through: attribution triage, GitHub issue linkage, isolated worktree repair, validation, and PR creation.
- When the likely root cause is model misunderstanding rather than backend behavior, first try to repair the model-facing contract: clearer tool descriptions, safer parameter wording, skill guidance, canonical examples, and explicit warning about dangerous defaults.
- When the fix belongs to CloudBase skill content, edit `config/source/skills/` as the source of truth. Do not treat the root `skills/` directory as the source for those external skills.
- Only stop at status-only attribution updates when the issue is non-actionable, blocked by missing evidence, blocked by missing Worktrunk, or clearly outside MCP repo control.
- Do not use broad uncategorized backlog queries as the default source of work. Only use them in explicit fallback mode when category labels are incomplete or the user asks for a full backlog sweep.
- Items discovered through fallback broad queries must not enter the repair queue until run evidence clearly shows they belong to `mcp/src` or `config/source/skills`.
- Prefer one sub-agent per issue when sub-agent support exists. Give each sub-agent ownership of exactly one issue. If sub-agents are unavailable, process issues serially and keep a strict one-issue-at-a-time context.
- If a repair is needed, use Worktrunk's `wt` workflow for the isolated worktree. If `wt` is unavailable, stop and report that Worktrunk is missing instead of silently falling back to a shared checkout.
- Never reuse the same worktree for multiple attribution issues.
- Do not open or update GitHub issues until you have enough run evidence to explain the problem clearly.
- If an issue already has a GitHub issue or PR, read its current state before starting a new branch or changing direction: open or closed status, latest comments, review decisions, and whether the linked work is already stale or superseded.
- Review comments and post-PR evaluation failures are part of the same repair loop. Use them to drive another iteration instead of prematurely closing the attribution.
- If a real evaluation interface is available, prefer leaving the attribution `in_progress` until the repaired branch or PR passes a fresh evaluation round.
- Do not claim validation success from reasoning alone. Use the evaluation API and the final run result whenever that interface is available.

## Required preflight

Before starting a fresh diagnosis or code iteration for an attribution issue, complete this checklist in order:

1. Read the attribution detail plus the latest `notes`.
2. Read `externalUrl` if present.
3. If `externalUrl` points to a GitHub issue, check whether it is open or closed and whether later comments changed the fix direction.
4. If `externalUrl` points to a PR, check whether it is open, merged, closed, or superseded.
5. Read PR comments, review comments, and review decisions before deciding whether to continue the same branch or start a new iteration.
6. Only after that, pick the representative run and continue into `result`, `trace`, and `evaluation-trace`.

## Required closure preflight

Before changing an attribution to `resolved`, complete this checklist in order even if you already did the normal preflight earlier:

1. Reopen the linked GitHub issue or PR.
2. Re-read the latest top-level comments, review comments, and review decisions.
3. Confirm whether any comment arrived after the latest code push, PR update, or evaluation result.
4. If new feedback exists, keep the attribution `in_progress` and continue the loop.
5. Only if there is no newer unresolved feedback, evaluate whether closure evidence is now strong enough.

## Quick commands

```bash
curl -s 'http://127.0.0.1:5174/api/attributions?category=tool&resolutionStatus=todo&limit=50'
curl -s 'http://127.0.0.1:5174/api/attributions?category=skill&resolutionStatus=todo&limit=50'
curl -s "http://127.0.0.1:5174/api/attributions/<issueId>"
curl -s "http://127.0.0.1:5174/api/runs/<caseId>/<runId>/result"
curl -s "http://127.0.0.1:5174/api/runs/<caseId>/<runId>/trace"
curl -s "http://127.0.0.1:5174/api/runs/<caseId>/<runId>/evaluation-trace"
wt switch --create feature/attribution-<slug>
gh issue create --repo TencentCloudBase/CloudBase-MCP
gh pr view <number> --comments --repo TencentCloudBase/CloudBase-MCP
gh pr create --repo TencentCloudBase/CloudBase-MCP
curl -s -X POST http://127.0.0.1:5174/api/evaluations
```

## Minimum self-check

- Did I complete the existing-artifact preflight before starting a new diagnosis or code iteration?
- Did I inspect at least one related run's `result` and `trace` before changing status?
- Did I keep this issue isolated from every other issue?
- Is the issue actually actionable in `mcp/src`, `config/source/skills`, or is it environment / grader noise?
- If the issue was actionable, did I continue into GitHub issue / worktree / PR work instead of stopping at triage?
- If there was already a PR or review thread, did I continue from that feedback instead of ignoring it?
- If a real evaluation interface was available, did I run a fresh evaluation before treating the issue as closed?
- Did I base the validation conclusion on the final evaluation result instead of my own guess?
- If I patched the attribution, did I keep the change limited to `resolutionStatus`, `owner`, `notes`, and `externalUrl` when relevant?
- If I started a fix, does it live in its own Worktrunk worktree and branch?
- If the issue was caused by model misunderstanding, did I reduce model-facing complexity by mapping repo-specific behavior to familiar concepts and by explicitly naming dangerous defaults?
- If I marked something `resolved`, is there explicit closure evidence?
- If I marked something `resolved`, did I re-read the latest PR comments, review comments, review decisions, and issue comments immediately before closing it?
