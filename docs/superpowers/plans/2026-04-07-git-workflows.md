# Git Workflows Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 更新 `git-workflows` skill，把本次正式版发布中暴露的经验固化成更稳妥的 commit / push / release 工作流规则。

**Architecture:** 只修改 skill 文档层。主 skill 文件负责触发条件与执行守则，`source-commands.md` 负责具体命令模板，`command-catalog.md` 负责面向使用者的命令映射摘要。重点补齐正式版/预发布分流、tag 校验、本地文件保护和 release 前后校验。

**Tech Stack:** Markdown, git, gh CLI, bumpp workflow conventions

---

### Task 1: 补齐 skill 总体执行守则

**Files:**
- Modify: `.workbuddy/skills/git-workflows/SKILL.md`

- [ ] 增加“按发布类型区分正式版与 prerelease”规则
- [ ] 增加“提交前检查 staged diff，避免 `.workbuddy/` 与临时结果文件误入 commit”规则
- [ ] 增加“release/PR/push 前后都要做状态校验”的规则

### Task 2: 优化 release note 与正式版发布模板

**Files:**
- Modify: `.workbuddy/skills/git-workflows/references/source-commands.md`

- [ ] 在 `releasenote.md` 中补充正式版默认对比上一正式版、预发布才允许使用 prerelease 基线的规则
- [ ] 在 `releasenote.md` 中补充发布前检查 release 是否已存在、发布后回读 release 元数据的步骤
- [ ] 在 `version_publish_main.md` 中补充同步远端 tags、处理本地 tag 冲突、避免直接依赖 `bumpp` 默认 push/tag 副作用的说明
- [ ] 在 `version_publish_main.md` 中补充保护本地工作文件和临时文件的检查项

### Task 3: 同步命令目录摘要

**Files:**
- Modify: `.workbuddy/skills/git-workflows/references/command-catalog.md`

- [ ] 更新 `/releasenote` 与 `/version_publish_main` 的 intent 文案，让摘要能反映新规则
- [ ] 视需要补一句“正式版默认忽略 beta 基线”的说明

### Task 4: 自检与经验记录

**Files:**
- Modify: `.workbuddy/memory/2026-04-07.md`

- [ ] 复核三个文档之间是否一致
- [ ] 记录这次 skill 优化沉淀了哪些发布经验
