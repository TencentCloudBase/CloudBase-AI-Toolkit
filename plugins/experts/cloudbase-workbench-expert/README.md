# cloudbase-workbench-expert（个人工作台专家）

CloudBase 个人工作台单专家。定位：**打卡 / 习惯 / 清单 / 记账 / 追剧 / 复盘 / 周报**等日常记录场景 → 数据存云端的在线小应用：换设备不丢、可多人共用、有账号体系。

服务对象：

- **想坚持一件事的人**：健身打卡、背单词、习惯追踪，做个好看好记的打卡工具
- **想和家人朋友一起用的人**：情侣记账、双人打卡监督、家庭清单，每人登录、数据按人隔离
- **想长期留存记录的人**：追剧短评、情绪记录、育儿日志、周报素材库，数据长期在云端

## 分层引用（包内不复制领域知识）

| 层 | 内容 | 来源 |
| --- | --- | --- |
| 核心 | 平台总览 / 建站部署 / PG / 前端直连 PG / MCP 建表 / 登录鉴权 / UI 规范 | `cloudbase-platform`、`cloudbase-sites-runtime`、`postgresql-development-cloudbase`、`relational-database-web-cloudbase`、`relational-database-mcp-cloudbase`、`auth-web-cloudbase`、`ui-design` |
| 补充 | 文件上传 / 大模型 | `cloud-storage-web`、`ai-model-web` |
| 包内 | 场景模板目录（数据模型、多人/登录判断、交付形态）、分享开关升级路径 | `references/workbench-templates-playbook.md` |

## 使用

WorkBuddy 专家中心选择本专家，直接描述场景（如"帮我做个健身打卡工具，要有打卡日历"）。

## 维护

真源在本仓库 `plugins/experts/cloudbase-workbench-expert/`，修改后执行：

```bash
npm run experts:sync cloudbase-workbench-expert
```
