---
name: cloudbase-ai-app-bootstrap
description: "Bootstrap scripts, code skeletons, and capability map for building full-stack applications on Tencent CloudBase. Used by the CloudBase 全栈应用交付团 expert team. Covers environment readiness checks, full-stack architecture templates (mini program + Web + PostgreSQL), and CloudBase capability routing."
version: 1.1.0
connectorIds:
  - cloudbase
---

# CloudBase 全栈应用引导工具包

本 Skill 是 `cloudbase-ai-saas-architect` 专家团队的内部工具集，提供：

1. **环境就绪检查** — CloudBase 连接器、登录态、EnvId 一键检查
2. **架构模板** — 全栈小程序架构（wx.cloud + 文档库）、Web 系统架构（PG 主推）、代码骨架
3. **能力地图** — CloudBase 能力清单与最佳实践路径，指向连接器 references

## 何时使用

- 用户启动新项目时，先跑 `scripts/check-readiness.sh` 确认环境就绪
- 设计架构时，参考 `templates/fullstack-architecture.md`
- 不确定该用哪个 CloudBase 能力时，查 `references/cloudbase-capability-map.md`

## 文件结构

```
skills/cloudbase-ai-app-bootstrap/
├── SKILL.md                              # 本文件
├── scripts/
│   └── check-readiness.sh                # 环境就绪检查
├── templates/
│   ├── fullstack-architecture.md         # 全栈应用架构模板（小程序 + Web + PG）
│   └── web-chat-ui-skeleton.tsx         # Web 聊天 UI 骨架
└── references/
    └── cloudbase-capability-map.md       # CloudBase 能力清单与路由路径
```

## 依赖

- **CloudBase 连接器（MCP）**：必须先在「设置 - 连接器」中连接 CloudBase
- **CloudBase 登录**：通过 `auth` 工具完成设备码登录
- **EnvId**：用户提供，或通过控制台获取

## 使用原则

- **资源先于代码**：auth provider / 数据库表 / 存储域 / 安全规则先通过 MCP 准备好
- **数据库选型**：小程序默认文档型（NoSQL），Web 系统主推 CloudBase PG（PostgreSQL + RLS）
- **模板是起点不是终点**：骨架代码需要根据具体业务调整，不要无脑复制
- **能力地图优先**：不确定用哪个能力时，先查 `references/cloudbase-capability-map.md`，避免走错路径
