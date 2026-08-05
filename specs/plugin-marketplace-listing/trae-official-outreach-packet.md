# Trae 官方 in-app MCP / Skills 市场 — Partner Outreach Packet

Prepared: 2026-08-05  
Owner: CloudBase AI Toolkit  
Status: **outreach initiated** (community listed; official in-app still partner-only)

## 背景（一句话）

CloudBase MCP / Skills 已进入 Trae **社区目录**；Trae IDE 内置 MCP 市场与 Trae Work 技能市场仍无公开第三方提交通道，需产品侧合作上架。

## 已完成（社区通道，≠ 官方商店）

| 通道 | 状态 | 证据 |
|------|------|------|
| `trae-community/trae-mcp` README 目录 | **Merged** 2026-08-05 | https://github.com/trae-community/trae-mcp/pull/4 |
| `trae-community/trae-skills` Skills 目录 | **Merged** 2026-08-05 | https://github.com/trae-community/trae-skills/pull/20 |
| 本仓安装文档 | listed (docs) | `doc/ide-setup/trae.mdx`、MCP deeplink 文档 |
| Trae 官方 in-app MCP 市场 | **未上架** | 无公开 submit form（见 docs.trae.cn） |
| Trae Work 官方技能市场 | **未上架** | 论坛确认个人上传仅本地生效；市场项为官方策展 |

## 公开文档结论（2026-08-05 复核）

1. **MCP**：用户可「从市场添加」或「手动配置」；文档未给出第三方如何进入内置 MCP 市场。  
   - https://docs.trae.cn/ide_add-mcp-servers  
   - https://docs.trae.cn/work_remote-mcp-server
2. **Skills**：可上传本地 `zip` / `.skill`，或从技能市场安装；论坛帖说明市场侧以官方策展为主，本地上传不对其他用户同步。  
   - https://docs.trae.cn/solo_skills  
   - https://forum.trae.cn/t/topic/171994
3. **社区目录**是公开 PR 通道；**官方 in-app 市场**仍为 partner / 官方策展。

## 推荐对接入口（按优先级）

| # | 渠道 | 用途 | Agent 能否直接发送 |
|---|------|------|-------------------|
| 1 | GitHub issue → `trae-community/trae-mcp` + `trae-skills` | 请社区维护者转发官方策展 / 说明 in-app 收录路径 | ✅ 可发 |
| 2 | 合并 PR 跟帖 @YeatsLiao | 社区已审通过，请求官方市场路径指引 | ✅ 可发 |
| 3 | 论坛「社区伙伴」/「产品建议」/「TraeWork 专区」 | 正式产品侧可见的合作申请 | ❌ 需人类登录发帖 |
| 4 | 字节跳动 / Trae 产品商务或生态对接（内部） | 腾讯云开发 × Trae 官方策展 | ❌ 需人类 BD |

## 产品一页纸（给 Trae 产品 / 生态）

### 我们是谁

腾讯云开发（CloudBase）官方 AI Toolkit：`@cloudbase/cloudbase-mcp` + Agent Skills，覆盖 Web / 小程序 / 云函数 / 数据库 / 存储 / CloudRun / 认证等。

### 希望上架的两个官方入口

1. **Trae IDE / Trae Work 内置 MCP 市场**：一键添加 CloudBase MCP（stdio / `npx`）
2. **Trae Work 技能市场**：策展 CloudBase 入口 Skill（MCP-first + 场景路由）

### 推荐安装配置（MCP，stdio）

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["-y", "@cloudbase/cloudbase-mcp@latest"]
    }
  }
}
```

### 关键链接

| 项 | URL |
|----|-----|
| 产品文档 | https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ |
| Trae 配置指南 | https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/ide-setup/trae |
| MCP npm | https://www.npmjs.com/package/@cloudbase/cloudbase-mcp |
| Open Plugin 专用仓 | https://github.com/TencentCloudBase/cloudbase-plugin |
| 社区 MCP 目录行 | https://github.com/trae-community/trae-mcp |
| 社区 Skills | https://github.com/trae-community/trae-skills/tree/main/skills/cloudbase |
| License | MIT |

### 价值主张（中文，可直接粘贴）

```text
CloudBase 是腾讯云开发官方 BaaS / 全栈后端。将 CloudBase MCP 与 Skills 放入 Trae 官方市场后，Trae 用户可在 IDE / Trae Work 内用自然语言完成环境开通、数据库建模、云函数部署、静态托管、小程序联调等，而无需离开编辑器。我们已通过 Trae 社区目录审核（MCP + Skills），希望进一步进入官方 in-app 策展，降低安装摩擦。
```

### 英文短描述（marketplace card）

```text
Tencent CloudBase MCP + skills: auth, databases, cloud functions, storage, CloudRun, and WeChat Mini Program workflows — install via npx and build full-stack apps inside Trae.
```

## 论坛发帖草稿（人类登录后发送）

**建议版块：** 社区伙伴（优先）或 产品建议；Skills 相关可同步 TraeWork 专区。

**标题：**

```text
【合作申请】腾讯云开发 CloudBase MCP / Skills 申请进入 Trae 官方 in-app 市场策展
```

**正文：**

```markdown
您好，我们是腾讯云开发（CloudBase）团队。

## 背景
- 已在 Trae 社区目录上架并合并：
  - MCP：https://github.com/trae-community/trae-mcp/pull/4
  - Skills：https://github.com/trae-community/trae-skills/pull/20
- 文档侧：用户可手动配置 / deeplink 安装；希望进一步进入 **Trae 内置 MCP 市场** 与 **Trae Work 技能市场** 官方策展。

## 申请事项
1. 请告知官方 in-app MCP 市场的第三方 / 合作伙伴收录流程与对接人。
2. 请告知 Trae Work 技能市场的官方策展 / 投稿流程（本地上传是否仅个人生效？是否有 partner 通道？）。
3. 如需材料包（logo、描述、安装 JSON、Skill zip、安全说明），我们可按模板补齐。

## 安装示意（MCP）
`npx -y @cloudbase/cloudbase-mcp@latest`

## 联系
- GitHub：https://github.com/TencentCloudBase/CloudBase-AI-Toolkit
- 文档：https://docs.cloudbase.net/ai/cloudbase-ai-toolkit/
- Issues：https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/issues

感谢支持！
```

## GitHub Issue 草稿（Agent 可直接开）

已开：

- MCP：https://github.com/trae-community/trae-mcp/issues/5
- Skills：https://github.com/trae-community/trae-skills/issues/21
- PR 跟帖：https://github.com/trae-community/trae-mcp/pull/4#issuecomment-5189097225 · https://github.com/trae-community/trae-skills/pull/20#issuecomment-5189097487

核心问题：

1. 社区 README 目录与 Trae 客户端内置市场是否同源 / 如何同步？
2. 官方策展的申请材料与联系人是谁？
3. Skills 市场是否接受社区仓 Skill 自动同步，或仅官方策展？

## 验收标准（本 outreach 任务）

1. When 社区目录已 listed 且官方无公开 submit form, the outreach packet shall 明确区分 community vs official_curated，且不得把官方市场标成 listed。
2. When outreach 发起后, the submission log shall 记录渠道、时间、链接与下一步（论坛人类发帖 / BD）。
3. When Trae 回复收录路径, the follow-up task shall 按官方模板补材料并更新 `markets.yaml` `official_curated`。

## 明确不做

- 不在 `doc/ide-setup/trae.mdx` 声称「已上架官方市场」
- 不伪造官方 submit URL
- 不等同社区 PR merge = in-app marketplace listed
