# Source Classification

Use this reference before migrating or mounting local skills.

## Source types

### Standard

Classify a source as `standard` when the target folder already contains a usable `SKILL.md` and behaves like a normal skill folder.

Typical signals:

- `SKILL.md` exists at the root or selected subpath
- the folder name already looks like a stable skill name
- supporting files are already split into `references/`, `scripts/`, or `assets/`

### Nonstandard

Classify a source as `nonstandard` when it contains skill-like materials but no valid standard entry point.

Typical signals:

- rules, prompts, scripts, or templates exist without `SKILL.md`
- files are buried under editor-specific folders or ad-hoc directories
- one capability is present, but it is expressed as loose markdown or config fragments

### Mixed

Classify a source as `mixed` when a repository contains both standard skill folders and nonstandard skill-like materials.

Use mixed classification when:

- one subtree already has `SKILL.md`
- another subtree still needs migration

## File grouping hints

When classifying nonstandard sources, separate materials by purpose:

- Main capability guidance: likely belongs in `SKILL.md`
- Deep domain detail: likely belongs in `references/`
- Repeatable deterministic operations: likely belongs in `scripts/`
- Templates or output resources: likely belongs in `assets/`
- Editor-specific target paths or install metadata: likely belongs in mapping data or installation references

## When to ask the user

Ask for clarification before migration when:

- the source covers multiple unrelated capabilities
- there is no clear skill name
- trigger scope is ambiguous
- files are highly editor-specific and it is unclear whether they should become one skill or multiple skills
- the source is incomplete and cannot support a reusable skill boundary

## Minimum classification output

The inspection result should be able to report:

- source type
- candidate skill name
- candidate entry path
- files that look like references
- files that look like scripts
- warnings about ambiguity, collisions, or missing context
