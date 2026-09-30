# CloudBase Evals

一个用于测试 AI agent 能否用好 [CloudBase](https://cloudbase.net) 的基准测试与评测框架——覆盖数据库、登录认证、存储、云函数、CloudRun 与静态托管。它让 coding agent 完成真实的 CloudBase 任务（建表、接登录、修安全规则），并对真实环境中实际发生的结果打分。

**状态：建设中。** 公开榜在 [CloudBase Evals](https://tencentcloudbase.github.io/CloudBase-AI-Toolkit/evals/)。上面列出下面这 17 道计分题，模型成绩公布前榜是空的。仓库里有 20 个场景目录：17 道可以公开计分，1 道在仓库里但未计分（见下），另外 2 道草案不上榜。runner 会加载场景并写出 `results/<experiment>/<eval>/run-<n>/result.json`，不会创建 CloudBase 环境。榜单上的模型名去掉 `-ioa` 通道后缀。

## 跑通一个场景

在仓库根目录执行，不需要 CloudBase 凭证：

```bash
node --experimental-strip-types evals/packages/framework/src/cli.ts \
  run resolve-security-002-rls-cross-tenant-leak --experiment fixture-dry
```

这是 30 分钟验收入口。它加载场景，对假环境打分，并写下 `evals/results/`。检查会失败，因为没有真实实现。

只打分、不启动模型：

```bash
node --experimental-strip-types evals/packages/framework/src/cli.ts \
  score resolve-security-002-rls-cross-tenant-leak
```

真跑需要你自己的 `CLOUDBASE_ENV_ID`、`TENCENTCLOUD_SECRETID` 和 `TENCENTCLOUD_SECRETKEY`。runner 不会创建环境。干跑仍用 `fixture-dry`。接本地评测进程时设置 `CLOUDBASE_LOCAL_ENDPOINT`，并用 `CLOUDBASE_MCP_BIN` 指向已构建的 `mcp/dist/cli.cjs`。不要同时注入 `TENCENTCLOUD_SECRETID` / `TENCENTCLOUD_SECRETKEY`。

## 计分题

公开任务索引是这 17 道：

- `build-auth-001-email-password-flow`
- `build-cli-001-bootstrap-app`
- `build-cli-002-declarative-schema`
- `build-dataapi-002-restock-alert-report`
- `build-database-001-migrate-postgres-to-supabase`
- `build-functions-004-service-role-bypass`
- `build-functions-005-dual-auth-user-secret`
- `build-rls-003-org-roles-permissions`
- `build-storage-001-private-bucket-access`
- `build-tests-001-rls-tenant-isolation`
- `build-vectors-001-rag-with-permissions`
- `deploy-functions-001-edge-function-secrets`
- `investigate-auth-001-deleted-user-access`
- `investigate-realtime-001-subscribed-no-events`
- `resolve-dataapi-001-empty-results`
- `resolve-database-001-migration-history-mismatch`
- `resolve-security-002-rls-cross-tenant-leak`

## 未计分的题

这些题留在仓库里，不上公开榜：

- `build-dataapi-001-relational-report`：匿名角色仍能 SELECT `public.orders`。

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
  site/                     # 公开榜，路径 /evals/
  results/                  # 运行产物：results/<experiment>/<eval>/run-<n>/
```

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

- 真跑使用你已经有的环境。本 runner 不会创建环境。
- 在固定重复采样协议落地前，公开分数是单次运行。
- Agent 工具版本固定；升级后全量重跑再切换榜单。
- 各 harness 统一上下文窗口与压缩配置。

## 参与贡献

见 [CONTRIBUTING.md](CONTRIBUTING.md)。
