# Hooks 有效性评估机制深度调研

> 调研对象：`plugin/cloudbase/hooks/` 目录
> 调研时间：2026-07-15

## A. 当前是否有评估机制

**NO — 没有真正的有效性评估机制。**

当前仅有的"评估"：

1. **单元测试**（`tests/hooks/*.test.mjs`，5 个文件）—— 只验证函数级正确性（如 `matchPromptWithReason` 的评分逻辑），不验证端到端命中率
2. **manifest 结构断言**（`tests/hooks/build-skill-manifest.test.mjs`）—— 验证 28 个 skill 都有 `promptSignals.phrases`，但不验证 phrases 质量
3. **doc 中的激活率声明**（`doc/prompts/how-to-use.mdx:90`）—— 声称 "Hooks 最高（约 80%+）"，但无数据来源、无方法论、无可复现的评测数据集

**关键缺口**：
- 没有 benchmark/eval 数据集（无测试 prompt 集合）
- 没有 CI 中的 hook 评测流程（`.github/workflows/` 中 14 个 workflow 无一涉及 hooks 评测）
- hooks 单元测试甚至不在 CI 中运行（CI 只跑 `./mcp` 目录的 `npx vitest run`，根目录 `tests/hooks/` 被忽略）
- 没有用户调研、问卷、case study、success story

## B. Hooks 可观测性分析

### 日志系统（`plugin/cloudbase/hooks/logger.mjs`）

- 4 级日志：`off` / `summary` / `debug` / `trace`，**默认 `off`**
- 环境变量控制：`CLOUDBASE_PLUGIN_LOG_LEVEL`、`CLOUDBASE_PLUGIN_DEBUG=1`、`CLOUDBASE_PLUGIN_HOOK_DEBUG=1`
- 输出到 `process.stderr`（JSON Lines 格式），含 `invocationId`、`timestamp`、`event`、`elapsed_ms`
- `complete()` 方法记录 `matchedCount`/`injectedCount`/`dedupedCount`/`cappedCount`/`droppedByBudget`/`boostsApplied`

### 关键问题

- `appendAuditLog` 函数（`hook-env.mjs:38-48`）会写入 `~/.claude/projects/<slug>/cloudbase-plugin/skill-injections.jsonl`，设计为持久化命中率审计日志，但**这是 dead code**——函数被导出（`hook-env.mjs:207`）却从未被任何 hook 调用（全仓库 `import.*appendAuditLog` 无匹配）
- 默认日志级别 `off`，用户不主动开启则零可观测性
- 日志只输出到 stderr，无集中收集、无聚合、无告警

### 错误处理

所有 hook 采用 `try/catch` + `logCaughtError` 静默降级模式，hook 失败不会中断用户会话，但也意味着失败不可见。

## C. 每个 Hook 的有效性判断

实际注册 7 个 hook 入口点（`hooks.json`），对应 17 个 .mjs 文件：

| Hook 文件 | 效果 | 有效性 | 失败行为 | 性能开销 |
|---|---|---|---|---|
| `session-start-seen-skills.mjs` | 清理 dedup 临时文件（clear/compact 时） | **有效** | 静默 | 低（tmpdir readdir） |
| `session-start-profiler.mjs` | 检测项目类型，设 5 个 env var | **有效但粗糙** | 静默 | 低（文件存在性检查） |
| `inject-session-context.mjs` | 注入 ~2KB 场景+规则+skill 目录到 additionalContext | **有效但可能注入无关内容** | 静默 | 低 |
| `user-prompt-submit-skill-inject.mjs` | 分析 prompt 注入最多 2 个 skill | **可能有误命中**（见 D 节） | 静默 | 中（每次 prompt 全量匹配 28 skill） |
| `pretooluse-skill-inject.mjs` | 按 file_path/command 正则匹配注入 skill | **有效** | 静默 | 低 |
| `session-end-cleanup.mjs` | 清理 dedup 临时文件 | **有效** | 静默 | 低 |
| `compat.mjs`（工具） | 跨 IDE 输出适配 | **有效** | N/A | N/A |
| `skill-inject-core.mjs`（工具） | 加载 manifest + 构建注入输出 | **有效** | 静默 | 首次加载 manifest |
| `lexical-index.mjs`（工具） | 同义词扩展倒排索引 | **有效但同义词表硬编码** | N/A | 中 |
| `unified-ranker.mjs`（工具） | 合并 exact+lexical 分数 | **有效** | N/A | 低 |
| `prompt-patterns.mjs`（工具） | 评分算法核心 | **有效但 substring 匹配有风险** | N/A | 低 |
| `prompt-analysis.mjs`（工具） | 故障排查意图分类 | **有效** | N/A | 低 |
| `patterns.mjs`（工具） | seen-skills dedup + compaction reset | **有效** | N/A | 低 |
| `hook-env.mjs`（工具） | 临时文件/dedup 管理 | **有效但 appendAuditLog 是 dead code** | 静默 | 低 |
| `session-start-activation.mjs`（工具） | CloudBase 项目激活检测 | **有效** | N/A | 低 |
| `logger.mjs`（工具） | 日志系统 | **有效但默认关闭** | N/A | 低 |

**无法验证的 hook**：`user-prompt-submit-skill-inject.mjs` 和 `pretooluse-skill-inject.mjs` 的实际命中率——没有评测数据集，无法判断是否命中正确 skill。

## D. Skill-Inject 命中率分析（2026-07-15 评估后修正）

### 重大修正：之前的"误命中风险"结论是错误的

之前调研报告称"45 个短词（≤3 字符）单个出现即注入，存在误命中风险"——**这个结论被 2026-07-15 的实际评估推翻**。

实际情况：**manifest 中所有 `promptSignals.phrases` 和 `retrieval.*` 都是空数组**，skill-inject 根本不会注入任何 skill，更不存在误命中。

### 实际匹配机制（当前状态）

- `plugin/cloudbase/hooks/prompt-patterns.mjs:56-101` 用 `String.includes()` substring 匹配
- 评分规则：phrases 每个 +6，allOf 每组 +4，anyOf 每个 +1（cap +2），minScore 默认 6
- **但 manifest 中 phrases 全空**，所以 `matchPromptWithReason` 永远返回 `score: 0, matched: false`
- `plugin/cloudbase/hooks/lexical-index.mjs` 的 lexical 搜索依赖 `retrieval.aliases/intents/entities/examples`
- **但 retrieval 全空**，lexical 索引构建出的文档所有字段都是空数组
- **最终 `injectedSkills` 永远为空数组**

### 根本原因

`scripts/build-skill-manifest.mjs:77-78`：
```js
promptSignals: frontmatter.promptSignals || { phrases: [], minScore: 6 },
retrieval: frontmatter.retrieval || { aliases: [], intents: [], entities: [], examples: [] },
```

`plugin/cloudbase/skills/*/SKILL.md` 的 frontmatter **没有定义** `promptSignals` 和 `retrieval` 字段，所以 fallback 到空数组。

### 唯一生效的路径：Troubleshooting Intent（但也是 dead code）

`prompt-analysis.mjs:18-37` 的 `classifyTroubleshootingIntent` 使用硬编码正则，能命中：
- "加载但/提交但/不生效" → flow-verification → `ops-inspector`
- "卡住/卡死/超时" → stuck-investigation → `ops-inspector`
- "白屏/空白页/404/500/cors" → browser-only → `ops-inspector`

**但这些结果未被使用**：`analyzePrompt` 返回 `report.troubleshooting`，但 `user-prompt-submit-skill-inject.mjs` 和 `unified-ranker.mjs` 从未读取该字段。

### 评估证据

见 `specs/plugin-review/baseline-result.md`：
- F1 = 0.0000
- 60 个期望命中全部漏掉
- 0 个误命中（因为零注入）
- 3 个 troubleshooting intent 命中但未使用

### 漏命中风险（已确证）

所有正例都是漏命中。即使最明确的 prompt（如 "创建用户表" → database、"部署云函数" → functions）也无法触发注入。

## E. 性能开销分析

- **UserPromptSubmit**：每次 prompt 触发，对 28 个 skill 全量 substring 匹配 + lexical 倒排索引查询，开销 O(skills × phrases)，实际 <5ms
- **PreToolUse**：对 Edit/Write/Bash 工具触发，正则匹配 28 skill 的 pathRegexes/bashRegexes，开销低
- **SessionStart**：3 个 hook 串行执行，文件存在性检查 + env var 设置，开销 <10ms
- **Dedup 机制**：tmpdir 下的文件系统操作（`tryClaimSessionKey` 用 `openSync(wx)` 原子创建），开销低
- **总体**：性能开销可接受，无明显瓶颈

## F. 副作用风险

- **无网络请求**（全仓库 `fetch(`/`http.request` 无匹配）—— 安全
- **文件系统写入**：
  - `tmpdir` 下 dedup 临时文件（`cloudbase-plugin-<sessionId>-seen-skills.{txt,d}`），session 结束自动清理
  - `CLAUDE_ENV_FILE` 追加 env var（`compat.mjs:137`，`patterns.mjs:146`），有 shell 注入防护（`escapeShellEnvValue`）
  - `~/.claude/projects/` 下 audit log 路径已定义但**未启用**（dead code）
- **环境变量写入**：`CLOUDBASE_PLUGIN_SCENARIO`、`CLOUDBASE_PLUGIN_LIKELY_SKILLS`、`CLOUDBASE_PLUGIN_SEEN_SKILLS` 等，用于跨 hook 通信
- **无权限提升**：hook 以调用方权限运行，无 sudo/特权操作
- **风险评级**：低。主要风险是 `CLAUDE_ENV_FILE` 的重写逻辑（`patterns.mjs:132-150`）—— 读-改-写非原子，并发可能丢失，但实际场景低频

## G. 关键结论

**Hooks 有效性当前无法验证，且没有证据证明 hooks 真的提升开发体验。**

2026-07-15 实际评估后进一步确认：**skill-inject 功能当前完全失效（F1=0.0000）**。

具体论据：
1. **无评测数据集**：没有测试 prompt 集合，无法计算命中率/误命中率/漏命中率（本次已建立 `tests/hooks/eval/prompts.jsonl`，59 个 prompt）
2. **CI 不跑 hooks 测试**：`tests/hooks/` 下 5 个测试文件存在，但 CI（`nightly-build.yaml`、`npm-publish.yaml`）只跑 `./mcp` 目录的 `npx vitest run`，hooks 测试是"写了但没人跑"（本次已接入 CI，见 `nightly-build.yaml`）
3. **审计日志是 dead code**：`appendAuditLog` 设计为持久化命中率记录，但从未被调用，无法回溯历史注入效果
4. **doc 中的"80%+ 激活率"无来源**：`doc/prompts/how-to-use.mdx:90` 声称 hooks 激活率最高约 80%+，但**实际评估显示 F1=0.0000，完全不是 80%+**
5. **误命中风险已推翻**：之前报告称"45 个短词误命中风险"——**实际是零命中**，phrases 全空，不会命中任何东西
6. **无用户反馈闭环**：无问卷、无 telemetry、无 case study、无 success story

**新发现（评估后确认）**：
7. **Manifest 数据层全空**：28 个 SKILL.md 都没有 `promptSignals` 和 `retrieval` frontmatter，导致 manifest 中所有 phrases 和 retrieval 字段都是空数组
8. **Troubleshooting Intent 是 dead code**：`classifyTroubleshootingIntent` 能命中 3 个 ops 类 prompt，但返回的 `report.troubleshooting` 从未被下游读取
9. **Skill-inject 完全空转**：架构完善（exact + lexical + ranker + dedup + budget），但因为输入数据全空，整个链路空转，最终 `injectedSkills` 永远为空数组

**积极方面**：
- 架构设计合理（exact + lexical + ranker + dedup + budget）
- 错误处理完善（全静默降级，不影响用户会话）
- 跨 IDE 兼容（Claude Code + Cursor）
- 无网络请求、无权限提升、副作用可控
- **评估脚本和评测数据集已建立**，后续可量化改进效果

## H. 建议的评估方案

### 短期（1-2 天）—— 立即可做

1. **启用 audit log**：在 `user-prompt-submit-skill-inject.mjs` 和 `pretooluse-skill-inject.mjs` 中调用 `appendAuditLog`，记录 `{prompt, matchedSkills, injectedSkills, droppedByCap, droppedByBudget, elapsed_ms}`，写入 `~/.claude/projects/<slug>/cloudbase-plugin/skill-injections.jsonl`
2. **建立评测数据集**：创建 `tests/hooks/eval/prompts.jsonl`，包含 50-100 个标注 prompt（expectedSkills 字段），覆盖 28 个 skill 的正例/负例/边界用例
3. **接入 CI**：在根目录 `package.json` 添加 `"test:hooks": "vitest run tests/hooks/"`，新增 `.github/workflows/hooks-test.yml` 在 PR 时运行

### 中期（1-2 周）

4. **命中率评估脚本**：`scripts/eval-skill-inject.mjs`，读取 eval 数据集，调用 `analyzePrompt` + `mergeExactAndLexical` + `rerankPromptAnalysisReport`，输出 precision/recall/F1
5. **短词治理**：对 ≤3 字符的 phrase 强制要求 minScore >= 8 或要求 allOf 组合，避免单个短词命中
6. **A/B 对比**：开启/关闭 hooks 时对比 Skill() 工具调用率（通过 audit log）

### 长期

7. **用户反馈闭环**：在 audit log 中记录用户是否在后续对话中实际调用了被注入的 skill
8. **定期回归**：每次 manifest 变更后跑 eval 数据集，监控命中率回归

## 关键文件路径索引

- Hooks 目录：`plugin/cloudbase/hooks/`
- Logger：`plugin/cloudbase/hooks/logger.mjs`
- Dead code（audit log）：`plugin/cloudbase/hooks/hook-env.mjs:38-48`
- 评分核心：`plugin/cloudbase/hooks/prompt-patterns.mjs:56-101`
- Manifest：`plugin/cloudbase/generated/skill-manifest.json`
- 测试（未接入 CI）：`tests/hooks/`
- 激活率声明（无来源）：`doc/prompts/how-to-use.mdx:90`
