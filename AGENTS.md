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

   注：`specs/` 已加入 `.gitignore`，spec 文档只写在本地、**不要 `git add` 到公开仓库**（含内部信息，完整历史归档在私有仓库 `cloudbase-mcp-specs-archive`）。

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
1. 项目结构
   - doc 存放对外的文档
   - mcp 核心的 mcp package
   - config 用来给 AI IDE 提供的规则和 mcp 预设配置
   - tests 自动化测试
   - skills 项目级 skills 源目录
   - specs 需求/设计/任务文档（**本地目录，不提交到公开仓库**。含内部信息，仅保留 `plugin-marketplace-listing/` 与 `npm-supply-chain-security-hardening/` 两个被代码或规范依赖的子目录；完整历史归档在私有仓库 `cloudbase-mcp-specs-archive`）

2. AGENTS 文件约定
   - `AGENTS.md` 为项目及子目录的唯一可信源
   - `CLAUDE.md`、`CODEBUDDY.md` 均为指向 `AGENTS.md` 的软链
   - 新增子目录时，只需创建 `AGENTS.md`，用软链补齐 `CLAUDE.md`

3. Skills & Rules 目录约定
   - `.agents/skills` 为 skills 的唯一可信源，`.codebuddy/skills`、`.claude/skills` 软链至此
   - `.agents/rules` 为 rules 的唯一可信源（尚未创建时以 `.agents/rules` 为目标）
   - 新增 skills 请直接添加到 `skills/` 目录，`.agents/skills/` 下的软链会自动关联
   - 如果使用 `npx skills` 命令添加 skills 时保留 `Universal` 选项，不用重复添加 `claude` 和 `codebuddy` 选项
   - 某个目录中只要有 `AGENTS.md`、`CLAUDE.md` 和 `.agents/skills`、`.claude/skills` 中的任意一个，就需要自动补齐

4. 项目子目录规则
   - `mcp/` 子目录同样适用本约定：`mcp/AGENTS.md` 为源，`mcp/CLAUDE.md`、`mcp/CODEBUDDY.md` 为软链
</project_rules>

<internal_dirs>
## 本地内部目录的存放、同步与获取

两个目录**都不提交到公开仓库**，只在本地维护并归档到私有仓：

| 目录 | 内容 | 为什么不入库 |
| --- | --- | --- |
| `specs/` | 规格 / 设计 / 审视报告 | 含内部任务 ID、审视报告、评测/归因上下文 |
| `.workbuddy/` | IDE 本地状态：AI 每日记忆、plans、expert 会话历史 | 类比 `.idea/` / `.vscode/`，本就不该进版本控制；记忆里带内部任务 ID 与未公开决策 |

`specs/` 里仅 `specs/plugin-marketplace-listing/` 与 `specs/npm-supply-chain-security-hardening/` 两个被代码或规范依赖的子目录留在仓库里，其余全部忽略。`.workbuddy/` 全量忽略。

**写**：新 spec 照旧写在本仓库 `specs/<name>/{requirements,design,tasks}.md`，只是不要 `git add`。`.workbuddy/` 由 IDE 自行维护，不用管。

### 切分支 / merge 后目录变空是预期行为

这些目录不再被 git 跟踪，**从旧分支切到已移除它们的分支（或 merge 这类分支）时，git 会把工作区里的文件删掉**。这不是数据丢失，真源在私有归档仓里。

- 提交时由 `pre-commit` 自动恢复一次（`lefthook.yml` 的 `internal-restore`）——本机 `post-checkout` / `post-merge` 被 git-lfs 的 `other-*` 链接接管，不走 lefthook，所以恢复挂在 pre-commit 上。
- 手动恢复：`npm run internal:restore`
- **AI agent：开工前发现 `specs/` 或 `.workbuddy/` 缺失、或其中某个目录是空的，先跑 `npm run internal:restore` 再继续**，不要报"文档丢失"。
- **merge / 切分支前，本分支新写或改过的内容先跑 `npm run internal:archive`**——归档仓只在这次同步时才会拿到新内容，否则切走就没了。

### 同步与获取

```bash
npm run internal:status         # 看本地与归档仓的漂移
npm run internal:archive        # 本地 → 私有归档（只同步当前工作区）
npm run internal:restore        # 私有归档 → 本地
npm run internal:archive:all    # 扫所有 worktree，把漂移全收进归档仓
```

`internal:archive` 只管当前工作区；写在一个 worktree 里、没归档就切走的内容会永久丢失（已经发生过一次）。`internal:archive:all` 按内容哈希 + mtime 扫全部 worktree 补齐，是防丢的真正兜底，**已配每日自动跑**。

脚本：`scripts/internal-sync.sh`。两个目录的差异：`specs/` pull 时跳过仍在版本控制里的白名单子目录（避免冲掉未提交改动）；`.workbuddy/` pull 时带 `-u`，本地更新的文件不覆盖（那是 IDE 刚写的实时状态）。

归档仓位置不写在仓库里，从环境变量 `INTERNAL_ARCHIVE_DIR` 或 `~/.config/cloudbase-mcp/internal-archive-dir` 读取；没配置时脚本静默跳过，不阻塞 git 操作。

**新机器**：

```bash
git clone git@github.com:binggg/cloudbase-mcp-specs-archive.git ~/Projects/cloudbase-mcp-specs-archive
mkdir -p ~/.config/cloudbase-mcp
printf '%s\n' "$HOME/Projects/cloudbase-mcp-specs-archive" > ~/.config/cloudbase-mcp/internal-archive-dir
```

- 私有归档仓：`binggg/cloudbase-mcp-specs-archive`（PRIVATE，main 分支），顶层同时放 `specs/` 与 `.workbuddy/`
- 公开仓库的 git **历史**里仍能看到旧 spec 与 `.workbuddy/` 文件（只做了最新版本移除，未 rewrite）
- 对外产物（`config/source/skills/`、`plugin/`、`doc/`、IDE command 模板）里提到的 `specs/` 指的是**使用者自己项目**里的目录，与本仓库的归档约定无关，不要往那里写私有归档信息
</internal_dirs>

<attribution_evaluation_guardrails>
当任务来源于 failing eval、attribution issue、grader、benchmark、trace、result artifact 或其他评测证据时，必须额外遵守以下规则：
1. 评测证据只用于定位问题，不等于产品公开契约；先判断是否存在真实用户可见的产品缺陷，再决定是否修改产品代码。
2. 不要为了通过评测而新增 benchmark-only / grader-only 的兼容分支、提示词、注释、文案或行为。
3. 不要新增同一语义字段的多套命名变体（例如大小写/下划线别名）来"兼容评测"，除非该别名已经是文档化的公开契约。
4. 不要在代码、注释、文档、提交说明或 PR 描述中泄漏内部评测文件名或上下文路径（例如 `run-result.json`、`run-trace.json`、`evaluation-trace.json`、`.codebuddy/attribution-context`）；如必须提及，统一改写为"internal evaluation evidence"。
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

<mcp_tool_schema_rules>
1. 当新增或修改 MCP 工具入参 schema 时，如果某个字符串字段在 description 中描述了固定可选值、取值范围、模式枚举或协议类型（例如 `MYSQL/FLEXDB`、`on/off`、`blacklist/whitelist`、`OAUTH/OIDC/EMAIL`），必须在 Zod / JSON Schema 中定义为 `z.enum([...])` 或等价枚举 schema，而不是只用 `z.string()` 加说明文字。
2. 仅当字段确实是用户自定义标识、路径、命令、搜索关键词、动态模板名或后端返回的开放值时，才保留 `z.string()`；不要把"例如"中的示例值误收窄成枚举。
3. 枚举值必须来自公开文档、Manager SDK 类型/文档、已有公开契约或当前代码中已稳定使用的常量；如果契约不清楚，先保留开放类型并在总结中说明，不要凭直觉收窄。
4. 修改枚举入参后必须同步补充或更新 schema 测试，并更新生成产物（如 `scripts/tools.json`、`doc/mcp-tools.md`）。
5. 提交前应扫描生成后的工具 schema，确认不存在"description 里列固定取值，但 schema 没有 enum"的字段。
</mcp_tool_schema_rules>

<add_aiide>
# CloudBase AI Toolkit - 新增 AI IDE 支持工作流

1. 在 `config/source/editor-config/` 中补充该 IDE 所需的机器配置文件或兼容说明文件
2. 如需新增 rules / instructions 兼容产物，更新 `scripts/build-compat-config.mjs` 的生成目标
3. 更新 `mcp/src/tools/setup.ts` 中该 IDE 的文件映射和描述
4. 如新增 skill 级兼容要求，确认是否需要保留到 `config/.claude/skills/` 镜像
5. 创建 `doc/ide-setup/{ide-name}.md` 配置文档
6. 更新 `README.md`、`doc/index.md`、`doc/faq.md` 中的 AI IDE 支持列表，README 中注意 detail 中的内容也要填写
7. **更新 IDE 文件映射**：
   - 在 `mcp/src/tools/setup.ts` 的 `ALL_IDE_FILES` 数组中添加新 IDE 的配置文件路径
   - 在 `IDE_FILE_MAPPINGS` 对象中添加新 IDE 的文件映射关系
   - 在 `IDE_DESCRIPTIONS` 对象中添加新 IDE 的描述
   - 在 `IDE_TYPES` 数组中添加新 IDE 的类型
8. 执行 `node scripts/build-compat-config.mjs` 验证兼容产物生成
9. 如需本地检查 Claude skills 镜像，执行 `node scripts/sync-claude-skills-mirror.mjs --check`
10. 执行 `node scripts/diff-compat-config.mjs` 验证外部兼容面无回退
11. 测试 IDE 特定下载功能是否正常工作
</add_aiide>

<ide_mcp_upgrade>
# CodeBuddy IDE 内置 CloudBase MCP 升级与白名单同步

涉及以下场景时，**必须先加载 skill `codebuddy-ide-mcp-upgrade`**（本仓库 `skills/codebuddy-ide-mcp-upgrade/`）：

1. 升级 CodeBuddy IDE 内置的 CloudBase MCP bundle
2. 修改 IDE 内嵌的 `toolWhiteList` / `systemPrompt` / `attatchPrompt`
3. 排查「IDE 里集成的 CloudBase 功能不足」
4. **MCP 发版后同步 IDE 侧配置**

## 发版强制项（防漂移）

MCP 每次发版（工具增删改名）都**必须**重新生成 IDE 侧白名单。否则新工具会被 IDE 的白名单静默过滤，用户侧零变化 —— 这是历史上「IDE 里 CloudBase 功能不足」的唯一根因（实测 21 条白名单里 12 条是已被 MCP 删除或改名的死条目，用户实际只能用 9 个）。

发版 checklist：

1. `scripts/tools.json` 是否已更新（工具清单真源）
2. 用 `scripts/build-config.mjs` 重新生成配置，产出新 `toolWhiteList`
3. 检查新增 / 改名的工具在提示词里是否有对应引导 —— 提示词引用已删除的工具名会导致模型调用不存在的工具
4. 同步新配置给 IDE 侧
5. 交付文档里记录本次新增了哪些工具

## 关键约束

- **白名单按 `scripts/tools.json` 全量生成，不要裁剪**。CodeBuddy 已支持 Tool Search（工具按需检索，不再全量占上下文），当初裁剪的唯一理由已不存在；继续裁剪只会让白名单随发版漂移成死条目。
- **改 IDE 打包产物后必须对整文件做真实编译**（`node --check`）。JSON 字段回读全绿 ≠ 文件可用 —— 曾因重复拼接 `JSON.parse('` 前缀导致整文件 `SyntaxError`，而回读校验仍报全绿。
- **白名单条数 ≥ 实际暴露工具数是正常的**：`msg-push` 等插件工具不在 `DEFAULT_PLUGINS` 内，需注入 `CLOUDBASE_MCP_PLUGINS_ENABLED` 才注册。IDE 侧白名单是 filter 不是枚举，多留位安全且便于后续启用插件。
- **提示词要覆盖 PG 模式**。PG 模式下认证、存储、权限、迁移四项全部改道（pgstore 与 legacy COS 是两套系统、授权走 RLS），不是「多了一种数据库」。漏了会让模型把 PG 用户引导到 NoSQL / MySQL 路径。

详细流程、脚本、端到端验收用例与踩坑记录见 skill 本体。
</ide_mcp_upgrade>

<add_example>
# CloudBase AI Toolkit - 新增用户案例/视频/文章工作流
0. 注意标题尽量用原标题，然后适当增加一些描述
1. 更新 README.md
2. 更新 doc/tutorials.md

例如 艺术展览预约系统 - 一个完全通过 AI 编程开发的艺术展览预约系统，包含预约功能、管理后台等功能。
</add_example>

<sync_doc>
cp -r doc/* {cloudbase-docs dir}/docs/ai/cloudbase-ai-toolkit/
</sync_doc>


<fix_config_hardlinks>
兼容文件不再通过硬链接维护。
日常维护时，直接修改 `config/source/skills/`、`config/source/guideline/`、`config/source/editor-config/` 并提交即可。
`config/.claude/skills/` 是从 `config/source/skills/` 自动同步的兼容镜像，不要手改。
兼容产物的生成和对外发布主要由 CI / workflow 负责，不需要像以前一样手动跑同步脚本。
只有在需要本地验证或手动同步外部模板仓库时，才执行：
1. `node scripts/sync-claude-skills-mirror.mjs`
2. `node scripts/build-compat-config.mjs`
3. `node scripts/sync-config.mjs`
</fix_config_hardlinks>

<git_push>
1. 提交代码注意 commit 采用 conventional-changelog 风格，在 `feat(xxx):` 后面加一个 emoji，提交信息使用英文描述。
2. 提交代码不要直接推到 `main`，使用 feature 分支，并且默认只推送 GitHub 远端，不要执行 `cnb` 推送，也不要使用 `--force`：
   - `git push origin HEAD`
3. 然后自动创建 PR。
4. 创建 PR 后先等待几分钟，再检查 review 评论和 CI；如果有可执行的问题，继续在同一分支修复并更新 PR。
5. **每次推送代码到 PR 分支后，必须立即检查 PR 状态**：包括是否有冲突（`This branch has conflicts that must be resolved`）、CI 是否通过、机器人评论是否已解决。不要假设推送后万事大吉，冲突和 CI 失败往往只在远程才暴露。
6. **CI 主动监控（强制）**：git push 后必须主动监控 CI Pipeline，不能等用户提醒。使用 `gh pr view --json statusCheckRollup` 等待 CI 完成；如果 CI 失败，自动分析日志并修复；CI 全绿后主动告知用户。
</git_push>

<dependency_upgrade_checklist>
升级任何依赖（尤其 @cloudbase/manager-node 等运行时依赖）时，必须**三份 lockfile 同步**，缺一不可：

1. 根 `package-lock.json`：CI `nightly-build.yaml` 在根目录执行 `npm ci --ignore-scripts`
2. `mcp/package-lock.json`：同一 workflow 第二步 `cd mcp && npm ci`（历史遗留 npm lockfile）
3. `pnpm-lock.yaml`：mcp 开发主 lockfile（用 `pnpm install` 更新）

漏任一份会导致 CI 报 `Invalid: lock file's X does not satisfy Y` 或 `Missing: xxx from lock file`（2026-08-24 PR #952 实测踩坑）。
提交前自查：`git ls-tree -r origin/main | grep -E "package-lock|pnpm-lock"` 列全所有 lockfile 逐一确认同步，push 后等 `build-and-publish` 转绿再合入。
</dependency_upgrade_checklist>

<skills_and_rules_maintenance>
对外暴露的 skills 和规则文件采用「单一语义源 + 自动生成兼容层」的方式维护，具体约定如下：

1. skills 源（对外 Skill 能力定义）
   - 修改 / 新增任何对外 Skill 时，只编辑 `config/source/skills/` 目录下的模块化 `SKILL.md`
   - 如果需要拆模块，可以按功能拆分子目录，例如 `config/source/skills/database/`、`config/source/skills/web/`
   - **Plugin skill-inject 匹配数据**：新增会进入 `plugin/cloudbase/skills/` 的 skill 时，必须同步在 `plugin/cloudbase/skill-metadata.json` 增加同名 key 的 `promptSignals`/`retrieval`（模板见 `plugin/cloudbase/skill-metadata.template.json`），然后运行 `npm run build:skill-manifest`。不要把匹配数据只写在 SKILL.md frontmatter（上游 sync 会覆盖）。漏写会导致 `tests/hooks/build-skill-manifest.test.mjs` 失败，且清空 previous-manifest 后 skill-inject 匹配为空。

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
   - 修改插件名、默认集合或别名时，必须同步检查 `doc/connection-modes.mdx`、`README.md`、`mcp/README.md`

2. URL 参数与环境变量成对校验
   - 同一能力如果同时暴露环境变量与 URL 参数（例如 `CLOUDBASE_MCP_PLUGINS_ENABLED` / `CLOUDBASE_MCP_PLUGINS_DISABLED` 与 `enable_plugins` / `disable_plugins`），标题、说明、示例和多值格式必须保持一致
   - 多值默认统一使用逗号分隔，不要再写重复 query key 的示例

3. canonical 名称与文档链接校验
   - 文档中的插件 canonical 名必须能在 `AVAILABLE_PLUGINS` 中解析；旧名称只允许出现在"兼容别名"说明中，不应继续作为主名称书写
   - 文档链接必须指向真实存在的仓库文件或站点路由；涉及工具数量时，优先使用不易过期的描述，避免写死数字
</doc_freshness_rules>

<supply_chain_security>
# npm 供应链安全（必须遵守）

本项目因 MCP Server + 大规模 AI IDE 技能分发特性，是 npm 供应链攻击的高价值目标。

**强制规则：**
- 安全敏感依赖（`@cloudbase/*`、`@modelcontextprotocol/sdk`、express、ws、zod 等 runtime 核心）**必须使用精确版本**（禁止 `^` / `~`）。
- 所有 GitHub Actions 引用**必须 pin 到完整 40 字符 commit SHA**（禁止浮动 tag 如 `@v4`、`@beta`）。
- 修改 `package.json`、`pnpm-workspace.yaml`、`.npmrc` 或 workflow 时，必须参考内部详细指南。
- 优先使用 `corepack + pnpm` 进行依赖管理（已配置 `packageManager` 字段）。

**详细内部文档（含当前状态、AI Agent 审计 Prompt、防护措施）：**
`specs/npm-supply-chain-security-hardening/npm-security.md`

任何涉及依赖或 CI 的变更，在开始前都应先阅读该文档。
</supply_chain_security>
