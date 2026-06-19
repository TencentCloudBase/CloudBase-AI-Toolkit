# 需求文档

## 介绍

调整当前 skills 架构，明确区分两套不同的 skills 资产，而不是将 `config/.claude/skills/` 视为由根目录 `skills/` 生成的镜像。

新的目标是：

- 根目录 `skills/` 仅用于本项目开发时消费与维护
- `config/.claude/skills/` 仅用于对外分发给用户项目消费与维护

两者服务对象不同、生命周期不同、内容允许不同，因此不应再被建模为单向镜像关系。

## 需求

### 需求 1 - 明确两套 skills 资产的职责边界

**用户故事：** 作为仓库维护者，我希望根目录 `skills/` 和 `config/.claude/skills/` 的职责被明确区分，这样团队在修改 skill 时不会混淆“本项目开发用”和“用户分发用”的边界。

#### 验收标准

1. When 维护者查看仓库说明文档时，CloudBase AI Toolkit shall 明确说明根目录 `skills/` 用于本项目开发消费与维护。
2. When 维护者查看仓库说明文档时，CloudBase AI Toolkit shall 明确说明 `config/.claude/skills/` 用于对外分发给用户项目消费与维护。
3. When 维护者选择修改某个 skill 时，CloudBase AI Toolkit shall 不再默认假设两处目录是镜像关系。

### 需求 2 - 移除单向镜像假设

**用户故事：** 作为仓库维护者，我希望现有脚本和文档不再把 `config/.claude/skills/` 当作 `skills/` 的镜像产物，这样不会继续误导维护流程。

#### 验收标准

1. When 仓库脚本或文档描述 `skills/` 与 `config/.claude/skills/` 的关系时，CloudBase AI Toolkit shall 不再使用“mirror”或“generated from `skills/`”作为默认模型。
2. When 维护者阅读 `config/README.md` 时，CloudBase AI Toolkit shall 不再声明 `config/.claude/skills/` 不应手工修改。
3. When 维护者执行与 skills 相关的脚本时，CloudBase AI Toolkit shall 避免隐式覆盖 `config/.claude/skills/` 的独立内容。

### 需求 3 - 调整 skills 相关脚本与测试

**用户故事：** 作为仓库维护者，我希望 skills 相关脚本和测试符合新的双源模型，这样自动化不会继续按错误假设运行。

#### 验收标准

1. When 运行 skills 构建或同步相关脚本时，CloudBase AI Toolkit shall 明确区分“本项目 skills”与“分发 skills”的输入输出语义。
2. When 现有脚本仅适用于某一套 skills 资产时，CloudBase AI Toolkit shall 在脚本命名、注释或输出中明确说明其适用范围。
3. When 现有测试验证 `skills/` 与 `config/.claude/skills/` 一致性时，CloudBase AI Toolkit shall 移除或重构这些测试，以适配新的双源模型。

### 需求 4 - 为后续迁移保留清晰演进路径

**用户故事：** 作为仓库维护者，我希望这次调整不仅是文档修正，还能为后续技能迁移和维护建立稳定规则，这样后续 PR 不会继续在错误目录假设上反复返工。

#### 验收标准

1. When 维护者新增或修改本项目开发用 skill 时，CloudBase AI Toolkit shall 引导其修改根目录 `skills/`。
2. When 维护者新增或修改对外分发 skill 时，CloudBase AI Toolkit shall 引导其修改 `config/.claude/skills/`。
3. When 后续需要说明某个 skill 属于哪套体系时，CloudBase AI Toolkit shall 提供清晰、可执行的判定规则。
