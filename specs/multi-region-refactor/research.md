# 多地域/多端点切换调研报告

> 调研日期：2026-07-29
> 调研范围：CloudBase MCP 当前实现 + Supabase / Vercel 竞品方案
> 调研目的：为「国内站也将有新加坡地域、海外多地域」的演进做技术储备，回答"用户安装一个 MCP / CLI / Skill 后如何轻松切换/对接正确服务"
> 阶段：spec 前置调研（不含实现）

---

## 一、背景与问题

当前 CloudBase MCP 默认对接国内站，可通过地域参数切换到国际站（新加坡），但实现耦合度高：

- 只有传特定地域（`ap-singapore`）时才走国际站逻辑
- `region` 与「站点」概念 1:1 绑定，无法表达"国内站也有新加坡地域""国际站多地域（硅谷/法兰克福）"

即将面临的挑战：
1. 国内站也会有新加坡地域
2. 海外可能有多地域
3. 用户安装一个 MCP / CLI / Skill 后，如何轻松切换/对接正确的服务

本调研不涉及开发，仅为后续 spec/设计提供输入。

---

## 二、当前 MCP 现状与耦合点

### 2.1 配置加载流程

`cli.ts:110` → `createCloudBaseMcpServer` → `server.cloudBaseOptions` 存储（`server.ts:290`）→ 插件注册（`server.ts:326`）。工具调用时 `getCloudBaseManager()`（`cloudbase-manager.ts:417`）按优先级链 `cloudBaseOptions.region ?? TCB_REGION ?? 'ap-shanghai'` 解析 region 并构造 manager。

### 2.2 地域参数入口

- **环境变量 `TCB_REGION`** 是主入口，全仓 12 处读取。典型：`mcp/src/cloudbase-manager.ts:462`、`mcp/src/server.ts:63`
- **程序化传入** `cloudBaseOptions.region`，由 `createCloudBaseMcpServer({ cloudBaseOptions })` 接收（`mcp/src/server.ts:213,290`）
- **CLI 参数**：`mcp/src/cli.ts:18-54` 仅解析 `--cloud-mode/--integration-ide/--api-key/--env-id`，**没有 region CLI 参数**
- **MCP 工具参数**：单个工具 schema 不含 region，**启动时绑定**，非每次调用传入

### 2.3 端点/Host 切换逻辑

MCP 层**没有自己的 host 映射表**，完全委托给 `@cloudbase/manager-node` SDK：`new CloudBase({ region })`（`mcp/src/cloudbase-manager.ts:521-529,553`），由 SDK 内部按 region 选 host。唯一显式 host 改写是**登录页 URL**：`mcp/src/auth.ts:440` `url.replace("cloud.tencent.com", "tencentcloud.com")`。

### 2.4 工具如何感知地域

**启动时绑定**：region 存 `server.cloudBaseOptions` 或 `TCB_REGION`。每次工具调用经 `getCloudBaseManager()` 拿到带 region 的 manager 实例。`callCloudApi`（`mcp/src/tools/capi.ts:263,295`）通过 `cloudbase.commonService(service).call({...})` 发请求，region 已固化在 manager 中。`envQuery`/数据库工具同理，均不单独传 region。

### 2.5 六个核心耦合点（解耦必改）

| 位置 | 问题 |
|---|---|
| `mcp/src/utils/tencent-cloud.ts:8` | `isInternationalRegion = region === 'ap-singapore'` —— **耦合根源**，region 直接等价站点 |
| `mcp/src/utils/tencent-cloud.ts:1-4` | REGION 仅硬编码 SHANGHAI/SINGAPORE 两个值 |
| `mcp/src/server.ts:64,76` | `registerDatabase`/`registerNoSQLDatabase` 用 `isInternationalRegion` 决定是否注册 NoSQL 工具 |
| `mcp/src/auth.ts:432,439` | 登录 URL 构造按国际站替换域名 |
| `mcp/src/templates/env-setup/components.ts:15` | 前端 `accountInfo.region !== 'ap-singapore'` 判断是否显示切换账号按钮 |
| `mcp/src/cloudbase-manager.ts` | region 解析 fallback 分散重复 5 处（行 47/81/330/462/552），无统一入口 |

### 2.6 扩展性瓶颈

1. **缺"站点(site)"抽象层**：`tencent-cloud.ts` 把 region 与站点 1:1 绑定，无法表达"国内站也有新加坡地域"或"国际站多地域（硅谷/法兰克福）"
2. **`isInternationalRegion` 是布尔二元判断**（`tencent-cloud.ts:8`），新增海外地域需改判断逻辑，无法数据驱动
3. **能力探测缺失**：NoSQL 工具注册用 region 硬判断（`server.ts:64`），而非按环境实际后端能力（`RuntimeBackends`）动态注册——与 `envQuery` 已有的 `RuntimeBackends` 字段语义重复且冲突
4. **登录域名替换硬编码**（`auth.ts:440`）：只替换一次 `cloud.tencent.com→tencentcloud.com`，多站点无法复用
5. **region 解析逻辑分散重复**：`cloudbase-manager.ts` 内 5 处 `?? TCB_REGION ?? 'ap-shanghai'` fallback，无统一入口，易漂移
6. **前端 UI 硬编码** `ap-singapore`（`components.ts:15`），新增海外站点需同步改前端

---

## 三、Supabase 方案调研

### 3.1 MCP server 两种模式

- **Hosted/Remote**：固定单一 endpoint `https://mcp.supabase.com/mcp`，OAuth 动态注册认证（不再需要 PAT）
- **Local**：`http://localhost:54321/mcp`，由 `supabase start` 启动的本地 Docker 容器提供

### 3.2 切换项目 / region

**通过 URL query 参数 `?project_ref=<id>` 限定到单个项目**：

```json
{
  "mcpServers": {
    "supabase": {
      "url": "https://mcp.supabase.com/mcp?project_ref=abc123&read_only=true"
    }
  }
}
```

- `project_ref=<id>`：限定到特定项目（会禁用账户管理工具）
- `read_only=true`：以只读 Postgres 用户执行所有查询
- `features=<groups>`：仅启用特定工具组（逗号分隔，如 `database,docs`）
- 参数可组合

**Region 不暴露给 MCP 层**，由后端按 project_ref 自动路由。

### 3.3 认证

- **默认 OAuth 动态注册**（浏览器登录），无需手动创建 PAT 或 OAuth app
- **CI 环境**：通过 `Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}` header 传递 PAT
  ```json
  {
    "mcpServers": {
      "supabase": {
        "url": "https://mcp.supabase.com/mcp?project_ref=${SUPABASE_PROJECT_REF}",
        "headers": { "Authorization": "Bearer ${SUPABASE_ACCESS_TOKEN}" }
      }
    }
  }
  ```

### 3.4 CLI 层配置

- `supabase link --project-ref <string>`：建立"目录→远程项目"映射
- `supabase/config.toml`：项目级配置文件（local 模式核心）
- `supabase login`：token 存 `~/.supabase/access-token` 或系统钥匙串；`SUPABASE_ACCESS_TOKEN` 环境变量覆盖
- `--profile <string>`：全局 flag，切换不同 API 连接配置
- `--workdir <string>` / `SUPABASE_WORKDIR`：指定项目目录

### 3.5 配置层级分工

| 层级 | 配置内容 | 存储位置 |
|---|---|---|
| 全局 | 认证 token、profile、Docker 网络 | `~/.supabase/` 或钥匙串 |
| 项目级 | config.toml、迁移、函数、测试、种子数据 | `supabase/` 目录 |
| 运行时 | 环境变量覆盖 | `SUPABASE_*` 环境变量 |
| 远程 | 通过 `supabase config push` 推送本地配置到远程 | Supabase 平台 |

**核心理念**：**统一 endpoint + project_ref 路由 + OAuth 授权 scope**。region 是 project 的属性，不是 server 的属性。

---

## 四、Vercel 方案调研

### 4.1 MCP server

- **固定单一 endpoint** `https://mcp.vercel.com`（remote，Streamable HTTP 传输）
- **OAuth 认证**（浏览器授权），连接后获得"与你的 Vercel 账户同等权限"
- 通用一键安装：`npx add-mcp https://mcp.vercel.com`（自动检测已安装的 AI 客户端并批量配置）
- 仅允许 Vercel 审核批准的客户端连接，含混淆代理防护

### 4.2 CLI 层切换 team/scope

| 方式 | 命令 | 说明 |
|---|---|---|
| 交互式切换 | `vercel switch` | 从所属团队列表中选择 |
| 直接指定 | `vercel switch [team-name]` | 指定目标团队 |
| 临时指定 | `vercel --scope my-team-slug`（`-S`） | 不切换当前 scope，临时以另一个 scope 执行 |
| 临时指定 | `vercel --team my-team-slug`（`-T`） | 支持 team slug 或 team ID |

### 4.3 项目绑定（Project Linking）

- `vercel link` → 生成 `.vercel/project.json`（含 `projectId` + `orgId`），适合单项目目录
- `vercel link --repo` → 生成 `.vercel/repo.json`，通过 Git remote 连接，适合 monorepo/多项目仓库

**项目指定的三种方式及优先级**：
1. `--project` flag（最高）
2. `VERCEL_PROJECT_ID` 环境变量
3. `.vercel/project.json` from project linking（最低）

### 4.4 Agent scope 解析（关键，来自 vercel-labs/agent-skills）

**三级回退机制**，让 AI Agent 零交互定位到正确的 team/project：

1. **环境变量解析（最高优先级）**：`VERCEL_PROJECT_ID` + `VERCEL_ORG_ID` 同时存在 → CLI 原生绕过本地 `.vercel/` 元数据，直接定位
2. **项目 URL 提取**：提供 dashboard URL（如 `https://vercel.com/my-team/my-project`）→ 解析提取 team slug + project name
3. **本地配置文件**：读取 `.vercel/project.json` 或 `.vercel/repo.json`

多 team 场景下 `--scope <team-slug>` 是**强制性的**以消除歧义。

**标识符体系**：
- Team Slug（人类可读）→ 用于 `--scope` CLI 参数
- Org ID（内部 API 识别）→ 用于 `VERCEL_ORG_ID` 环境变量
- Project ID → 用于 `VERCEL_PROJECT_ID` 环境变量

### 4.5 安全防护（Detection Guardrails）

| 禁止命令 | 原因 |
|---|---|
| `vercel link` | 在未链接目录中运行会触发交互式 prompt 或静默链接 |
| `vercel project inspect` | 同上 |

| 允许命令 | 用途 |
|---|---|
| `vercel whoami` | 安全验证认证状态 |
| `vercel ls` | 安全列出部署，不修改本地状态 |

### 4.6 配置层级与优先级

| 层级 | 参数 | 默认路径 | 用途 |
|---|---|---|---|
| 全局配置 | `--global-config`（`-Q`） | `~/.vercel` | 全局配置目录（认证、scope） |
| 项目级 JSON | `--local-config`（`-A`） | 当前目录 `vercel.json` | 项目级配置文件 |
| 项目级链接 | — | `.vercel/` | 项目链接信息（`project.json`） |

**整体优先级**：CLI flag > 环境变量 > 项目级配置 > 全局配置

**核心理念**：**统一 endpoint + 多层 scope 解析（env > URL 解析 > 本地文件 > 交互）+ OAuth 账户授权**。

---

## 五、从 A 迁到 B 的迁移逻辑（补充调研）

> 本节补充调研 Vercel / Supabase 的"从 A 迁到 B"能力。两家都区分了两种语义：① 切换归属（不动基础设施）② 迁移基础设施（换 region）。

### 5.1 Vercel：只有「切换归属」，无独立 region 迁移

**Project Transfer**（team 之间转移）：

- **范围**：Vercel Team 之间（Hobby→Pro 等），不支持 Account/Region 级别独立迁移
- **停机**：**零停机**，原项目迁移期间保持活跃
- **URL/域名**：不变。根域名"移动"到目标 team；子域名/通配符域名"委托"给目标 team，根域名留原 scope
- **迁移内容**：部署、环境变量、域名、Git 链接、Cron Jobs、Analytics、Function Region 配置
- **不迁移**：集成（需重装）、日志/监控数据、Log Drains、Vercel Blob、Secure Compute
- **操作**：**仅 Dashboard UI**（Settings → General → Transfer Project），**无 CLI 命令**
- **前置条件**：源 team Owner + 目标 team Member + 有效支付方式
- **耗时**：10 秒 ~ 10 分钟
- **跨 region**：❌ 没有独立操作；Function Region 只是作为配置项随项目一起带走

### 5.2 Supabase：明确区分「Transfer」和「Migration」

#### A. Project Transfer（组织间转移，不动基础设施）

- **范围**：Organization 之间，**不能跨 region**
- **region/project ref/API URL**：**不变**（仅归属变更）
- **停机**：同级计划无缝；付费→Free 时 1-2 分钟停机
- **操作**：**仅 Dashboard**（无 CLI）
- **前置条件（5 项）**：源 org Owner + 目标 org Member + 无活跃 GitHub 集成 + 无 project-scoped roles + 无 Log Drains
- **计费**：转移前费用归源 org，转移后归目标 org

#### B. Project Migration（换 region / 升级主版本）

- **本质**：**新建一个目标 region 的新项目 + dump/restore**
- **project ref / API URL / keys**：**全部变化**（是新项目），客户端需更新
- **CLI 流程**：

  ```bash
  # 备份旧项目
  supabase db dump --db-url $OLD -f roles.sql --role-only
  supabase db dump --db-url $OLD -f schema.sql
  supabase db dump --db-url $OLD -f data.sql --use-copy --data-only
  # 新建项目后，psql 恢复
  psql --single-transaction --file roles.sql --file schema.sql --file data.sql --dbname $NEW
  ```

- **能迁移**：DB roles/schema/data、迁移历史、Edge Functions（`functions download`→`deploy`）、Storage Objects（JS 脚本下载再上传）
- **不能直接迁移**：**根加密密钥**（必须用 API 在旧项目暂停前转移，否则 Vault/加密列永久无法解密）、项目配置、project ref
- **停机**：**非零停机**，离线 dump/restore，无 CDC/增量同步
- **付费计划捷径**：Paid Plan + 物理备份可用 "Restore to another project" 自动复制加密密钥
- **旧项目**：恢复完成前必须保持活跃（取密钥），验证新项目后再暂停/删除

### 5.3 核心对比

| 维度 | Vercel Transfer | Supabase Transfer | Supabase Migration |
|---|---|---|---|
| 迁移什么 | Team 间归属 | Org 间归属 | 换 region/升级版本 |
| 动基础设施 | 否 | 否（明确定义） | **是**（新建项目） |
| region 变化 | 否（随配置带走） | 否 | **是** |
| project ref/URL | 不变 | 不变 | **变**（新项目） |
| 停机 | 零停机 | 同级无缝/降级 1-2min | 非零停机（离线 dump/restore） |
| 操作方式 | Dashboard only | Dashboard only | **CLI 为主** + Dashboard 新建项目 |
| 域名处理 | 移动/委托，URL 不变 | 不涉及 | 不涉及（需客户端改 URL） |

### 5.4 对 CloudBase MCP 的启示

1. **应区分两种语义**：CloudBase 用户"从 A 到 B"也可能有两种诉求——切换账号/site 归属（不动资源）vs 把资源迁到另一个 region。当前耦合点（`region === site`）把这两件事混在一起了
2. **归属切换应做到零停机、URL/envId 不变**（学 Vercel/Supabase Transfer）：用户从一个 site/账号切到另一个 site/账号操作同一资源，理想是配置层切换，不动资源本身
3. **跨 region 迁移是重操作**（学 Supabase Migration）：需新建环境 + 数据 dump/restore + 密钥/配置单独处理，且要明确告知用户 envId/URL 会变
4. **迁移操作 Dashboard 优先，CLI 做数据搬运**：两家归属转移都只在 Dashboard 操作；CLI 主要用于 Migration 的 backup/restore。CloudBase MCP 若要做迁移工具，应聚焦数据搬运（类似 `supabase db dump`），归属切换交给控制台/MCP 管理工具

---

## 六、共同模式总结

Supabase 与 Vercel 虽细节不同，但遵循高度一致的模式：

1. **MCP server 都是固定单一 endpoint**，绝不通过不同 URL/端口区分 region
2. **region 不是 MCP 层概念**，是 project/env 的属性，由后端按标识符路由
3. **OAuth 优先**（非 token 硬编码），CI 才用 PAT/token env
4. **"限定操作范围"用 project_ref / project_id**，而非 region
5. **本地配置文件**（`.vercel/project.json`、`supabase/config.toml`）建立"目录→远程资源"映射
6. **环境变量覆盖机制**专门服务 CI/agent 非交互场景
7. **三级配置优先级**：flag > env > 本地文件 > 全局

---

## 七、对 CloudBase MCP 的启示

CloudBase 比 Supabase/Vercel 多一层复杂度：**国内站与国际站是两套独立的账号体系/endpoint**，不是同一 OAuth 账户下的不同项目。因此不能照搬，但可借鉴。

### 6.1 引入「站点(site)」与「地域(region)」解耦

- `site`（domestic/intl/...）决定 **auth endpoint + API host + 账号体系**
- `region` 是站点内的地域属性，决定 **资源所在地域**
- 建立数据驱动的映射表 `site → {regions[], authHost, apiEndpoint, capabilities}`，替换 `isInternationalRegion` 布尔判断
- `tencent-cloud.ts:8` 改为 `getSite(region)` 查表

### 6.2 MCP endpoint 策略（待 spec 阶段决策）

- **方案 A（Supabase 式）**：统一单一 endpoint，靠 `env_id`/`site` 参数由后端路由 → 用户体验最简，但需后端支持统一入口
- **方案 B（Vercel CLI 式）**：MCP 启动时通过"三级回退"解析当前 site/env：env 变量 > 项目级配置文件 > 交互式选择 → 适合国内/国际站账号体系分离的现状，改动较小
- CloudBase 现状（国内/国际站分离）更接近 **方案 B**

### 6.3 配置层级建议（借鉴 Vercel）

- CLI flag > 环境变量（`TCB_SITE`/`TCB_REGION`/`TCB_ENV_ID`）> 项目级配置文件（类似 `.cloudbase/project.json` 记录 site+envId）> 全局 `~/.cloudbase/`
- **项目级配置文件是当前缺失的关键一环**，能让"安装后自动对接正确服务"

### 6.4 工具注册按能力探测而非 region 硬判

- `server.ts:64,76` 的 `isInternationalRegion` 判断改为按 `envQuery` 已有的 `RuntimeBackends` 动态注册
- 避免新增地域时改代码，数据驱动

### 6.5 登录域名处理数据化

- `auth.ts:440` 的硬编码替换改为查 `site → authHost` 映射表

### 6.6 region 解析统一入口

- `cloudbase-manager.ts` 内 5 处分散的 `?? TCB_REGION ?? 'ap-shanghai'` 收敛为单一 `resolveRegion()` 函数

---

## 八、待决策问题（进入 spec 前需拍板）

1. **MCP endpoint 策略**：走统一入口路由（方案 A）还是启动时绑定 site（方案 B）？
2. **是否引入项目级配置文件**（如 `.cloudbase/project.json`）建立"目录→site+envId"映射？
3. **国内站/国际站是否共享同一套凭证体系**？还是永久保持两套 OAuth？（这决定 site 抽象的复杂度）
4. **多 site 凭证并存**：用户同时有国内站和国际站账号时，如何切换/存储多套 token？

---

## 九、参考链接

### Supabase
- CLI Reference: https://supabase.com/docs/reference/cli/start
- CLI config: https://supabase.com/docs/guides/local-development/cli/config
- MCP Server: https://supabase.com/docs/guides/ai-tools/mcp
- Project Transfer: https://supabase.com/docs/guides/platform/project-transfer
- Migrating within Supabase: https://supabase.com/docs/guides/platform/migrating-within-supabase
- Backup and Restore (CLI): https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore

### Vercel
- CLI Global Options: https://vercel.com/docs/cli/global-options
- CLI switch: https://vercel.com/docs/cli/switch.md
- MCP Server: https://vercel.com/docs/agent-resources/vercel-mcp
- Agent Skills - Project and Team Scope Resolution: https://deepwiki.com/vercel-labs/agent-skills/11.2-project-and-team-scope-resolution
- Transferring a project: https://vercel.com/docs/projects/transferring-projects

### 当前代码耦合点
- `mcp/src/utils/tencent-cloud.ts:1-8`
- `mcp/src/server.ts:64,76,213,290,326`
- `mcp/src/auth.ts:432,439,440`
- `mcp/src/cloudbase-manager.ts:47,81,330,417,462,521-529,552,553`
- `mcp/src/cli.ts:18-54,110`
- `mcp/src/tools/capi.ts:263,295`
- `mcp/src/templates/env-setup/components.ts:15`
