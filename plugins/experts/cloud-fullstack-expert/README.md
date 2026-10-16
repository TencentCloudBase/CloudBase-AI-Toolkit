# cloud-fullstack-expert（云上全栈工程师）

CloudBase 云上全栈交付专家。定位：**把已有的代码、或用指定语言写的服务，真的部署上线** ——
不挑语言（Java / Go / Rust / C++ / Python / Node.js / PHP / .NET），部署到云托管（Docker 容器）或 HTTP 云函数。

服务对象：

- **有代码要上线的开发者**：本地已经跑通，缺一个稳定的线上地址
- **指定了语言栈的团队**：Java / Go / Rust 等，不想为了部署换技术栈
- **要跑常驻服务的**：WebSocket、后台任务、定时同步

## 与同门专家的分工

| 专家 | 做什么 | 什么时候找它 |
| --- | --- | --- |
| **本专家** | 把**服务**跑起来（任意语言 + 容器/函数 + 一个真地址） | 我有代码 / 指定语言，要上线 |
| `cloudbase-webdev-expert` | 搭**业务系统**（官网 / CRM / 进销存 / 管理后台） | 我要一个现成的业务系统 |

## 分层引用（包内不复制领域知识）

| 层 | 内容 | 来源 |
| --- | --- | --- |
| 核心 | 平台总览 / 容器 / 云函数 / 静态托管 / PG / 鉴权 | `cloudbase-platform`、`cloudrun-development`、`cloud-functions`、`cloudbase-sites-runtime`、`postgresql-development-cloudbase`、`auth-web-cloudbase` |
| 补充 | 文件存储 / 大模型 | `cloud-storage-web`、`ai-model-web` |
| 包内 | 语言·形态→部署映射、Docker 上云流程、交付标准、常见坑 | `references/cloud-fullstack-playbook.md` |

## 使用

WorkBuddy 专家中心选择本专家，直接描述要跑的东西（如"这段 Go 服务帮我部署上线，给我地址"）。

## 维护

真源在本仓库 `plugins/experts/cloud-fullstack-expert/`，修改后执行：

```bash
node scripts/sync-experts.mjs cloud-fullstack-expert
```
