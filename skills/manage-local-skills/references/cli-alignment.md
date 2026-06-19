# CLI Alignment

Use this reference when local skill management must behave like the `skills` CLI as closely as possible.

## Behavioral baseline

The local management flow should preserve these `skills` CLI ideas:

1. Distinguish `project` scope from `global` scope.
2. Keep one stable canonical entry per installed skill.
3. Prefer symlinks when supported.
4. Fall back to copy mode when symlinks fail or when the user explicitly requests copying.
5. Treat universal `.agents/skills` targets and agent-specific targets with one shared model.
6. Keep path handling and overwrite behavior explicit and auditable.

## Canonical directory model

For local management in this skill:

- `project` canonical base: `<cwd>/.agents/skills`
- `global` canonical base: `~/.agents/skills`

The maintained source might be `skills/<skill-name>/`.

For this repo's local project workflow:

- in `symlink` mode, the canonical path should point back to the maintained source
- in `copy` mode, the canonical path should be a materialized copy

This keeps `skills/` as the single maintained source when symlinks are available, while still allowing a copy fallback when they are not.

This is a deliberate local deviation from a stricter copied-canonical model.

## Agent target model

After the canonical directory exists:

- universal agents can use the canonical `.agents/skills` path directly
- agent-specific targets should point to the canonical install
- symlink mode should create a canonical entry that resolves back to the maintained source, and agent-specific targets should resolve back to the canonical entry
- copy mode should materialize a standalone copy in the target agent directory

## Alignment scope in this skill

This skill intentionally aligns with local installation behavior, not the full CLI surface.

Aligned in the first version:

- canonical install entry under `.agents/skills`
- project and global scope selection
- universal versus agent-specific target handling
- symlink-first installation with copy fallback
- path safety and conflict checks
- the upstream `sanitizeName()` character policy: lowercase, allow `a-z`, `0-9`, `.`, `_`, replace other runs with `-`, trim leading and trailing `.` or `-`, fallback to `unnamed-skill`
- the four IDE mappings used in this repo: Claude, Cursor, CodeBuddy, and Codex

Not covered in the first version:

- remote repository cloning
- interactive TUI prompts
- telemetry, audit, and leaderboard behavior
- lock file restoration and update workflows

## How to reason about differences

If the requested behavior depends on unsupported CLI features, state that clearly and proceed with the local equivalent when possible.

Also state clearly when the local behavior intentionally differs from the stricter copied-canonical CLI mental model. In this repo, the main intentional difference is that project-local maintained skills stay in `skills/`, and `.agents/skills` points back to that source in `symlink` mode.

Examples:

- Remote repository install requested: explain that this skill manages local sources and does not clone repositories.
- Interactive selection requested: explain that this skill expects explicit paths, skill names, and target agents.
- Lockfile restore requested: explain that this skill validates and mounts local skills, but does not rehydrate a lockfile workflow.
