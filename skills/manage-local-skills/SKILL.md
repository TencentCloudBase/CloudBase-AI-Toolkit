---
name: manage-local-skills
description: Analyze, standardize, validate, and sync locally maintained skills into agent skill directories with a `skills` CLI-aligned workflow. Use this skill when Codex needs to turn ad-hoc prompt or rules folders into reusable `SKILL.md`-based skills, install or sync one or more local skills from `./skills` into Claude, Cursor, CodeBuddy, Codex, or similar agent directories, or manage local skill path mappings and symlink or copy installation behavior.
---

# Manage Local Skills

Manage locally maintained skills as reusable, standard skill assets.

## What this skill does

Use this skill to:

- classify local sources as standard skills, non-standard skill-like folders, or mixed repositories
- convert non-standard local materials into a standard `SKILL.md`-based structure
- validate standard skill structure before installation
- sync one or more local skills into one or more agent skill directories
- maintain explicit agent and IDE path mappings for local skill installation

## Do not use this skill for

- publishing remote skills registries or package indexes
- cloning skills from remote repositories
- interactive marketplace search
- generic documentation cleanup unrelated to local skill structure

## Workflow

1. Identify whether the user wants analysis only, migration, validation, mapping changes, or installation.
2. If the source is not obviously standard, read `references/source-classification.md` and run `scripts/inspect-source.mjs` first.
3. If migration is needed, read `references/migration-playbook.md` and convert the source into a standard skill folder before installation.
4. Before mounting a skill, read `references/cli-alignment.md` and `references/install-workflow.md` to preserve the source-first install model used in this repo.
5. Use `scripts/validate-skill.mjs` before and after installation when structure or path correctness is in doubt.
6. If the target agent is new or unclear, read `references/mapping-extension.md` before adding or changing mappings.

## Common requests

- "Install this local skill into Claude and Cursor."
- "Sync everything under `./skills` to Codex and CodeBuddy."
- "Turn this prompts folder into a reusable skill."
- "Link my local skills into the agent directories for this project."

## Routing

| Task | Read | Script |
| --- | --- | --- |
| Understand how this differs from or aligns with `skills` CLI | `references/cli-alignment.md` | |
| Classify local sources and detect migration candidates | `references/source-classification.md` | `scripts/inspect-source.mjs` |
| Convert non-standard local folders into standard skills | `references/migration-playbook.md` | `scripts/inspect-source.mjs` |
| Install or mount local skills into agent directories | `references/install-workflow.md` | `scripts/install-skill.mjs` |
| Add or update agent mappings | `references/mapping-extension.md` | `scripts/install-skill.mjs` |
| Validate structure or installation results | `references/install-workflow.md` | `scripts/validate-skill.mjs` |

## Operating rules

- Treat `skills` CLI installation semantics as the baseline, but follow this repo's source-first project install model for locally maintained skills.
- Prefer analysis first when the source structure is ambiguous.
- Do not execute arbitrary scripts from the source folder while inspecting it.
- In `symlink` mode, keep `skills/` as the single maintained source of truth and expose `.agents` entries as links instead of extra copies.
- Prefer symlinks when supported and safe. Fall back to copy when the user requests it or symlinks fail.
- Make scope explicit: `project` means the current workspace, `global` means the user-level agent directory.
- Ask the user to confirm before writing files, replacing existing installs, changing mappings, or converting a non-standard source into a standard skill.
- If the user asks to sync multiple skills or multiple agents, summarize the planned batch operation before execution and wait for confirmation.
- Call out differences whenever the requested behavior cannot fully match `skills` CLI.

## Quick commands

```bash
node skills/manage-local-skills/scripts/inspect-source.mjs --input <path> --json
node skills/manage-local-skills/scripts/validate-skill.mjs --skill-dir <path>
node skills/manage-local-skills/scripts/install-skill.mjs --source-dir skills --skill <name> --agent cursor --scope project --mode symlink
```

## Minimum self-check

- Is the source clearly classified as `standard`, `nonstandard`, or `mixed`?
- Is the target skill structure valid before installation?
- If `symlink` mode was requested, does the installed `.agents` entry resolve back to the maintained source?
- Is the selected agent mapping explicit and correct for the requested scope?
- If symlink mode is used, is there a defined fallback to copy mode?
- If behavior differs from `skills` CLI, did you state the difference clearly?
