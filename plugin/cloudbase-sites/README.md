# CloudBase Sites Plugin

CloudBase Sites packages the shared CloudBase site runtime for Claude Code,
CodeBuddy, and Codex.

## Codex local validation

Validate the Codex plugin manifest from the repository root:

```bash
python3 /Users/bookerzhao/.codex/skills/.system/plugin-creator/scripts/validate_plugin.py plugin/cloudbase-sites
```

Run the focused regression tests:

```bash
cd mcp
node_modules/.bin/vitest run --config vitest.config.js ../tests/cloudbase-sites-plugin.test.js
```

## Runtime state

Project-local runtime state is stored in `<project>/.cloudbase-sites/`.
Machine-level supervisor state is stored in `~/.cloudbase-sites/`.

These paths are runtime-only and should not be committed.
