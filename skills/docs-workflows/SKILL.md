---
name: docs-workflows
description: Documentation and extension workflows derived from local slash commands (docs, explanation, issues, prototypes, tutorials, MCP design review).
---

# Docs Workflows (docs / explanation / issue / prototype / extension)

This skill groups the repo's documentation-oriented slash commands into reusable workflows.

## When to use this skill

Use this skill when the user asks to:

- create or standardize documentation
- produce a structured explanation of changes
- draft an issue
- create a quick prototype plan or outline
- add an article/video tutorial entry
- add AI IDE / skill / command templates
- run MCP design quality review

## Source of truth

- `references/add_article_tutorial.md`
- `references/create_doc.md`
- `references/doc_type.md`
- `references/explanation.md`
- `references/issue.md`
- `references/prototype.md`
- `references/add_video_tutorial.md`
- `references/add_aiide.md`
- `references/add_skill.md`
- `references/add_command.md`
- `references/mcp_design_review.mdc`

## Execution rules

1. Read the relevant command template from this skill's `references/`.
2. Apply the template structure and required fields as the output contract.
3. Keep edits minimal and consistent with repo doc locations (e.g. `doc/`, `specs/`).
4. Prefer clarity and auditability over verbosity.

## Command mapping

See `references/command-catalog.md`.

