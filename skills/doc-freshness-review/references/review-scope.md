# Documentation Freshness Review Scope

## Purpose

Use this reference to keep documentation review focused on freshness, drift, and evidence-backed correction.

## Review surfaces

### 1. Published documentation

Primary target:

- `doc/`

Check whether published documentation still matches:

- current source behavior
- generated artifacts
- linked scripts and workflow names
- repository layout and file names

### 2. README surfaces

Primary targets:

- `README.md`
- `README-EN.md`
- `README-ZH.md`
- `mcp/README.md`

Check whether these entry surfaces still match:

- current capabilities
- current commands
- current file paths
- public documentation under `doc/`

## Typical drift patterns

- missing or stale references to scripts, docs, or workflows
- commands that no longer exist or no longer work
- README surfaces describing removed or renamed features
- published documentation lagging behind current implementation
- duplicated guidance that drifted in multiple places

## Escalation rule

- Mechanical, low-risk correction: fix + PR
- Clear finding but broader coordination needed: issue + report
- Product behavior still unclear: report only until confirmed
