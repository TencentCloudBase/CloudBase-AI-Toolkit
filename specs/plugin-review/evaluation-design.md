# 评测体系设计

> 目标：建立 skill-inject 命中率的量化评测体系

## 一、架构

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

## 二、数据集设计

### 数据集格式

`tests/hooks/eval/prompts.jsonl`，每行一个 JSON 对象：

```json
{
  "prompt": "创建用户表",
  "expectedSkills": ["database", "cloudbase-document-database-web-sdk"],
  "category": "database",
  "note": "正例：明确数据库操作"
}
```

字段说明：
- `prompt`：用户输入的 prompt 文本
- `expectedSkills`：期望被注入的 skill 目录名数组（空数组表示不应触发任何 skill）
- `category`：分类（用于按类别统计命中率）
- `note`：可选说明

### 数据集原则

1. **正例**：prompt 明确指向某 skill 的核心场景（如 "创建用户表" → database）
2. **负例**：prompt 不应触发任何 skill（如 "你好" → []）
3. **边界用例**：包含短词但不应误命中的场景（如 "帮我设计一个 API" 不应触发 ui-design）
4. **覆盖**：28 个 skill 每个至少 1 正例 + 1 负例
5. **规模**：50-100 个 prompt，平衡覆盖率和维护成本

### 类别划分

- `database` - 数据库相关
- `functions` - 云函数相关
- `auth` - 认证相关
- `web` - Web 开发相关
- `miniprogram` - 小程序相关
- `cloudrun` - 云托管相关
- `ai-model` - AI 模型相关
- `storage` - 存储相关
- `ui` - UI 设计相关
- `ops` - 运维相关
- `guidelines` - 总入口/指南
- `negative` - 负例（不应触发）
- `boundary` - 边界用例（短词误命中测试）

## 三、评估脚本设计

### 脚本路径

`scripts/eval-skill-inject.mjs`

### 评估指标

- **Precision** = 正确注入数 / 实际注入数
- **Recall** = 正确注入数 / 应注入数
- **F1** = 2 × (Precision × Recall) / (Precision + Recall)
- **误命中率** = 误命中 prompt 数 / 总 prompt 数
- **漏命中率** = 漏命中 prompt 数 / 总 prompt 数

### 评估流程

1. 读取 `tests/hooks/eval/prompts.jsonl`
2. 对每个 prompt：
   - 调用 `analyzePrompt(prompt, manifest)` 获取 exact 匹配
   - 调用 lexical 索引获取 lexical 匹配
   - 调用 `mergeExactAndLexical` 合并
   - 调用 `rerankPromptAnalysisReport` 排序
   - 取前 N 个（N = MAX_SKILLS=2）作为实际注入
3. 对比 `expectedSkills`：
   - 正确注入 = 实际注入 ∩ 期望注入
   - 误命中 = 实际注入 - 期望注入
   - 漏命中 = 期望注入 - 实际注入
4. 输出报告

### 输出格式

```
=== Skill Inject 评估报告 ===
数据集: tests/hooks/eval/prompts.jsonl (N 个 prompt)

总体指标:
  Precision: 0.XX (XX/XX)
  Recall:    0.XX (XX/XX)
  F1:        0.XX
  误命中率:  XX% (XX/XX)
  漏命中率:  XX% (XX/XX)

按类别统计:
  database:       P=0.XX R=0.XX F1=0.XX
  functions:      P=0.XX R=0.XX F1=0.XX
  ...

误命中清单:
  [1] prompt: "帮我设计一个 API"
      expected: []
      actual:   ["ui-design"]
      issue:    短词"设计"误命中
  ...

漏命中清单:
  [1] prompt: "cloudbase 总入口"
      expected: ["cloudbase-guidelines"]
      actual:   []
      issue:    minScore=8 但单 phrase +6 不够
  ...
```

## 四、CI 接入方案

### 方案 A：复用 nightly-build.yaml（推荐）

在 `.github/workflows/nightly-build.yaml` 的 "Test package" 步骤后增加：

```yaml
- name: Test hooks
  run: npm run test:hooks
```

**优点**：复用现有 workflow，维护成本低
**缺点**：每次 PR 都跑 hooks 测试（可接受，<5 秒）

### 方案 B：新建 hooks-test.yml

新建 `.github/workflows/hooks-test.yml`，仅在 PR 改动 `plugin/cloudbase/` 或 `tests/hooks/` 时触发。

**优点**：不影响其他 PR
**缺点**：多一个 workflow 维护

**选择方案 A**，简单直接。

### package.json 变更

```json
{
  "scripts": {
    "test:hooks": "vitest run tests/hooks/"
  }
}
```

## 五、基线结果存档

首次评估后，在 `specs/plugin-review/baseline-result.md` 记录：

- 评估时间
- 数据集规模
- 总体指标（P/R/F1）
- 按类别指标
- 典型误命中案例（Top 5）
- 典型漏命中案例（Top 5）
- 后续改进建议

作为后续改进的参照基线。每次 manifest 变更后重新评估，对比基线监控回归。

## 六、后续改进方向（不在本次范围）

1. **启用 audit log**：在 `user-prompt-submit-skill-inject.mjs` 调用 `appendAuditLog`，收集真实用户命中率
2. **短词治理**：对 ≤3 字符的 phrase 强制 minScore ≥ 8
3. **端到端测试**：fixture 模拟 SessionStart→UserPromptSubmit→PreToolUse 全流程
4. **A/B 对比**：开启/关闭 hooks 时对比 Skill() 工具调用率
5. **用户反馈闭环**：audit log 中记录用户后续是否实际调用了被注入的 skill
