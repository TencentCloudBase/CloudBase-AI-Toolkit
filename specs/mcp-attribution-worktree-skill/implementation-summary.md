# 归因修复闭环实施总结

## 背景

这次工作的目标，不是单纯新增一个 prompt 或补一段说明文档，而是给仓库补上一套“评测归因 -> 代码修复 -> PR -> 再评测 -> 继续迭代”的维护闭环。

从工程视角看，这件事有两个很重要的价值：

1. **自进化（self-evolving）**
   - 评测系统不再只是发现问题
   - Agent 可以把问题接回仓库，自主完成归因、修复、验证和后续迭代

2. **Harness engineering**
   - 评测 harness 不再只是打分器
   - 它成为驱动维护流程的真实反馈源，能推动 MCP 和 skills 持续演进

## 这次实现了什么

### 1. 新增内部维护型 skill

新增了根目录内部维护 skill：

- `skills/mcp-attribution-worktree/`

它负责约束 Agent 在处理 attribution issues 时的默认行为，不再停留在“看一下问题、改个状态”。

现在它的默认闭环是：

1. 拉取归因 backlog
2. 读取 issue detail 和 run 证据
3. 判断问题属于 `mcp/src` 还是 `config/source/skills`
4. 回写 attribution 证据
5. 建 GitHub issue / 关联已有 issue
6. 用 worktree 隔离修复
7. 提交 PR
8. 如果有真实评测接口，再跑一轮评测决定是否闭环
9. 如果 review 或评测说明方向错了，再继续下一轮迭代

### 2. 修复面从 MCP 扩展到 skills

这次明确区分了两个源码面：

- `mcp/src`
- `config/source/skills`

这很关键，因为：

- 根目录 `skills/` 是项目内部维护型 skill
- 对外 CloudBase skills 的真实源码在 `config/source/skills/`

如果不把这层边界写清楚，后续 Agent 很容易改错地方。

### 3. 从“一次性修复”升级到“持续迭代”

这次不是把 PR 当终点，而是把 PR 当作一个检查点。

skill 里新增了明确规则：

- 如果 attribution 已经关联了 GitHub issue 或 PR，下一轮要先读取已有上下文
- 如果 review comment 指出方向不对，Agent 要继续修，而不是重新从零开始猜
- 如果后续真实评测仍失败，Agent 要把失败结果作为下一轮输入继续推进
- 只有在真实闭环成立时，才应该把 attribution 视为真正完成

这让整个系统从“单次修 bug”升级成“可回合式修复”。

### 4. 把真实评测纳入闭环

这次还补上了评测接口验证规则。

核心原则是：

- **不能只靠 Agent 主观判断“我觉得修好了”**
- 如果 AI Coding Eval Report API 可用，就必须：
  1. 发起评测
  2. 轮询状态
  3. 读取最终 result
  4. 再决定是否验证通过

这会让维护流程从“基于解释的正确”走向“基于运行结果的正确”。

### 5. backlog 查询策略更保守，降低误判

最开始的想法是通过宽查询兜底，但这会提高误判风险。

最终收敛成了三层策略：

1. 默认只查 `category=tool`
2. 默认再查 `category=skill`
3. 宽查询只作为 fallback，不作为默认工作源

并且 fallback 查到的项不能直接进修复队列，必须经过更严格的 run 证据校验。

这一步的意义是：

- 保持召回率
- 同时控制幻觉和误修风险

## 配套基础设施也一起补齐了

### source-first 本地 skill 安装模型

这次还顺手完善了 `manage-local-skills`：

- `skills/` 保持唯一源码
- `.agents/skills` 保持 link
- `.claude/skills`、`.codebuddy/skills` 等 agent 目录继续 link 到 `.agents/skills`

这意味着：

- 本地维护不再需要复制多份 skill
- 修改源码后，运行态入口会自动感知变化
- 内部维护型 skill 的迭代成本更低

这件事本身也是“自进化工程”的一部分，因为它降低了维护系统自身的摩擦成本。

## 这次交付的主要文件

### 维护型 skill

- `skills/mcp-attribution-worktree/SKILL.md`
- `skills/mcp-attribution-worktree/references/report-api-workflow.md`
- `skills/mcp-attribution-worktree/references/value-triage.md`
- `skills/mcp-attribution-worktree/references/worktree-repair.md`
- `skills/mcp-attribution-worktree/references/iteration-loop.md`
- `skills/mcp-attribution-worktree/references/evaluation-verification.md`

### 安装与链接模型

- `skills/manage-local-skills/SKILL.md`
- `skills/manage-local-skills/references/cli-alignment.md`
- `skills/manage-local-skills/references/install-workflow.md`
- `skills/manage-local-skills/scripts/lib/install-model.mjs`
- `tests/manage-local-skills.test.js`

### 规划文档

- `specs/mcp-attribution-worktree-skill/design.md`
- `specs/mcp-attribution-worktree-skill/tasks.md`

## 验证情况

### 已完成验证

- `npx vitest run tests/manage-local-skills.test.js`
- `node skills/manage-local-skills/scripts/validate-skill.mjs --skill-dir skills/manage-local-skills`
- `npm run build` in `mcp`

### 补充验证与状态更正

后续复核时，本地 `127.0.0.1:5174` 已可访问，补充确认了两件关键事实：

- live API 实际返回的 attribution 字段已经是 `resolutionStatus`、`owner`、`notes`、`externalUrl` 这一套新契约，不能再机械依赖 OpenAPI 里旧的 `status` schema
- 对 attribution worker 执行异常的 run result 写入逻辑已经修正，像 `ExecutionError` / `error_during_execution` / provider `429 usage exceeds frequency limit` 这类问题会按 `error` 处理，而不是误记成普通 `fail`

本次复核还能从真实数据中看到历史记录已被回填修正，例如部分 issue 的 `notes` 已明确写出：

> Affected run attribution status has been backfilled to error.

这说明这次不仅补了 skill 里的流程约束，连同 run attribution 的写入逻辑本身也已经修掉，并对受影响的历史 issue 做了状态更正。

需要注意的是，这个结论针对的是 attribution / run result 写入链路已经修正；它不等于所有 repair issue 都已经完成新一轮真实评测闭环。后续是否 `resolved`，仍然应该继续遵守“以 fresh evaluation 的 final run result 为准”的规则。

## 这次工作的工程意义

如果用一句话概括，这次不是“新增一个 skill”，而是：

> 给仓库补上了一套能接住评测反馈、驱动代码和 skills 演进、并允许多轮迭代的维护型自进化闭环。

它解决的不是单点问题，而是维护方式本身的问题：

- 问题发现后如何不丢
- 修复后如何不靠拍脑袋判断成功
- PR 之后如果方向不对，如何继续迭代
- skills 和 MCP 两个层面，如何统一接回同一条闭环

这正是“自进化工程”和“harness engineering”的结合点。

## 后续可继续演进的方向

### 1. 把真实评测跑通成默认路径

当 AI Coding Eval Report API 稳定可用后，可以把：

- 提交 PR
- 触发真实评测
- 读取最终结果
- 决定是否继续修

变成默认闭环，而不是可选增强。

### 2. 把 iteration 记录结构化

后续可以考虑在 attribution notes 或外部记录中结构化保存：

- iteration 次数
- 对应 PR
- 对应评测 run
- 本轮失败原因
- 下一轮改进方向

这样后面分享和复盘会更清楚。

### 3. 从单 skill 走向维护框架

如果后面继续演进，这个 skill 还可以成为一个更通用的维护框架：

- 不只处理 MCP
- 不只处理 skills
- 也可以处理 guideline、兼容配置、文档投影等归因问题

那时它就不只是一个 skill，而会成为仓库内部的维护操作系统。

## 相关提交

- PR: [#394](https://github.com/TencentCloudBase/CloudBase-MCP/pull/394)
- Branch: `feature/mcp-attribution-repair-loop`
- Commit: `feat(skills): ✨ add attribution repair loop skill and source-first linking`
