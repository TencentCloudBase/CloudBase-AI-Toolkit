# game-backend-expert（全栈游戏开发专家）

游戏后端单专家（后端跑在腾讯云 CloudBase 的数据库与云存储上）。定位：**排行榜 / 存档 / 玩家数据 / 战绩 / 道具 / 内购记录 / 素材托管 / 业务接口**，从需求到部署跑通——**不用买服务器，不用自己写服务端**。**非微信小游戏场景以 PostgreSQL 为核心数据库**，微信小游戏侧走云开发的文档数据库。

服务对象：

- **独立游戏开发者 / 学生 / 小团队**：用 Godot、Unity、Cocos 做游戏（含微信小游戏），只想让排行榜、存档、战绩这些琐碎活有个托管的地方
- **微信小游戏开发者**：OPENID 身份天然可用，数据落云数据库，变现链路的数据侧一并覆盖
- **小团队协作**：多端（手机 / PC / 小游戏）玩家数据打通，测试与生产环境分开

**不做**：游戏客户端开发（引擎、美术、玩法）——这类问题指向 Godot / Unity / Cocos 专家。

## 分层引用（包内不复制领域知识）

| 层 | 内容 | 来源 |
| --- | --- | --- |
| 核心 | 平台总览与路由 / **PG 数据库** / 云函数 / 建模 | `cloudbase-platform`、`postgresql-development-cloudbase`、`cloud-functions`、`data-model-creation` |
| 数据库 | **非小游戏场景以 PostgreSQL 为核心**（`app.rdb()` / PG REST / RLS / pgstore）；微信小游戏侧走文档数据库 | `postgresql-development-cloudbase`、`http-api-cloudbase`、`cloudbase-document-database-in-wechat-miniprogram` |
| 其他能力 | 素材存储 / 长连接与常驻服务 / 引擎侧 HTTP / 登录凭据 / 小游戏 | `cloud-storage-web`、`cloudrun-development`、`http-api-cloudbase`、`auth-tool-cloudbase`、`miniprogram-development` |
| 包内 | 数据模型建议、排行榜三档做法、防作弊、引擎侧调用样例、存档与内购的幂等要点、联机分档 | `references/game-backend-playbook.md` |
| 逃生通道 | 包内未列的其他 CloudBase 能力（网关、AI 模型、运维排查等） | 先查 `cloudbase-platform` 路由到对应官方 skill，未安装按 https://docs.cloudbase.net/skill.md 接入；无 skill 时查 docs.cloudbase.net |

## 使用

WorkBuddy 专家中心选择本专家，直接说需求（如"帮我给 Godot 游戏做一个排行榜，能看前 100 名"）。

**使用前提**：会话需已连接「腾讯云 CloudBase」connector（建表、部署等 MCP 工具的来源）；未连接时专家只出方案，会引导先连接。引用的官方 skills 随 CloudBase 插件提供，WorkBuddy 已内置；确实加载不到时，按 CloudBase 官方接入说明装（https://docs.cloudbase.net/skill.md ，命令 `npx skills add tencentcloudbase/cloudbase-skills -y`），同一套别装两遍。

## 能力边界（对外口径）

- **现在就给**：排行榜、存档、玩家数据、战绩、道具、内购记录、素材存储、自定义 HTTP 接口、小游戏数据侧
- **给方案**：多人实时联机（开发中，当前给自建长连接 / 轮询的替代方案）、异步与回合制对战
- **不做**：引擎、美术、玩法等客户端工作

## 维护

真源在本仓库 `plugins/experts/game-backend-expert/`，修改后执行：

```bash
npm run experts:sync game-backend-expert
```
