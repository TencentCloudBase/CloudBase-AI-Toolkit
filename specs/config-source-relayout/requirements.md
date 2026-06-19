# 需求文档

## 介绍

当前仓库已经将 AI 规则体系收敛为少量主源目录，但这些主源目录位于仓库根目录下：

- `skills/`
- `guideline/`
- `editor-config/`

为了进一步统一目录心智模型，希望将这些主源移动到 `config/` 目录下，同时保持外部消费方兼容性不变，并继续保留仓库内的兼容镜像与特殊保留目录。

## 需求

### 需求 1 - 统一 source 目录位置

**用户故事：** 作为维护者，我希望所有主源目录都位于 `config/` 下，以便仓库结构更集中统一。

#### 验收标准

1. When the repository stores AI rule sources, the toolkit shall place modular skills under `config/source/skills/`.
2. When the repository stores the main guideline source, the toolkit shall place it under `config/source/guideline/`.
3. When the repository stores editor and MCP machine configuration sources, the toolkit shall place them under `config/source/editor-config/`.
4. When the source relocation is complete, the toolkit shall stop treating root-level `skills/`, `guideline/`, and `editor-config/` as active source-of-truth directories.

### 需求 2 - 保持兼容镜像与外部行为不变

**用户故事：** 作为依赖旧路径或兼容产物的消费方，我希望仓库重组后仍能继续工作，不需要同步修改外部依赖。

#### 验收标准

1. When source directories are moved, the toolkit shall keep `config/.claude/skills/` as a Git-tracked compatibility mirror.
2. When source directories are moved, the toolkit shall continue generating `.generated/compat-config/` with the same external compatibility surface unless explicitly changed.
3. When source directories are moved, the toolkit shall preserve existing external publishing flows for skills repo, all-in-one skill, template sync, and downloadTemplate compatibility artifacts.
4. While external consumers still rely on repository paths, the toolkit shall not require those consumers to read from `config/source/*`.

### 需求 3 - 保持内部消费方可用

**用户故事：** 作为仓库内部脚本和 CI 的维护者，我希望内部脚本在迁移后仍能稳定运行。

#### 验收标准

1. When internal scripts load source skills, the toolkit shall read from `config/source/skills/`.
2. When internal scripts load the main guideline, the toolkit shall read from `config/source/guideline/`.
3. When internal scripts load editor config sources, the toolkit shall read from `config/source/editor-config/`.
4. When the migration is finished, the toolkit shall update tests and workflows that reference the old root-level source paths.

### 需求 4 - 明确 source 与 generated 边界

**用户故事：** 作为维护者，我希望迁移后仍然清楚哪些目录能手改、哪些目录是生成物。

#### 验收标准

1. When contributors read repository docs, the toolkit shall document `config/source/*` as the only human-maintained source-of-truth for the shared AI rules system.
2. When contributors read repository docs, the toolkit shall document `config/.claude/skills/` as a generated compatibility mirror that must not be edited manually.
3. When contributors read repository docs, the toolkit shall document `.generated/compat-config/` as a generated compatibility output that must not be edited manually.
4. When contributors perform day-to-day maintenance, the toolkit shall not require manual hardlink repair workflows.
