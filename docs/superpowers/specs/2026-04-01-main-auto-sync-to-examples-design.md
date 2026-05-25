# Main Auto Sync to Examples - 设计说明

## 背景

当前仓库只有手动触发的 `.github/workflows/sync-branch.yml`，可以把本仓库指定分支同步到 `TencentCloudBase/awsome-cloudbase-examples` 的指定分支。但 `searchKnowledgeBase(mode="skill")` 依赖的 ZIP 产物上游来自 examples 仓库，主线内容如果仍依赖人工触发同步，更新节奏会偏慢，且容易遗漏。

本次需求不改同步动作本身，只调整同步时机：当本仓库 `main` 合并产生新的主线提交，且变更命中会影响 examples 同步结果的路径时，自动把内容同步到 `awsome-cloudbase-examples/master`。

## 目标

1. 保留现有 `sync-branch.yml` 的手动用途，继续支持任意分支到任意分支的人工同步。
2. 新增一个独立的主线自动同步 workflow，在 `push` 到 `main` 时自动执行同步。
3. 自动 workflow 保持与现有手动 workflow 相同的核心动作：checkout 当前仓库、checkout examples 仓库、执行 `node scripts/sync-config.mjs --skip-git`、有 diff 时自动 commit/push。
4. 在自动同步前增加兼容面守门：先执行 `node scripts/diff-compat-config.mjs`，出现 blocking diff 时直接失败并停止同步。

## 非目标

1. 不改 `scripts/sync-config.mjs` 的同步语义。
2. 不把 `sync-branch.yml` 改成双模式 workflow。
3. 不在本次需求中加入 ZIP 构建、静态资源发布或 MCP 缓存刷新。
4. 不把 baseline 作为唯一触发条件；baseline 只作为自动同步前的守门校验。

## 方案选择

### 方案 A：直接改 `sync-branch.yml`

将现有手动 workflow 同时改为支持 `workflow_dispatch` 和 `push main`。

- 优点：文件少。
- 缺点：需要同时处理 `github.event.inputs.*` 和 `push` 事件，条件分支会明显变脏；手动任务和主线自动发布的职责混在一起，后续维护成本更高。

### 方案 B：保留手动 workflow，新增自动 workflow（推荐）

新增 `.github/workflows/sync-main-to-examples.yml`，固定监听 `push` 到 `main` 并同步到 `awsome-cloudbase-examples/master`；现有 `sync-branch.yml` 保持手动任务角色。

- 优点：真正做到“只改时机，不改动作”；自动与手动职责分离，逻辑清晰；不会影响现有人工流程。
- 缺点：会多一个 workflow 文件，存在少量步骤重复。

本次采用方案 B。

## 触发与过滤策略

自动 workflow 仅在以下条件同时满足时触发：

- 事件：`push`
- 分支：`main`
- 路径命中以下之一：
  - `config/source/skills/**`
  - `config/source/guideline/**`
  - `config/source/editor-config/**`
  - `scripts/build-compat-config.mjs`
  - `scripts/diff-compat-config.mjs`
  - `scripts/update-compat-baseline.mjs`
  - `scripts/sync-config.mjs`
  - `scripts/template-config.json`
  - `.github/workflows/sync-main-to-examples.yml`

这样可以避免 README、spec、测试等与 examples 产物无关的主线变更触发外部仓库写操作。

## 自动 workflow 执行流程

1. checkout 当前仓库 `main` 的触发提交。
2. checkout `TencentCloudBase/awsome-cloudbase-examples@master` 到 `cloudbase-examples/`。
3. 使用 Node.js 22，与现有 workflow 保持一致。
4. 执行 `node scripts/diff-compat-config.mjs`：
   - 如果存在 blocking diff，workflow 失败并停止。
   - 如果只有 advisory text-surface drift，继续执行。
5. 打印 examples 仓库同步前状态，便于排查。
6. 执行 `node scripts/sync-config.mjs --skip-git`，并通过 `CLOUDBASE_EXAMPLES_PATH=cloudbase-examples` 指向目标仓库。
7. 打印同步后状态与 diff。
8. 若 `git diff --staged --quiet` / `git diff --quiet` 等价判断结果为“无变化”，则跳过 commit/push。
9. 若有变化，则自动 commit 并 push 到 `awsome-cloudbase-examples/master`。

## baseline 的定位

`config/source/editor-config/compat-baseline.json` 及 `diff-compat-config.mjs` 的职责是“兼容契约守门”，不是“发布触发器”。

- 触发是否发生：由 `push main + paths` 决定。
- 自动同步能否继续：由 `diff-compat-config.mjs` 的 blocking / advisory 结果决定。

这样可以避免把 skill / guideline 文本变化误判为“不需要同步”，同时继续阻止机器配置或兼容结构的破坏性漂移进入 examples 仓库。

## 失败处理

- **compat blocking diff**：立即失败，不同步。
- **examples 仓库无 diff**：workflow 成功结束，不产生空提交。
- **push 失败**：workflow 失败，由维护者按现有方式重试或排查 token / 分支状态。

## 影响范围

### 新增
- `.github/workflows/sync-main-to-examples.yml`

### 修改
- `CONTRIBUTING.md`：补充主线自动同步 workflow 的说明，并明确 `sync-branch.yml` 继续用于手动分支同步。

## 验收标准

1. 当 `main` 合并后产生 push，且变更命中指定路径时，自动 workflow 会被触发。
2. 自动 workflow 固定同步到 `awsome-cloudbase-examples/master`。
3. `diff-compat-config.mjs` 出现 blocking diff 时，自动 workflow 会停止，不继续同步。
4. 如果同步后 examples 仓库没有变化，自动 workflow 不会生成空提交。
5. 现有 `sync-branch.yml` 手动能力保持不变。
