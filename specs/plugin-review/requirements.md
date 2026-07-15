# 插件系统 Review 与评测体系设计

## 介绍

本 spec 归档 2026-07 对 CloudBase AI Toolkit 插件系统的两轮调研结论，并设计自动化测试与评测体系。目标是回答两个问题：

1. Claude Code 插件是否最优解？其他 IDE 插件是否应跟进？
2. hooks 的有效性如何评估？当前是否有证据证明 hooks 真的提升开发体验？

## 需求

### 需求 1 - 插件系统现状 Review 存档

**用户故事：** 作为插件维护者，我希望有一份完整的现状 review 文档，以便决定下一步投入方向。

#### 验收标准

1. When 维护者查阅 spec 时，the 系统 shall 提供 5 份结构化文档：analysis.md（现状分析）、claude-code-design.md（Claude Code 插件设计评分）、hooks-effectiveness.md（hooks 有效性评估）、ecosystem-survey.md（外部 IDE 生态调研）、evaluation-design.md（评测体系设计）。
2. While 文档存在时，the 文档 shall 准确引用具体文件路径和行号（file_path:line_number 格式）。
3. When 文档声明某个结论时，the 文档 shall 标注证据来源（代码引用、测试文件、或"无证据"说明）。

### 需求 2 - 接入 hooks 测试到 CI

**用户故事：** 作为维护者，我希望 hooks 单元测试在 PR 时自动执行，避免测试"写了但没人跑"。

#### 验收标准

1. When PR 提交时，the CI shall 自动执行 `tests/hooks/` 下所有测试。
2. When hooks 测试失败时，the CI shall 阻止合并。
3. While 仓库根目录有 package.json，the package.json shall 提供 `npm run test:hooks` 脚本。

### 需求 3 - 建立 skill-inject 评测数据集

**用户故事：** 作为插件开发者，我希望有一份标注好的 prompt 数据集，用于量化 skill 注入的命中率。

#### 验收标准

1. When 维护者查阅数据集时，the 数据集 shall 包含至少 50 个标注 prompt。
2. While 数据集覆盖 28 个 skill，the 数据集 shall 为每个 skill 提供至少 1 个正例和 1 个负例。
3. When 数据集包含短词误命中场景时，the 数据集 shall 显式标注 `expectedSkills: []`（空数组表示不应触发任何 skill）。
4. While 数据集可机器读取，the 数据集 shall 使用 JSONL 格式，每行一个 `{prompt, expectedSkills, category}` 对象。

### 需求 4 - 命中率评估脚本

**用户故事：** 作为插件开发者，我希望有一键运行的脚本，输出当前 skill-inject 的 precision/recall/F1 指标。

#### 验收标准

1. When 执行 `node scripts/eval-skill-inject.mjs` 时，the 脚本 shall 读取 eval 数据集并输出 precision/recall/F1。
2. When 脚本运行完成时，the 脚本 shall 输出误命中清单（prompt → 错误注入的 skill）和漏命中清单（prompt → 应注入但未注入的 skill）。
3. While 脚本依赖 hooks 模块，the 脚本 shall 通过 import 调用 `analyzePrompt`、`mergeExactAndLexical`、`rerankPromptAnalysisReport` 函数，不重复实现匹配逻辑。

### 需求 5 - 基线评测结果存档

**用户故事：** 作为维护者，我希望有当前 skill-inject 的基线命中率数据，作为后续改进的参照。

#### 验收标准

1. When 评估脚本首次运行后，the 脚本 shall 在 `specs/plugin-review/baseline-result.md` 写入 precision/recall/F1 和典型误命中案例。
2. While 后续改进 manifest，the 维护者 shall 重新运行评估并对比基线，监控命中率回归。

## 技术方案概要

### 文档结构

```
specs/plugin-review/
├── requirements.md          ← 本文档
├── analysis.md              ← 插件系统现状分析（三套插件概念、完善度对比）
├── claude-code-design.md    ← Claude Code 插件设计评分与可移植性分析
├── hooks-effectiveness.md   ← hooks 有效性评估机制深度调研
├── ecosystem-survey.md      ← 外部 AI IDE 生态调研（14 个工具）
├── evaluation-design.md     ← 评测体系设计（数据集、脚本、CI 接入）
├── tasks.md                 ← 实施计划
└── baseline-result.md       ← 首次评估基线结果（执行后生成）
```

### 评测体系架构

```
tests/hooks/eval/prompts.jsonl   ← 标注数据集（50+ prompts）
        │
        ▼
scripts/eval-skill-inject.mjs     ← 评估脚本
        │  import from plugin/cloudbase/hooks/
        │  ├── skill-inject-core.mjs (analyzePrompt)
        │  ├── unified-ranker.mjs (mergeExactAndLexical)
        │  └── prompt-patterns.mjs (matchPromptWithReason)
        ▼
specs/plugin-review/baseline-result.md  ← 基线结果
```

### CI 接入

- 根目录 `package.json` 添加 `"test:hooks": "vitest run tests/hooks/"`
- `.github/workflows/nightly-build.yaml` 在 "Test package" 步骤后增加 "Test hooks" 步骤
- 不新建 workflow，复用现有 nightly-build.yaml 减少维护成本

### 数据集设计原则

1. **正例**：prompt 明确指向某 skill 的核心场景（如 "创建用户表" → database）
2. **负例**：prompt 不应触发任何 skill（如 "你好" → []）
3. **边界用例**：包含短词但不应误命中的场景（如 "帮我设计一个 API" 不应触发 ui-design）
4. **覆盖**：28 个 skill 每个至少 1 正例 + 1 负例
5. **规模**：50-100 个 prompt，平衡覆盖率和维护成本

## 风险与限制

1. **评测数据集主观性**：expectedSkills 由人工标注，可能存在偏差。建议多人 review。
2. **匹配算法的副作用**：修复短词误命中可能影响现有正确命中。需要对比基线。
3. **CI 测试时间**：新增 hooks 测试会增加 CI 时间约 5-10 秒，可接受。
4. **数据集维护成本**：每次新增 skill 需要补充对应 prompt，需写入维护文档。

## 后续工作（不在本 spec 范围）

- 启用 audit log（hook-env.mjs:38-48 的 dead code）
- 短词治理（对 ≤3 字符的 phrase 强制 minScore ≥ 8）
- 端到端 hook 链路测试（fixture 模拟 SessionStart→UserPromptSubmit→PreToolUse）
- 为 Codex/CodeBuddy/OpenCode/Cursor 提供"无 hook 版"的 skill 注入方案
