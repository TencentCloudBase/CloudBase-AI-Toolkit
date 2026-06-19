# 技术方案设计

## 架构概述

本次重构的核心不是减少“最终发布出去的文件数量”，而是减少“仓库中需要人工维护的源文件数量”。

目标架构分为三层：

1. `source`：人工维护的最小源
2. `generated`：在本仓库内临时生成的兼容产物
3. `published`：同步到外部仓库并进一步打包发布的文件

重构后，外部消费方继续看到当前的文件路径与协议；变化仅发生在本仓库内部的生产方式。

## 设计目标

- 将语义类规则内容收敛为单一人工维护源：`skills` + `guideline`
- 将编辑器兼容文件降级为生成产物，不再签入为长期维护源码
- 保持 `downloadTemplate(template="rules")`、外部模板仓库、skills 仓库、all-in-one skill 仓库行为不变
- 允许本仓库内部文档与脚本迁移到新的源布局

## 非目标

- 不改变外部仓库 `awsome-cloudbase-examples` 的 ZIP 打包脚本接口
- 不改变 `mcp/src/tools/setup.ts` 对外暴露的 IDE 类型与过滤协议
- 不要求外部编辑器、外部仓库或终端工具改造其读取路径

## 外部消费方分析

### 1. 外部模板与 ZIP 流水线

当前链路：

```text
本仓库 config/*
-> scripts/sync-config.mjs
-> awsome-cloudbase-examples/web/cloudbase-project/*
-> awsome-cloudbase-examples/scripts/build-zips.js
-> dist/web-cloudbase-project.zip
-> downloadTemplate(template="rules")
```

兼容要求：

- `web/cloudbase-project` 目录内容与当前保持路径兼容
- `airules/codebuddy` 目录仍可同步当前期望的 CodeBuddy 产物
- 外部 `build-zips.js` 无需修改即可继续打包

### 2. MCP `downloadTemplate`

当前 [`mcp/src/tools/setup.ts`]( /Users/joe/Workspace/CloudBase-AI-ToolKit/mcp/src/tools/setup.ts ) 使用 `RAW_IDE_FILE_MAPPINGS` 对 ZIP 内容做 IDE 过滤。

兼容要求：

- 在重构初期，不修改 `RAW_IDE_FILE_MAPPINGS`
- 通过生成阶段继续产出这些路径
- 只有在生成产物与现状完全等价后，才考虑进一步压缩映射定义

### 3. 外部 skills 仓库与 all-in-one skill 仓库

当前分别由以下流程消费：

- [`scripts/build-skills-repo.mjs`]( /Users/joe/Workspace/CloudBase-AI-ToolKit/scripts/build-skills-repo.mjs )
- [`scripts/build-allinone-skill.ts`]( /Users/joe/Workspace/CloudBase-AI-ToolKit/scripts/build-allinone-skill.ts )

兼容要求：

- 输出结构与仓库推送 workflow 保持一致
- 仅修改输入源目录，不修改外部目标仓库的目录契约

## 关键约束

### 1. 语义类文本可由最小源生成

下列文件可以安全视为语义兼容产物：

- `rules/**`
- `.cursor/rules/**`
- `.trae/rules/**`
- `.windsurf/rules/**`
- `.clinerules/**`
- `.kiro/steering/**`
- `.codebuddy/skills/**`
- `AGENTS.md`
- `CLAUDE.md`
- `CODEBUDDY.md`
- `.github/copilot-instructions.md`
- `.augment-guidelines`
- `.gemini/GEMINI.md`
- `.qwen/QWEN.md`

这些文件本质上是 `skills` 与 `guideline` 的不同投影视图。

### 2. 机器配置不能从 prose 安全推导

下列文件属于机器配置，不应该从自然语言规则文档反推：

- `.mcp.json`
- `.cursor/mcp.json`
- `.roo/mcp.json`
- `.comate/mcp.json`
- `.vscode/mcp.json`
- `.kiro/settings/mcp.json`
- `.gemini/settings.json`
- `.qwen/settings.json`
- `.codex/config.toml`
- `.opencode.json`
- `.vscode/settings.json`

因此，若要求“行为不变”，则除了 `skills` 与 `guideline` 外，还需要一个最小的机器源。建议收敛为单一机器源描述，例如 `editor-config/` 或 `compat/editor-config.ts`，而不是保留多份编辑器特定副本。

这部分不是规则内容源，但属于外部兼容所必需的机器描述。

## 目录重构方案

### 推荐目录布局

```text
skills/
  auth-web/
    SKILL.md
    ...
  no-sql-web-sdk/
    SKILL.md
    ...
  ...

guideline/
  cloudbase/
    SKILL.md

editor-config/
  targets.ts
  mcp-base.json
  templates/
    codex.toml
    vscode.settings.json
    ...

scripts/
  build-compat-config.mjs
  build-skills-repo.mjs
  build-allinone-skill.ts
  sync-config.mjs
  generate-prompts.mjs
  generate-prompts-data.mjs

.generated/
  compat-config/
  skills-repo-output/
  allinone/
```

### 目录职责

- `skills/`：唯一的模块化技能语义源
- `guideline/`：唯一的总入口 guideline 源
- `editor-config/`：唯一的机器配置源
- `.generated/compat-config/`：对外模板和 ZIP 所需的完整兼容产物

## 兼容产物生成方案

新增主脚本：

- `scripts/build-compat-config.mjs`

该脚本输入：

- `skills/`
- `guideline/cloudbase/SKILL.md`
- `editor-config/`

该脚本输出到：

- `.generated/compat-config/`

### 输出内容

1. `rules/`
   - 由 `skills/<name>/SKILL.md` 生成 `rules/<name>/rule.md`
   - 其余补充 `.md` 文件原样复制

2. IDE rules 目录
   - `.cursor/rules/**`
   - `.trae/rules/**`
   - `.windsurf/rules/**`
   - `.clinerules/**`
   - `.kiro/steering/**`
   - `.qoder/rules/**`
   - `.agent/rules/**`
   - Cursor 继续做 `.md -> .mdc` 转换

3. 单文件 instruction 兼容层
   - `AGENTS.md`
   - `CLAUDE.md`
   - `CODEBUDDY.md`
   - `.github/copilot-instructions.md`
   - `.augment-guidelines`
   - `.gemini/GEMINI.md`
   - `.qwen/QWEN.md`

   这些文件统一由 `guideline` 生成，不再在仓库中直接维护副本。

4. skills 镜像
   - `.codebuddy/skills/**`
   - 由 `skills/` 直接复制生成

5. 机器配置文件
   - `.mcp.json`
   - `.cursor/mcp.json`
   - `.roo/mcp.json`
   - `.comate/mcp.json`
   - `.vscode/mcp.json`
   - `.kiro/settings/mcp.json`
   - `.gemini/settings.json`
   - `.qwen/settings.json`
   - `.codex/config.toml`
   - `.opencode.json`
   - `.vscode/settings.json`

   这些文件由 `editor-config/` 中的规范化描述生成。

## 脚本重构方案

### 1. 替换 `fix-config-hardlinks.mjs`

现状问题：

- 直接改写 `config/`，导致“生成产物签入仓库”
- 依赖硬链接，适合本地同步，不适合作为长期源码模型

改造方案：

- 保留旧脚本一段时间作为迁移辅助
- 新增 `build-compat-config.mjs` 作为主发布构建脚本
- 新脚本不在源码目录内写回，不使用硬链接作为长期状态

### 2. 改造 `sync-config.mjs`

现状：

- 源目录固定为 `config/`

改造后：

1. 先调用 `build-compat-config.mjs`
2. 从 `.generated/compat-config/` 同步到 `awsome-cloudbase-examples`

这样外部仓库仍收到与当前一致的布局，但本仓库不再保存这些副本。

### 3. 改造 skills 仓库构建脚本

`build-skills-repo.mjs` 改为直接读取：

- `skills/`
- `guideline/cloudbase/SKILL.md`

不再依赖 `config/.claude/skills` 与 `scripts/skills-repo-template/cloudbase-guidelines`

### 4. 改造 all-in-one 构建脚本

`build-allinone-skill.ts` 改为直接读取：

- `skills/`
- `guideline/cloudbase/SKILL.md`

输出结构保持不变。

### 5. 改造 prompts 文档构建

`generate-prompts.mjs` 和 `generate-prompts-data.mjs` 改为直接读取 `skills/`。

规则：

- `SKILL.md` 作为主入口文件
- 其余 `.md` 作为附加文档
- 输出 MDX 结构与现有文档保持一致

## 迁移策略

### 阶段 1 - 建立生成器并并行验证

- 新增 `skills/`、`guideline/`、`editor-config/`
- 新增 `build-compat-config.mjs`
- 继续保留现有 `config/` 目录
- 增加对比脚本，比较 `.generated/compat-config/` 与现有 `config/` 的关键发布文件

### 阶段 2 - 切换内部消费方

- 文档脚本改读 `skills/`
- skills repo / all-in-one 改读 `skills/` 与 `guideline/`
- workflow 触发路径改为新的源目录

### 阶段 3 - 切换同步入口

- `sync-config.mjs` 改为同步 `.generated/compat-config/`
- 验证外部仓库 `web/cloudbase-project` 与 `airules/codebuddy` 内容等价
- 验证 `build-zips.js` 产出的 ZIP 文件结构未变化

### 阶段 4 - 删除仓库内旧兼容产物

- 删除 `config/rules`
- 删除 `config/.cursor/rules`、`config/.trae/rules` 等 IDE rules 目录
- 删除 `config/AGENTS.md`、`config/CLAUDE.md`、`config/CODEBUDDY.md` 等生成副本
- 视迁移结果决定是否保留一个最薄的 `config/README.md` 解释新结构

## 测试策略

### 1. 生成一致性测试

- 对比 `.generated/compat-config/` 与当前 `config/` 的关键路径集合
- 对比 `web/cloudbase-project` 打包前文件清单
- 对比 `airules/codebuddy` 同步结果

### 2. `downloadTemplate` 行为测试

- 保留并扩展现有 `downloadTemplate` IDE filtering tests
- 使用生成后的兼容目录做 fixture
- 验证 `ide=cursor`、`ide=windsurf`、`ide=codebuddy`、`ide=claude-code` 等返回结果不变

### 3. 文档生成测试

- 验证 `doc/prompts/*.mdx` 数量、标题、正文来源与旧实现一致
- 验证 `sidebar.json` 更新逻辑不受影响

### 4. 发布工作流测试

- 验证 `push-skills-repo.yaml` 与 `push-allinone-skill.yml` 触发路径与产物不回退
- 验证 `build-zips.yml` 在新同步链路下继续工作

## 风险与缓解

### 风险 1 - 误以为只靠 `skills + guideline` 就能生成所有文件

缓解：

- 明确区分“语义源”和“机器配置源”
- 为 MCP/TOML/JSON 类文件保留唯一机器源

### 风险 2 - 外部 ZIP 行为发生微妙变化

缓解：

- 先做文件清单 diff
- 再做压缩前目录 diff
- 最后做 `downloadTemplate` 集成验证

### 风险 3 - workflow 触发条件漏改

缓解：

- 检查所有引用 `config/.claude/skills` 和 `scripts/skills-repo-template` 的 workflow
- 将触发路径迁移到 `skills/**`、`guideline/**`、`editor-config/**`

## 建议结论

最稳妥的重构目标不是“仓库里只剩两个目录”，而是：

- 语义内容源只剩两个目录：`skills/` 与 `guideline/`
- 机器配置源只剩一个小目录：`editor-config/`
- 所有兼容层都在 `.generated/compat-config/` 中生成

这样可以同时满足：

- 仓库内维护面显著缩小
- 外部消费方保持兼容
- 内部脚本与发布流程可以逐步迁移
