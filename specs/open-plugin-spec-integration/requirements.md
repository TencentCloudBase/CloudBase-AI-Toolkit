# 需求文档

## 介绍

将 CloudBase AI Toolkit 的插件包（`plugin/cloudbase/`）接入 [Open Plugin Specification v1.0.0](https://open-plugins.com/plugin-builders/specification)，使其能通过 `npx plugins add TencentCloudBase/CloudBase-MCP` 一键安装到所有支持该规范的 AI 编程助手（Claude Code / Cursor / Codex / Grok Build / Kimi Code / GitHub Copilot CLI / VS Code）。

当前 `plugin/cloudbase/` 已有完整的插件结构（`.claude-plugin/plugin.json` + `.codex-plugin/` + `skills/` + `.mcp.json` + `commands/` + `agents/` + `hooks/`），且已被 `npx plugins discover . --remote` 成功识别为 `cloudbase` 插件。本需求在此基础上补齐 Open Plugin Spec v1.0.0 的合规性要求，并更新文档主推 `npx plugins add` 路径。

**范围边界**：
- CodeBuddy / WorkBuddy / ZCode 不在 `plugins` CLI 的 target 白名单内，仍走各自 IDE 集成路径（Codex marketplace / WorkBuddy 连接器 / 各 IDE MCP 配置），本需求不涉及这些 IDE 的接入改动
- 不推动 CodeBuddy / WorkBuddy 实现 Open Plugin Spec（那是产品决策，不在本需求范围）
- 不给 `vercel-labs/plugins` 提 PR 加 target（等仓库公开后再评估）

## 调研结论（已验证）

| 验证项 | 结论 |
|---|---|
| `npx plugins discover . --remote` 在 `plugin/cloudbase/` 下运行 | 成功识别 `cloudbase` 插件 |
| 现有 `.claude-plugin/plugin.json` 与 spec schema 对比 | 字段已基本符合，缺 `$schema`，`name` 合规 |
| 现有 `skills/` 目录结构 | 每个子目录含 `SKILL.md`，符合 spec 的 Agent Skills 发现规则 |
| 现有 `.mcp.json` | 内容为 stdio 传输（`npx @cloudbase/cloudbase-mcp@latest`），符合 spec 的 stdio 要求 |
| `plugins` CLI 支持的 target | 7 个：Claude Code / Cursor / Codex / Grok Build / Kimi Code / GitHub Copilot CLI / VS Code (Preview) |
| Open Plugin Spec v1 支持的组件类型 | 仅 2 种：Agent Skills + MCP Servers（commands/agents/hooks/rules 明确不在 v1 范围，但 host 必须忽略不支持的类型，可保留） |

## 需求

### 需求 1 - 插件 manifest 符合 Open Plugin Spec v1.0.0

**用户故事：** 作为插件作者，我希望 CloudBase 插件包的 manifest 完全符合 Open Plugin Spec v1.0.0，这样任何实现该规范的 host 都能标准地发现和加载我的插件，而不需要厂商特定的适配。

#### 验收标准

1. When 在 `plugin/cloudbase/` 目录下检查 manifest 时，the system shall 在 `.plugin/plugin.json` 路径提供厂商中立的 manifest 文件（spec 推荐路径）。
2. When 解析 `.plugin/plugin.json` 时，the system shall 包含 `$schema` 字段，值为 `https://open-plugins.com/schemas/1.0.0/plugin.schema.json`（spec 必填字段）。
3. When 解析 `.plugin/plugin.json` 时，the system shall 包含 `name` 字段，值为 `cloudbase`，符合 spec 的命名约束（lowercase alphanumeric + hyphens，1-64 字符，不以连字符开头/结尾，不含 `--` 或 `..`）。
4. While 保留 `.claude-plugin/plugin.json` 和 `.codex-plugin/` 等厂商特定配置时，the system shall 不破坏现有 Claude Code marketplace 和 Codex marketplace 的集成（向后兼容）。
5. When `.plugin/plugin.json` 与 `.claude-plugin/plugin.json` 内容不一致时，the system shall 以 `.plugin/plugin.json` 为 spec 合规的权威源，厂商特定配置作为超集补充。

### 需求 2 - MCP server 配置符合 spec

**用户故事：** 作为 AI 编程助手，我希望通过标准的 `mcp.json` 发现并启动 CloudBase MCP Server，而不需要依赖厂商特定的 `.mcp.json` 路径。

#### 验收标准

1. When 在 `plugin/cloudbase/` 目录下查找 MCP 配置时，the system shall 在 `mcp.json`（无点前缀）路径提供配置文件（spec 标准路径）。
2. When 解析 `mcp.json` 时，the system shall 包含 `mcpServers` 对象，其中 `cloudbase-mcp` 条目使用 `stdio` 传输（`command: "npx"`，`args: ["-y", "@cloudbase/cloudbase-mcp@latest"]`）。
3. While spec 要求支持 MCP 的 host 必须支持 `stdio` 和 `streamable-http` 两种传输时，the CloudBase 插件 shall 在 `mcp.json` 中至少提供 `stdio` 配置（spec §11.1 第 5 条要求 host 支持两种，但插件只需提供自己支持的传输类型）。
4. When `mcp.json` 与现有 `.mcp.json` 内容需要保持同步时，the system shall 通过构建脚本或符号链接确保两者一致，避免维护双份配置。

### 需求 3 - Skills 目录结构符合 Agent Skills specification

**用户故事：** 作为 AI 编程助手，我希望通过标准的 `skills/` 目录发现 CloudBase 的所有 Agent Skills，每个 skill 是一个子目录含 `SKILL.md`，符合 Agent Skills specification。

#### 验收标准

1. When 在 `plugin/cloudbase/skills/` 目录下发现组件时，the system shall 每个直接子目录包含一个 `SKILL.md` 文件（spec 的 Agent Skills 发现规则）。
2. While 现有 skills 源在 `config/source/skills/` 维护时，the system shall 通过构建脚本（`sync-cloudbase-plugin-skills.mjs` 或新增脚本）将 skills 同步到 `plugin/cloudbase/skills/`，保持单一真源。
3. When skills 源发生变更时，the system shall 通过现有 CI/构建流程自动更新 `plugin/cloudbase/skills/`，无需手动同步。
4. While `SKILL.md` 需要符合 Agent Skills specification 时，the system shall 不修改现有 `config/source/skills/*/SKILL.md` 的内容格式（现有格式已被 Claude Code / CodeBuddy 等验证可用）。

### 需求 4 - 能被 `npx plugins` CLI 识别和安装

**用户故事：** 作为用户，我希望在任意支持 Open Plugin Spec 的 AI 编程助手环境下，通过一条命令 `npx plugins add TencentCloudBase/CloudBase-MCP` 安装 CloudBase 插件，而不需要查阅各 IDE 的单独配置文档。

#### 验收标准

1. When 运行 `npx plugins discover TencentCloudBase/CloudBase-MCP --remote` 时，the system shall 成功识别并列出 `cloudbase` 插件。
2. When 运行 `npx plugins add TencentCloudBase/CloudBase-MCP --target claude-code --yes` 时，the system shall 成功将插件安装到 Claude Code（`~/.claude` 或项目级 `.agents/plugins/`）。
3. When 运行 `npx plugins add TencentCloudBase/CloudBase-MCP --target cursor --yes` 时，the system shall 成功将插件安装到 Cursor。
4. When 运行 `npx plugins add TencentCloudBase/CloudBase-MCP --target codex --yes` 时，the system shall 成功将插件安装到 Codex。
5. When 运行 `npx plugins add TencentCloudBase/CloudBase-MCP`（不带 `--target`）时，the system shall 自动检测本机已安装的 AI 工具并安装到所有检测到的目标。
6. While 安装到各 target 后，the system shall 使该 target 的 AI 工具能发现 CloudBase 的 MCP Server 和 Agent Skills，无需用户额外配置。

### 需求 5 - 文档主推 `npx plugins add` 路径

**用户故事：** 作为新用户，我希望在文档中首先看到 `npx plugins add` 这条最简路径，快速完成安装；当我的 IDE 不在支持列表时，再查阅各 IDE 的单独接入文档作为 fallback。

#### 验收标准

1. When 用户打开 `doc/ai-agent-plugins.mdx` 时，the system shall 在文档顶部显著位置展示 `npx plugins add TencentCloudBase/CloudBase-MCP` 作为推荐安装命令。
2. When 用户使用的 IDE 不在 `plugins` CLI 支持列表时，the system shall 在文档中提供明确的 fallback 说明，引导用户到各 IDE 单独接入章节（Codex App / Codex CLI / Claude Code / WorkBuddy / 其他 IDE）。
3. While 保留现有各 IDE 接入文档时，the system shall 不删除现有 Tab 切换式接入指南（作为 fallback 路径）。
4. When 文档中提到 `npx plugins` 工具时，the system shall 明确说明该工具基于 Open Plugin Specification，并列出当前支持的 7 个 target（Claude Code / Cursor / Codex / Grok Build / Kimi Code / GitHub Copilot CLI / VS Code）。
5. While CodeBuddy / WorkBuddy 不在 `plugins` CLI 支持列表时，the system shall 在文档中加一段说明，解释为什么这两个 IDE 需要走各自集成路径而非 `npx plugins add`。

### 需求 6 - 构建脚本与 CI 集成

**用户故事：** 作为维护者，我希望 spec 合规产物（`.plugin/plugin.json`、`mcp.json`）通过构建脚本自动生成和同步，而不需要手动维护双份配置。

#### 验收标准

1. When skills 源或 MCP 配置发生变更时，the system shall 通过现有构建脚本（`sync-cloudbase-plugin-skills.mjs` 或扩展）自动生成 `.plugin/plugin.json` 和 `mcp.json`。
2. When `.plugin/plugin.json` 的内容需要与 `.claude-plugin/plugin.json` 保持元数据一致时，the system shall 从单一数据源（如 `package.json` 或共享配置）生成两者，避免版本/描述/作者字段不同步。
3. While CI 流程存在时，the system shall 在 CI 中加入校验步骤，运行 `npx plugins discover plugin/cloudbase --remote` 确认产物可被 `plugins` CLI 识别。
4. When 构建脚本运行完成后，the system shall 使 `plugin/cloudbase/` 目录结构完全符合 Open Plugin Spec v1.0.0 的 directory layout 要求。

### 需求 7 - 同步修复 P0 文档问题

**用户故事：** 作为维护者，我希望在接入 Open Plugin Spec 的同时，修复之前调研发现的 P0 文档问题（与 `mcp/src/server.ts` 真源不同步、broken link），避免文档债务累积。

#### 验收标准

1. When 修改 `doc/connection-modes.mdx` 时，the system shall 补全 25 个 canonical 插件名（含 `pg_database`/`pg_storage`/`mysql_database`/`database-nosql`/`database-sql`/`data-model`）和 10 个别名（含 `mysql`/`mysql-database`/`sql-database`）。
2. When 修复 broken link 时，the system shall 将 `doc/plugins/miniprogram.md:62` 中指向 `../plugins.md` 的链接改为指向真实存在的文档（`../connection-modes.mdx#支持的插件` 或新建 `doc/plugins/index.mdx`）。
3. While 同步真源时，the system shall 确保 `README.md`、`mcp/README.md`、`doc/connection-modes.mdx` 三处的插件列表一致，均以 `mcp/src/server.ts` 为权威源。

## 非功能性要求

- **向后兼容**：不破坏现有 Claude Code marketplace、Codex marketplace、WorkBuddy 连接器、各 IDE MCP 配置的接入路径
- **单一真源**：skills 源仍在 `config/source/skills/` 维护，通过构建同步到 `plugin/cloudbase/skills/`，不产生双份维护负担
- **供应链安全**：遵循 `<supply_chain_security>` 规则，`plugins` 作为 devDependency 时使用精确版本
- **不泄漏内部信息**：遵循 `<attribution_evaluation_guardrails>`，不在文档中泄漏内部评测文件名或路径

## 验收方式

| 验收项 | 验证命令/方式 |
|---|---|
| spec 合规性 | `npx plugins discover plugin/cloudbase --remote` 成功识别 |
| 实际安装 | `npx plugins add TencentCloudBase/CloudBase-MCP --target cursor --yes` 安装成功，Cursor 能发现 MCP + Skills |
| 文档主推路径 | `doc/ai-agent-plugins.mdx` 顶部有 `npx plugins add` 命令 |
| fallback 路径 | 现有各 IDE 接入 Tab 保留，CodeBuddy/WorkBuddy 有专门说明 |
| P0 修复 | `doc/connection-modes.mdx` 插件表与 `mcp/src/server.ts` 一致，无 broken link |
| 向后兼容 | 现有 Claude Code marketplace 安装方式仍可用 |
