# 需求文档：SKILL.md 瘦身与内联安全清单

## 介绍

当前 CloudBase-MCP 项目 28 个 skill 中 25 个超过 100 行（最长 585 行），大量内容是 API 参数文档的复制。Supabase 的实践表明"代理懒于读取参考文件"，过长的 SKILL.md 会导致关键安全信息被跳过。

同时，安全规则集中在 `cloudbase-code-review/references/RULES_INDEX.md`（58 条），开发阶段看不到，只有 close-out 阶段才检查，增加返工成本。

此外，`config/source/guideline/cloudbase/SKILL.md`（262 行）作为总入口指南，`alwaysApply: true`，**每次对话都加载到上下文**。过长的总入口会持续消耗 context budget，瘦身优先级最高。

本需求旨在：
1. 瘦身 guideline 总入口（alwaysApply，优先级最高），将部署流程、控制台链接等移到 `references/`
2. 瘦身 top 5 最长 skill，将 API 细节移到 `references/`，SKILL.md 只保留核心信息
3. 在开发类 skill 中内联安全检查清单，加载即获得
4. 建立瘦身模板，指导后续 skill 维护

## 现状与差距

| 维度 | 现状 | 目标 |
|------|------|------|
| guideline 总入口长度 | 262 行，alwaysApply: true，每次加载 | ≤120 行，只保留路由 + 宪章 |
| skill 平均长度 | 25/28 超过 100 行，最长 585 行 | top 5 瘦身到 ≤200 行 |
| 安全清单位置 | 集中在 code-review 的 RULES_INDEX | 内联到各开发 skill 顶部 |
| 内容策略 | 混合模式（查找 + 复制大量文档） | "教如何查找"为主，SKILL.md 不复制 API 细节 |
| 重复内容 | http-api 中 searchKnowledgeBase 引导重复 3 次 | 去重，关键引导只保留 1 次 |

## 需求

### 需求 1 - Guideline 总入口瘦身（最高优先级）

**用户故事：** 作为 skill 维护者，我希望 guideline 总入口（`alwaysApply: true`）能瘦身到合理长度，以便每次对话不消耗过多 context budget，代理能快速获取路由信息和工程宪章。

#### 验收标准

1. While 瘦身已完成, when 检查 guideline SKILL.md 长度时, the system shall 确保行数不超过 120 行（当前 262 行）。
2. While 瘦身时, when 保留核心内容时, the system shall 在 SKILL.md 中保留：三阶段工作流、Activation Contract、Engineering constitution、High-priority routing 路由表、Routing reminders。
3. While 瘦身时, when 移动非核心内容时, the system shall 将以下内容移到 `references/` 子目录：
   - 部署流程（当前第 195-234 行）→ `references/deployment-workflow.md`
   - 控制台链接列表（当前第 239-262 行）→ `references/console-links.md`
   - CloudBase scenarios 表格（当前第 161-179 行）→ `references/scenarios.md`
   - MCP Prerequisite 的 mcporter 配置细节（当前第 111-153 行）→ 合并到已有的 `references/mcp-setup.md`
4. While 瘦身时, when 处理重复内容时, the system shall 消除 Core Behavior Rules（当前第 183-193 行）与 Activation Contract 的重复段落，保留更精确的版本。
5. While 瘦身时, when 处理非核心内容时, the system shall 删除 Pricing & Free Trial 段落（保留链接即可）和 "What to add to AGENTS.md" 段落（元信息，不属于 skill 加载内容）。
6. While 瘦身时, when 处理 Web SDK quick reminder 时, the system shall 将其移到 `web-development` skill，不在总入口保留。
7. While 瘦身已完成, when 代理需要部署流程或控制台链接时, the system shall 通过 SKILL.md 中的 `references/` 链接按需加载，不丢失任何原有信息。

### 需求 2 - Top 5 最长 skill 瘦身

**用户故事：** 作为 skill 维护者，我希望 top 5 最长的 SKILL.md 能瘦身到合理长度，以便代理在加载时能快速获取关键信息，不被冗长内容淹没。

#### 验收标准

1. While 瘦身已完成, when 检查 SKILL.md 长度时, the system shall 确保 top 5 最长 skill 的 SKILL.md 行数不超过 200 行：http-api（当前 585 行）、auth-wechat（当前 535 行）、auth-web（当前 515 行）、auth-tool（当前 508 行）、cloudbase-platform（当前 484 行）。
2. While 瘦身时, when 移动 API 细节时, the system shall 将完整的 API 参数表、curl 示例、错误码表移到 `references/` 子目录下的独立文件，SKILL.md 只保留工作流 + 查找指引 + 常见错误。
3. While 瘦身时, when 处理重复内容时, the system shall 消除 SKILL.md 内的重复段落（如 searchKnowledgeBase 引导多次出现的合并为 1 次）。
4. While 瘦身已完成, when 代理需要 API 细节时, the system shall 通过 SKILL.md 中的 `references/` 链接按需加载，不丢失任何原有信息。
5. While 瘦身已完成, when 运行 skill 质量标准测试时, the system shall 通过 `tests/skill-quality-standards.test.js` 中所有断言。

### 需求 3 - 内联安全检查清单

**用户故事：** 作为使用 CloudBase 的开发者，我希望 AI 代理在开发阶段就能看到安全检查清单，而不是等到 code review 阶段才发现安全问题，以便减少返工。

#### 验收标准

1. While 内联安全清单已添加, when 代理加载开发类 skill 时, the system shall 在 SKILL.md 顶部（Activation Contract 之后）展示该领域的安全检查清单。
2. While 安全清单已内联, when 选择清单内容时, the system shall 从 `cloudbase-code-review/references/RULES_INDEX.md` 提取每个领域 top 5 高频安全问题，不复制全部 58 条规则。
3. While 安全清单已内联, when 格式化清单时, the system shall 使用 Supabase 风格的简洁格式（❌ 禁止 / ⚠️ 警告），每条不超过 2 行。
4. While 内联清单已添加, when 代理开发时, the system shall 在以下 skill 中包含安全清单：postgresql-development、auth-web、auth-wechat、no-sql-web-sdk、cloud-storage-web。
5. While 内联清单已添加, when code-review skill 运行时, the system shall 保留完整 RULES_INDEX.md 作为 close-out 兜底，不删除原有规则。

### 需求 4 - 瘦身模板与规范

**用户故事：** 作为 skill 维护者，我希望有统一的瘦身模板和规范，以便后续新增或修改 skill 时有标准可循，避免重新膨胀。

#### 验收标准

1. While 瘦身模板已定义, when 新建或修改 skill 时, the system shall 遵循以下 SKILL.md 结构规范：
   - frontmatter（name / description / version / alwaysApply）
   - Standalone Install Note
   - Activation Contract（Use this first / Do NOT / Common mistakes）
   - 安全检查清单（内联，仅开发类 skill）
   - 工作流（何时用 / 如何用）
   - 查找指引（searchKnowledgeBase，只 1 次）
   - 详细参考链接（references/ 目录）
2. While 瘦身模板已定义, when SKILL.md 超过 200 行时, the system shall 触发维护者审查，判断是否需要将部分内容移到 references/。
3. While 瘦身规范已定义, when 内容属于 API 参数表、完整代码示例、错误码表时, the system shall 将其移到 references/ 而非保留在 SKILL.md 中。
4. While 瘦身规范已定义, when 内容属于激活契约、安全清单、工作流、查找指引时, the system shall 将其保留在 SKILL.md 中，不移到 references/。

### 需求 5 - promptSignals/retrieval 字段持久化（前置依赖）

**用户故事：** 作为 skill 维护者，我希望 skill-inject 的匹配数据（promptSignals/retrieval）不会因 SKILL.md 同步覆盖而丢失，以便瘦身过程中安全重建 manifest，不会导致 skill-inject 失效。

**背景**：调研发现当前 SKILL.md frontmatter 已丢失 `promptSignals` 和 `retrieval` 字段（被上游同步覆盖），manifest 中的匹配数据是"幸存的旧数据"。一旦运行 `npm run build:skill-manifest`，所有匹配数据会变空，skill-inject 完全失效（F1 从 0.93 → 0）。此问题必须在瘦身前优先解决。

#### 验收标准

1. While 字段持久化方案已实施, when 从 `config/source/skills/` 构建 manifest 时, the system shall 优先从独立的元数据配置文件（如 `skill-metadata.json`）读取 `promptSignals` 和 `retrieval` 字段，而非从 SKILL.md frontmatter 读取。
2. While 独立配置已建立, when 同步脚本（`sync-claude-skills-mirror.mjs` 或 `sync-cloudbase-plugin-skills.mjs`）覆盖 SKILL.md 时, the system shall 不影响 `promptSignals` 和 `retrieval` 数据，因为这些数据已不在 SKILL.md 中。
3. While 字段已迁移, when 运行 `npm run build:skill-manifest` 时, the system shall 生成与当前 manifest 中 `promptSignals`/`retrieval` 完全一致的数据，不丢失任何 phrases/allOf/anyOf/aliases/intents/entities/examples。
4. While 字段已迁移, when 验证匹配效果时, the system shall 通过 `npm run eval:skill-inject` 保持 F1 ≥ 0.90（当前基线 0.93）。
5. While 迁移已完成, when 新增 skill 时, the system shall 在独立配置文件中为新 skill 添加 `promptSignals` 和 `retrieval` 字段，并在 `tests/hooks/build-skill-manifest.test.mjs` 中断言所有 skill 都有非空 promptSignals。

## 范围

### 在范围内

- **promptSignals/retrieval 字段持久化（前置依赖）**：迁移到独立配置文件，防止同步覆盖丢失
- guideline 总入口瘦身（`config/source/guideline/cloudbase/SKILL.md`，262→≤120 行）
- top 5 最长 skill 瘦身（http-api、auth-wechat、auth-web、auth-tool、cloudbase-platform）
- 5 个开发类 skill 内联安全清单（postgresql-development、auth-web、auth-wechat、no-sql-web-sdk、cloud-storage-web）
- 瘦身模板与规范文档
- 更新 `tests/skill-quality-standards.test.js` 断言

### 不在范围内

- 全部 28 个 skill 瘦身（先 guideline + top 5，验证效果后再推广）
- RULES_INDEX.md 重构（保留作为 close-out 兜底）
- skill-inject hooks 匹配逻辑修改（不改 exact/lexical 匹配算法本身）
- 评估瘦身效果（属于 skill-effectiveness-eval 的范畴）

## 技术约束

1. **不丢失信息**：移到 references/ 的内容必须完整保留，SKILL.md 中提供链接
2. **description 字段不可精简**：cloudbase plugin（hooks）不是默认安装的，无插件场景下 skill 发现完全依赖 frontmatter 的 `description` 字段（IDE 原生 Skill tool 和 `searchKnowledgeBase` 都靠它匹配）。瘦身时只能精简正文，**不能缩短 description**
3. **不破坏注入**：有插件场景下瘦身后 `npm run eval:skill-inject` 的 F1 必须 ≥ 0.90（当前基线 0.93）
4. **不破坏兼容**：Standalone Install Note 保留，独立安装时仍可访问 references/
5. **安全清单精简**：每个 skill 最多 5 条安全规则，不复制全部 RULES_INDEX
6. **前置依赖**：promptSignals/retrieval 字段持久化（需求 5）必须先于瘦身（需求 1-2）完成，否则 manifest 重建会导致有插件场景的 skill-inject 失效
7. **瘦身安全验证**：每完成一个 skill 瘦身后，运行 `npm run eval:skill-inject` 确认命中率不回归（验证有插件场景）；同时检查 description 字段未被修改（验证无插件场景）

## 三种使用场景与 skill 发现机制

| 场景 | plugin（hooks） | skill 发现方式 | 瘦身注意事项 |
|------|----------------|---------------|-------------|
| A：安装了 cloudbase plugin | ✅ 有 hooks | promptSignals/retrieval 自动匹配注入 | 正文可精简，不影响匹配 |
| B：只有 MCP server | ❌ 无 hooks | `searchKnowledgeBase(mode=skill)` + IDE 原生 Skill tool（靠 description） | description 不可精简 |
| C：通过 `npx skills add` 安装 | ❌ 无 hooks | IDE 原生 Skill tool（靠 description） | description 不可精简 |

**关键结论**：description 字段是场景 B/C 的唯一匹配依据。瘦身只精简正文（移 API 细节到 references/），**不动 description**。

## guideline 瘦身示范（参考）

### 瘦身前（262 行）

| 段落 | 行数 | 处理 |
|------|------|------|
| frontmatter | 1-7 | 保留（description 关键词可精简） |
| Workflow（三阶段） | 9-29 | **保留** |
| Activation Contract | 31-63 | **保留** |
| Engineering constitution | 64-73 | **保留** |
| High-priority routing（路由表） | 75-94 | **保留** |
| Routing reminders | 96-102 | **精简**（与路由表去重） |
| Web SDK quick reminder | 104-109 | **移到** web-development skill |
| MCP Prerequisite（mcporter 配置） | 111-153 | **移到** references/mcp-setup.md |
| Pricing & Free Trial | 155-158 | **删除**（保留链接） |
| CloudBase scenarios 表格 | 161-179 | **移到** references/scenarios.md |
| What to add to AGENTS.md | 177-179 | **删除**（元信息） |
| Core Behavior Rules | 183-193 | **精简**（与 Activation Contract 去重） |
| Deployment Workflow | 195-234 | **移到** references/deployment-workflow.md |
| Console Entry Points | 239-262 | **移到** references/console-links.md |

### 瘦身后（~120 行）

- frontmatter
- Workflow（三阶段）
- Activation Contract（Global rules + Universal guardrails）
- Engineering constitution（工程宪章）
- High-priority routing（路由表）
- Routing reminders（精简后）
- MCP 必要性声明（1 段，细节链接到 references/mcp-setup.md）
- 详细参考链接（references/ 目录）

## http-api 瘦身示范（参考）

### 瘦身前（585 行）

| 段落 | 行数 | 问题 |
|------|------|------|
| frontmatter + Standalone | 1-16 | 保留 |
| Activation Contract | 17-50 | 保留 |
| When to use / How to use | 51-97 | 精简（searchKnowledgeBase 引导去重） |
| OpenAPI Swagger Documentation | 99-132 | **删除**（与 85-97 重复） |
| Authentication and Authorization | 134-220 | **精简**（移细节到 references） |
| 关系型数据库 RESTful API | 235-357 | **移到** references/relational-database-api.md |
| NoSQL RESTful API | 383-428 | **移到** references/nosql-api.md |
| AI 大模型接入 API | 432-460 | **移到** references/ai-model-api.md |
| Online Debugging Tool | 464-471 | **删除**（非核心） |
| API Documentation References | 473-513 | **删除**（与 85-97 重复） |
| Common Authentication Flows | 527-585 | **移到** references/auth-flows.md |

### 瘦身后（~130 行）

- frontmatter + Standalone Install Note
- Activation Contract
- 安全检查清单（新增内联）
- How to use（精简）
- 认证方式简表（3 种方式 + 安全 gotcha）
- Base URL 规则
- API 查找指引（searchKnowledgeBase，只 1 次）
- 详细参考链接（references/ 目录）

## 参考

- Supabase Agent Skills 博文：https://supabase.com/blog/supabase-agent-skills#how-we-test-it
- 现有安全规则矩阵：`config/source/skills/cloudbase-code-review/references/RULES_INDEX.md`
- skill 质量标准测试：`tests/skill-quality-standards.test.js`
- 对标分析报告：`/Users/bookerzhao/Projects/AI-Workspace/output/reviews/2026-07-16-cloudbase-mcp-vs-supabase-agent-skills-review.md`
