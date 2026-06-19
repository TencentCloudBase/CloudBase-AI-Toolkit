# 技术方案设计

## 目标

在不改动整体交互结构的前提下，增强 `doc/components/IDESelector.tsx` 对 Trae 的指引能力：

- 为 Trae 增加可点击的一键安装链接（`trae://...`），并在 UI 上展示为与 Cursor/VSCode 类似的 “Add to Trae” 按钮。
- 在 Trae 的配置步骤中增加“安装后需要在 Builder with MCP 或 SOLO Coder 等智能体中使用 MCP Server”的提示，并提供 Trae 官方文档链接。

## 方案概述

### 1) 数据层：补齐 Trae IDE 配置项

在 `IDES` 中为 `id: 'trae'` 增加：

- `docUrl`: 指向 Trae 官方文档 `https://docs.trae.ai/ide/use-mcp-servers-in-agents?_lang=zh`
- `oneClickInstallUrl`: 使用 `trae://.../mcp-import?...` 的 deep link
- `supportsProjectMCP`: 设为 `true`（用于展示模板提示区域；与其它独立 IDE 的行为一致）

### 2) 视图层：Trae 专属提示

复用现有的 `templateHint` 展示结构（目前已对 CodeBuddy 做了特殊提示），新增 `ide.id === 'trae'` 分支：

- 中文提示：强调 “安装完成后请在 Builder with MCP 中的智能体使用 MCP Server”
- 英文提示：提供对应英文描述（避免英文站点出现全中文块）
- 提示块内提供一个外链按钮（沿用 `templateLink` 样式）跳转到 Trae 官方文档

### 3) 交互层：协议链接打开策略

现有一键安装按钮对多数 IDE 使用 `_blank` 打开。对 `trae://` 这类协议链接，使用 `_blank` 可能导致浏览器拦截或产生空白页。

因此在渲染一键安装按钮时，增加对 URL scheme 的判断：

- 如果是一键安装链接以 `http://` / `https://` 开头：保持 `_blank`
- 否则（如 `trae://`、`vscode:` 等）：不强制 `_blank`，让浏览器/系统协议处理器按默认方式处理

## 影响范围

- 仅修改 `doc/components/IDESelector.tsx` 的 Trae IDE 配置项与相关 UI 分支逻辑
- 不改动其它 IDE 的配置项结构
- 不引入新依赖

## 测试策略

- 手动检查：选择 Trae 时，“一键安装”区域出现 “Add to Trae” 按钮，链接为 `trae://...`
- 手动检查：选择 Trae 时，“步骤 1：配置 CloudBase MCP” 中出现 Builder with MCP 提示块，且文档链接可点击
- 回归检查：Cursor / VSCode 的一键安装按钮仍按原逻辑工作

