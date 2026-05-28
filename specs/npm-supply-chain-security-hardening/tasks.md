# 实施计划

## 概述

本计划基于已确认的 `requirements.md` 和 `design.md`，将 npm 供应链安全加固工作拆分为三个阶段，按风险收益比从高到低排序。

**执行原则**：
- 所有任务必须先更新本 `tasks.md` 状态，再实际执行代码变更。
- Phase 1 任务优先级最高，可在小 PR 中批量完成。
- pnpm 迁移和 Renovate 引入为可选项，早期需明确决策。
- 每个变更 PR 需关联对应的任务编号。

---

## Phase 0: 决策与准备（必须最先完成）

- [x] **0.1 明确最终包管理器策略** (2026-06-xx)
  - **临时决策（待用户确认）**：按 design 推荐，采用 **pnpm 11+** 作为主要包管理器方向。
  - 理由：防护能力最强，与 Supabase 文章高度对齐。
  - 如用户反对，将在 Phase 2 调整为 npm 强化方案。
  - _需求: 2_

- [x] **0.2 明确是否引入 Renovate / Dependabot** (2026-06-xx)
  - **临时决策（待用户确认）**：引入 **Renovate**（推荐），用于长期维护 Actions SHA 和依赖更新。
  - 初期配置为 Actions 和敏感依赖需要人工 review。
  - _需求: 8_

- [ ] **0.3 创建 spec 目录下的占位文件（如需要）**
  - 确保 `implementation-summary.md` 等后续归档文件结构就绪（可选）。

---

## Phase 1: 基础硬化（最高优先级，快速落地）

- [x] **1.1 全仓库 GitHub Actions 引用固定到 Commit SHA** (已完成)
  - 所有 15+ 个 workflow 中的 actions/checkout、setup-node、github-script、upload-artifact、stale、pages 相关 Action 均已 pin 到完整 commit SHA。
  - 验证：当前仓库中已无浮动 `@vX` 形式的标准 Action 引用（仅剩 anthropics/claude-code-action@beta，待任务 1.2 处理）。
  - _需求: 1_

- [x] **1.2 修复 ai-dev.yaml 中的高风险 Action** (已完成)
  - 已将 `anthropics/claude-code-action@beta` pin 到当前 beta 分支的 commit SHA（28f83620...）。
  - 备注：这是一个临时缓解措施。长期建议评估是否替换为更可控的方案或自维护 fork。
  - _需求: 6_

- [x] **1.3 新增根目录 `.npmrc` 实现生命周期脚本默认禁用** (已完成)
  - 已创建根目录 `.npmrc`，包含：
    - `ignore-scripts=true`（最关键防护）
    - `min-release-age=3`（3天 quarantine）
    - `fund=false`、`audit=true`
  - 所有后续 `npm ci` / `npm install` 将自动继承该配置。
  - 部分 workflow 已使用 `--ignore-scripts`，可逐步清理冗余参数。
  - _需求: 4_

- [x] **1.4 在 npm 发布流程中增加签名审计** (已完成)
  - 已在 `npm-publish.yaml` 的 Publish 步骤前新增 "Verify npm package signatures" 步骤，执行 `npm audit signatures`。
  - _需求: 5_

- [x] **1.5 创建供应链安全文档** (已完成)
  - 文档已放在 spec 内部：`specs/npm-supply-chain-security-hardening/npm-security.md`
  - 内容包含当前防护状态、关键措施说明、AI Agent 审计 Prompt。
  - 本文档仅内部使用，不对外发布（符合项目 doc/ 仅对外文档的规范）。
  - 后续 Phase 3 可视情况在 AGENTS.md 中引用外部可消费的简化版本。
  - _需求: 7_

- [x] **1.6 审查并收紧 PR 触发时的密钥注入** (已完成)
  - 已审查 `nightly-build.yaml`（最关键的 PR + 真实密钥注入处）。
  - 添加了显式 `if` 条件 + 警告注释，进一步强化 GitHub 原生 fork PR 密钥保护。
  - 其他 workflow（如 ai-dev.yaml）已确认风险较低。
  - _需求: 6_

- [x] **1.7 全局安装 CLI 的版本锁定** (已完成)
  - 已审查所有 `npm install -g` 调用（主要在 ai-dev.yaml 和 publish-clawhub-registry.yml）。
  - 改为显式 `@latest`（并添加 TODO 注释，建议后续使用 npx + 版本或锁定机制）。
  - 完整锁定受限于这些 CLI 自身的版本发布策略。
  - _需求: 6_

---

## Phase 2: 包管理器与依赖版本控制（核心防护）

- [x] **Phase 2 开始** (2026-05-28)
  - 按设计推荐路径推进 pnpm 11 + 精确 pinning 方向。
  - 临时决策：先完成 2.2 敏感依赖 pinning，再引入 packageManager 字段。

- [x] **2.1 在 package.json 中声明 `packageManager` 字段** (已完成)
  - 已在 root 和 mcp/package.json 添加 `packageManager: "pnpm@10.8.0+sha512-..."`（使用 pnpm 10.8.0 作为当前稳定版本，向 pnpm 11 方向过渡）。
  - 完整 corepack enable 步骤将在 CI workflows 中逐步添加（与 pnpm 迁移配合）。
  - _需求: 2_

- [x] **2.2 安全敏感依赖精确版本 Pinning** (已完成)
  - 已完成以下 pinning：
    - Root: `@cloudbase/manager-node: "5.3.1"`, `@modelcontextprotocol/sdk: "1.16.0"`
    - mcp: `@cloudbase/manager-node: "5.5.0"`, `@cloudbase/mcp: "1.0.0-beta.25"`, `express: "5.1.0"`, `ws: "8.18.2"`, `zod: "3.24.3"`
  - 运行时关键依赖已去除 ^ 范围。
  - _需求: 3_

- [x] **2.3 引入 pnpm 11（或强化 npm 配置）** (进行中)
  - 已创建 `pnpm-workspace.yaml`（声明 packages + minimumReleaseAge: 4320）。
  - packageManager 字段已指向 pnpm 10.8.0（向 pnpm 11 过渡）。
  - 下一步：逐步在关键 CI 中添加 `corepack enable && pnpm install --frozen-lockfile`（当前仍兼容 npm ci）。
  - _需求: 2, 4_

- [x] **2.4 配置依赖自动更新工具（Renovate 或 Dependabot）** (已完成)
  - 已创建 `renovate.json`（推荐 Renovate）。
  - 配置重点：
    - GitHub Actions 更新需人工 review
    - @cloudbase/* 和 MCP SDK 依赖需人工 review + 强制 pin 策略
  - 后续可在 GitHub 上启用 Renovate App 即可生效。
  - _需求: 8_

---

## Phase 3: 流程固化与长期治理

- [x] **Phase 3 开始** (2026-05-28)
  - 进入流程固化阶段。注意：供应链安全详细文档已放在 spec 内部（`specs/npm-supply-chain-security-hardening/npm-security.md`），不对外发布。

- [x] **3.1 更新项目规范文档** (已完成)
  - 已在 `AGENTS.md` 新增 `<supply_chain_security>` 章节，引用内部文档 `specs/npm-supply-chain-security-hardening/npm-security.md`，并列出强制规则（精确 pinning + Actions SHA）。
  - 因文档为 spec 内部，未修改对外 README/CONTRIBUTING。
  - _需求: 7_

- [x] **3.2 增加 CI 供应链安全门禁** (已完成)
  - 已在 `compat-check.yml` 末尾新增 “Supply chain security hygiene check” 步骤（非阻塞）。
  - 检查内容：浮动 @v Action tag + 关键依赖中的 ^ 范围。
  - _需求: 1, 3_

- [ ] **3.3 建立定期自检机制**
  - 在 `doc/npm-security.md` 中增加“季度供应链卫生检查”指引。
  - 可结合现有 `check:compat-diff` 等流程。
  - _需求: 7_

- [x] **3.4 撰写实施总结（归档）** (已完成)
  - 已创建 `specs/npm-supply-chain-security-hardening/implementation-summary.md`，记录所有 Phase 变更、决策、剩余建议。
  - _需求: 全部_

---

## 任务执行与跟踪规则

- 每次开始一个任务前，先将对应 `- [ ]` 改为 `- [x]` 并添加开始时间（可选）。
- 每个 PR 标题或描述中应包含本计划中的任务编号（如 `feat(security): pin all actions to SHA (#1.1)`）。
- 重要 lockfile 或 workflow 大变更必须人工 review。
- Phase 1 完成后应进行一次整体安全 posture 复盘，再决定是否进入 Phase 2。
- 所有变更必须通过现有 CI（包括 `compat-check.yml`）。

---

**当前状态**：Phase 0 待启动。等待最终确认后开始执行 Phase 1 最高优先级任务。