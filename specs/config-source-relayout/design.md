# 技术方案设计

## 概述

本次调整不改变“最小源 + 生成兼容层”的整体架构，只改变主源目录的位置：

- `skills/` -> `config/source/skills/`
- `guideline/` -> `config/source/guideline/`
- `editor-config/` -> `config/source/editor-config/`

保留现有兼容层：

- `config/.claude/skills/`：Git 跟踪的兼容镜像
- `config/codebuddy-plugin/`：插件专用保留目录
- `.generated/compat-config/`：生成兼容产物

## 目录模型

```text
config/
├── source/
│   ├── skills/
│   ├── guideline/
│   └── editor-config/
├── .claude/skills/          # generated mirror
└── codebuddy-plugin/        # dedicated retained source
```

## 迁移原则

1. 只迁移 source 目录，不恢复其他旧 `config/rules` / IDE rules 常驻目录。
2. 外部消费路径保持兼容，尤其是：
   - `config/.claude/skills/`
   - `.generated/compat-config/`
   - 外部 skills repo
   - all-in-one skill
   - sync-config 对外模板同步
3. 迁移后所有内部脚本统一从 `config/source/*` 读取主源。
4. 文档统一声明：
   - `config/source/*` 可手改
   - `config/.claude/skills/` 不可手改
   - `.generated/compat-config/` 不可手改

## 受影响脚本

需要改路径读取的主脚本：

- `scripts/build-compat-config.mjs`
- `scripts/sync-claude-skills-mirror.mjs`
- `scripts/build-skills-repo.mjs`
- `scripts/build-allinone-skill.ts`
- `scripts/generate-prompts.mjs`
- `scripts/diff-compat-config.mjs`
- 相关测试与 workflow

## 兼容策略

### Claude skills 镜像

- source: `config/source/skills/`
- mirror: `config/.claude/skills/`
- 同步脚本继续负责：
  - 全量复制
  - 删除陈旧文件
  - drift check

### 兼容产物生成

- `build-compat-config.mjs` 改为从 `config/source/skills/` 与 `config/source/editor-config/` 读取
- 生成结果路径不变：`.generated/compat-config/`

### 文档与 prompts

- prompts 生成链改为从 `config/source/skills/` 读取
- docs 说明同步改为 `config/source/*`

## 测试策略

需要覆盖三类验证：

1. 路径迁移后脚本仍能找到 source
2. `config/.claude/skills/` 镜像仍与 source 一致
3. `.generated/compat-config/` 外部兼容面不回退

保留并扩展现有测试：

- `tests/sync-claude-skills-mirror.test.js`
- `tests/build-compat-config.test.js`
- `tests/generate-prompts.test.js`
- `tests/build-skills-repo.test.js`
- `tests/build-allinone-skill.test.js`

## 风险

### 风险 1 - 内部脚本漏改路径

如果个别脚本仍读根目录旧路径，将在 CI 或本地脚本执行时失败。

缓解：

- 统一检索所有 `skills/` / `guideline/` / `editor-config/` 旧路径引用
- 补回归测试

### 风险 2 - 兼容镜像漂移

如果 `config/.claude/skills/` 未同步，外部路径依赖会失真。

缓解：

- 保留 mirror check
- 保留 mirror sync workflow

### 风险 3 - 文档说明混淆

如果文档仍指向根目录 source，维护者会继续按旧路径操作。

缓解：

- 更新 `AGENTS.md`、`CLAUDE.md`、`CONTRIBUTING.md`、`config/README.md`

