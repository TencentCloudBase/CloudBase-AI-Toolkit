## Command mapping (git delivery)

These workflows are derived from former local command templates.

### Commit

- **Command**: `/git_commit`
- **Source**: `references/source-commands.md`
- **Intent**: create a conventional-changelog style commit safely and consistently

### Push + PR

- **Command**: `/git_push`
- **Source**: `references/source-commands.md`
- **Intent**: branch -> commit -> push -> create PR -> return to main

### Release notes

- **Command**: `/releasenote`
- **Source**: `references/source-commands.md`
- **Intent**: generate/publish release notes from git/GitHub signals

### Version publish (main)

- **Command**: `/version_publish_main`
- **Source**: `references/source-commands.md`
- **Intent**: build on main -> bump version -> generate/publish release notes

### GitHub workflow fix

- **Command**: `/github_workflow_fix`
- **Source**: `references/source-commands.md`
- **Intent**: inspect the latest failed GitHub Actions run -> diagnose with logs -> fix in an isolated worktree -> push and open a PR
