# Main Auto Sync to Examples Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated GitHub Actions workflow that automatically syncs this repository's `main` branch changes to `TencentCloudBase/awsome-cloudbase-examples:master` while preserving the existing manual sync workflow.

**Architecture:** Keep `.github/workflows/sync-branch.yml` as the manual, parameterized branch-to-branch sync entrypoint. Add a new `push`-driven workflow that reuses the same sync sequence, inserts `diff-compat-config` as a release guard, and only runs when main-branch changes touch files that can affect examples output.

**Tech Stack:** GitHub Actions YAML, Node.js 22, existing repository scripts (`sync-config.mjs`, `diff-compat-config.mjs`), Markdown docs.

---

### Task 1: Add the main-branch auto sync workflow

**Files:**
- Create: `.github/workflows/sync-main-to-examples.yml`
- Reference: `.github/workflows/sync-branch.yml`
- Reference: `.github/workflows/build-zips.yml`

- [ ] **Step 1: Create the workflow shell with the fixed trigger and target branch**

Add a new workflow file with this header and trigger block:

```yml
name: Sync Main to Examples

on:
  push:
    branches:
      - main
    paths:
      - "config/source/skills/**"
      - "config/source/guideline/**"
      - "config/source/editor-config/**"
      - "scripts/build-compat-config.mjs"
      - "scripts/diff-compat-config.mjs"
      - "scripts/update-compat-baseline.mjs"
      - "scripts/sync-config.mjs"
      - "scripts/template-config.json"
      - ".github/workflows/sync-main-to-examples.yml"

concurrency:
  group: sync-main-to-examples
  cancel-in-progress: false
```

- [ ] **Step 2: Add the job that checks out both repositories and sets up Node 22**

Use a single `sync` job that keeps the same checkout pattern as the existing manual workflow:

```yml
jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout current repo
        uses: actions/checkout@v4

      - name: Checkout cloudbase-examples
        uses: actions/checkout@v4
        with:
          repository: TencentCloudBase/awsome-cloudbase-examples
          ref: master
          path: cloudbase-examples
          token: ${{ secrets.CLOUDBASE_EXAMPLES_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'
```

- [ ] **Step 3: Insert the compatibility guard before syncing**

Add a dedicated step before the sync script:

```yml
      - name: Validate compatibility surface
        run: node scripts/diff-compat-config.mjs
```

Expected behavior: blocking compat diffs fail the workflow; advisory text drift logs but still returns success.

- [ ] **Step 4: Reuse the current sync steps without changing the sync script behavior**

Add the same status and sync steps used in the manual workflow, but with fixed branches:

```yml
      - name: Check git status before sync
        working-directory: cloudbase-examples
        run: |
          echo "=== Git status before sync ==="
          git status --short || true

      - name: Sync config to examples
        run: node scripts/sync-config.mjs --skip-git
        env:
          CLOUDBASE_EXAMPLES_PATH: cloudbase-examples

      - name: Check git status after sync
        working-directory: cloudbase-examples
        run: |
          echo "=== Git status after sync ==="
          git status --short
          echo "=== Files changed ==="
          git diff --name-only || echo "No changes detected"
          echo "=== Staged files ==="
          git diff --staged --name-only || echo "No staged files"
```

- [ ] **Step 5: Commit and push only when the sync produced real changes**

Add a final step that mirrors the manual workflow's git behavior, but always targets `master` and skips empty commits:

```yml
      - name: Commit and push changes
        working-directory: cloudbase-examples
        env:
          PAT_TOKEN: ${{ secrets.CLOUDBASE_EXAMPLES_TOKEN }}
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add .
          if git diff --staged --quiet; then
            echo "No changes to commit, skipping commit and push"
          else
            git commit -m "chore: sync config from main"
            git remote set-url origin https://x-access-token:${PAT_TOKEN}@github.com/TencentCloudBase/awsome-cloudbase-examples.git
            git push origin master
          fi
```

### Task 2: Document the new automatic/main workflow boundary

**Files:**
- Modify: `CONTRIBUTING.md`

- [ ] **Step 1: Add a short section for the automatic main sync workflow**

Insert a new subsection near the existing Actions workflow documentation that explains the new workflow and its boundary:

```md
### Sync Main to Examples

**Workflow**: `.github/workflows/sync-main-to-examples.yml`

在本仓库 `main` 分支发生 push，且变更命中 examples 相关路径时自动触发。

**行为**：
- 先执行 `node scripts/diff-compat-config.mjs` 作为兼容面守门
- 再执行 `node scripts/sync-config.mjs --skip-git`
- 自动同步到 `TencentCloudBase/awsome-cloudbase-examples` 的 `master` 分支
- 如果同步结果没有产生 diff，则跳过 commit / push
```

- [ ] **Step 2: Clarify that the old workflow remains manual and branch-parameterized**

Update the existing `Sync Branch to Examples` section so it explicitly states that it is still the manual workflow for non-main or preview sync:

```md
仅用于手动将本仓库的指定分支同步到 cloudbase-examples 的指定分支，不构建 zip 文件，也不替代 `main` 主线的自动同步 workflow。
```

### Task 3: Verify the new workflow file and final diff

**Files:**
- Verify: `.github/workflows/sync-main-to-examples.yml`
- Verify: `CONTRIBUTING.md`

- [ ] **Step 1: Parse the new workflow YAML to catch syntax errors**

Run:

```bash
ruby -e 'require "yaml"; YAML.load_file(".github/workflows/sync-main-to-examples.yml"); puts "YAML OK"'
```

Expected: `YAML OK`

- [ ] **Step 2: Check repository diff formatting issues**

Run:

```bash
git diff --check
```

Expected: no output

- [ ] **Step 3: Review the final file diff to confirm only the intended workflow/docs changed**

Run:

```bash
git --no-pager diff -- .github/workflows/sync-main-to-examples.yml CONTRIBUTING.md docs/superpowers/specs/2026-04-01-main-auto-sync-to-examples-design.md docs/superpowers/plans/2026-04-01-main-auto-sync-to-examples.md
```

Expected: shows the new workflow, the contributor doc update, and the two planning docs only.
