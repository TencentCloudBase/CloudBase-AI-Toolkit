---
name: narrow-compat-baseline-check
overview: 收窄 compat baseline / diff 校验范围：保留机器可消费配置与目录结构的阻断校验，弱化或移除 skills/guideline 文本类产物的全文 hash 阻断，降低文案改动导致的 CI 噪音。
todos:
  - id: audit-compat-surface
    content: 使用[subagent:code-explorer]核对 compat 产物并确定三类校验边界
    status: completed
  - id: build-policy-module
    content: 新增 scripts/compat-surface.mjs 统一分类与 manifest 组装
    status: completed
    dependencies:
      - audit-compat-surface
  - id: refactor-baseline-flow
    content: 改造 diff/update 脚本与 baseline 实现分层校验
    status: completed
    dependencies:
      - build-policy-module
  - id: add-regression-tests
    content: 新增 tests/compat-diff.test.js 覆盖阻断与仅报告场景
    status: completed
    dependencies:
      - refactor-baseline-flow
  - id: align-workflow-docs
    content: 使用[skill:docs-workflows]更新 workflow 与 CONTRIBUTING 说明
    status: completed
    dependencies:
      - refactor-baseline-flow
      - add-regression-tests
---

## User Requirements

- 保留现有 baseline / compat diff 链路，不直接删除。
- 将当前“对 `.generated/compat-config` 全量全文快照阻断”收窄为分层校验：
- 机器可消费配置与关键目录结构继续阻断；
- 入口说明类文件保留弱校验；
- skills / guideline 派生的文本规则变化仅报告、不阻断。
- 明确 baseline 的职责、消费边界与后续维护方式，避免纯文案改动继续频繁拦截 CI。

## Product Overview

- 本次改造聚焦兼容校验流程本身，不新增业务功能页面。
- 目标是保留关键兼容面防护，同时降低文本产物高频变化带来的误报与维护摩擦。
- 无界面改版，无视觉变化。

## Core Features

- 兼容产物按“严格哈希 / 仅存在性 / 仅报告”三类管理。
- CI 仅对关键配置和结构回归失败，对文本类变化输出摘要。
- baseline 只承载需要审计的兼容契约信息，更新条件更清晰。

## Tech Stack Selection

- 脚本层：仓库现有 Node.js ESM 脚本体系（`scripts/*.mjs`）
- 校验入口：GitHub Actions 工作流 `/.github/workflows/compat-check.yml`
- 兼容产物生成：`/Users/bookerzhao/Projects/cloudbase-turbo-delploy/scripts/build-compat-config.mjs`
- 测试方式：现有 Vitest 测试体系（`/Users/bookerzhao/Projects/cloudbase-turbo-delploy/tests/*.test.js`）

## Implementation Approach

先复用现有 `buildCompatConfig()` 生成链路，不改兼容产物的生成内容，只在“baseline 记录方式”和“diff 判定方式”上收窄。核心做法是把已验证的生成目标按来源与消费方式拆成三类策略，再由 baseline 与 diff 脚本按策略执行不同级别的比较。

关键技术决策：

1. **保留生成器单一事实源**：`build-compat-config.mjs` 已真实定义了 `GUIDELINE_TARGETS`、`IDE_RULE_TARGETS`、`MACHINE_TARGETS`、`PASS_THROUGH_DIRS`，分类策略应基于这些已验证目标，而不是重新发明路径约定。
2. **baseline 改为分层 manifest**：不再只存一份全量 `files` 哈希，而是拆成严格哈希、仅存在性、仅报告三组，避免纯文本规则变化与机器契约变化同级阻断。
3. **保持现有命令入口稳定**：继续保留 `npm run check:compat-diff` 与 `npm run update:compat-baseline`，减少贡献者习惯与 CI 接入面的变动。
4. **单次遍历完成对比**：生成后统一收集文件并分类，时间复杂度保持 O(n)，避免对同一目录反复 walk / hash；只对需要哈希的文件计算内容摘要，控制 I/O 成本。

建议分类边界（基于已验证代码）：

- **严格哈希**：`MACHINE_TARGETS` 产物，如 `.mcp.json`、`.cursor/mcp.json`、`.vscode/settings.json`、`.iflow/settings.json`、`mcp.json` 等。
- **仅存在性**：`GUIDELINE_TARGETS` 中的关键入口文件、`.claude/**`、`codebuddy-plugin/**` 等，保留路径与文件存在约束，但不因文案改动阻断。
- **仅报告**：`rules/**`、`.codebuddy/skills/**`、各 IDE 规则目录中由 `config/source/skills/**` 派生的规则文件，记录变化但不 `exit 1`。

## Implementation Notes

- 优先抽出共享的 compat surface 分类/manifest 辅助模块，避免 `diff-compat-config.mjs` 和 `update-compat-baseline.mjs` 再次复制文件收集、哈希和分类逻辑。
- 兼容脚本日志需明确分区：`blocking diffs`、`exists-only issues`、`report-only changes`，沿用现有最大输出条数限制，避免 CI 日志过长。
- 尽量不改变 `buildCompatConfig()` 的输出内容；若需暴露目标元数据，优先通过导出常量/辅助函数复用，避免改动生成结果本身。
- baseline 结构变更需要在同一改动中同步刷新 `config/source/editor-config/compat-baseline.json`，避免脚本升级后仓库基线失配。
- 文本类变更改为仅报告后，仍要保证关键入口文件缺失会被拦截，防止 setup / IDE 接入文件被误删。

## Architecture Design

本次改造保持现有生成链不变，只在生成结果之上增加“兼容面策略层”。

- **生成层**：`buildCompatConfig()` 负责产出 `.generated/compat-config`
- **策略层**：根据已定义目标，把产物映射到 strict-hash / exists-only / report-only
- **基线层**：`update-compat-baseline.mjs` 生成新的分类 manifest
- **校验层**：`diff-compat-config.mjs` 比较当前产物与 baseline，并决定是否阻断 CI
- **流程层**：`compat-check.yml` 继续执行 `npm run check:compat-diff`，但结果语义变为“只拦关键兼容契约”

## Directory Structure Summary

本次实现主要调整 compat baseline 的分类与对比逻辑，不改变兼容产物的发布入口。

```text
/Users/bookerzhao/Projects/cloudbase-turbo-delploy/
├── scripts/
│   ├── compat-surface.mjs                 # [NEW] 兼容面分类与 manifest 共享模块。基于已验证的生成目标定义 strict-hash、exists-only、report-only 策略，并提供文件收集、哈希、比较辅助函数，供 diff/update 脚本复用。
│   ├── build-compat-config.mjs            # [MODIFY] 暴露生成目标元数据或辅助方法，供 compat-surface 复用；保持实际生成内容与路径不被无关修改。
│   ├── diff-compat-config.mjs             # [MODIFY] 按新 manifest 执行分层校验；仅对严格哈希和存在性问题失败，对报告类变化输出摘要。
│   └── update-compat-baseline.mjs         # [MODIFY] 生成新的分类 baseline 文件，写入分组后的文件列表和必要哈希。
├── .github/workflows/
│   └── compat-check.yml                   # [MODIFY] 继续触发 compat 检查，但日志与失败语义需匹配新的分层校验结果。
├── config/source/editor-config/
│   └── compat-baseline.json               # [MODIFY] 刷新为新的分类 manifest，提交新的已批准兼容基线。
├── tests/
│   └── compat-diff.test.js                # [NEW] 覆盖严格哈希失败、仅存在性缺失失败、文本报告不失败、baseline 结构迁移等关键场景。
└── CONTRIBUTING.md                        # [MODIFY] 更新 baseline 维护说明，明确哪些改动需要更新 baseline，哪些改动只会在 CI 中报告。
```

## Key Code Structures

建议将 baseline 结构从单一 `files` 哈希表收敛为带版本的分类 manifest，便于后续继续扩展策略而不破坏语义：

```ts
type CompatBaselineManifest = {
  version: number;
  strictHashFiles: Record&lt;string, string&gt;;
  existsOnlyFiles: string[];
  reportOnlyFiles: Record&lt;string, string&gt;;
};
```

若需平滑迁移，可让 `diff-compat-config.mjs` 在过渡期兼容旧结构并给出明确提示，但同一改动中仍应提交新的 baseline。

## Agent Extensions

### SubAgent

- **code-explorer**
- Purpose: 复核 `build-compat-config.mjs` 派生出的真实路径集合，确保 strict-hash、exists-only、report-only 的边界基于仓库现状而非猜测。
- Expected outcome: 得到可落地的路径分类清单，减少 IDE 兼容产物遗漏或误分类。

### Skill

- **docs-workflows**
- Purpose: 同步贡献与维护文档中的 compat baseline 规则、更新时机和 CI 预期结果。
- Expected outcome: `CONTRIBUTING.md` 与新流程一致，后续提交者能准确判断何时需要更新 baseline。