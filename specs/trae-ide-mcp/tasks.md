# 实施计划

- [ ] 1. 更新 Trae IDE 数据配置
  - 在 `doc/components/IDESelector.tsx` 的 `IDES` 数组中为 `id: 'trae'` 增加 `docUrl`、`oneClickInstallUrl`、`supportsProjectMCP`
  - 确保 `oneClickInstallUrl` 使用 `trae://.../mcp-import?...` deep link
  - _需求: 需求 2_

- [ ] 2. 增加 Trae 专属提示块（Builder with MCP）
  - 在 “步骤 1：配置 CloudBase MCP” 区域新增 `ide.id === 'trae'` 的提示块
  - 提示块包含 Builder with MCP 的引导文案与 Trae 官方文档链接
  - _需求: 需求 1_

- [ ] 3. 优化一键安装链接的打开方式（协议链接）
  - 一键安装按钮在 URL 为协议链接（非 http/https）时不强制 `_blank`
  - 回归检查 Cursor 与 VSCode 的一键安装行为保持不变
  - _需求: 需求 2_

- [ ] 4. 基础回归检查
  - 选择 Trae：确认出现 “Add to Trae” 一键安装按钮与提示块
  - 选择 Cursor/VSCode：确认一键安装按钮仍正常
  - _需求: 需求 1, 需求 2_

