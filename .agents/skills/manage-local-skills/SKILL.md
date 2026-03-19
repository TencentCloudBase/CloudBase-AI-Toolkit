---
name: manage-local-skills
description: Analyze, standardize, validate, and mount locally maintained skills into agent skill directories with a `skills` CLI-aligned workflow. Use this skill when Codex needs to organize standard and non-standard local skill folders, migrate ad-hoc rules or prompt directories into `SKILL.md`-based skills, manage agent-to-skill directory mappings, or install local skills into project/global agent paths using symlinks or copy fallback.
---

# Manage Local Skills

Manage locally maintained skills as reusable, standard skill assets.

## What this skill does

Use this skill to:

- classify local sources as standard skills, non-standard skill-like folders, or mixed repositories
- convert non-standard local materials into a standard `SKILL.md`-based structure
- validate standard skill structure before installation
- mount one local skill source into one or more agent skill directories
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
4. Before mounting a skill, read `references/cli-alignment.md` and `references/install-workflow.md` to preserve the canonical-install model.
5. Use `scripts/validate-skill.mjs` before and after installation when structure or path correctness is in doubt.
6. If the target agent is new or unclear, read `references/mapping-extension.md` before adding or changing mappings.

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

- Treat `skills` CLI installation semantics as the behavioral baseline for canonical directory layout, scope handling, and symlink fallback.
- Prefer analysis first when the source structure is ambiguous.
- Do not execute arbitrary scripts from the source folder while inspecting it.
- Keep local source directories distinct from canonical install directories.
- Prefer symlinks when supported and safe. Fall back to copy when the user requests it or symlinks fail.
- Make scope explicit: `project` means the current workspace, `global` means the user-level agent directory.
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
- Is the canonical install path separate from the maintained source directory?
- Is the selected agent mapping explicit and correct for the requested scope?
- If symlink mode is used, is there a defined fallback to copy mode?
- If behavior differs from `skills` CLI, did you state the difference clearly?
