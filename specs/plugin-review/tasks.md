# 实施计划

- [x] 1. 创建 spec 文档
  - 1.1 创建 `specs/plugin-review/requirements.md`
  - 1.2 创建 `specs/plugin-review/analysis.md`（插件系统现状分析）
  - 1.3 创建 `specs/plugin-review/claude-code-design.md`（Claude Code 插件设计评分）
  - 1.4 创建 `specs/plugin-review/hooks-effectiveness.md`（hooks 有效性评估）
  - 1.5 创建 `specs/plugin-review/ecosystem-survey.md`（外部 IDE 生态调研）
  - 1.6 创建 `specs/plugin-review/evaluation-design.md`（评测体系设计）
  - 1.7 创建 `specs/plugin-review/tasks.md`（本文档）
  - _需求: 1_

- [x] 2. 接入 hooks 测试到 CI
  - 2.1 在根目录 `package.json` 添加 `"test:hooks": "vitest run tests/hooks/"` 脚本
  - 2.2 在 `.github/workflows/nightly-build.yaml` 的 "Test package" 步骤后增加 "Test hooks" 步骤
  - 2.3 本地运行 `npm run test:hooks` 验证全部通过（80 个测试通过）
  - _需求: 2_

- [x] 3. 建立 skill-inject 评测数据集
  - 3.1 创建 `tests/hooks/eval/` 目录
  - 3.2 编写 `tests/hooks/eval/prompts.jsonl`，包含 59 个标注 prompt
  - 3.3 覆盖 20 个类别（正例/负例/边界用例）
  - 3.4 重点覆盖短词误命中场景（"帮我设计一个 API" 等）
  - _需求: 3_

- [x] 4. 编写命中率评估脚本
  - 4.1 创建 `scripts/eval-skill-inject.mjs`
  - 4.2 import hooks 模块（analyzePrompt / mergeExactAndLexical / rerankPromptAnalysisReport）
  - 4.3 读取 eval 数据集，调用匹配逻辑
  - 4.4 输出 precision/recall/F1 和误命中/漏命中清单
  - 4.5 支持 `--verbose` 输出详细报告
  - _需求: 4_

- [x] 5. 跑一次评估并记录结果
  - 5.1 执行 `node scripts/eval-skill-inject.mjs --verbose`
  - 5.2 在 `specs/plugin-review/baseline-result.md` 写入基线数据
  - 5.3 记录关键发现：F1=0.0000，manifest 数据层全空
  - 5.4 推翻之前"误命中风险"结论，修正为"零命中问题"
  - 5.5 提出 P0/P1/P2 改进建议
  - _需求: 5_
