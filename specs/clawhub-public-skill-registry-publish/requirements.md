# 需求文档

## 介绍

当前仓库已经具备从 `config/source/skills/` 与 `config/source/guideline/` 构建对外 Skill 产物并推送到独立 skills 仓库的能力，但缺少面向 ClawHub public skill registry 的自动发布流程。

本需求目标是补齐一套 GitHub Actions 发布脚本，使维护者可以基于仓库中的原始 skill 源或受控构建产物，按目标发布单元自动发布到 ClawHub public skill registry，同时保留必要的校验、日志和失败反馈能力。

结合当前仓库结构，已确认需要探索并纳入的发布单元不是“全量 skills”，而是“按目标发布单元”处理，当前范围包括：

- `miniprogram-development`：直接来自 `config/source/skills/miniprogram-development/`
- `all-in-one`：对应 `scripts/build-allinone-skill.ts` 生成的 `cloudbase` 聚合 Skill

当前草案基于以下探索结论与假设：

- 发布对象以“显式选中的发布单元”为准，而不是默认发布 `config/source/skills/` 下所有 Skill。
- `miniprogram-development` 可直接从 `config/source/skills/` 发布。
- `all-in-one` 需要通过 `scripts/build-allinone-skill.ts` 先构建，再作为单独 Skill 发布。
- `setup-cloudbase-openclaw` 已确认不再维护，不纳入本次 ClawHub 发布范围。
- 发布动作通过 ClawHub 官方 CLI `clawhub` 执行。
- GitHub Actions 将通过仓库 Secret 注入发布凭证。

## 需求

### 需求 1 - 按目标发布单元准备发布输入

**用户故事：** 作为维护者，我希望工作流能够按我指定的发布目标准备发布输入，而不是默认发布所有 Skill，这样我可以只发布当前需要的单元。

#### 验收标准

1. When 发布工作流启动时, the CloudBase AI Toolkit shall 仅处理维护者显式指定的发布单元，而不是默认扫描并发布所有 Skill。
2. When 维护者指定 `miniprogram-development` 时, the CloudBase AI Toolkit shall 从 `config/source/skills/miniprogram-development/` 生成可供 registry 发布的独立输入目录。
3. When 维护者指定 `all-in-one` 时, the CloudBase AI Toolkit shall 先调用 `scripts/build-allinone-skill.ts` 构建 `cloudbase` 聚合 Skill，再生成可供 registry 发布的独立输入目录。
4. While 某个发布单元缺少 `SKILL.md` 或必要元数据时, when 工作流准备发布输入, the CloudBase AI Toolkit shall 阻止发布该单元并输出明确的失败原因。

### 需求 2 - 提供可控的 GitHub Actions 发布入口

**用户故事：** 作为维护者，我希望通过 GitHub Actions 触发发布，并控制发布哪些 Skill、何时发布，这样发布过程可追踪且可回放。

#### 验收标准

1. When 维护者手动触发 GitHub Actions 工作流时, the CloudBase AI Toolkit shall 支持通过输入参数指定要发布的目标单元，至少覆盖 `miniprogram-development` 与 `all-in-one`。
2. When 维护者一次指定多个发布单元时, the CloudBase AI Toolkit shall 按单元逐个构建与发布，并分别记录结果。
3. When 指定的发布单元名称不存在或当前仓库不支持解析时, the CloudBase AI Toolkit shall 终止工作流并输出无效单元名称列表。
4. While 发布工作流执行中, when 每个发布单元开始与结束发布时, the CloudBase AI Toolkit shall 在日志中输出对应单元名称、阶段状态和结果。

### 需求 3 - 调用 ClawHub Registry 发布能力

**用户故事：** 作为维护者，我希望工作流直接调用 ClawHub 的发布工具完成 registry 发布，这样可以避免手工在本地重复执行命令。

#### 验收标准

1. When 工作流进入发布阶段时, the CloudBase AI Toolkit shall 在 GitHub Actions 环境中安装或启用 ClawHub CLI。
2. When 发布某个目标单元时, the CloudBase AI Toolkit shall 使用仓库 Secret 提供的凭证调用 `clawhub sync` 命令，并显式传入 `--root`、`--all`、`--bump`、`--changelog` 与 `--tags` 等参数。
3. While 发布凭证缺失或无效时, when 工作流尝试发布, the CloudBase AI Toolkit shall 立即失败并输出凭证配置缺失或认证失败提示。
4. When 某个目标单元发布失败时, the CloudBase AI Toolkit shall 在工作流摘要或日志中保留失败单元名称和错误信息。

### 需求 4 - 保证发布前校验与回归边界

**用户故事：** 作为维护者，我希望发布前至少完成基础校验，避免把结构错误或不完整的 Skill 发布到公共 registry。

#### 验收标准

1. When 发布工作流开始执行时, the CloudBase AI Toolkit shall 在发布前运行与目标单元构建直接相关的本地校验步骤。
2. While 发布输入目录与目标单元定义的源目录或构建产物存在结构偏差时, when 校验步骤执行, the CloudBase AI Toolkit shall 阻止继续发布并输出差异信息。
3. When 发布脚本或工作流被修改时, the CloudBase AI Toolkit shall 提供自动化测试或脚本级验证，确保发布单元筛选、构建与发布逻辑可回归。

### 需求 5 - 与现有发布链路保持边界清晰

**用户故事：** 作为维护者，我希望新增的 ClawHub 发布流程不会破坏现有 skills repo、compat config 和文档生成链路。

#### 验收标准

1. When 新增 ClawHub 发布脚本后, the CloudBase AI Toolkit shall 保持现有 `scripts/build-skills-repo.mjs` 与 `push-skills-repo.yaml` 的默认行为不变。
2. When ClawHub 发布工作流执行时, the CloudBase AI Toolkit shall 仅消费 `config/source/*` 或其受控构建产物，而不要求手工修改 `.skills-repo-output/` 等生成目录。
3. While 仓库中存在其他未参与发布的变更时, when ClawHub 发布工作流运行, the CloudBase AI Toolkit shall 仅处理被显式选中的发布单元，避免误发布无关内容。
4. When 发布 `all-in-one` 单元时, the CloudBase AI Toolkit shall 复用现有 all-in-one 构建链路，而不是复制一套独立的聚合逻辑。
