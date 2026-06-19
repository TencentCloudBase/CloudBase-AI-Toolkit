# Config

This directory is no longer the primary source for AI rules or editor compatibility files.

Current source of truth lives in:

- `config/source/skills/`
- `config/source/guideline/`
- `config/source/editor-config/`

This repository also keeps one Git-tracked compatibility mirror for external
consumers:

- `config/.claude/skills/`

That mirror is generated from `config/source/skills/` and should not be edited manually.

Compatibility artifacts for external consumers are generated into:

- `.generated/compat-config/`

Normal day-to-day maintenance should update the source directories above and commit
those changes directly. Compatibility generation and publication are handled by
CI/workflows in most cases.

Run generation scripts manually only when you need local verification or an explicit
sync to external repositories.

`config/` is kept only for:

- the generated `config/.claude/skills/` compatibility mirror
- sources that have not been migrated yet, such as `codebuddy-plugin`
