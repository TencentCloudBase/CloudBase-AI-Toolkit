# Git Workflows Skill Design

## Goal

沉淀本次正式版发布中的经验，优化 `/.workbuddy/skills/git-workflows`，让 `/git-workflows` 在 commit / push / release / workflow triage 场景下更稳妥，尤其减少正式版发布时的基线判断错误、tag 冲突和本地临时文件误提交。

## Scope

本次仅调整 skill 文档与命令源说明，不新增自动化脚本，也不改仓库业务代码。

涉及文件：
- `/.workbuddy/skills/git-workflows/SKILL.md`
- `/.workbuddy/skills/git-workflows/references/source-commands.md`
- `/.workbuddy/skills/git-workflows/references/command-catalog.md`

## Key Decisions

### 1. 正式版与预发布分流
- 正式版 release note 默认以上一个正式版 tag 为对比基线
- beta / prerelease 只有在用户明确要求时，才允许以上一个 prerelease 作为基线
- skill 中明确要求在生成 release note 前先确认“当前目标是正式版还是预发布”

### 2. 版本 bump 改为可控步骤
- 文档中不再把 `npx bumpp` 当成黑盒交互步骤
- 增加发布前先同步远端 tags、检查本地 tag 冲突的规则
- 推荐在需要人工确认的发布流程中显式避免自动 push / 自动发布副作用，先校验、再执行外部动作

### 3. 本地工作文件保护
- 在 commit / push / release 工作流中增加检查项，避免误提交 `.workbuddy/`、临时 release 草稿、个人结果文件等本地产物
- 强调提交前必须审阅 staged diff，而不是默认 `git add -A`

### 4. 发布前后双向校验
- 发布前检查 release 是否已存在
- 发布后回读 release 的 URL、draft / prerelease 状态和发布时间
- workflow 输出里要包含发布链接，便于复核和留档

## Expected Outcome

优化后的 skill 应该能：
- 更准确地区分正式版和 beta 发布语义
- 降低 `bumpp`、tag 和远端状态不一致导致的中断风险
- 降低误提交本地工作文件的概率
- 让 release 创建结果更容易验证和复盘
