---
name: cloudbase-miniprogram
description: "Use when building a WeChat Mini Program (微信小程序 / 小程序) with a real backend on 腾讯云开发 CloudBase — from an idea to a published release. Triggers on: 小程序, 微信小程序, wx.cloud, 云开发, 云函数, 数据库, 集合, 云存储, 上传图片, 登录, openid, 订阅消息, 支付, 体验版, 预览, 上传代码, 提交审核, 发布, 合法域名, 真机调试, 分包. Covers project scaffolding, project.config.json / appid / miniprogramRoot, the wx.cloud data path, cloud functions, storage, auth, subscription messages, and the preview → upload → review → release chain. Do NOT use for Web/H5 frontends (use a web skill), pure backend services, or mini programs that do not use CloudBase."
description_zh: 微信小程序全栈开发：从项目初始化、云开发后端（数据库/云函数/存储/登录）、订阅消息到预览、上传、提交审核发布
version: 1.0.0
license: MIT
---

# CloudBase 全栈小程序开发

一个小程序要真正跑起来，缺的从来不是页面，是后端那一半：数据存哪、登录怎么做、图片传到哪、消息怎么发、审核怎么过。这个技能按「从想法到上架」的顺序组织，每一步告诉你调哪个工具、去哪取细节。

配方正文不打包，用 CloudBase MCP 的知识库按需检索（见文末）。这样内容永远跟线上最新版一致。

## 第 0 步：先问清三件事，别急着写代码

| 要确认 | 为什么 |
| --- | --- |
| 小程序 **appid** 与主体类型 | 个人 / 个体工商户 / 企业主体决定能用哪些能力（支付、部分类目）。**测试号不支持云开发** |
| 后端是否用 **云开发（CloudBase）** | 不用云开发就走另一条路，本技能不适用 |
| 云开发环境是**国内站还是国际站** | 两套账号体系互不相通，选错的表现是「登录了但环境列表空」 |

还有一个高频坑：DevTools 里「云开发」入口是灰的，或者看不到环境——**先诊断，不要当成工具 bug**。常见原因就是上表第三条（主体不支持 / 绑定账号不一致 / 站点错）。诊断路径：`searchKnowledgeBase({ mode: "skill", skillName: "miniprogram-development" })` 的 Common Pitfalls 一节。

## 第 1 步：接上 CloudBase MCP

技能包不能携带 MCP 配置，这一步必须显式做。三条路径按客户端能力选：

```bash
# A. 能跑命令的客户端
claude mcp add --transport http cloudbase https://tcb-api.cloud.tencent.com/mcp/v1

# B. 本地 stdio（需要 API Key，或要用远程缺的工具）
claude mcp add cloudbase -- npx -y @cloudbase/cloudbase-mcp@latest

# C. 客户端不支持 MCP 但有终端（走 mcporter 桥）
npx -y mcporter@0.16.1 call --stdio "npx -y @cloudbase/cloudbase-mcp@latest" auth action=status
```

图形客户端（Cursor、Qoder）只能让用户手动加：类型 HTTP / Streamable HTTP，地址填 `/mcp/v1`。

验证：调 `auth action=status`，返回 `auth_status: READY` 且带 `current_env_id` 就通了。

## 第 2 步：先跑通一个最小闭环，再谈功能

顺序固定，不要跳：

1. **建环境并绑定**：`manageEnv`（查/建）→ `auth(action="set_env", envId=...)` 绑定。
2. **建一个集合**：`writeNoSqlDatabaseStructure`。
3. **写一条数据**：`writeNoSqlDatabaseContent`。
4. **写一个云函数并部署**：`manageFunctions`，创建后在 DevTools 里「上传并部署：云端安装依赖」；用 MCP 的 `queryFunctions` / `queryLogs` 验证调用与日志。
5. **小程序端读这条数据**：`wx.cloud.init({ env })` → `wx.cloud.database().collection(...).get()`。

这五步通了，说明环境、权限、网络都对了；后面加页面只是重复。

## 第 3 步：按任务路由

| 要做的事 | 首选工具 / 技能 |
| --- | --- |
| 项目脚手架、`project.config.json`、`miniprogramRoot`、tabBar | `searchKnowledgeBase` → `miniprogram-development` |
| 数据库集合、索引、权限规则 | `writeNoSqlDatabaseStructure` / `manageDataModel` |
| 增删改查（小程序端 / 云函数端） | `writeNoSqlDatabaseContent` / `readNoSqlDatabaseContent` + skill `cloudbase-document-database-in-wechat-miniprogram` |
| 云函数（含 `scf_bootstrap`、定时触发） | `manageFunctions` + skill `cloud-functions` |
| 图片/文件上传 | `manageStorage` + skill `cloud-storage-web` |
| 登录、openid、用户体系 | skill `auth-wechat-miniprogram`（先在控制台配登录方式） |
| 订阅消息 / 客服消息 | skill `miniprogram-development` 的消息推送一节 |
| 预览、上传代码、提交审核 | `miniprogram-ci`，或 DevTools Nightly 的 `wechatide` CLI |
| 页面长得不好看 | skill `ui-design` |
| 上线后出问题 | `queryLogs` / skill `ops-inspector` |

## 第 4 步：发布链

体验版 → 上传代码 → 提交审核 → 发布。三步都有各自的坑：

- **预览/上传**优先用 `miniprogram-ci`（走密钥，可自动化）；想用 `wechatide` CLI 需要 **Nightly 版 DevTools**，没装就如实说「这是缺工具，不是环境限制」，等用户决定。
- **合法域名**：小程序端只能请求已备案并配置的域名；走 `wx.cloud` 不受这个限制——这也是云开发省事的地方。
- **审核驳回**最常见三类：类目与实际功能不符、有诱导分享、收集了不该收集的用户信息。这些只能提前避，工具帮不上。

## 细节从哪来

不要凭记忆写配置项和小程序 API 参数，**先查再写**：

| 想要什么 | 怎么取 |
| --- | --- |
| 某个技能的完整配方 | `searchKnowledgeBase({ mode: "skill", skillName: "<技能名>" })` |
| 官方文档段落 | `searchKnowledgeBase({ mode: "docs", action: "searchDocs", input: "订阅消息" })`，再 `action: "readDoc"` + `docPath` 取全文 |
| 某个云 API 的参数 | `searchKnowledgeBase({ mode: "openapi", apiName: "<api>" })` |

可查的相关技能：`miniprogram-development`、`cloudbase-document-database-in-wechat-miniprogram`、`auth-wechat-miniprogram`、`cloud-functions`、`cloud-storage-web`、`ui-design`、`ops-inspector`、`cloudbase-wechat-integration`、`spec-workflow`。

## 四条红线

1. **先确认主体与站点**，再动环境。测试号 / 个人主体不支持的能力，硬做只会白费。
2. **不要把密钥、AppSecret 写进小程序端代码**——小程序包是可以被反编译的。
3. **改数据库权限规则、删集合、删云函数前说清后果**。
4. **审核相关的事（类目、诱导分享、用户信息）先讲规则再动手**，别等驳回才改。

## 常见失败对照

| 现象 | 多半是 |
| --- | --- |
| DevTools 里云开发入口是灰的 | 测试号 / 主体不支持，或绑定账号不一致 |
| 登录成功但环境列表空 | 站点选错（国内 / 国际） |
| `wx.cloud` 调用报环境不存在 | 没 `wx.cloud.init`，或 envId 写错 |
| 云函数本地跑通、线上 500 | 依赖没装（「云端安装依赖」），或 `scf_bootstrap` 缺 |
| 图片上传成功但打不开 | 存储权限规则没放行读 |
