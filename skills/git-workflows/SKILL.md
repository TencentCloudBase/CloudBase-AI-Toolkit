---
name: git-workflows
description: Reusable git delivery workflows derived from local slash commands (commit, push, PR, release notes, and GitHub Actions failure triage with worktree-based fixes).
---

# Git Workflows (from local commands)

This skill turns the repo's former local command templates into reusable git delivery workflows.

## When to use this skill

Use this skill when the user asks to:

- run a commit workflow (conventional-changelog style)
- push changes with safe branching and open a PR
- generate release notes from git history / GitHub context
- analyze the latest failed GitHub Actions workflow, attempt a fix in an isolated worktree, and submit a PR

## Source of truth

All detailed steps and constraints live in:

- `references/source-commands.md`

This skill describes how to apply them consistently across agents/editors without duplicating implementation details.

## Execution rules

1. Read the requested command template from `references/source-commands.md`.
2. Follow it as workflow steps, not as a loose summary.
3. Keep actions safe by default:
   - avoid destructive git operations unless explicitly requested
   - avoid committing secrets
   - keep changes minimal and localized
4. If a workflow implies external side effects (push/PR/release), request explicit confirmation right before performing the side effect.

## Command mapping

See `references/command-catalog.md`.
