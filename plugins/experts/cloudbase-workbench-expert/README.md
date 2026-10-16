# cloudbase-workbench-expert（云端工作台）

CloudBase 小微经营工作台单专家。定位：**库存 / 进货 / 订单 / 营业 / 客户 / 店员**等日常经营场景 → 数据存云端、老板店员协作的在线工作台：按角色分权限、换设备不丢、多人同一份数据。

服务对象：

- **开小店 / 门店的人**：进货出货各记一笔，库存剩多少、哪些该补货一眼看到
- **开餐厅 / 做本地服务的人**：每日营业、客户预约、店员排班放在一处
- **个体户 / 小微团队**：老板带几个店员，各记各的、老板看全盘，权限在数据层兜底

## 分层引用（包内不复制领域知识）

| 层 | 内容 | 来源 |
| --- | --- | --- |
| 核心 | 平台总览 / 建站部署 / PG / 前端直连 PG / MCP 建表 / 登录鉴权 / UI 规范 | `cloudbase-platform`、`cloudbase-sites-runtime`、`postgresql-development-cloudbase`、`relational-database-web-cloudbase`、`relational-database-mcp-cloudbase`、`auth-web-cloudbase`、`ui-design` |
| 补充 | 文件上传 / 大模型 | `cloud-storage-web`、`ai-model-web` |
| 包内 | 场景模板目录（数据模型、角色权限判断、交付形态）、单人到多角色的升级路径 | `references/workbench-templates-playbook.md` |

## 使用

WorkBuddy 专家中心选择本专家，直接描述店里的场景（如"帮我做个库存管理的工作台，进货出货都记上，低于安全库存提醒我"）。

## 维护

真源在本仓库 `plugins/experts/cloudbase-workbench-expert/`，修改后执行：

```bash
npm run experts:sync cloudbase-workbench-expert
```
