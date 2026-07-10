---
name: cloudbase-code-review
description: "Code review and validation for CloudBase projects. After writing code for Web / miniprogram / CloudRun / cloud-function projects, call this skill to check for known pitfalls — auth guard misuse, missing database tables, RLS misconfiguration, storage domain setup, and SDK API misuse. Supports automated lint scripts (regex-based) + LLM semantic review."
version: 2.23.8
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloudbase-code-review/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill, use the standalone fallback URL shown next to that reference.

# CloudBase Code Review

> **One-liner**: After implementing CloudBase features, call this skill to catch common mistakes before the grader does.

## When to use

Call this skill **after** completing a CloudBase implementation task, before declaring done:

- You implemented auth (login / register / route guard)
- You created database tables or wrote CRUD (NoSQL / PostgreSQL / MySQL)
- You set up CloudBase Storage (file upload, hosting)
- You configured security rules or RLS policies
- You wrote MCP-dependent code

## How it works

The skill runs in two layers:

| Layer | Method | Speed | What it catches |
|-------|--------|-------|-----------------|
| **Lint (optional)** | No executable script is shipped. If the user approves running lint, review the code block in `references/lint-rules/README.md`, copy it to a temporary local `cloudbase-lint.mjs`, then run `node cloudbase-lint.mjs --project-dir <path>` | Seconds | Deterministic regex checks — wrong API calls, missing configs, pattern mismatches |
| **LLM review** | Read each rule's "LLM 检查" section, inspect code semantically | Variable | Semantic issues — route guard logic, RLS completeness, architecture-level problems |

## Rule index

See `references/RULES_INDEX.md` for the full matrix (module × frontend type → applicable rules).

## Rule boundary

Do not promote a single failed run or case-specific workaround into a hard rule. A rule should be backed by stable SDK/API documentation, repeated failures, or deterministic runtime behavior. Case-specific observations belong in attribution reports; only broadly applicable constraints should enter `RULES_INDEX.md` or the optional lint checklist.

## Quick start

```bash
# Step 1: Read relevant rules for identified modules
#   references/rules/cross-cutting/AUTH001.md
#   references/rules/postgresql/PG-CR001.md
#   ...

# Optional: if the user approves running lint, review the script code block in
# references/lint-rules/README.md, copy it to a temporary cloudbase-lint.mjs,
# then run: node cloudbase-lint.mjs --project-dir .

# Step 2: For each applicable rule, read the "LLM 检查" section
#         and manually inspect your code before claiming done.
```

## Rule format

Each rule `.md` file follows this structure:

```markdown
# RULE-ID Rule Name

- **Module**: which module (auth / postgresql / storage / ...)
- **Severity**: error | warning
- **Stage**: code-generation | deployment | config

## 正则检查 (Lint)

The condition checked by the optional script code block in `references/lint-rules/README.md`.

## LLM 检查

Semantic review prompt for human or LLM to evaluate.

## 修复指引

How to fix the issue.
```
