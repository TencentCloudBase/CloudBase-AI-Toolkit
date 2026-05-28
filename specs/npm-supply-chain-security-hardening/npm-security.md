# npm 供应链安全加固指南（内部）

> 本文档为 `npm-supply-chain-security-hardening` spec 的配套内部指导文档，仅限仓库内部使用。

## 背景

CloudBase AI Toolkit 因其 MCP Server + 大量 AI IDE 技能分发能力，成为 npm 供应链攻击的高价值目标。

参考 Supabase 2026 年发布的 npm 供应链攻击防护分析，本 spec 旨在系统性提升项目的安全姿态。

## 当前防护状态（随 spec 推进实时更新）

### Phase 1 已完成项（基础硬化）

- [x] 所有 GitHub Actions 引用固定到 Commit SHA（任务 1.1）
- [x] `anthropics/claude-code-action@beta` 已 pin（任务 1.2）
- [x] 根目录 `.npmrc`：`ignore-scripts=true` + `min-release-age=3`（任务 1.3）
- [x] `npm-publish.yaml` 增加 `npm audit signatures`（任务 1.4）
- [x] PR 触发敏感密钥注入收紧（nightly-build.yaml 添加显式条件）（任务 1.6）
- [x] 全局 CLI 安装加固（添加版本提示 + TODO）（任务 1.7）

### Phase 2 进行中 / 计划中

- [ ] `packageManager` 字段 + corepack 强制
- [ ] 安全敏感依赖精确版本 pinning（@cloudbase/manager-node 等）
- [ ] pnpm 11 迁移或 npm 强化 quarantine 配置
- [ ] Renovate 配置（Actions + 敏感依赖 review 策略）

### Phase 3 计划中

- 规范文档更新（AGENTS.md 等引用本指南）
- CI 供应链安全门禁
- 定期自检机制
- 实施总结归档

## 关键防护措施说明

### 1. GitHub Actions Pinning
所有第三方 Action 必须使用完整 40 字符 commit SHA，禁止使用 `@vX` tag。

### 2. 生命周期脚本控制
通过 `.npmrc` 全局禁用 `preinstall`/`install`/`postinstall`，仅在必要时通过 allowlist 放行。

### 3. 版本时效隔离（Quarantine）
新发布的包在 3 天内无法被 CI 拉取，降低 0-day 恶意包风险。

### 4. 发布签名审计
发布前执行 `npm audit signatures`。

## AI Agent 审计 Prompt（内部版本）

```
Audit this repository for npm supply-chain hygiene according to the internal spec at specs/npm-supply-chain-security-hardening/.

Focus areas:
- All GitHub Actions must be pinned to full commit SHA.
- .npmrc must enforce ignore-scripts=true and min-release-age.
- Security-sensitive dependencies (@cloudbase/*, @modelcontextprotocol/sdk, etc.) should use exact versions.
- No floating @beta or @latest in critical workflows without justification.
- Check for dangerous patterns (pull_request_target + checkout, unpinned global installs).

Report changes and items requiring human review.
```

## 参考

- 需求文档：`requirements.md`
- 技术方案：`design.md`
- 实施计划：`tasks.md`
- Supabase 原始文章：https://supabase.com/blog/protecting-your-supabase-projects-from-npm-supply-chain-attacks

---

**维护说明**：本文件随 spec 任务推进持续更新，仅供内部参考，不对外发布。