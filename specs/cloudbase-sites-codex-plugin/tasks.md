# 实施计划

- [x] 1. 补充 Codex 插件 manifest
  - 新增 `plugin/cloudbase-sites/.codex-plugin/plugin.json`
  - 填写 `CloudBase Sites` 的 Codex UI 元数据、starter prompts、skills 和 MCP server 路径
  - 运行本地 Codex plugin validator，修正 manifest schema 问题
  - _需求: 1_

- [x] 2. 统一 Sites 状态目录命名
  - 将项目级状态路径从 `.cloudbase-agent` 改为 `.cloudbase-sites`
  - 将全局 supervisor/registry 路径从 `~/.cloudbase-agent` 改为 `~/.cloudbase-sites`
  - 将 CLI help、skill 文档、hook 日志路径和错误提示同步为 Sites 命名
  - 将 stderr 前缀从 `[cloudbase-agent]` 改为 `[cloudbase-sites]`
  - 不实现旧 `.cloudbase-agent` 兼容迁移
  - _需求: 4, 6_

- [x] 3. 更新 Git ignore 防护
  - 在仓库 `.gitignore` 中加入 `**/.cloudbase-sites/`
  - 在 `cloudbase-sites init` 或状态目录创建流程中确保用户项目 `.gitignore` 包含 `.cloudbase-sites/`
  - 确认 `save` 的 `git add -A` 不会提交 `.cloudbase-sites/`、`dist/`、`node_modules/`、`.env`
  - _需求: 4, 6_

- [x] 4. 梳理跨宿主 manifest 与 skill 复用
  - 保留 `.claude-plugin/plugin.json`
  - 将 skill 文件或 skill name 从 agent runtime 命名调整为 CloudBase Sites runtime 命名
  - 在 skill 文档中明确 Codex、Claude Code、CodeBuddy 的 hooks 和 context 注入差异
  - 确保 shared CLI/runtime 仍为唯一实现源
  - _需求: 2_

- [x] 5. 适配 Codex-compatible hooks
  - 调整 `hooks/hooks.json` 保持 Codex 可发现的默认 hook 布局
  - 修改 hook 脚本的插件根目录解析逻辑，避免只依赖 `CLAUDE_PLUGIN_ROOT`
  - 将 `on-session-start.sh` 的状态读取逻辑更新到 V2 `app.json`
  - 保持 hooks 失败不阻塞，诊断写入 `.cloudbase-sites/logs/`
  - _需求: 3, 6_

- [x] 6. 修复 CLI alias 和 runtime 行为
  - 修复 `cloudbase-sites status`，使其真实等价于 `cloudbase-sites preview --status`
  - 更新 `init` 的 empty-enough allowlist 为 `.cloudbase-sites`
  - 更新 `versions`、`preview`、`supervisor` 的路径和输出
  - _需求: 4, 6_

- [x] 7. 收紧 save / deploy / rollback 语义
  - 明确 `save` 创建本地 Git commit/tag，不 push
  - 部署指定 version 时构建对应 saved commit，避免部署当前工作区却标记为旧版本
  - 保留 rollback 的 stash + reset + preview restart 行为
  - 确认命令输出 JSON 可被 agent 稳定解析
  - _需求: 5_

- [x] 8. 记录 CloudBase 构建元数据
  - 扩展部署记录 schema，支持 `buildId`、`versionName`、`buildStatus`
  - 调整 `deploy --post` 参数解析和 `appendDeployment`
  - 当未传 `--build-id` 时在 JSON 中输出 warning
  - 更新 skill 文档，要求 agent 将 `manageApps` 返回的 BuildId 传回 Phase 2
  - _需求: 5_

- [x] 9. 添加或更新聚焦验证
  - 为路径常量、deployment schema、status alias 等可单测逻辑添加测试或轻量验证脚本
  - 用临时 Vite fixture 验证 `status`、`save`、`versions`、`deploy --skip-build` 的关键输出
  - 验证 Codex plugin validator 通过
  - _需求: 1, 6, 7_

- [x] 10. 文档与最终自查
  - 补充本地安装/测试 CloudBase Sites Codex 插件的简短说明
  - 检查 `git diff --stat`，排除无关 `doc/mcp-tools.md`、`scripts/tools.json` 漂移
  - 扫描确认无 `.cloudbase-agent`、`[cloudbase-agent]` 残留
  - _需求: 7_
