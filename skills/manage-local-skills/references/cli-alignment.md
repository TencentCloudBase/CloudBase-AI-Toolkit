# CLI Alignment

Use this reference when local skill management must behave like the `skills` CLI as closely as possible.

## Behavioral baseline

The local management flow should preserve these `skills` CLI ideas:

1. Keep a canonical installed copy of the skill separate from the maintained source folder.
2. Install from the canonical directory into agent-specific directories.
3. Prefer symlinks for agent-specific installs when supported.
4. Fall back to copy mode when symlinks fail or when the user explicitly requests copying.
5. Distinguish `project` scope from `global` scope.
6. Treat universal `.agents/skills` targets and agent-specific targets with one shared model.

## Canonical directory model

For local management in this skill:

- `project` canonical base: `<cwd>/.agents/skills`
- `global` canonical base: `~/.agents/skills`

The maintained source might be `skills/<skill-name>/`, but installation should copy it into the canonical base first.

That separation matters because it:

- keeps the maintained source independent from install state
- avoids exposing one source folder directly to every agent
- makes overwrite handling and verification more predictable

## Agent target model

After the canonical directory exists:

- universal agents can use the canonical `.agents/skills` path directly
- agent-specific targets should point to the canonical install
- symlink mode should create a target entry that resolves back to the canonical directory
- copy mode should materialize a standalone copy in the target agent directory

## Alignment scope in this skill

This skill intentionally aligns with local installation behavior, not the full CLI surface.

Aligned in the first version:

- canonical install directory
- project and global scope selection
- universal versus agent-specific target handling
- symlink-first installation with copy fallback
- path safety and conflict checks
- the upstream `sanitizeName()` character policy: lowercase, allow `a-z`, `0-9`, `.`, `_`, replace other runs with `-`, trim leading and trailing `.` or `-`, fallback to `unnamed-skill`
- a broader upstream-inspired agent mapping table, including XDG-style global directories such as Amp, Goose, and OpenCode

Not covered in the first version:

- remote repository cloning
- interactive TUI prompts
- telemetry, audit, and leaderboard behavior
- lock file restoration and update workflows

## How to reason about differences

If the requested behavior depends on unsupported CLI features, state that clearly and proceed with the local equivalent when possible.

Examples:

- Remote repository install requested: explain that this skill manages local sources and does not clone repositories.
- Interactive selection requested: explain that this skill expects explicit paths, skill names, and target agents.
- Lockfile restore requested: explain that this skill validates and mounts local skills, but does not rehydrate a lockfile workflow.
