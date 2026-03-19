# Migration Playbook

Use this reference when a local folder is skill-like but not yet a standard skill.

## Migration goal

Convert ad-hoc local materials into a reusable skill with this minimum structure:

```text
skill-name/
├── SKILL.md
├── references/
├── scripts/
└── assets/
```

Create only the subdirectories that are actually needed.

## Migration steps

1. Classify the source with `scripts/inspect-source.mjs`.
2. Identify the single reusable capability the skill should represent.
3. Normalize the skill name to a stable kebab-case folder name.
4. Draft `SKILL.md` with a precise `name` and `description`.
5. Move deep detail into `references/`, deterministic operations into `scripts/`, and reusable output resources into `assets/`.
6. Preserve enough source context that another maintainer can understand where the new skill came from.
7. Run `scripts/validate-skill.mjs` before mounting the result.

## How to split content

Put content into `SKILL.md` when it must change agent behavior directly after trigger.

Put content into `references/` when it is:

- long-form explanation
- domain detail
- decision tables
- examples or migration notes that should be read only when needed

Put content into `scripts/` when it is:

- repetitive
- deterministic
- path-sensitive
- easy to break if rewritten ad hoc

Put content into `assets/` when it is used in output rather than as instructions.

## Traceability rule

When migration requires heavy restructuring, keep a short source note in the migrated skill or a migration reference that answers:

- what the original source was
- why the skill boundary was chosen
- which files were promoted into references or scripts

Do not turn this into project-management documentation. Keep it brief and operational.

## When to stop and confirm

Pause and confirm with the user when:

- one source folder appears to contain multiple distinct skills
- the skill name is still unclear after inspection
- the source is mostly installation metadata with no reusable capability guidance
- the migration would require inventing large amounts of missing domain logic
