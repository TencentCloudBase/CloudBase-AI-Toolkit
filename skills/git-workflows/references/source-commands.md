## Source commands (migrated from `.cursor/commands/`)

### git_commit.md

```md
# Git Commit Workflow

## Function
Git commit and push workflow following OpenAgentKit standards

## Trigger Condition
When user inputs `/git_commit`

## Behavior
1. Commit code using conventional-changelog style
2. After each commit, run `git status --short`.
3. If hooks/build steps modified tracked files (for example generated docs or JSON), review them and create follow-up commit(s) until the working tree is clean.
4. Execute `git push origin <branch-name>`

## Commit Message Format
Follow conventional-changelog style:
```
type(scope): description

[optional body]

[optional footer]
```

### Commit Types
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples
```
feat(auth): add OAuth2 authentication support
fix(ui): resolve button alignment issue in mobile view
docs(api): update authentication endpoint documentation
```

## Quality Checklist
- [ ] Commit message follows conventional-changelog format
- [ ] Changes are properly staged
- [ ] No sensitive information in commit
- [ ] Code passes linting and tests
```

### git_push.md

```md
# Git Push Workflow

## Function
Complete git workflow including branch management and PR creation

## Trigger Condition
When user inputs `/git_push`

## Behavior
1. Commit code using conventional-changelog style
2. Create or switch to feature branch (e.g., feature/xxx) instead of directly to main
3. Execute `git push origin <branch-name>`
4. Automatically create PR after push
5. Switch back to main branch after PR creation

## Branch Naming Convention
- `feature/description`: New features
- `fix/description`: Bug fixes
- `docs/description`: Documentation updates
- `refactor/description`: Code refactoring
- `chore/description`: Maintenance tasks

## PR Creation
- Use conventional-changelog style for PR title
- Include detailed description of changes
- Reference related issues if applicable
- Add appropriate labels and reviewers
- After opening the PR, wait a few minutes and then inspect automated review comments and CI results before declaring the work done
- If review feedback or CI failures are actionable, continue fixing them on the same branch and update the PR

## Quality Checklist
- [ ] Working on appropriate feature branch
- [ ] Commit message follows conventional-changelog format
- [ ] All changes are committed and pushed
- [ ] PR is created with proper title and description
- [ ] Waited a few minutes, checked review comments and CI, and handled any actionable follow-up
- [ ] Switched back to main branch
```

### releasenote.md

```md
---
name: releasenote
description: Generate and publish release note using gh CLI
---

# Release Note Generator Command

## Function
Automatically generate and publish a user-friendly release note in Chinese by analyzing git commit history between versions.

**Brand Name**: Use "CloudBase MCP" (NOT "CloudBase AI Toolkit") in all release notes.

## Trigger Condition
When user inputs `/releasenote`

## Behavior

### Step 1: Version Detection
1. Get the latest tag: `git tag --sort=-v:refname | head -1`
2. Get the previous release tag: `gh release list --limit 1 --json tagName`
3. If no previous release exists, use the initial commit as baseline

### Step 2: Commit Analysis
1. Get all commits between versions: `git log <previous_tag>..<latest_tag> --oneline --no-merges`
2. Parse commit messages following conventional-changelog format:
   - `feat`: New features (新功能)
   - `fix`: Bug fixes (问题修复)
   - `docs`: Documentation changes (文档更新)
   - `perf`: Performance improvements (性能优化)
   - `refactor`: Code refactoring (代码重构)
   - `style`: Style changes (样式调整)
   - `test`: Test additions/updates (测试更新)
   - `chore`: Maintenance tasks (maintenance - 不在 release note 中显示)
   - `build`: Build system changes (构建优化)
   - `ci`: CI configuration changes (maintenance - 不在 release note 中显示)

### Step 3: Generate Release Note Content

**Format Guidelines:**
- Use Chinese language
- Focus on user-facing changes and benefits
- Group by feature categories (e.g., IDE 支持、环境管理、开发工具、文档和用户体验、数据库、云函数、AI 能力等)
- Weaken technical implementation details
- Exclude maintenance-related commits (chore, ci, internal refactoring) from the main highlights by default
- If maintenance / engineering changes are worth mentioning, place them in a dedicated section at the very end and keep the wording lightweight (optional reading)
- Highlight breaking changes if any
- Use friendly, non-technical language where possible
- Add emoji for better readability (optional but recommended for sections)

**Structure:**
```markdown
# CloudBase MCP v{VERSION}

## 🎉 新功能

### {Category 1}
- {User-friendly description of feature 1}
- {User-friendly description of feature 2}

### {Category 2}
- ...

## 🐛 问题修复

- {User-friendly description of bug fix 1}
- {User-friendly description of bug fix 2}

## 📚 文档更新

- {Documentation improvements}

## ⚡ 性能优化

- {Performance improvements}

## 🔧 其他改进

- {Other improvements}

## 🔧 维护与工程改进（可选阅读）

- {Lightweight summary of maintenance / workflows / CI / ecosystem improvements}
```

### Step 4: Interactive Confirmation
1. Display the generated release note content
2. Ask user to review and confirm:
   - "请查看以下 Release Note 内容，是否需要修改？"
   - Options: "确认发布" / "需要修改" / "取消"
3. If user chooses "需要修改", allow editing before proceeding

### Step 5: Publish Release
1. Create release using gh CLI:
   ```bash
   gh release create {tag} \
     --title "CloudBase MCP v{VERSION}" \
     --notes "{generated_content}" \
     --verify-tag
   ```
2. Display success message with release URL
3. Remind user to update related documentation if needed

## Content Translation Rules

**Commit Type to Chinese:**
- feat → 新功能
- fix → 问题修复
- docs → 文档更新
- perf → 性能优化
- refactor → 代码优化 (only if user-visible impact)
- style → 样式调整
- test → 测试改进 (usually skip)
- build → 构建优化

**Common Phrases:**
- "add" → "新增"
- "update" → "优化" / "更新"
- "fix" → "修复"
- "improve" → "改进"
- "support" → "支持"
- "remove" → "移除"
- "deprecate" → "废弃"

**Category Examples:**
- IDE Support → IDE 支持
- Environment Management → 环境管理
- Development Tools → 开发工具
- Documentation → 文档和用户体验
- Database → 数据库功能
- Cloud Functions → 云函数
- AI Capabilities → AI 能力
- Authentication → 身份认证
- Storage → 云存储
- Hosting → 静态托管

## Quality Checklist
- [ ] All user-facing changes are included
- [ ] Content is written in Chinese
- [ ] Technical jargon is minimized
- [ ] Changes are grouped by logical categories
- [ ] Maintenance commits are excluded
- [ ] Breaking changes are highlighted
- [ ] Release URL is provided after publishing
```

### version_publish_main.md

```md
---
name: version_publish_main
description: Build, bump version, and publish release on main
---

# Version Publish (main branch) Command

## Function
Publish a new version from the `main` branch with a consistent sequence:
build -> commit+push to main -> bump version in `mcp/` -> generate/publish release notes.

## Trigger Condition
When user inputs `/version_publish_main`

## Behavior

### Step 0: Preconditions (must pass)
1. Ensure current branch is `main`
2. Ensure working tree is clean: `git status --porcelain` is empty
3. Ensure local main is up to date:
   - `git fetch origin`
   - `git pull --ff-only origin main`

### Step 1: Build on main
1. Run build: `npm run build`
2. Stage build outputs (only if the repo expects build artifacts to be committed)
3. Commit build changes and push directly to `main`:
   - Commit message MUST be English and conventional-changelog style
   - Example: `chore(release): build artifacts for vX.Y.Z`
   - Push: `git push origin main`

### Step 2: Bump version in `mcp/`
1. `cd mcp`
2. Determine the exact target version (preferred) or release type before running `bumpp`.
3. Run `bumpp` non-interactively instead of relying on prompts:
   - Exact version: `npx bumpp --release X.Y.Z --yes --no-commit --no-tag --no-push --ignore-scripts`
   - Release type: `npx bumpp --release patch --yes --no-commit --no-tag --no-push --ignore-scripts`
   - Supported `--release` values include explicit versions and release types such as `major`, `minor`, `patch`, `premajor`, `preminor`, `prepatch`, and `prerelease`.
   - Ensure Node 22+ is active before running (e.g. via `nvm use 22` or the workspace's version manager). Bare `npx bumpp` may fall back to Node 18 and fail.
4. Return to repo root and sync all repo-managed CloudBase skill versions to the same release version:
   - `cd ..`
   - `node scripts/sync-skill-versions.mjs --version X.Y.Z`
   - This updates `config/source/skills/*/SKILL.md` and `config/source/guideline/cloudbase/SKILL.md`
5. After bump, commit the version change on `main` and push:
   - Example: `chore(release): bump version to vX.Y.Z`
   - `git push origin main`

### Step 3: Release note
Run `/releasenote` and follow the interactive confirmation before publishing.

## Safety Notes
- This workflow has direct side effects on `main` (commit + push). Always ask for explicit user confirmation right before pushing.
- If the repository does NOT commit build artifacts, skip Step 1.2 and only ensure the build passes.
```

### github_workflow_fix.md

```md
---
name: github_workflow_fix
description: Analyze the latest failed GitHub Actions run, attempt a worktree-based fix, and submit a PR
---

# GitHub Workflow Failure Triage + Fix

## Function
Inspect the latest failed GitHub Actions run for the current repository, explain the root cause with evidence, and if the failure is actionable in code or repo config, attempt a minimal fix in an isolated git worktree and submit a PR.

## Trigger Condition
When user inputs requests like:
- "分析当前项目 GitHub 最新的流水线失败原因"
- "看下最近失败的 workflow"
- "修一下最新 CI 挂掉的问题并提 PR"

## Behavior

### Step 0: Preconditions
1. Confirm `gh` is available and authenticated:
   - `gh auth status`
2. Confirm the local repo has no blocking dirty changes before creating a worktree:
   - `git status --short`
3. Fetch the latest remote state:
   - `git fetch origin --prune`

### Step 1: Locate the latest failed run
1. Query recent runs:
   - `gh run list --limit 20 --json databaseId,workflowName,displayTitle,headBranch,headSha,event,status,conclusion,createdAt,url`
2. Pick the most recent run whose `conclusion` is `failure`, `timed_out`, or `startup_failure`
3. If there is no failed run, report that explicitly and stop

### Step 2: Gather failure evidence
1. Inspect run summary and jobs:
   - `gh run view <run-id> --json jobs,url,workflowName,displayTitle,headBranch,headSha,event,status,conclusion`
2. Pull failed job logs:
   - `gh run view <run-id> --log-failed`
3. Identify:
   - the first failing job / step
   - the concrete error message
   - whether the issue looks deterministic, flaky, infra-related, or permission-related
4. Summarize the root cause in plain language with the workflow name, run URL, failing job, and the key log evidence

### Step 3: Decide whether to attempt a fix
1. Only continue automatically when the failure appears actionable in repository code, scripts, tests, or workflow config
2. Do NOT attempt a speculative fix for:
   - transient GitHub outage
   - third-party service outage
   - permission / secret / environment values unavailable to the repo
   - flaky failure without a plausible repo-side mitigation
3. If non-actionable, explain why and stop after the diagnosis

### Step 4: Create an isolated worktree
1. Create a branch name based on the failure, e.g. `feature/fix-<workflow-slug>`
2. Create a sibling worktree from the latest `origin/main`:
   - `git worktree add ../<repo>-workflow-fix-<slug> -b feature/<slug> origin/main`
3. Perform all reproduction and edits inside the new worktree, not in the original checkout

### Step 5: Reproduce and fix
1. Reproduce the failure locally when possible using the closest matching command from the logs
2. Make the smallest reasonable change that addresses the identified root cause
3. Re-run the relevant validation locally
4. If local reproduction is impossible, explain the gap and use the strongest available evidence before deciding whether to proceed

### Step 6: Commit, push, and open a PR
1. Review the final diff for accidental changes
2. Commit with an English conventional-changelog message
3. Push the worktree branch to remote
4. Open a PR that includes:
   - failure summary
   - root cause
   - fix summary
   - local verification performed
   - link to the failed run
5. Return to the original checkout after the PR is created

## Output Expectations
- Always report the failed run URL and workflow name
- Always provide a concise root-cause summary before making code changes
- If a fix was attempted, include the worktree path, branch name, commit SHA, and PR URL
- If no fix was attempted, explain the blocker clearly

## Quality Checklist
- [ ] The latest failed run was identified from GitHub, not guessed
- [ ] The diagnosis references actual failing job/log evidence
- [ ] Non-actionable failures are not "fixed" speculatively
- [ ] Any code change is isolated in a dedicated worktree
- [ ] The PR contains both diagnosis and verification details
```

### check_ide_icons.md

```md
---
name: check_ide_icons
description: Check IDE icon configuration consistency across all document components and source files
---

# IDE Icon Integrity Check

## Function
Verify that all IDE icons in the documentation are properly configured and consistent across all files: `IDEIconGrid.tsx`, `IDESelector.tsx`, `setup.ts`, and their cloudbase-docs mirror copies (both zh and en).

## Trigger Condition
When user inputs `/check_ide_icons` or mentions "检查 IDE 图标"、"图标完整性"、"图标检查"

## Behavior

### Step 1: Extract IDE configurations from source files

Run the following commands to extract IDE icon configurations:

1. Extract iconUrl and iconSlug from IDEIconGrid:
   ```
   grep -n 'iconUrl\|iconSlug' doc/components/IDEIconGrid.tsx
   ```

2. Extract iconUrl and iconSlug from IDESelector:
   ```
   grep -n 'iconUrl\|iconSlug' doc/components/IDESelector.tsx
   ```

3. Extract IDE_TYPES from setup.ts:
   ```
   grep -A 30 'IDE_TYPES' mcp/src/tools/setup.ts | grep "'" | head -30
   ```

### Step 2: Check icon URL availability

For each `iconUrl` entry in IDEIconGrid.tsx, check if the URL is reachable:

1. Parse out all `iconUrl` values
2. For each URL, run: `curl -sI -o /dev/null -w "%{http_code}" <url>`
3. Report any URLs that return non-200 status codes

For each `iconSlug` entry, construct the lobe-icons CDN URL:
- Base: `https://img.jsdelivr.com/raw.githubusercontent.com/lobehub/lobe-icons/refs/heads/master/packages/static-png/light`
- If slug is in the color set (`claude`, `gemini`, `baidu`, `alibaba`, `qwen`, `bytedance`, `tencent`): `{base}/{slug}-color.png`
- Otherwise: `{base}/{slug}.png`
- Check each constructed URL with curl

### Step 3: Compare IDE lists across files

Extract the IDE `id` values from each file and compare:

1. Compare IDEIconGrid.tsx vs IDESelector.tsx:
   - Report IDEs present in IDEIconGrid but missing in IDESelector
   - Report IDEs present in IDESelector but missing in IDEIconGrid

2. Compare with setup.ts IDE_TYPES:
   - Report IDEs in documentation but not in setup.ts
   - Report IDEs in setup.ts but not in documentation

3. For each common IDE, verify iconUrl/iconSlug consistency across files

### Step 4: Check cross-repo sync with cloudbase-docs

If the cloudbase-docs repo exists at `../cloudbase-docs/` (sibling directory):

1. Compare IDEIconGrid:
   ```
   diff <(grep -A4 "id:" doc/components/IDEIconGrid.tsx) <(grep -A4 "id:" ../cloudbase-docs/docs/ai/cloudbase-ai-toolkit/components/IDEIconGrid.tsx)
   ```

2. Compare IDESelector:
   ```
   diff <(grep -A4 "id:" doc/components/IDESelector.tsx) <(grep -A4 "id:" ../cloudbase-docs/docs/ai/cloudbase-ai-toolkit/components/IDESelector.tsx)
   ```

3. Compare with English mirror:
   ```
   diff <(grep -A4 "iconUrl\|iconSlug" doc/components/IDEIconGrid.tsx) <(grep -A4 "iconUrl\|iconSlug" ../cloudbase-docs/i18n/en/docusaurus-plugin-content-docs/current/ai/cloudbase-ai-toolkit/components/IDEIconGrid.tsx)
   ```

4. Report any differences found.

### Step 5: Output structured report

Generate a report with the following sections:

```markdown
## IDE 图标完整性检查报告

### ✅ 图标 URL 可达性
- [通过/失败] IDEIconGrid.tsx 中 N 个图标 URL 检查结果
- [通过/失败] IDESelector.tsx 中 N 个图标 URL 检查结果
- 列出所有失败的 URL

### 🔄 IDE 列表一致性
- IDEIconGrid 共 N 个, IDESelector 共 N 个, setup.ts 共 N 个
- 差异明细（如有）

### 🔗 跨仓库同步
- 与 cloudbase-docs 中文版一致性
- 与 cloudbase-docs 英文版一致性

### ⚠️ 需要关注的问题
- 列出所有不一致、缺失、失效的配置项
```

## Quality Checklist
- [ ] All icon URLs have been verified with HTTP HEAD requests
- [ ] All iconSlug entries have been verified against lobe-icons CDN
- [ ] IDE lists have been compared across IDEIconGrid.tsx, IDESelector.tsx, and setup.ts
- [ ] Cross-repo sync with cloudbase-docs has been checked
- [ ] Chinese and English versions have been compared
- [ ] A structured report has been generated
```
