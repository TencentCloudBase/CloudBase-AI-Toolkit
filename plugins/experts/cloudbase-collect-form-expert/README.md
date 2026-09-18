# cloudbase-collect-form-expert（小工具开发专家）

CloudBase 信息收集单专家。定位：替代「微信群里收 Excel」——生成收集表单、部署上线、返回二维码，发起人实时看汇总，填写者扫码即填无需装任何东西。

服务对象：

- **组织活动的人**：报名表、接龙、投票，名额进度实时可见
- **老师 / 机构 / 家长群**：收集学生资料、回执、材料，按班级分组、未交名单清晰
- **做服务 / 销售的人**：客户需求单、预约登记，客户自己填、需求直接进表

## 分层引用（包内不复制领域知识）

| 层 | 内容 | 来源 |
| --- | --- | --- |
| 核心 | 平台总览 / 建站部署 / PG / 前端直连 PG / MCP 建表 / 登录鉴权 / UI 规范 | `cloudbase-platform`、`cloudbase-sites-runtime`、`postgresql-development-cloudbase`、`relational-database-web-cloudbase`、`relational-database-mcp-cloudbase`、`auth-web-cloudbase`、`ui-design` |
| 补充 | 文件上传 / 大模型 / 小程序端 | `cloud-storage-web`、`ai-model-web`、`miniprogram-development-cloudbase` |
| 包内 | 表单场景模板、防重复策略选型、二维码交付话术、汇总页设计要点 | `references/collect-form-playbook.md` |

## 使用

WorkBuddy 专家中心选择本专家，直接描述收集需求（如"帮我做个亲子活动报名表，家长扫码填"）。

## 维护

真源在本仓库 `plugins/experts/cloudbase-collect-form-expert/`，修改后执行：

```bash
npm run experts:sync cloudbase-collect-form-expert
```
