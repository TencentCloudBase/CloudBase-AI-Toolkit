# CloudBase Evals

一个用于测试 AI agent 能否用好 [CloudBase](https://cloudbase.net) 的基准测试与评测框架——覆盖数据库、登录认证、存储、云函数、CloudRun 与静态托管。它让 coding agent 完成真实的 CloudBase 任务（建表、接登录、修安全规则），并对真实环境中实际发生的结果打分。

**状态：建设中。** 场景仍是首批 2 个示例。runner 已能加载场景、用干跑执行评分器，并写出 `results/<experiment>/<eval>/run-<n>/result.json`。CodeBuddy Code 可以 headless 调用（`cbc -p`）；榜单上的模型名是标准名，`-ioa` 只在传给 `--model` 时使用。本 runner 不会创建 CloudBase 环境。

## 为什么做

越来越多用户通过 CLI、MCP、skills 和文档让 agent 来搭建 CloudBase 项目。我们希望对"agent 用 CloudBase 建东西到底行不行"给出可度量、可复现的答案——既用来改进我们自己的工具链，也为模型厂商提供一个规则全公开的打榜渠道。

## 目录结构

```
evals/
  README.md                 # 本文件
  evals/
    benchmark/              # 公开榜单场景（广度）
    regression/             # 已知失败模式追踪（深度）
  experiments/              # 被测配置：模型 + harness 组合
  packages/                 # core、framework、sandbox
  results/                  # 运行产物：results/<experiment>/<eval>/run-<n>/
```

## 跑通一个场景

在仓库根目录执行，不需要 CloudBase 凭证：

```bash
node --experimental-strip-types evals/packages/framework/src/cli.ts \
  run build-auth-001-username-signin --experiment fixture-dry
```

这是 30 分钟验收入口：加载场景、对假环境跑评分器、写下 `evals/results/`。干跑的检查会失败，因为没有真实环境里的实现。真跑需要你已有的 `CLOUDBASE_ENV_ID`；runner 不会自己创建环境。

## 场景格式

每个场景是一个目录，包含 `PROMPT.md`（任务描述 + frontmatter 元数据）和 `EVAL.ts`（评分器）：

```markdown
---
stage: build | resolve | investigate
interface: mcp | cli
product:
  - auth | database | storage | functions | cloudrun | hosting | ai
topic:
  - sdk | security | observability | ...
---

<任务描述>
```

评分器对真实状态断言——数据库里的数据、可访问的托管 URL、生效的登录配置——以确定性校验为主，只在需要语义判断时使用 LLM judge。评分器刻意保持区分度：错误的密钥、沙箱预装的假状态、只覆盖部分 CRUD 的安全规则，都会按预期判失败。

## 运行与计分规则

- 每个场景都跑在真实 CloudBase 环境上，一次运行独占一个环境，跑前创建、跑后销毁。
- 榜单分数为 3 次独立运行的平均值。
- harness 版本固定；升级 harness 后全量重跑再切换榜单。
- 各 harness 统一上下文窗口与压缩配置。

## 参与贡献

欢迎通过 PR 贡献场景和实验配置。CONTRIBUTING.md（如何选题、如何写评分器、结果如何复核）将随 runner 一起落地。
