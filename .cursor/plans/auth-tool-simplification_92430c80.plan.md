---
name: auth-tool-simplification
overview: 将当前 `login/logout` 与环境编排逻辑收敛为统一的 `auth` 工具，采用最小显式动作模型；CodeBuddy 作为特殊环境，仅暴露可用的只读/显式绑定能力。
todos:
  - id: rename-auth-tool
    content: 将 `login/logout` 收敛到统一的 `auth` 工具，并更新 action schema
    status: pending
  - id: split-explicit-vs-interactive
    content: 将 `select_env` 收紧为显式绑定，将交互式流程收敛到 `choose_env`
    status: pending
  - id: ide-capability-gating
    content: 按 IDE 能力控制 `auth` 可见动作，CodeBuddy 仅保留 `status/select_env`
    status: pending
  - id: update-next-step-and-docs
    content: 更新 `next_step`、tools schema、文档与提示文案
    status: pending
  - id: migrate-tests
    content: 迁移并补齐 `auth` 的单元测试与集成测试
    status: pending
isProject: false
---

# Auth Tool Simplification

## 目标

将当前分散且语义混杂的 `login` / `logout` / `ensure` / 交互式选环境逻辑收敛为统一的 `auth` 工具，并明确区分：

- 认证状态查询
- 发起认证
- 显式环境绑定
- 交互式环境选择（仅在支持交互的 IDE）
- 退出登录

本次重构采用最小显式动作模型：

- 所有 IDE 的基础动作：`status`、`start_auth`、`select_env`、`logout`
- 不再对外暴露 `ensure`
- `choose_env` 仅在支持交互的 IDE 中保留
- CodeBuddy 特殊处理：仅暴露 `status`、`select_env`

## 核心语义调整

- `auth(action="status")`
  - 只读查询当前认证状态、环境状态、候选环境、下一步建议
- `auth(action="start_auth")`
  - 仅发起认证，不做环境选择编排
- `auth(action="select_env", envId)`
  - 仅显式绑定指定环境，`envId` 必填，不触发登录 UI
- `auth(action="choose_env")`
  - 仅在有交互能力的 IDE 中开放，走交互式环境选择
- `auth(action="logout")`
  - 清理登录态与缓存
- `ensure`
  - 从 tool schema 中移除，内部若仍有需要，可保留为代码层辅助能力，但 AI 不直接调用

## 主要改动点

- [mcp/src/tools/env.ts](mcp/src/tools/env.ts)
  - 将工具名从 `login` 收敛为 `auth`
  - 合并现有 `logout` 实现到 `auth(action="logout")`
  - 调整 action schema，移除公开的 `ensure`
  - 将 `select_env` 收紧为“显式 envId 绑定”
  - 将交互式路径收敛到 `choose_env`
  - 根据 `server.ide` / 集成环境决定是否暴露 `choose_env`、`start_auth`、`logout`
- [mcp/src/tools/interactive.ts](mcp/src/tools/interactive.ts)
  - 保留 `_promptAndSetEnvironmentId()` 作为交互式环境选择底层实现
  - 让它只服务于 `choose_env` 或内部辅助逻辑，不再承接公开的 `select_env`
- [mcp/src/cloudbase-manager.ts](mcp/src/cloudbase-manager.ts)
  - 保持 fail-fast 认证门禁
  - `AUTH_REQUIRED` / `ENV_REQUIRED` 的 `next_step.tool` 从 `login` 改为 `auth`
  - 去掉对 `ensure` 的外部依赖，改为引导 AI 使用 `status`、`start_auth`、`select_env`
- [mcp/src/utils/tool-result.ts](mcp/src/utils/tool-result.ts)
  - 统一 `next_step` 的推荐动作与参数，改用 `auth`
- [scripts/tools.json](scripts/tools.json)
  - 更新 `auth` 工具 schema 与 action 列表
  - 同步移除公开的 `ensure`
- [doc/mcp-tools.md](doc/mcp-tools.md)
  - 更新工具文档与推荐调用顺序
  - 增加“显式动作模型”说明与 CodeBuddy 差异说明
- [tests/npx-simulate.test.js](tests/npx-simulate.test.js)
  - 将原 `login` 测试迁移到 `auth(action="status")`
  - 补充 CodeBuddy/非交互场景断言（如适用）
- [mcp/src/tools/env.test.ts](mcp/src/tools/env.test.ts)
  - 改造现有 `login/logout` 测试为 `auth` action 测试
  - 覆盖 `status/start_auth/select_env/logout/choose_env` 的可见性与返回结构

## 兼容策略

- 短期内可考虑保留 `login` / `logout` 作为兼容别名，内部转发到 `auth`
- `next_step`、文档与新测试全部以 `auth` 为主
- 若担心老规则/旧 agent 立即失效，可分两步迁移：
  1. 先引入 `auth` 并保留别名
  2. 再在后续版本移除 `login/logout`

## 默认交互策略

- CodeBuddy：只暴露 `status`、`select_env`
- 其他支持交互的 IDE：暴露 `status`、`start_auth`、`select_env`、`logout`，并按能力增加 `choose_env`
- `choose_env` 不作为所有环境的默认推荐动作，仅在需要交互选择且 IDE 支持时返回为 `next_step`

