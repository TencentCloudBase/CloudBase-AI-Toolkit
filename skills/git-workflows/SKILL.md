---
name: git-workflows
description: Reusable git delivery workflows derived from local slash commands (commit, push, PR, release notes, and GitHub Actions failure triage with worktree-based fixes).
---

# Git Workflows (from local commands)

This skill turns the repo's former local command templates into reusable git delivery workflows.

## When to use this skill

Use this skill when the user asks to:

- run a commit workflow (conventional-changelog style)
- push changes with safe branching and open a PR
- generate release notes from git history / GitHub context
- publish a version from `main` (including bilingual README Recent updates on minor bumps)
- analyze the latest failed GitHub Actions workflow, attempt a fix in an isolated worktree, and submit a PR
- check IDE icon configuration consistency across document components and source files

## Source of truth

All detailed steps and constraints live in:

- `references/source-commands.md`

This skill describes how to apply them consistently across agents/editors without duplicating implementation details.

## Execution rules

1. Read the requested command template from `references/source-commands.md`.
2. Follow it as workflow steps, not as a loose summary.
3. Keep actions safe by default:
   - avoid destructive git operations unless explicitly requested
   - avoid committing secrets
   - keep changes minimal and localized
4. If a workflow implies external side effects (push/PR/release), request explicit confirmation right before performing the side effect.

## Repo-specific gotchas (CloudBase-MCP)

- **Sync dependencies before building on `main`.** A stale `node_modules` shows up as a type error in code that is actually correct (seen: `@cloudbase/manager-node` 5.8.6 installed vs 5.8.8 locked → `Property 'ExternalStorage' does not exist on type 'CreateEnvParams'`). Verify with `npm pack <pkg>@<locked-version>` and read the `.d.ts` before touching code.
- **`pnpm install` fails inside the sandbox** with `ERR_PNPM_CODEBUDDY_BROKER_DENY` (symlink ENOENT), and the failed run deletes the package directory that was previously there. Re-run the same command with sandbox disabled before concluding anything about the build.
- **`npm run build` succeeds even when the last step is blocked.** The build's `rm -rf dist/types` is refused by the safe-delete hook (325 files > threshold), so the log ends with a `SAFE_DELETE_BULK_CONFIRM_REQUIRED` line and `dist/types/` is left behind. Judge the build by whether webpack printed `ERROR in`, not by that trailing message.
- **Release-note scope is `git log <previous-tag>..HEAD`**, including merge commits. A PR number lower than the current version does not mean it already shipped — PRs often merge after the tag that "should" have contained them.
- **`CHANGELOG.md`'s `## Unreleased` is not rotated on release** in this repo; publish a GitHub Release and leave the changelog alone unless asked.
- **Version bump surface**: `mcp/package.json` + `config/source/**` skill versions (`node scripts/sync-skill-versions.mjs --version X.Y.Z`) + `config/.claude/skills` mirror (`npm run sync:claude-skills-mirror`) + optional README bullets (patch: only for clearly user-visible capability, and both `README.md` and `README.zh-CN.md`, verified with `npm run check:readme-sync`).

## Redacting internal references from a pushed PR

Public-repo PR metadata — the title, the body, each commit headline, each commit message — is as public as the diff, yet it never appears *in* the diff, so no file-layer guard covers it. `npm run check:internal-refs` enforces this in CI (see `internal-docs-guard.yml`). When a reference has already been pushed, fix it in place:

1. **Enumerate every source before editing anything.** `gh pr view <n> --json commits` *truncates* headlines — read messages from git instead (`git log --format='%s%n%b' origin/main..<branch>`) and the body via `gh api repos/<owner>/<repo>/pulls/<n> --jq .body`. Body and commit messages are separate fixes; doing only one is the usual miss.
2. **Amend the message, then prove nothing else moved:** `git commit --amend -F -`, followed by `git diff --stat <old-sha> HEAD` — it must be empty.
3. **Force-push with `--force-with-lease`.** The repo rule says "no `--force`", but rewriting an already-pushed message has no alternative; the lease form still refuses to clobber a concurrent update.
4. **Rewrite the body** with `gh pr edit <n> --body-file -`.
5. **Clear local-only commits** carrying the same problem: back up first (`git diff > /tmp/residual.patch`), then `git reset --hard origin/main`. The content is normally already in the PR it was split out of, so nothing is lost — verify each file is covered by a branch before resetting.

A `--force-with-lease` push re-triggers CI, and this repo's `Publish MCP Package to pkg.pr.new` job runs live cloud integration tests that flake on timeouts (seen: cloud-function create/call at 60s). Read the failed test name before assuming the rewrite broke something — a message-only amend cannot.

## Command mapping

See `references/command-catalog.md`.
