# 插件系统现状分析

> 调研时间：2026-07-15
> 调研范围：/Users/bookerzhao/Projects/CloudBase-MCP 仓库

## 关键认知：三套并存的"插件"概念

仓库存在三个层面的"插件"，讨论时必须先区分：

| 层面 | 真源 | 性质 |
|------|------|------|
| **MCP 工具插件** | `mcp/src/server.ts:40-121` | 20 个内联工具模块（非 IDE 插件） |
| **IDE 兼容配置下载** | `mcp/src/tools/setup.ts:42-185` | 21 个 IDE 的配置文件下载能力 |
| **AI IDE 原生插件包** | `plugin/cloudbase/`、`config/codebuddy-plugin/` | 真正的 Claude Code/Codex 插件 |

用户问的"Claude code 插件最完善、codex 差点、codebuddy 要看看、opencode 在开发"——指的是第三层"原生插件包"。

## 一、MCP 工具插件真源

- **`mcp/src/server.ts:40-61`** `DEFAULT_PLUGINS`：20 个默认启用工具（env, database, pg_database, pg_storage, mysql_database, functions, hosting, storage, setup, rag, cloudrun, gateway, app-auth, apps, permissions, logs, agents, download, invite-code, capi）
- **`server.ts:84-108`** `AVAILABLE_PLUGINS`：23 个可用插件（比默认多 `database-nosql`、`database-sql`、`data-model` 三个细粒度别名）
- **`server.ts:110-121`** `PLUGIN_ALIASES`：10 个兼容别名（如 `mysql`→`mysql_database`）

实现特点：无独立 `mcp/src/plugins/` 目录，所有插件以 `registerXxxTools` 函数内联注册在 `server.ts` 的 `createCloudBaseMcpServer` 循环中（`server.ts:329-333`）。

## 二、AI IDE 原生插件包完善度对比

### 🟢 Claude Code 插件（最完善）

**路径**：`plugin/cloudbase/.claude-plugin/plugin.json`

**能力清单**：
- **16 个 hooks**（`plugin/cloudbase/hooks/`）：包含 skill injection、session profiler、lexical-index、unified-ranker、prompt-patterns 等复杂逻辑
- **4 个 commands**：deploy / env / init / status
- **2 个 agents**：cloudbase-architect、cloudbase-deployment-expert
- **25+ skills 模块**
- 独立 marketplace.json + 完整文档 `doc/ide-setup/claude-code.mdx`

### 🟡 Codex 插件（基本完善，有差距）

**路径**：`plugin/cloudbase/.codex-plugin/plugin.json`

**现状**：
- 复用同一套 skills 目录（`"skills": "./skills/"`）
- 有 `interface` 配置（displayName、capabilities、brandColor、defaultPrompt）
- 有 `mcpServers` 配置
- 有 marketplace.json + `doc/ide-setup/codex.mdx`

**差距**：
- **无独立 hooks**（Claude Code 有 16 个，Codex 复用 cloudbase 目录的 hooks 但未声明）
- **无独立 commands/agents 声明**（plugin.json 中只有 skills + mcpServers + interface）
- Codex 的 plugin.json 版本 0.1.0，Claude Code 是 0.2.0

### 🔴 CodeBuddy 插件（严重缺失）

**路径**：`config/codebuddy-plugin/.codebuddy-plugin/plugin.json`（仅 16 行）

```json
{
  "name": "cloudbase",
  "version": "1.0.0",
  "skills": ["./skills/cloudbase"]
}
```

**严重差距**：
- ❌ 无 hooks
- ❌ 无 commands
- ❌ 无 agents
- ❌ 无 marketplace 声明
- 仅有 skills 引用，skills 内容未明确

**评价**：与 Claude Code/Codex 差距巨大，几乎是空壳。是当前最大的短板。

### 🟡 OpenCode 插件（尚未真正开始）

**现状**：
- 仅有 `config/source/editor-config/files/opencode.json`（14 行 MCP 配置）
- 有 `doc/ide-setup/opencode.mdx` 文档
- **`plugin/` 目录下无 opencode 原生插件实现**

**评价**：用户说"正在开发 opencode 插件"，但仓库中只有配置下载，无原生插件包。属于待启动状态。

### 🟡 Gemini CLI（基本可用）

**现状**：复用 cloudbase 目录，有 `gemini-extension.json` + `GEMINI.md`，无独立 hooks。

### 🟡 cloudbase-sites 插件

**路径**：`plugin/cloudbase-sites/`

实现完整但无独立 IDE 配置文档。

## 三、IDE 兼容配置覆盖（setup.ts）

**`mcp/src/tools/setup.ts:42-65`** `IDE_TYPES`：21 个 IDE（含 `all`）。

**`setup.ts:84-144`** `RAW_IDE_FILE_MAPPINGS`：每个 IDE 的配置文件路径映射。

**已知技术债**：
- `setup.ts:113-114, 124` 拼写错误 `cloudbaase`（多一个 a），与正确路径 `cloudbase` 双路径并存
- README 支持表与 IDE_TYPES 不一致（缺 Antigravity/Qoder/Kiro/Aider/VSCode/iFlow 6 个 IDE）
- aider / vscode 缺独立配置文档
- 8 个 IDE 缺独立机器配置模板文件

## 四、测试覆盖

| 测试文件 | 覆盖范围 |
|----------|----------|
| `tests/plugin-marketplace.test.js` | Codex + Claude Code marketplace 清单 |
| `tests/cloudbase-sites-plugin.test.js` | Sites 插件打包与 verbs |
| `tests/sync-codebuddy-plugin.test.js` | CodeBuddy 插件 skill 同步 |
| `tests/setup-compat-mappings.test.js` | IDE 文件映射与生成产物一致性 |
| `tests/setup-ide-filtering.test.js` + `tests/ide-filtering.test.js` | IDE 文件过滤逻辑 |
| `tests/setup-tool-logic.test.js` | downloadTemplate 工具逻辑 |
| `tests/hooks/*.test.mjs`（5 个） | hooks 单元测试，**但未被 CI 执行** |

**测试缺口**：
- 无 Gemini extension.json 结构测试
- 无 INTEGRATION_IDE_MAPPING 映射完整性测试
- hooks 测试未接入 CI（nightly-build.yaml 只跑 `./mcp` 目录）
- 无端到端 hook 触发链路测试

## 五、完善度评分与差距清单

### 完善
- **Claude Code 插件**：hooks + commands + agents + skills 完整，有 marketplace 和文档
- **Codex 插件**：基本完善，缺 hooks/commands/agents 声明

### 基本可用
- **Gemini CLI**：复用 cloudbase 目录有 extension.json，但无独立 hooks
- **cloudbase-sites (Claude/Codex)**：实现完整但无独立 IDE 配置文档

### 有缺失
- **CodeBuddy 插件**：仅 plugin.json + 1 个 rules md，无 hooks/commands/agents
- **Cursor/Windsurf/Cline 等配置下载型 IDE**：仅 mcp.json + rules 目录，无原生插件能力

### 严重缺失
- **OpenCode**：无原生插件包实现
- **aider**：有 mapping 无文档无独立测试
- **vscode**：有 mapping 无文档
- **README 未列入的 6 个 IDE**（Antigravity/Qoder/Kiro/Aider/VSCode/iFlow）：setup.ts 已定义但 README 支持表未展示

## 六、具体差距清单

1. `setup.ts:113-114, 124` 拼写错误 `cloudbaase`（多一个 a），虽双路径并存但属技术债
2. CodeBuddy 插件实现深度远低于 Claude Code/Codex（无 hooks/commands/agents）
3. README 支持表与 IDE_TYPES 不一致（缺 6 个 IDE）
4. aider/vscode 缺独立配置文档
5. cloudbase-sites 插件缺独立 IDE 配置文档
6. 8 个 IDE 缺独立机器配置模板文件
7. 无 Gemini extension.json 结构测试和 INTEGRATION_IDE_MAPPING 完整性测试
8. hooks 测试未接入 CI（**本次已修复**：`nightly-build.yaml` 新增 "Test hooks" 步骤，`package.json` 新增 `test:hooks` 脚本）
9. `hook-env.mjs:38-48` 的 `appendAuditLog` 是 dead code（已实现但从未被调用）
10. `doc/prompts/how-to-use.mdx:90` 声称"Hooks 最高约 80%+"，**实际评估显示 F1=0.0000**（见 baseline-result.md）
11. **Manifest 数据层全空**：28 个 SKILL.md 都没有 `promptSignals` 和 `retrieval` frontmatter，导致 manifest 中所有 phrases 和 retrieval 字段都是空数组，skill-inject 完全失效
12. **Troubleshooting Intent 是 dead code**：`classifyTroubleshootingIntent` 能命中 3 个 ops 类 prompt，但 `report.troubleshooting` 从未被下游读取
13. **评测体系已建立**：`tests/hooks/eval/prompts.jsonl`（59 个 prompt）+ `scripts/eval-skill-inject.mjs`，可量化后续改进效果
