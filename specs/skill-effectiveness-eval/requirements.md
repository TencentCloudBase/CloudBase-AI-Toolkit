# 需求文档：Skill Effectiveness 端到端评估

## 介绍

当前 CloudBase-MCP 项目已有 skill-inject 命中率评估体系（P/R/F1=0.93），能量化检测"skill 是否被正确注入到代理上下文"。但**缺少对 skill 注入后实际效果的评估**——不知道 skill 内容是否真正帮助代理写出更好的代码。

对标 Supabase Agent Skills 的三条件对照 + LLM judge 方法论，建立端到端 skill-effectiveness 评估能力，回答"我们的 skill 到底有没有用"这个根本问题。

利用项目 CI 中已有的 CodeBuddy CLI headless 模式（`codebuddy -p --model hy3-preview-ioa`）和 hunyuan 免费模型，在项目内完成评估，不依赖 Braintrust 等外部平台。

## 现状与差距

| 维度 | 现状 | 目标 |
|------|------|------|
| 评估对象 | skill 是否被正确注入（命中率） | skill 是否真正改善代码质量（效果） |
| 评估方法 | 规则匹配（P/R/F1） | LLM judge 评分 + 三条件对照 |
| 对照组 | 无 | baseline / MCP only / MCP+Skill |
| 评估平台 | 自研脚本 | CodeBuddy CLI + hy3 模型（项目内） |
| CI 接入 | `npm run test:hooks`（每 PR） | 定期跑 + 手动触发（非每 PR） |

## 需求

### 需求 1 - 三条件对照评估框架

**用户故事：** 作为 skill 维护者，我希望能在三种条件下对照评估代理完成 CloudBase 任务的质量，以便量化 skill 的真实贡献，而不是只看注入命中率。

#### 验收标准

1. While 评估框架已搭建, when 运行评估脚本时, the system shall 在三种条件下分别执行代理任务：Baseline（无 cloudbase plugin + 无 MCP）、MCP only（无 cloudbase plugin + 有 MCP）、MCP + Skill（有 cloudbase plugin + 有 MCP）。
2. While 三条件任务已执行完成, when 收集结果时, the system shall 保存每个条件的完整代理转录和生成的文件。
3. While 三条件结果已收集, when 输出报告时, the system shall 生成对比表展示每个场景在三条件下的得分，并计算 skill 净贡献值（MCP+Skill 得分 - MCP only 得分）。
4. While 评估框架已搭建, when 控制条件时, the system shall 通过不同的 fixture 项目配置（`.claude/` 目录、MCP 配置）实现条件隔离，不依赖环境变量单独禁用 hooks。

### 需求 2 - 核心场景覆盖

**用户故事：** 作为 skill 维护者，我希望评估覆盖 CloudBase 核心开发场景，以便发现哪些 skill 内容有效、哪些需要改进。

#### 验收标准

1. While 评估场景已定义, when 选择场景时, the system shall 至少覆盖以下 5 个核心场景：PostgreSQL RLS（建表 + 安全策略）、Web 用户名密码认证、Storage 前端上传（安全域名配置）、HTTP 云函数部署、NoSQL 安全规则配置。
2. While 场景已选定, when 执行评估时, the system shall 为每个场景提供一个最小可运行的 fixture 项目模板（包含必要的 `package.json`、入口文件、TODO 标记）。
3. While 场景已执行, when 评分时, the system shall 将需求分为主要需求（核心交付物）和次要需求（安全检查、工作流合规），分别评分。

### 需求 3 - LLM judge 自动评分

**用户故事：** 作为 skill 维护者，我希望用 LLM 自动评分代理的输出质量，以便无需人工审查每个评估结果。

#### 验收标准

1. While 代理任务已执行完成, when 触发评分时, the system shall 调用 hunyuan 模型（`hy3-preview-ioa`）作为 LLM judge，审查完整转录和生成的文件。
2. While LLM judge 审查时, when 评估主要需求时, the system shall 检查具体证据（工具调用记录、SQL 语句、代码文件、有效输出），而非仅依赖代理的自我陈述。
3. While LLM judge 评分完成, when 输出结果时, the system shall 为每个场景每个条件生成 0-100 分的得分，并列出通过/未通过的具体需求项。
4. While 评分结果已生成, when 评估可靠性不足时, the system shall 标注低置信度结果（如 judge 模型无法判断时），提示人工复查。

### 需求 4 - CI 接入与定期执行

**用户故事：** 作为团队，我们希望评估能定期自动运行，以便监控 skill 质量趋势，同时在 skill 内容变更时可手动触发验证。

#### 验收标准

1. While CI workflow 已配置, when 到达定期触发时间时, the system shall 每 2 周自动运行一次完整评估（cron 触发）。
2. While PR 修改了 skill 内容, when 开发者需要验证时, the system shall 支持通过 `workflow_dispatch` 手动触发评估。
3. While 评估不在每 PR 都跑, when PR 仅修改非 skill 内容时, the system shall 不触发评估（成本控制）。
4. While 评估完成, when 结果已生成时, the system shall 将结果存档到 `specs/skill-effectiveness-eval/baseline-results/` 目录，按日期命名，便于趋势对比。

## 范围

### 在范围内

- 三条件对照评估框架设计与实现
- 5 个核心场景的 fixture 项目模板
- LLM judge 评分脚本（用 hy3 模型）
- CI workflow 配置（定期 + 手动触发）
- 评估结果存档与对比

### 不在范围内

- Braintrust 等外部评估平台接入（用项目内 hy3 模型）
- 跨代理评估（先在 CodeBuddy 上跑通，跨代理是后续 P2）
- 评估所有 28 个 skill（先覆盖 5 个核心场景）
- 实时评估反馈（先做离线定期评估）
- skill 内容优化实施（评估方案先行，优化是后续任务）

## 技术约束

1. **复用现有基础设施**：CodeBuddy CLI headless 模式、`CODEBUDDY_AUTH_TOKEN` 认证、`hy3-preview-ioa` 模型
2. **不依赖外部平台**：不引入 Braintrust，评估脚本和 judge 都在项目内完成
3. **成本控制**：每场景 3 条件 = 3 次代理执行 + 3 次 judge 评分，5 场景共 30 次调用，需控制单次执行时间
4. **fixture 项目隔离**：三条件通过不同的项目配置实现，不修改 hooks 运行时代码

## 参考

- Supabase Agent Skills 博文：https://supabase.com/blog/supabase-agent-skills#how-we-test-it
- OpenAI Agent Skills 评估框架：https://developers.openai.com/blog/eval-skills
- 现有 skill-inject 评估：`specs/plugin-review/evaluation-design.md`
- CodeBuddy CLI headless 调用示例：`.github/workflows/issue-auto-processor-simple.yml:419`
- 对标分析报告：`/Users/bookerzhao/Projects/AI-Workspace/output/reviews/2026-07-16-cloudbase-mcp-vs-supabase-agent-skills-review.md`
