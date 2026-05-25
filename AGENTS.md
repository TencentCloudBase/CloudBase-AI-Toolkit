---
alwaysApply: true
---


<workflow>
1. 每当我输入新的需求的时候，为了规范需求质量和验收标准，你首先会搞清楚问题和需求
2. 需求评估：先根据需求大小、影响范围、复杂度和风险判断是否需要走完整 spec 流程。对于跨模块、中大型、高风险、涉及较多协作或验收边界不清晰的需求，必须先补齐 spec；对于小型、低风险、边界清晰的改动，不强制要求产出 spec，但仍需先明确目标、范围和验收标准。
3. 需求文档和验收标准设计：如果判断需要 spec，则先完成需求设计，按照 EARS 简易需求语法方法来描述，保存在 `specs/spec_name/requirements.md` 中，跟我进行确认，最终确认清楚后，需求定稿，参考格式如下

```markdown
# 需求文档

## 介绍

需求描述

## 需求

### 需求 1 - 需求名称

**用户故事：** 用户故事内容

#### 验收标准

1. 采用 ERAS 描述的子句 While <可选前置条件>, when <可选触发器>, the <系统名称> shall <系统响应>，例如 When 选择"静音"时，笔记本电脑应当抑制所有音频输出。
2. ...
...
```
4. 技术方案设计：对于需要 spec 的需求，在完成需求设计之后，你会根据当前的技术架构和前面确认好的需求，进行技术方案设计，保存在 `specs/spec_name/design.md` 中，精简但是能够准确描述技术架构（例如架构、技术栈、技术选型、数据库/接口设计、测试策略、安全性），必要时可以用 mermaid 来绘图，跟我确认清楚后，才进入下阶段。对于不需要 spec 的小需求，可以直接在对话中给出精简方案并继续执行。
5. 任务拆分：对于需要 spec 的需求，在完成技术方案设计后，你会根据需求文档和技术方案，细化具体要做的事情，保存在 `specs/spec_name/tasks.md` 中，跟我确认清楚后，才开始正式执行任务，同时更新任务状态。对于不需要 spec 的小需求，可以直接给出精简任务说明或直接执行。

格式如下

``` markdown
# 实施计划

- [ ] 1. 任务信息
  - 具体要做的事情
  - ...
  - _需求: 相关的需求点的编号

```
</workflow>


<project_rules>
1.项目结构
- doc 存放对外的文档
- mcp 核心的 mcp package
- config 用来给 AI IDE提供的规则和 mcp 预设配置
- tests 自动化测试
</project_rules>

<attribution_evaluation_guardrails>
当任务来源于 failing eval、attribution issue、grader、benchmark、trace、result artifact 或其他评测证据时，必须额外遵守以下规则：
1. 评测证据只用于定位问题，不等于产品公开契约；先判断是否存在真实用户可见的产品缺陷，再决定是否修改产品代码。
2. 不要为了通过评测而新增 benchmark-only / grader-only 的兼容分支、提示词、注释、文案或行为。
3. 不要新增同一语义字段的多套命名变体（例如大小写/下划线别名）来“兼容评测”，除非该别名已经是文档化的公开契约。
4. 不要在代码、注释、文档、提交说明或 PR 描述中泄漏内部评测文件名或上下文路径（例如 `run-result.json`、`run-trace.json`、`evaluation-trace.json`、`.codebuddy/attribution-context`）；如必须提及，统一改写为“internal evaluation evidence”。
5. 如果证据更像 grader / task contract 问题、仓库路由错误、或外部系统限制，而不是当前仓库里的真实产品缺陷，应停止产品表面改动，并在总结里明确说明原因与后续建议。
6. 提交前必须自查 staged diff：确认没有评测专用措辞、没有内部 artifact 泄漏、没有为同一字段临时补多个别名。
</attribution_evaluation_guardrails>

<cloud_api_backend_rules>
1. 如果需求涉及通过调用腾讯云 API 来实现后端功能，开始设计或编码前必须先查阅相关文档：
   - 云 API 文档：https://cloud.tencent.com/document/product/876/34809
   - 依赖 API 文档：https://cloud.tencent.com/document/product/876/34808
2. 同时必须检查 CloudBase Manager SDK 文档：https://docs.cloudbase.net/api-reference/manager/node/introduction
3. 如果 Manager SDK 有对应方法，优先使用 Manager SDK；只有在 SDK 没有对应能力或无法满足需求时，才直接调用腾讯云 API。
4. 在实现前，需要根据文档确认接口能力、参数、鉴权方式、返回结构和限制条件，避免凭记忆实现。
</cloud_api_backend_rules>

<add_aiide>
# CloudBase AI Toolkit - 新增 AI IDE 支持工作流

1. 在 `config/source/editor-config/` 中补充该 IDE 所需的机器配置文件或兼容说明文件
2. 如需新增 rules / instructions 兼容产物，更新 `scripts/build-compat-config.mjs` 的生成目标
3. 更新 `mcp/src/tools/setup.ts` 中该 IDE 的文件映射和描述
4. 如新增 skill 级兼容要求，确认是否需要保留到 `config/.claude/skills/` 镜像
5. 创建 `doc/ide-setup/{ide-name}.md` 配置文档
6. 更新 `README.md`、`doc/index.md`、`doc/faq.md` 中的 AI IDE 支持列表,README 中注意 detail 中的内容也要填写
7. **更新 IDE 文件映射**：
   - 在 `mcp/src/tools/setup.ts` 的 `ALL_IDE_FILES` 数组中添加新IDE的配置文件路径
   - 在 `IDE_FILE_MAPPINGS` 对象中添加新IDE的文件映射关系
   - 在 `IDE_DESCRIPTIONS` 对象中添加新IDE的描述
   - 在 `IDE_TYPES` 数组中添加新IDE的类型
8. 执行 `node scripts/build-compat-config.mjs` 验证兼容产物生成
9. 如需本地检查 Claude skills 镜像，执行 `node scripts/sync-claude-skills-mirror.mjs --check`
10. 执行 `node scripts/diff-compat-config.mjs` 验证外部兼容面无回退
11. 测试IDE特定下载功能是否正常工作
</add_aiide>

<sync_doc>
cp -r doc/* {cloudbase-docs dir}/docs/ai/cloudbase-ai-toolkit/
</sync_doc>


<update_readme>
 1. 按照中文文档更新英文文档
 2. 英文文档中的banner 图是英文的，保持不变
 3. 复制 README.md 覆盖 mcp/
</update_readme>


<fix-config-hardlinks>
兼容文件不再通过硬链接维护。
日常维护时，直接修改 `config/source/skills/`、`config/source/guideline/`、`config/source/editor-config/` 并提交即可。
`config/.claude/skills/` 是从 `config/source/skills/` 自动同步的兼容镜像，不要手改。
兼容产物的生成和对外发布主要由 CI / workflow 负责，不需要像以前一样手动跑同步脚本。
只有在需要本地验证或手动同步外部模板仓库时，才执行：
1. `node scripts/sync-claude-skills-mirror.mjs`
2. `node scripts/build-compat-config.mjs`
3. `node scripts/sync-config.mjs`
</fix-config-hardlinks>


<git_push>
提交代码注意 commit 采用 conventional-changelog 风格，在 `feat(xxx):` 后面加一个 emoji，提交信息使用英文描述。
默认只推送 GitHub 远端，不要执行 `cnb` 推送，也不要使用 `--force`：
- `git push github HEAD`
提交 PR 之后不要立刻结束，先等待几分钟，观察 review 评论和 CI 结果；如果有可执行的失败项或反馈，继续在同一分支修复并更新 PR。
</git_push>

<workflow>
1. 每当我输入新的需求的时候，为了规范需求质量和验收标准，你首先会搞清楚问题和需求
2. 需求评估：先根据需求大小、影响范围、复杂度和风险判断是否需要走完整 spec 流程。对于跨模块、中大型、高风险、涉及较多协作或验收边界不清晰的需求，必须先补齐 spec；对于小型、低风险、边界清晰的改动，不强制要求产出 spec，但仍需先明确目标、范围和验收标准。
3. 需求文档和验收标准设计：如果判断需要 spec，则先完成需求设计，按照 EARS 简易需求语法方法来描述，保存在 `specs/spec_name/requirements.md` 中，跟我进行确认，最终确认清楚后，需求定稿，参考格式如下

```markdown
# 需求文档

## 介绍

需求描述

## 需求

### 需求 1 - 需求名称

**用户故事：** 用户故事内容

#### 验收标准

1. 采用 ERAS 描述的子句 While <可选前置条件>, when <可选触发器>, the <系统名称> shall <系统响应>，例如 When 选择"静音"时，笔记本电脑应当抑制所有音频输出。
2. ...
...
```
4. 技术方案设计：对于需要 spec 的需求，在完成需求设计之后，你会根据当前的技术架构和前面确认好的需求，进行技术方案设计，保存在 `specs/spec_name/design.md` 中，精简但是能够准确描述技术架构（例如架构、技术栈、技术选型、数据库/接口设计、测试策略、安全性），必要时可以用 mermaid 来绘图，跟我确认清楚后，才进入下阶段。对于不需要 spec 的小需求，可以直接在对话中给出精简方案并继续执行。
5. 任务拆分：对于需要 spec 的需求，在完成技术方案设计后，你会根据需求文档和技术方案，细化具体要做的事情，保存在 `specs/spec_name/tasks.md` 中，跟我确认清楚后，才开始正式执行任务，同时更新任务状态。对于不需要 spec 的小需求，可以直接给出精简任务说明或直接执行。

格式如下

``` markdown
# 实施计划

- [ ] 1. 任务信息
  - 具体要做的事情
  - ...
  - _需求: 相关的需求点的编号

```
</workflow>


<project_rules>
1.项目结构
- doc 存放对外的文档
- mcp 核心的 mcp package
- config 用来给 AI IDE提供的规则和 mcp 预设配置
- tests 自动化测试
</project_rules>

<add_aiide>
# CloudBase AI Toolkit - 新增 AI IDE 支持工作流

1. 在 `config/source/editor-config/` 中补充该 IDE 所需的机器配置文件或兼容说明文件
2. 如需新增 rules / instructions 兼容产物，更新 `scripts/build-compat-config.mjs` 的生成目标
3. 更新 `mcp/src/tools/setup.ts` 中该 IDE 的文件映射和描述
4. 如新增 skill 级兼容要求，确认是否需要保留到 `config/.claude/skills/` 镜像
5. 创建 `doc/ide-setup/{ide-name}.md` 配置文档
6. 更新 `README.md`、`doc/index.md`、`doc/faq.md` 中的 AI IDE 支持列表,README 中注意 detail 中的内容也要填写
7. 执行 `node scripts/build-compat-config.mjs` 验证兼容产物生成
8. 如需本地检查 Claude skills 镜像，执行 `node scripts/sync-claude-skills-mirror.mjs --check`
9. 执行 `node scripts/diff-compat-config.mjs` 验证外部兼容面无回退
</add_aiide>


<add_example>
# CloudBase AI Toolkit - 新增用户案例/视频/文章工作流
0. 注意标题尽量用原标题，然后适当增加一些描述
1. 更新 README.md
2. 更新 doc/tutorials.md

例如 艺术展览预约系统 - 一个完全通过AI 编程开发的艺术展览预约系统, 包含预约功能、管理后台等功能。
</add_example>

<sync_doc>
cp -r doc/* {cloudbase-docs dir}/docs/ai/cloudbase-ai-toolkit/
</sync_doc>


<update_readme>
 1. 按照中文文档更新英文文档
 2. 英文文档中的banner 图是英文的，保持不变
 3. 复制 README.md 覆盖 mcp/
</update_readme>


<fix-config-hardlinks>
兼容文件不再通过硬链接维护。
日常维护时，直接修改 `config/source/skills/`、`config/source/guideline/`、`config/source/editor-config/` 并提交即可。
`config/.claude/skills/` 是从 `config/source/skills/` 自动同步的兼容镜像，不要手改。
兼容产物的生成和对外发布主要由 CI / workflow 负责，不需要像以前一样手动跑同步脚本。
只有在需要本地验证或手动同步外部模板仓库时，才执行：
1. `node scripts/sync-claude-skills-mirror.mjs`
2. `node scripts/build-compat-config.mjs`
3. `node scripts/sync-config.mjs`
</fix-config-hardlinks>


<git_push>
1. 提交代码注意 commit 采用 conventional-changelog 风格，在 `feat(xxx):` 后面加一个 emoji，提交信息使用英文描述。
2. 提交代码不要直接推到 `main`，使用 feature 分支，并且默认只推送 GitHub 远端，不要执行 `cnb` 推送，也不要使用 `--force`：
   - `git push github HEAD`
3. 然后自动创建 PR。
4. 创建 PR 后先等待几分钟，再检查 review 评论和 CI；如果有可执行的问题，继续在同一分支修复并更新 PR。
5. **每次推送代码到 PR 分支后，必须立即检查 PR 状态**：包括是否有冲突（`This branch has conflicts that must be resolved`）、CI 是否通过、机器人评论是否已解决。不要假设推送后万事大吉，冲突和 CI 失败往往只在远程才暴露。
</git_push>

<skills_and_rules_maintenance>
对外暴露的 skills 和规则文件采用「单一语义源 + 自动生成兼容层」的方式维护，具体约定如下：

1. skills 源（对外 Skill 能力定义）
   - 修改 / 新增任何对外 Skill 时，只编辑 `config/source/skills/` 目录下的模块化 `SKILL.md`
   - 如果需要拆模块，可以按功能拆分子目录，例如 `config/source/skills/database/`、`config/source/skills/web/`

2. guideline / rules 总入口
   - 所有对外公开阅读的总入口规则（如 CloudBase 总指南）统一维护在 `config/source/guideline/` 下
   - 例如 CloudBase 主入口为 `config/source/guideline/cloudbase/SKILL.md`

3. IDE / MCP 机器配置
   - 与 IDE / 插件 / MCP 相关的机器配置放在 `config/source/editor-config/`
   - 新增 IDE 或修改 IDE 行为时，只需要更新这里和 `mcp/src/tools/setup.ts` 中的映射

4. 兼容镜像与生成产物（禁止直接修改）
   - `config/.claude/skills/`：从 `config/source/skills/` 自动同步的 Claude skills 兼容镜像，不要手动编辑
   - `.generated/compat-config/`：各 IDE / 外部模板使用的兼容配置生成目录，不要手动编辑
   - `.skills-repo-output/`：对外 skills 仓库发布产物目录，不要手动编辑

5. 本地验证与对外发布
   - 日常只需要修改 `config/source/skills/`、`config/source/guideline/`、`config/source/editor-config/`，其余交给 CI
   - 如果 Skill 变更会影响对外公开的 prompts 文档（例如修改 `config/source/skills/cloudbase-platform/SKILL.md` 需要同步更新 `doc/prompts/cloudbase-platform.mdx`），在提交前必须本地运行：
     - `node scripts/generate-prompts-data.mjs && node scripts/generate-prompts.mjs`
   - 只有在需要本地验证兼容面或同步外部模板仓库时，才运行：
     - `node scripts/sync-claude-skills-mirror.mjs`
     - `node scripts/build-compat-config.mjs`
     - `node scripts/diff-compat-config.mjs`
     - `node scripts/sync-config.mjs`
</skills_and_rules_maintenance>

<doc_freshness_rules>
插件系统与接入说明相关文档的维护遵循以下规则：

1. 插件清单单一真源
   - `mcp/src/server.ts` 中的 `DEFAULT_PLUGINS`、`AVAILABLE_PLUGINS`、`PLUGIN_ALIASES` 是插件名、默认启用集合与兼容别名的唯一真源
   - 修改插件名、默认集合或别名时，必须同步检查 `doc/plugins.md`、`doc/connection-modes.mdx`、`README.md`、`mcp/README.md`

2. URL 参数与环境变量成对校验
   - 同一能力如果同时暴露环境变量与 URL 参数（例如 `CLOUDBASE_MCP_PLUGINS_ENABLED` / `CLOUDBASE_MCP_PLUGINS_DISABLED` 与 `enable_plugins` / `disable_plugins`），标题、说明、示例和多值格式必须保持一致
   - 多值默认统一使用逗号分隔，不要再写重复 query key 的示例

3. canonical 名称与文档链接校验
   - 文档中的插件 canonical 名必须能在 `AVAILABLE_PLUGINS` 中解析；旧名称只允许出现在“兼容别名”说明中，不应继续作为主名称书写
   - 文档链接必须指向真实存在的仓库文件或站点路由；涉及工具数量时，优先使用不易过期的描述，避免写死数字
</doc_freshness_rules>
