---
name: planning-workflows
description: Spec and no-spec planning workflows derived from local slash commands (requirements, design, tasks).
---

# Planning Workflows (spec / no-spec)

This skill standardizes how to choose and execute planning modes using local slash commands.

## When to use this skill

Use this skill when the user:

- wants a full spec workflow before implementation
- wants to skip spec and execute directly for small scoped tasks
- asks how to decide between spec vs no-spec

## Source of truth

- `references/source-commands.md`

## Decision rules

- Prefer **spec** when work is new/complex, cross-module, risky, or acceptance criteria are unclear.
- Prefer **no-spec** when work is small, low-risk, well-scoped (docs/config/simple fixes).

## Execution rules

1. Read the matching command template from `references/source-commands.md`.
2. Follow it as a phase gate workflow:
   - do not skip required confirmations when running spec mode
   - keep scope tight when running no-spec mode
3. Keep artifacts in the repo conventions (e.g. `specs/<name>/...`) when spec is selected.

## Command mapping

See `references/command-catalog.md`.

