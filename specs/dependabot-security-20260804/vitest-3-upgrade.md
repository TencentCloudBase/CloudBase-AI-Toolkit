# Vitest 3.x 升级评估与落地（GHSA-5xrq-8626-4rwp）

## 结论

已将 root + `mcp` 的 `vitest` 从 `^2.1.x` **精确升级到 `3.2.7`**，并删除未使用的 `test:ui`，以关闭 CVE-2026-47429 / GHSA-5xrq-8626-4rwp。

**不采用**「仅 dismiss Dependabot」方案：漏洞虽仅在 Vitest UI/API 监听时触发，但升级成本可控（vite@5 peer 仍兼容），且可从版本根消除 critical 告警。

## 告警事实

| Alert | Manifest | State（评估时） |
|-------|----------|-----------------|
| 178 | mcp/package.json | fixed |
| 179 | mcp/package-lock.json | open |
| 180 | pnpm-lock.yaml | open |
| 203 | package-lock.json | open |

- **Patched**：`>= 3.2.6`（Dependabot）/ `>= 3.2.5`（OSV）；选用 **3.2.7**（3.2 最新补丁）
- **影响条件**：UI/API 暴露到网络，或在 Windows 上跑 Vitest UI / Browser Mode

## 仓库暴露面（升级前）

- `@vitest/ui` **未安装**（optional peer）
- CI 仅 `vitest run` / `test:hooks`，无 `--ui`
- 配置均为 `environment: 'node'`
- 唯一诱导路径：`mcp` 的 `test:ui` script（已删除）

## 变更

1. `package.json`、`mcp/package.json`：`vitest` → `3.2.7`（精确版本）
2. 删除 `mcp` `test:ui`
3. `mcp/vitest.config.js`：`threads: false` → `pool: "forks"` + `fileParallelism: false`
4. 刷新 `pnpm-lock.yaml`、`package-lock.json`、`mcp/package-lock.json`
5. 更新 `specs/dependabot-security-20260804/report.md`

## 验证

- `npm run test:hooks`：7 files / 96 tests passed（vitest 3.2.7）
- `mcp` `vitest run src`：29 files / 375 tests passed

## 为何不 dismiss

| 方案 | 结果 |
|------|------|
| dismiss only | 版本仍 <3.2.6，告警依赖人工理由，易复发 |
| upgrade to 3.2.7 | Dependabot 在 lockfile 合入后应自动关闭 179/180/203 |

## 残余说明

- 若本地需要 Vitest UI，须显式安装 `@vitest/ui@3.2.7`（与 vitest 同版本），且勿将 `api.host` 暴露到非 localhost。
- `@modelcontextprotocol/sdk`、`decompress`、examples 依赖仍按父任务 deferred。
