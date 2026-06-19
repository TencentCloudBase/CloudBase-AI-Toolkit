# Install Workflow

Use this reference when mounting a local skill into one or more agent directories.

## Installation model

Treat installation as a two-stage process:

1. Create or refresh the canonical entry in the install directory.
2. Expose that canonical entry to one or more agent directories.

In this repo's `symlink` mode, the canonical entry should itself be a symlink back to the maintained source so `skills/` remains the only maintained copy.

## Scope

Use `project` scope when the skill should live under the current workspace.

- canonical base: `<cwd>/.agents/skills`

Use `global` scope when the skill should live under the user environment.

- canonical base: `~/.agents/skills`

Always make scope explicit before writing files.

Before performing a real install, confirm with the user when:

- the operation will write files instead of dry-run only
- multiple skills or multiple agents are involved
- an existing canonical path or target path will be replaced or updated

## Mode

Use `symlink` mode by default when the filesystem supports it and the user does not require physical copies.

In `symlink` mode:

- create the canonical path as a symlink to the maintained source
- if the target agent is universal and reuses `.agents/skills`, that canonical symlink is the final installed entry
- if the target agent has its own skills directory, symlink the target entry to the canonical path

Use `copy` mode when:

- the user asks for independent copies
- symlinks are unsupported or unreliable
- a target environment rejects symlinks

If symlink mode fails, report the fallback and switch to copy mode.

In `copy` mode:

- materialize the canonical path as a copied directory
- if needed, materialize copied agent targets from the canonical path

## Conflict handling

Before mounting a skill, check whether the canonical path or target path already exists.

Report one of these outcomes clearly:

- `overwrite`: replace the existing target with the new install
- `skip`: leave the existing target untouched
- `replace`: remove and recreate the target path
- `update`: canonical target already exists and will be refreshed from the source

Do not silently replace an existing skill path.
Show the user the conflict summary first, then proceed only after confirmation.

## Dry run

Use dry run when the user wants analysis or confirmation before changing files.

Dry run output should include:

- source skill directory
- canonical target path
- agent target path or paths
- selected scope
- selected mode
- detected conflicts

## Validation after install

After installation:

- verify the canonical path exists
- verify the target path exists
- if symlink mode was used, verify the canonical path resolves to the maintained source
- if the target path differs from the canonical path, verify the target resolves to the canonical path
- if copy mode was used, verify that required files such as `SKILL.md` are present
