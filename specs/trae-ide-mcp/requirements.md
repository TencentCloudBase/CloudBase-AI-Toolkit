# 需求文档

## 介绍

在文档站点的 IDE 配置选择器（`doc/components/IDESelector.tsx`）中优化 Trae IDE 的 MCP 配置指引，使用户在 Trae 中能更顺畅地完成 CloudBase MCP 的安装与在智能体中使用。

本文档面向 CloudBase MCP 用户，强调在 Trae 中应通过 “Builder with MCP” 的方式在智能体（Agent）中使用 MCP Server，并提供 Trae 支持的安装链接（`trae://` deep link）以减少手动配置成本。

## 需求

### 需求 1 - Trae 安装后使用指引提示

**用户故事：** 作为使用 Trae 的开发者，我希望在文档的 IDE 选择器中看到明确的后续操作指引，以便我在安装/配置 MCP 后，知道应在 Trae 的 “Builder with MCP” 中创建/配置智能体并使用 MCP Server。

#### 验收标准

1. While 用户在 IDE 选择器中选择了 Trae, when 用户查看 “步骤 1：配置 CloudBase MCP”, the 文档 shall 显示一段与 Trae 强相关的提示文案，强调安装完成后需要在 “Builder with MCP” 中的智能体里使用 MCP Server。
2. While 用户在 IDE 选择器中选择了 Trae, when 用户需要查看更详细的 Trae 智能体中使用 MCP 的说明, the 文档 shall 提供一个指向 Trae 官方文档的链接：`https://docs.trae.ai/ide/use-mcp-servers-in-agents?_lang=zh`。
3. While 用户在 IDE 选择器中选择了 Trae, when 文档展示 Trae 的智能体使用提示, the 文档 shall 提及 “Builder with MCP” 或 “SOLO Coder” 等智能体作为示例。

### 需求 2 - Trae 支持一键安装链接

**用户故事：** 作为使用 Trae 的开发者，我希望能够一键导入 CloudBase MCP 的配置，而不是手动编辑配置文件。

#### 验收标准

1. While 用户在 IDE 选择器中选择了 Trae, when 用户查看 “一键安装”, the 文档 shall 提供并可点击打开 Trae 支持的安装链接：
   - `trae://trae.ai-ide/mcp-import?type=stdio&name=cloudbase&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyJAY2xvdWRiYXNlL2Nsb3VkYmFzZS1tY3BAbGF0ZXN0Il0sImVudiI6eyJJTlRFR1JBVElPTl9JREUiOiJUcmFlIn19`
2. While 用户点击 Trae 的一键安装链接, when 浏览器/系统协议处理器被唤起, the 文档 shall 能够触发 Trae 客户端接收该链接（由 Trae 客户端能力保证，文档侧仅需提供正确链接且可点击）。
3. While 用户在 IDE 选择器中选择了 Trae, when 一键安装入口可用, the 文档 shall 显示一个与 Cursor/VSCode 类似的按钮样式（例如 “Add to Trae”），并在点击时触发对应的安装链接。

