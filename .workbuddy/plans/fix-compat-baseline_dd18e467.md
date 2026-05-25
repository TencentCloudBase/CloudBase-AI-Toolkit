---
name: fix-compat-baseline
overview: "修复 PR #454 的 CI compat-diff 检查失败：重新生成 compat-baseline.json 使其包含新增和变更的 skill 文件，然后提交推送。"
todos:
  - id: update-baseline
    content: 运行 npm run update:compat-baseline 更新 compat-baseline.json，然后运行 npm run check:compat-diff 验证退出码为 0
    status: completed
  - id: commit-push
    content: "将 compat-baseline.json 单独暂存并提交（commit message: chore(compat): 🔄 update compat baseline for skill contract refresh），推送到 github 远端"
    status: completed
    dependencies:
      - update-baseline
---

## 用户需求

修复 PR #454 的 CI 失败问题。

## 产品概述

PR #454（`feature/skill-contract-refresh`）在 GitHub Actions 中的 `compat-diff` 检查步骤失败，需要更新兼容性基线文件使 CI 通过。

## 核心功能

- 更新 `config/source/editor-config/compat-baseline.json` 基线文件，使其包含新增的 45 个文件（`cloud-functions/references/` 子目录和 `no-sql-wx-mp-sdk/security-rules.md` 在各 IDE target 下的生成产物）以及 135 个内容变更文件的最新哈希
- 验证 `node scripts/diff-compat-config.mjs` 退出码为 0（无 blocking diff）
- 提交更新后的基线文件并推送到远端，使 PR #454 CI 恢复绿色

## 技术栈

- Node.js 脚本（纯 ESM，无 node_modules 依赖）
- 项目已有的兼容性基线管理工具链

## 实现方案

本次修复只涉及运行项目已有的基线更新脚本，不需要修改任何源代码。

**方法**：执行 `npm run update:compat-baseline`，该命令调用 `scripts/update-compat-baseline.mjs`，内部会先调用 `buildCompatConfig()` 生成 `.generated/compat-config/` 下的全量兼容产物，然后调用 `buildCompatBaselineManifest()` 扫描生成目录、计算所有文件的 SHA-256 哈希，写入 `config/source/editor-config/compat-baseline.json`。

**为什么 CI 会失败**：分支上新增了 5 个 source skill 文件（`cloud-functions/references/` 下 4 个 + `no-sql-wx-mp-sdk/security-rules.md`），这些文件通过 `buildCompatConfig()` 被复制到 9 个 IDE target 目录下（agent/clinerules/codebuddy/cursor/kiro/qoder/trae/windsurf/rules），产生 45 个"extra"文件未被记录在基线中。同时多个 skill 的 SKILL.md 内容变更导致 135 个文件哈希不匹配。更新基线后两类 diff 都会消除。

## 实现注意事项

- 更新基线前不需要手动运行 `build-compat-config.mjs`，`update-compat-baseline.mjs` 内部会自动构建
- 更新后必须验证 `diff-compat-config.mjs` 退出码为 0
- 当前工作区有 3 个未暂存的修改文件（`guideline/cloudbase/SKILL.md`、`capi.ts`、`capi.test.ts`），这些不影响基线更新，但提交时只需 stage `compat-baseline.json` 一个文件
- 推送时 `cnb` remote 可能不存在，失败可忽略

## 目录结构

```
config/source/editor-config/
  └── compat-baseline.json  # [MODIFY] 更新兼容性基线清单，纳入新增的 45 个文件条目及 135 个哈希变更
```