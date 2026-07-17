# 实施计划

- [ ] 1. 修复 P0 文档问题：同步插件真源 + 修 broken link
  - 补全 `doc/connection-modes.mdx:237-259` 的 25 个 canonical 插件名（新增 `pg_database`/`pg_storage`/`mysql_database`/`database-nosql`/`database-sql`/`data-model`）
  - 补全 10 个别名（新增 `mysql`→`mysql_database`/`mysql-database`→`mysql_database`/`sql-database`→`mysql_database`）
  - 修复 `doc/plugins/miniprogram.md:62` 的 broken link（指向不存在的 `../plugins.md`，改为指向 `../connection-modes.mdx#支持的插件`）
  - 同步 `README.md`、`mcp/README.md` 中的插件列表，确保三处一致
  - _需求: 需求 7

- [ ] 2. 修复 ai-agent-plugins.mdx 中 Claude Code 仓库路径大小写不一致
  - `doc/ai-agent-plugins.mdx:96` 的 `TencentCloudBase/cloudbase-mcp` 改为 `TencentCloudBase/CloudBase-MCP`（与第 70 行 Codex 路径统一）
  - _需求: 需求 5

- [ ] 3. 新增构建脚本 `scripts/build-open-plugin-spec.mjs`
  - 从 `package.json` 读取 `version`/`description`/`author`/`homepage`/`repository`/`license`/`keywords`
  - 生成 `plugin/cloudbase/.plugin/plugin.json`（含 `$schema` 字段，闭合 schema，不含 `commands`/`agents`/`hooks`）
  - 从 `plugin/cloudbase/.mcp.json` 复制到 `plugin/cloudbase/mcp.json`
  - 支持 `--check` 模式（CI 用，仅校验不生成）
  - 校验 `.mcp.json` 与 `mcp.json` 内容一致
  - 运行 `npx plugins discover plugin/cloudbase --remote` 验证产物可识别
  - 不修改现有 `.claude-plugin/plugin.json` 和 `.codex-plugin/plugin.json`（保持 version 不动）
  - _需求: 需求 1, 需求 2, 需求 6

- [ ] 4. 运行构建脚本生成产物并验证
  - 执行 `node scripts/build-open-plugin-spec.mjs` 生成 `.plugin/plugin.json` 和 `mcp.json`
  - 验证 `npx plugins discover plugin/cloudbase --remote` 成功识别
  - 验证 `npx plugins discover . --remote`（在 plugin/cloudbase 下）成功识别
  - 提交产物到仓库
  - _需求: 需求 1, 需求 2, 需求 4

- [ ] 5. 实测 `npx plugins add` 安装到各 target
  - 测试 `npx plugins add TencentCloudBase/CloudBase-MCP --target claude-code --scope local --yes`（注意：需要等任务 4 的产物推到 GitHub 后才能测 remote 安装）
  - 测试 `npx plugins add TencentCloudBase/CloudBase-MCP --target cursor --scope local --yes`
  - 测试 `npx plugins add TencentCloudBase/CloudBase-MCP --target codex --scope local --yes`
  - 验证安装后 IDE 能发现 MCP Server 和 Skills
  - 验证不破坏现有 `claude plugin install` 和 `codex plugin add` 安装（回归测试）
  - _需求: 需求 4

- [ ] 6. 文档重组：ai-agent-plugins.mdx 按方案 C 重组
  - 顶部新增"方式 1：一键安装（推荐）"章节，展示 `npx plugins add TencentCloudBase/CloudBase-MCP` 命令
  - 列出支持的 7 个 target（Claude Code / Cursor / Codex / Grok Build / Kimi Code / GitHub Copilot CLI / VS Code）
  - 加双重安装警告："如果你已通过 `codex plugin add` 或 `claude plugin install` 安装过，请勿重复使用 `npx plugins add` 安装到同一 IDE"
  - 现有 Tab 改为"方式 2：按 IDE 手动安装"，保留 Codex App / Codex CLI / Claude Code / WorkBuddy / 其他 IDE
  - 加说明：CodeBuddy/WorkBuddy 不在 `plugins` CLI 白名单，需走方式 2
  - 加"什么是插件"段落（Open Plugin Spec 5 种组件定义）
  - _需求: 需求 5

- [ ] 7. CI 集成：加 Open Plugin Spec 校验步骤
  - 在现有 `sync-cloudbase-plugin-skills.yml` 或新建 `open-plugin-spec-check.yml` 中加入：
    - `node scripts/build-open-plugin-spec.mjs --check`（校验产物最新）
    - `npx plugins discover plugin/cloudbase --remote`（校验可识别）
  - 失败则 CI 失败
  - _需求: 需求 6

- [ ] 8. 最终回归测试与验收
  - 运行 `npx plugins discover plugin/cloudbase --remote` 确认识别
  - 运行 `claude plugin install cloudbase@tencent-cloudbase` 确认现有路径仍可用
  - 运行 `codex plugin add cloudbase@tencent-cloudbase` 确认现有路径仍可用
  - 检查 `doc/connection-modes.mdx` 插件表与 `mcp/src/server.ts` 一致
  - 检查 `doc/plugins/miniprogram.md` 无 broken link
  - 检查 `doc/ai-agent-plugins.mdx` 仓库路径统一为 `TencentCloudBase/CloudBase-MCP`
  - _需求: 全部
