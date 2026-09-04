# Markdown 文档访问

CloudBase 文档站（docs.cloudbase.net）的每个文档页面都支持以原始 Markdown 格式访问，方便你将官方文档内容投喂给 AI 助手（如 Claude、CodeBuddy、Cursor 等），让 AI 基于最新官方文档回答关于 CloudBase 的问题。

相比 HTML 页面，Markdown 是纯文本格式：

- 更易于 AI 解析，无需处理导航、脚本等页面噪音
- 完整保留代码块、表格、链接等结构化信息
- 可通过 URL 直接获取，方便脚本化、自动化访问

## .md 端点

在任意文档 URL 后面加上 `.md`，即可获取该页面的原始 Markdown 文件：

| 格式          | URL                                                             |
| ------------- | --------------------------------------------------------------- |
| HTML 页面     | `https://docs.cloudbase.net/quick-start/integrate-cloudbase`    |
| Markdown 文件 | `https://docs.cloudbase.net/quick-start/integrate-cloudbase.md` |

使用 `curl` 获取：

```bash
curl https://docs.cloudbase.net/quick-start/integrate-cloudbase.md
```

Markdown 文件与文档页面一一对应，包含：

- 完整的原始 Markdown 内容
- 带语言标注的代码块
- 保留为 Markdown 链接的站内相对链接
- 以 Markdown 表格呈现的表格

> 说明：`http-api` 路径下的接口文档（由 OpenAPI 自动生成）不提供 `.md` 文件。

## 查看 Markdown 按钮

每个文档页面的侧边栏底部都提供「查看 Markdown」按钮，点击即可在新标签页打开当前页面的原始 Markdown 文件。

## 复制文档

侧边栏的「复制文档」按钮可以一键将当前页面的 Markdown 内容复制到剪贴板，适合手动粘贴到 AI 对话中针对该功能提问。

## 将文档投喂给 AI 助手

### 单页上下文

针对某个具体功能，复制该页面的 Markdown 后直接粘贴到 Prompt 中：

> 这是云数据库的文档：
>
> [粘贴 Markdown 内容]
>
> 基于此，我如何创建一个集合并插入数据？

### 多页上下文

复杂任务可以组合多个相关页面：

> 我需要用 CloudBase 部署一个 Web 应用。以下是相关文档：
>
> ## 快速开始
>
> [粘贴 Markdown 内容]
>
> ## 静态托管
>
> [粘贴 Markdown 内容]
>
> 请帮我一步步完成部署。

### 项目规则

在 Cursor、CodeBuddy 等 AI 开发工具中，可以把文档的 `.md` URL 配置到项目规则（如 `CLAUDE.md`）中，让 AI 在开发过程中自动获取并参考相关文档内容。
