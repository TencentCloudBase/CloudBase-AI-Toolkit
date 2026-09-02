# CloudBase 全栈应用交付团

基于腾讯云 CloudBase 构建全栈应用的端到端协作团队：架构设计、前后端实现、测试验证、部署运维一站式交付。覆盖全栈小程序（wx.cloud + 文档库）+ Web 系统（PG 主推）两大主场景。

## 类型

Team 型（多角色协作团队）

## 团队成员

| 角色 | 名字 | 职责 |
|------|------|------|
| 主理人 · 全栈应用首席架构师 | 高见远 | 场景识别、架构设计、技术选型、协调编排、质量把关 |
| 全栈应用工程师 | 程一川 | 小程序（wx.cloud + 文档库）+ Web 系统（PG 主推）+ 云函数/CloudRun + 认证 + 部署 |
| 测试排障工程师 | 严过关 | 测试验证（静态 + 运行时）+ 运维巡检（ops-inspector）+ 错误排查 + CLS 日志分析 |

## 前置依赖

- **CloudBase 连接器（MCP）**：在「设置 - 连接器」中连接 CloudBase
- **CloudBase 登录**：通过 `auth` 工具完成设备码登录
- **EnvId**：用户提供，或通过控制台获取（alias 须先解析为完整 EnvId）

## 适用场景

- 全栈小程序从 0 到 1（wx.cloud + 文档库 + 云函数 + OPENID）
- Web 系统 + PG 主推方案（React/Next + CloudBase PG + RLS + 用户名密码登录）
- 现有应用数据库迁移（NoSQL → CloudBase PG）
- CloudBase PG / NoSQL 数据库设计与接入
- 资源健康巡检与错误排查

## 数据库选型

| 场景 | 默认选型 | 主推选型 | 理由 |
|------|---------|---------|------|
| 小程序简单 CRUD | 文档型（NoSQL） | — | 与小程序 SDK 原生集成，上手快 |
| Web 系统 / 管理后台 | — | CloudBase PG | 关系型查询 + RLS 行级权限 |
| 需要向量检索 / 复杂权限 | — | CloudBase PG | pgvector + RLS 行级安全策略 |

## 使用示例

- 我要在 CloudBase 上做一个全栈应用，帮我设计架构并实现
- 用 CloudBase 搭建带登录和 PG 数据库的 Web 系统
- 开发一个全栈小程序（wx.cloud + 文档库 + 云函数）

## 工作流程（SOP）

1. **Phase 1 需求澄清**：主理人识别场景 + 数据库选型 + 设计架构 + 资源清单
2. **Phase 2 开发实现**：全栈工程师做资源准备 + 前后端代码 + 部署
3. **Phase 3 测试验证**：测试排障工程师做静态 + 运行时验证 + 巡检
4. **Phase 4 部署守护**：主理人汇编 + 全栈工程师部署 + 测试排障工程师上线守护
5. **Phase 5 运维巡检**（可选）：健康检查 + 错误排查

## 头像

头像已通过 ImageGen 生成在 `avatars/` 目录下。如需替换为自定义头像，要求：
- 格式：PNG（推荐）或 JPG
- 尺寸：512×512 px
- 大小：单张不超过 500KB

## 附带 Skill

`skills/cloudbase-ai-app-bootstrap/` — 全栈应用引导脚本与模板：
- `scripts/check-readiness.sh` — 环境就绪检查清单
- `templates/fullstack-architecture.md` — 全栈应用架构模板（小程序 + Web + PG）
- `templates/web-chat-ui-skeleton.tsx` — Web 聊天 UI 骨架
- `references/cloudbase-capability-map.md` — CloudBase 能力清单与路由路径

## 安装 / 同步

本目录是专家包**源码真源**（随 CloudBase-MCP 仓库版本控制）。WorkBuddy 侧的专家目录 `~/.workbuddy/plugins/marketplaces/my-experts/plugins/` 是同步产物，**不要直接手改**——下次同步会被覆盖。

在仓库根目录执行一键同步（复制 → 校验 → 注册）：

```bash
npm run experts:sync
```

或指定单个专家：

```bash
node scripts/sync-experts.mjs cloudbase-ai-saas-architect
```

## 打包分享

```bash
zip -r cloudbase-ai-saas-architect.zip cloudbase-ai-saas-architect/
```
