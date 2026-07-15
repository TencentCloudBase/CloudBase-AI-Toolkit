# Claude Code 插件设计评分与可移植性分析

> 评估对象：`plugin/cloudbase/` 目录
> 评估时间：2026-07-15

## A. 设计评分：8/10

**理由**：
- 设计深度业界领先（17 个 hooks + 4 commands + 2 agents + 28 skills + 预编译 manifest），尤其 `hooks/skill-inject-core.mjs:20` 的"manifest 单一源 + 预编译 promptSignals"避免运行时 YAML 解析漂移，工程成熟度高。
- 扣分项：
  1. hooks 实现层强绑 Claude Code hooks 协议（`hooks/hooks.json:3-52`），跨平台靠 `compat.mjs:48-53` 运行时探测，并非真正协议中立
  2. 测试覆盖只到模块单元层，无端到端 hook 触发链路评测
  3. `lexical-index.mjs:6-35` 中英同义词表硬编码，扩展需改源码
  4. 45 个短词（≤3 字符）存在误命中风险（见 hooks-effectiveness.md）

## B. hooks 设计合理性

### 解决真实问题

核心是"按需注入 skill 摘要 + 去重 + 预算控制"，避免 28 个 skill 全量塞入上下文。

**检索链路**（`user-prompt-submit-skill-inject.mjs:56-78`）：
```
prompt → exact match (prompt-patterns)
       → lexical match (lexical-index 倒排索引 + 中英同义词)
       → unified-ranker 合并 + adaptive boost
       → MAX_SKILLS=2 + 8000 字节预算控制
```

**设计亮点**：
- `generated/skill-manifest.json` 预编译索引模式，运行时只读 JSON，避免 YAML 解析
- `session-start-profiler.mjs:17-40` 通过文件标记 + package.json 探测场景，输出环境变量
- `session-start-seen-skills.mjs` + `session-end-cleanup.mjs`：clear/compact 时清理去重产物
- 全 hook 静默降级（try/catch + logCaughtError），失败不中断用户会话

### 冗余/性能风险

- `hook-env.mjs:50-145` 的 dedup 机制（tmpdir 文件 + mkdir claim + sha256 session id）较重，每次 hook 触发 4-6 次磁盘读写。对 Claude Code 单机可接受，移植到 Cloud IDE 需谨慎。
- `compat.mjs` 注释明确"Adapted from Vercel plugin"——这是 Vercel 开源插件模式，已被验证为通用模式，不是 Claude Code 专属。
- `lexical-index.mjs:6-35` 内嵌中英同义词表为硬编码，扩展需改源码；可考虑抽到 manifest。

## C. commands/agents 设计合理性

### commands

`commands/_conventions.md:1-93` 定义了 6 段式结构：
```
Preflight → Plan → Commands → Verification → Summary → Next Steps
```

强制 MCP-first + CLI fallback + 生产门控 + 不输出 secret。**这是 IDE 无关的 prompt 工程**，任何支持 slash command 的 IDE（Claude Code/Cursor/Codex）都能直接用。

### agents

`agents/cloudbase-architect.md`、`cloudbase-deployment-expert.md` 用决策树 + 矩阵 + ASCII 架构图表达专家知识，frontmatter `name`/`description` 是 Claude Code subagent 协议，但**正文是纯知识**，可被任何 IDE 当 system prompt 注入。

**唯一专属点**：`plugin.json:25-34` 用 `commands`/`agents` 数组显式枚举，这是 Claude Code plugin 规范。

## D. skills 组织方式合理性

- 扁平 + 模块化混合：28 个 skill 目录平铺在 `plugin/cloudbase/skills/`，每个目录含 `SKILL.md` + 子文档
- 与 `config/source/skills/` 同源，由 `scripts/sync-cloudbase-plugin-skills.mjs` 从外部 `TencentCloudBase/skills` 仓库同步（README.md:17-19）
- `generated/skill-manifest.json`（1307 行）预编译 frontmatter 为 JSON，含 `promptSignals`/`retrieval`/`pathRegexSources`/`metadata.priority`，是 hooks 运行时唯一数据源
- **优秀设计**：把 SKILL.md 当文档，manifest 当索引，分离关注点

## E. 评测覆盖情况

| 维度 | 现状 | 问题 |
|------|------|------|
| 单元测试 | `tests/hooks/` 5 个文件 | 覆盖 compat/patterns/prompt-patterns/skill-inject-core/build-skill-manifest，**缺 unified-ranker / lexical-index / session-start-profiler / inject-session-context 测试** |
| 端到端测试 | 无 | 无 fixture 模拟 SessionStart→UserPromptSubmit→PreToolUse 全流程 |
| benchmark/eval | 无 | 无性能评测、无质量评测文件 |
| CI 评测 | 无 | 14 个 workflow 无一涉及 hooks 评测 |
| spec 文档 | 无 | specs/ 无 Claude Code 插件设计 spec |

## F. 关键结论：是否最优解？

**对 Claude Code 而言接近最优**（hooks 全链路 + manifest 预编译 + dedup + 预算控制是同类插件标杆，优于 Vercel 原版因增加了 lexical + unified ranker）。

**作为"跨 IDE 标准模板"则非最优**，原因：
1. hooks 协议是 Claude Code/Cursor 专属（Codex/CodeBuddy/OpenCode 无 hooks 机制）
2. `compat.mjs:48-53` 只适配 cursor + claude-code 两平台，未覆盖 Codex/CodeBuddy
3. commands/agents 的 Claude Code frontmatter 字段（`description` + `$ARGUMENTS`）其他 IDE 不解析

## G. 可移植性结论

| 能力 | 可移植性 | 说明 |
|------|---------|------|
| `skill-inject-core` + `lexical-index` + `unified-ranker` + `prompt-patterns` | 完全可移植 | 纯算法，输入 prompt 输出 skill 名，任何 IDE 可包装为 prompt 预处理 |
| `session-start-profiler` 场景探测逻辑 | 完全可移植 | 文件标记 + package.json 探测，输出环境变量 |
| manifest 预编译模式 | 完全可移植 | 任何 IDE 都可用 JSON 索引替代运行时 YAML |
| commands 6 段式 prompt 模板 | 可移植 | 作为 system prompt 注入即可 |
| agents 决策树知识 | 可移植 | 纯知识内容 |
| `hooks.json` + SessionStart/PreToolUse 事件协议 | **Claude Code/Cursor 专属** | Codex/CodeBuddy 无对应 hook 机制 |
| `plugin.json` 的 commands/agents 数组 | **Claude Code 专属** | Codex 用 `skills`+`mcpServers`，CodeBuddy 用 `skills` |
| `CLAUDE_ENV_FILE` + `CLAUDE_PLUGIN_ROOT` 环境变量 | **Claude Code 专属** | `hook-env.mjs:27`、`compat.mjs:127` |
| tmpdir dedup 文件机制 | 可移植但需重写 | 依赖 session_id，非 Claude 专属 |

## H. 跟进建议：分层跟进而非完全复制

### 第一层：所有 IDE 必须跟进（算法层，无协议依赖）

- `generated/skill-manifest.json` 预编译索引模式
- `session-start-profiler` 场景探测逻辑（`FILE_MARKERS` + `PACKAGE_MARKERS`）
- `lexical-index` + `unified-ranker` 的 prompt→skill 检索算法
- commands 6 段式 Preflight/Plan/Commands/Verification/Summary/Next Steps 模板（作为 system prompt 注入）

### 第二层：仅 Cursor 跟进（协议层，因 Cursor 支持 hooks）

- 完整 hooks 链路（`compat.mjs` 已为 Cursor 留好分支）
- dedup + 预算控制

### 第三层：不需要跟进（Claude Code 专属）

- hooks.json 协议（Codex/CodeBuddy/OpenCode 无 hook 机制，强行加会破坏简洁性）
- `CLAUDE_ENV_FILE`/`CLAUDE_PLUGIN_ROOT` 环境变量依赖
- `plugin.json` 的 commands/agents 数组（这些 IDE 的 plugin.json 规范更简洁）

### 建议补强

- 补 `unified-ranker`/`lexical-index`/`session-start-profiler` 的单元测试
- 新增端到端 hook 链路 fixture 测试
- 把 `lexical-index.mjs:6` 的 `SYNONYM_MAP` 抽到 manifest，避免改词表要改代码
- 为 Codex/CodeBuddy 提供"无 hook 版"的 skill 注入方案（如 MCP tool `searchSkillByPrompt` 包装 `skill-inject-core`）

## I. 总体判断

Claude Code 插件是 hooks 时代的优秀实现，但其"最优"是建立在 Claude Code 完整 hooks 协议之上的。其他 IDE 应抽取其**算法层**（profiler + ranker + manifest）而非**协议层**（hooks.json + plugin.json commands/agents），才能在各自规范下达到各自的最优。
