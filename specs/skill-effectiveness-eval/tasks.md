# 实施计划

- [ ] 1. 创建评估数据集
  - 创建 `tests/skill-effectiveness/eval.jsonl`，包含 5 个 case 的完整定义
  - 每个 case 包含：id、scenario、prompt、fixtureDir、primaryRequirements、secondaryRequirements、skillsExpected、category、differentiator
  - 参照 design.md 中 5 个场景的详细设计
  - _需求: 需求 2（核心场景覆盖）

- [ ] 2. 创建 fixture 项目模板（5 个）
  - 创建 `tests/skill-effectiveness/fixtures/` 目录
  - 每个 case 一个子目录：`pg-rls/`、`web-auth/`、`storage-upload/`、`http-function/`、`nosql-rules/`
  - 每个目录包含：`package.json`（最小依赖）、`src/`（入口文件含 TODO）、`README.md`（场景说明）、`.expected/`（预期结果）
  - fixture 项目不预装 @cloudbase/js-sdk，让代理自行决定
  - _需求: 需求 2（核心场景覆盖）

- [ ] 3. 实现评估执行器脚本
  - 创建 `scripts/eval-skill-effectiveness.mjs`
  - 核心流程：读取 eval.jsonl → 对每个 case 准备三条件 fixture → 调用 codebuddy CLI → 收集结果
  - 三条件隔离：通过 fixture 项目配置实现（无 .mcp.json / 有 .mcp.json / 有 .mcp.json + .codebuddy/skills/）
  - 复用 `issue-auto-processor-simple.yml` 中的 codebuddy 调用模式：`codebuddy -p "..." -y --output-format json --permission-mode acceptEdits --model hy3-ioa`
  - 超时控制：单次 1200s
  - 结果收集：代理 JSON 输出 + git diff（执行前 git init && commit）
  - 支持单场景运行：`node scripts/eval-skill-effectiveness.mjs --case pg-rls`
  - _需求: 需求 1（三条件对照评估框架）

- [ ] 4. 实现 LLM judge 脚本
  - 在评估执行器中集成 judge 逻辑（或独立脚本 `scripts/eval-skill-judge.mjs`）
  - 输入：用户 prompt + primaryRequirements + secondaryRequirements + 代理转录 + 文件变更
  - 用 hy3-ioa 模型作为 judge，输出 JSON：{ score, primaryResults, secondaryResults, overallAssessment }
  - judge prompt 模板参照 design.md 中的设计
  - 低置信度结果标注"不确定"，提示人工复查
  - _需求: 需求 3（LLM judge 自动评分）

- [ ] 5. 实现评估报告生成
  - 生成 Markdown 报告到 `specs/skill-effectiveness-eval/results/{date}.md`
  - 包含：总览对比表（三条件 × 5 场景 + skill 净贡献值）、每个场景的详细评分、judge 证据引用
  - 报告格式参照 design.md 中的设计
  - _需求: 需求 1（三条件对照评估框架）

- [ ] 6. 手动跑 1 个场景验证端到端流程
  - 用 `pg-rls` 场景跑完整流程（三条件 × 1 场景 = 3 次代理执行 + 3 次 judge）
  - 验证：脚本不报错、结果可收集、judge 输出合理、报告可读
  - 如果 codebuddy CLI 输出格式不稳定，调整解析逻辑
  - _需求: 需求 1、3（验证框架可用性）

- [ ] 7. 跑完整 5 个场景，记录 baseline
  - 运行 `node scripts/eval-skill-effectiveness.mjs`（5 场景 × 3 条件 = 15 次代理 + 15 次 judge）
  - 将结果存档到 `specs/skill-effectiveness-eval/results/`
  - 分析 baseline 数据：skill 净贡献值是否为正、哪些 case 区分度高/低
  - 如果区分度为"中"的 case 差异不明显，调整 prompt 或验证标准
  - _需求: 需求 2、3（全场景 baseline）

- [ ] 8. CI workflow 接入
  - 创建 `.github/workflows/skill-effectiveness-eval.yml`
  - 触发：每 2 周 cron + workflow_dispatch（手动）
  - 复用 issue-auto-processor 的认证配置（CODEBUDDY_AUTH_TOKEN / CODEBUDDY_API_KEY）
  - 执行评估脚本，上传结果 artifact
  - 不每 PR 触发（成本控制）
  - _需求: 需求 4（CI 接入与定期执行）

- [ ] 9. 文档与测试
  - 在 `specs/skill-effectiveness-eval/` 补充运行说明（如何手动跑、如何新增 case）
  - 为评估脚本添加单元测试（数据集解析、报告生成逻辑）
  - 更新 `package.json` scripts：`"eval:skill-effectiveness": "node scripts/eval-skill-effectiveness.mjs"`
  - _需求: 需求 1、4
