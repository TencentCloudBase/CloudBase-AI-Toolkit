# 需求文档

## 介绍

为 CloudBase AI Toolkit 新增 OpenClaw 支持入口，使用户能够在现有的 AI IDE / AI 工具支持体系中看到 OpenClaw，并按照 OpenClaw 的实际使用方式完成 CloudBase 能力接入。

本次需求聚焦文档、站点展示和安装指引，不将 OpenClaw 误描述为“支持项目级 MCP 配置文件的 IDE”。OpenClaw 的接入方式应以 Skills / 命令安装为主，并与仓库现有 `cloudbase-skills` 口径保持一致。

## 需求

### 需求 1 - 在支持列表中新增 OpenClaw

**用户故事：** 作为正在评估 CloudBase AI Toolkit 的用户，我希望在现有 AI IDE / AI 工具支持列表中看到 OpenClaw，这样我可以快速判断 CloudBase 是否支持我当前使用的工具。

#### 验收标准

1. When 用户查看 CloudBase AI Toolkit 对外支持列表时，the 文档 shall 在 `README.md`、`mcp/README.md`、`doc/index.mdx`、`doc/faq.md` 等现有 AI IDE / AI 工具列表中补充 OpenClaw 条目。
2. When 文档或组件中存在 Cursor 入口时，the 系统 shall 在同类 OpenClaw 适用场景中同步补充 OpenClaw 入口，至少覆盖 `doc/components/IDESelector.tsx`、`doc/components/IDEIconGrid.tsx` 与相关 IDE 快捷入口组件。
3. When 文档或组件展示 OpenClaw 条目时，the 系统 shall 将 OpenClaw 排在 Cursor 之前或更靠前的位置，以体现优先支持顺序。
4. When 文档展示 OpenClaw 条目时，the 文档 shall 使用与 OpenClaw 实际形态一致的工具描述，而不是将其描述为必须通过项目级 MCP JSON 文件接入的 IDE。
5. When 组件展示 OpenClaw 图标时，the 系统 shall 使用来自 OpenClaw 官方站点或官方资源的准确 logo，而不是复用通用图标或占位图。
6. When 用户从支持列表进入 OpenClaw 详情时，the 文档 shall 提供可访问的 OpenClaw 专属接入指引页面。

### 需求 2 - 提供 OpenClaw 专属安装与使用指引

**用户故事：** 作为 OpenClaw 用户，我希望看到一份独立的 CloudBase 接入指南，以便我按 OpenClaw 的使用习惯完成安装、验证和后续开发。

#### 验收标准

1. When 用户查阅 OpenClaw 接入文档时，the 文档 shall 在 `doc/ide-setup/openclaw.mdx` 提供独立的安装说明、验证方式和常见说明。
2. While 用户使用 OpenClaw 接入 CloudBase, when 文档给出安装方式时，the 文档 shall 以 Skills / 命令安装为主，并在 OpenClaw 章节推荐使用 `npx skills add tencentcloudbase/cloudbase-skills -y`。
3. While 用户使用 OpenClaw 接入 CloudBase, when 文档提供更口语化的接入方式时，the 文档 shall 说明用户也可以直接对 AI 说“安装 CloudBase Skills”，由 AI 引导完成安装。
4. While 用户使用 OpenClaw 接入 CloudBase, when 文档说明安装后的验证步骤时，the 文档 shall 提供可直接复制的验证提示词或验证命令，帮助用户确认 CloudBase 能力已可被 OpenClaw 使用。
5. While 用户阅读 OpenClaw 接入文档, when 文档解释接入机制时，the 文档 shall 明确说明 OpenClaw 场景不依赖项目级 MCP 配置文件，并避免要求用户创建 `.mcp.json`、`.cursor/mcp.json`、`.qwen/settings.json` 等与 OpenClaw 无关的配置。

### 需求 3 - 在站点交互入口中补充 OpenClaw

**用户故事：** 作为访问文档站点的用户，我希望在 AI 工具选择和展示入口中直接看到 OpenClaw，这样我不需要依赖全文搜索才能找到对应指引。

#### 验收标准

1. When 用户访问文档站点首页或相关 AI 工具展示区域时，the 站点 shall 在现有工具展示组件中补充 OpenClaw 入口，并链接到 OpenClaw 指引页面。
2. When 用户在需要选择工具的交互组件中查看可选项时，the 站点 shall 提供 OpenClaw 选项，并展示与其安装模式一致的说明文案。
3. When 站点展示 OpenClaw 的安装方式时，the 站点 shall 优先展示命令安装或 Skills 安装说明，而不是通用 MCP JSON 配置示例。

### 需求 4 - 与现有 Skills 说明保持一致

**用户故事：** 作为同时使用 CloudBase Skills 和 CloudBase MCP 的用户，我希望 OpenClaw 相关文档与仓库已有 Skills 说明一致，这样我不会在不同页面看到互相冲突的接入方式。

#### 验收标准

1. When 用户阅读 Skills 相关说明页面时，the 文档 shall 在适合的位置补充或对齐 OpenClaw 的使用说明，使其与 `cloudbase-skills` 的现有口径一致。
2. When 仓库中的通用 Skills 安装说明出现时，the 文档 shall 默认推荐使用 `npx skills add tencentcloudbase/cloudbase-skills`，而不是仅展示包名或其它安装口径。
3. While OpenClaw 被作为非 MCP 优先的接入场景展示, when 文档提到 CloudBase 能力来源时，the 文档 shall 区分 “Skills 提供开发规范/能力封装” 与 “MCP 提供云资源连接能力” 的职责边界。
4. When 文档引用 OpenClaw 安装来源时，the 文档 shall 优先引用 CloudBase 官方提供的 skill/package 名称，避免引导用户安装来源不明确的第三方技能包。

### 需求 5 - 重构 IDESelector 的 Skills 引导流程

**用户故事：** 作为正在查看 IDE 接入文档的用户，我希望 `IDESelector` 优先教我如何安装并使用 CloudBase Skills，而不是让我先下载模板或执行偏底层的规则下载提示词，这样接入路径更清晰，也更符合当前推荐工作流。

#### 验收标准

1. When 用户查看 `IDESelector` 的第一步安装区域时，the 组件 shall 将原有“使用项目模板（推荐）”相关提示替换为 CloudBase Skills 安装引导，而不是继续推荐模板内置规则方案。
2. When 用户查看 `IDESelector` 的第二步对话区域时，the 组件 shall 将原有“调用 MCP 工具下载 CloudBase AI 开发规则到当前项目，然后介绍CloudBase MCP 的所有功能”替换为以 CloudBase Skills 为中心的引导文案。
3. When 用户查看 `IDESelector` 的第二步对话区域时，the 组件 shall 采用两步提示结构：
   - 第一步提供一条完整 prompt，指导用户直接对 AI 说“安装 CloudBase Skills：执行如下命令 npx skills add tencentcloudbase/cloudbase-skills -y”
   - 第二步保留业务 prompt 入口，并在随机 prompt 前统一补充“使用 CloudBase Skills”提示
4. When `IDESelector` 展示业务 prompt 示例时，the 组件 shall 保留现有随机 prompt 机制，但不再默认展示“下载规则”类验证 prompt，且每条随机 prompt 前都要带有 CloudBase Skills 使用引导。
5. When 用户通过 `IDESelector` 的 “用 Cursor 打开” 或同类入口打开 prompt 时，the 组件 shall 打开的内容与新的 CloudBase Skills 两步流程保持一致，且第一条为合并后的完整安装 prompt。
