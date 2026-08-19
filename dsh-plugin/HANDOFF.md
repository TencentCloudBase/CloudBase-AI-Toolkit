# dsh-plugin Handoff 2026-08-19（12:50 刷新）

> 接手 agent 请先读本文 + `.workbuddy/memory/2026-08-19.md`（dsh-plugin 段）。
> PR 状态：https://github.com/TencentCloudBase/CloudBase-AI-Toolkit/pull/933（feat/dsh-plugin，OPEN MERGEABLE）

## 一、项目位置 & 核心信息

- **仓库根**：`~/Projects/CloudBase-MCP/`（name=`cloudbase-ai-toolkit` v1.7.3，包管理 pnpm）
- **插件位置**：`CloudBase-MCP/dsh-plugin/`（子目录，独立 npm 包 `@cloudbase/dsh-plugin` v0.1.0）
- **分支**：`feat/dsh-plugin`（已推 origin，PR #933 等待合并）
- **PR 评论**：5 条（5336740510 / 5336797983 / 5336843451 / 5336876063 / 5337395890 / 5337483746 / 5337600965 / 5337662023）— 涵盖 5 tab 流程 / AI 对话 / 修复 3 处 / callCloudApi 优化 / 顶层胶囊 / header 单行 / 唤起修复 / URL 抽象

## 二、当前进度（已 merge 到 PR #933 的 8 个 commit）

```
3ca965ab0 refactor(dsh-plugin): 抽象 URL 工具集合（5 工具统一切/部署/函数）
911a1f7a9 feat(dsh-plugin): 切换会话右侧面板保持打开 + 部署后自动激活预览
7898b39a2 feat(dsh-plugin): header 单行化 + CloudBase 品牌 logo + GitHub 链接
d8c7589f9 feat(dsh-plugin): 详情面板顶层胶囊（预览/后端）+ 默认 1:1 布局
1148e243e fix(dsh-plugin): list envs via callCloudApi DescribeEnvs + filter NORMAL
7e34c20f3 fix(dsh-plugin): parse queryEnv EnvList + prompt model to bind env first
e99572cdc fix(dsh-plugin): list 101 envs via queryEnv + strip proxy env for child MCP
4d9928ea2 fix(dsh-plugin): parse cloudbase-mcp auth_status READY + env switch remount
```

更早的 env 移除、typert RPC、登录门修复、esbuild 打包等已合入更早 commits。

## 三、关键技术决策（避免重复踩坑）

### 1. 数据通道：typert RPC 而非 ctx.remote
- client 端 `remote.<ns>` 是**编译期固定**（dsh-api-remotes 只挂载内置服务）
- 正确路径：client `ctx.connection.rpc.call("/api", "cloudbaseData/<method>", {args})` 直调 host api-gateway
- host 侧用 `ctx.typert.register({...invocations:[src-json codec]})` 注册 local 注册表（fiber-state 无关，绕开 `ctx.get` 死锁）

### 2. 真机 bug 修复（arch 关键坑）
- **authStatus 解析**：`cloudbase-mcp` 2.28.1 返回 `auth_status: "READY"`（非 `status: "AUTH_READY"`）——`isSignedIn()` 必须认 `auth_status==="READY"` / `code==="AUTH_READY|ENV_READY"`
- **set_env 后回退登录**：`code: ENV_READY` 不被识别 → 修同上
- **环境列表空**：`queryEnv(action=list)` 返回 `{EnvList:[...]}` —— unwrapData 优先读 EnvList
- **proxy 污染**：bridge spawn cloudbase-mcp 时 strip `HTTP_PROXY=127.0.0.1:57514` 等所有 proxy env（sandbox-c 设置）
- **listEnvironments** 用 `callCloudApi(service=tcb, action=DescribeEnvs)` 而非 queryEnv——queryEnv 绑定环境后只返回 1 个

### 3. 布局参数（本机 patch，临时）
- `~/.npm/_npx/.../@deepseek-ai/dsh-client-ui-layout/lib/client.js` 三处：
  - `clampWidth(details, 300, 520)` → `(300, 1400)`
  - `center` 最小 `640` → `200`（computeColumns 三处比较）
  - `openDetails` 默认 `720` → `Math.max(360, Math.round((window.innerWidth - 280) / 2))`（1:1）
  - **删除 AppFrame useLayoutEffect 中的 `actions.closeDetails()`**（切会话不再收起 details）
- ⚠️ npx 缓存清理会丢，需要时重新 patch 或写 `tools/relax-dsh-layout.mjs` 脚本持久化（**待办**）

### 4. 模块加载器
- client bundle factory **单参** `factory: (require) => {...}`，内部自建 `module`/`exports`（对齐 dsh-client-runtime ModuleLoader）

## 四、当前架构

```
dsh-plugin/
├── src/
│   ├── server/                          # host 端 cordis 插件
│   │   ├── index.ts                     # apply 入口 + Remote 服务
│   │   ├── mcp-bridge.ts                # spawn cloudbase-mcp child + strip proxy
│   │   ├── mcp-client.ts                # 透传 mcp__cloudbase__* 给 MCP
│   │   ├── data-service.ts              # isSignedIn/parseAuth/listEnvs/set_env
│   │   ├── remote-service.ts            # @Remote 标记 14 方法（typert 注册）
│   │   ├── term-map.ts                  # 内部代号 → 用户术语映射（FLEXDB→文档型数据库等）
│   │   ├── skill-sync.ts                # skills 同步
│   │   └── skill-cli.ts                 # cloudbase-skills bin
│   ├── shared/
│   │   ├── constants.ts                 # URL_TOOLS / DEPLOY_TOOLS / DATA_TABLE_TOOLS
│   │   ├── types.ts                     # CloudBaseData 接口
│   │   └── sql-ident.ts
│   ├── client/                          # browser 端运行时插件
│   │   ├── index.ts                     # withData (cloudbaseData+openDetails) + 注册 slots
│   │   ├── styles.ts                    # PANEL_CSS 全局注入
│   │   ├── lib/
│   │   │   ├── icons.tsx                # IconCloudBase (官方 logo) / IconGear / IconBrowser / IconGithub
│   │   │   ├── slots.ts                 # registerKeyedSlot / registerNamedSlot
│   │   │   ├── typert.ts                # getDataService(ctx)
│   │   │   ├── parse-tool-result.ts     # parseDeploy (accessUrl/accessUrls[0]/defaultDomain)
│   │   │   └── recent-deploys.ts        # recordDeployUrl → isNew → activate-preview 事件
│   │   └── components/
│   │       ├── DataTableCard.tsx        # 38 个 mcp 工具的表格 toolview
│   │       ├── DeployPreviewCard.tsx    # URL 工具泛化卡片（5 工具共用）
│   │       ├── DeliverableRow.tsx       # turnTail 交付物（URL_TOOLS 匹配）
│   │       ├── ConfirmDialog.tsx
│   │       └── DetailsPanel/
│   │           ├── index.tsx            # 单行 header（logo + env + 胶囊 + github）
│   │           ├── AuthGate.tsx         # render-prop ({status, setStatus})
│   │           ├── EnvSelector.tsx      # 紧凑内联 select
│   │           ├── DatabaseTab.tsx
│   │           ├── StorageTab.tsx
│   │           ├── AuthTab.tsx
│   │           ├── ConfigTab.tsx
│   │           ├── AnalyticsTab.tsx
│   │           ├── PreviewTab.tsx       # URL input + iframe + 最近部署 chips
│   │           └── SqlEditor.tsx
├── tests/                               # vitest 20/20
├── docs/screenshots/                    # 9 张 PR 评论截图
├── cordis.patch.yml                     # dsh 启动加载的 cordis patch
├── build.mjs                            # esbuild server+client
└── dist/                                # build 输出（gitignore）
```

## 五、UI 完整形态（当前）

```
┌─ Sidebar ─┬─ Center (chat) ─┬─ Topbar (logo + env + 胶囊 + github) ─┐
│ ws/未分组 │ dsh 对话         │ [☁CB] [env▾]    [⚙后端] [🌐预览] [GH] │
│ 新会话    │ tool call 卡片   │ 5 tab (后端) / webview (预览)        │
└───────────┴─────────────────┴──────────────────────────────────────┘
```

- **单行 header**（高 35px）：官方 CloudBase logo + 紧凑 env select（占满中间）+ 后端/预览胶囊（pill 11px + icon）+ GitHub 链接
- **后端胶囊**：5 tab（数据库 / 存储 / 认证 / 配置 / 分析）
- **预览胶囊**：URL input + iframe + 刷新/外链 + 最近部署 chips（localStorage 跨会话最多 5）
- **默认 1:1**：1280 视口 `280/500/500`，大视口按 1:1 缩放

## 六、待办（优先级从高到低）

1. **layout patch 持久化**（最影响 onboarding）：写 `tools/relax-dsh-layout.mjs` 脚本（npx 缓存清理时一键恢复 patch），README 加 install 步骤
2. **PR #933 合并**：当前 OPEN MERGEABLE，等待 Booker 拍板
3. **dsh-plugin README 完善**：中英双语 + 安装 + 截图 + 链接到 PR 评论
4. **端到端演示脚本**（T9）：从创建到部署到分享的完整脚本（`scripts/e2e-live.mjs` 已有雏形）
5. **sites 闭环**（R4）：bundle 携带 sites skill → 拷贝到 `~/.dsh/skills/cloudbase/` → 完整 demo

## 七、真机验证清单（已通过）

- ✅ 38 个 mcp__cloudbase__* 工具注册（queryPgDatabase/queryMysqlDatabase/manageHosting/manageApps/manageCloudRun/manageFunctions/manageGateway...）
- ✅ authStatus 解析（已登录 + 未登录 + set_env 中 三种状态）
- ✅ 环境列表 71 个 NORMAL（mcp-pg-ky5u9q 在列）
- ✅ EnvSelector 切换环境 → 各 tab remount 重新拉数据
- ✅ DataTableCard 渲染（分页 / 排序 / 复制 / 导出 CSV）
- ✅ DeployPreviewCard 泛化（manageHosting upload / manageApps deploy / manageCloudRun deploy 全部走同一卡片）
- ✅ PreviewTab webview（example.com 完整渲染 + chip 高亮）
- ✅ 部署自动激活预览（active-preview 事件链路）
- ✅ 切换会话 details 面板保持打开（patch AppFrame closeDetails）
- ✅ 默认 1:1 布局（1280 视口 280/500/500；1920 视口 280/820/820）
- ✅ header 单行 + 官方 CloudBase logo + 胶囊 icon + GitHub

## 八、已知坑（避免重蹈覆辙）

- `agent-browser open --viewport 1920x1080` 报错（参数未生效），固定 1280 视口
- dsh web 修改 layout 必须**先 kill 旧进程再重启**（HTTP 服务在内存缓存 plugin 源）
- dsh web 的 `?rev=<hash>` 是 client.js 内容 SHA1 短哈希，文件改了 HTTP 内容变但**浏览器**会缓存旧 URL，需 `agent-browser close + open` 强制重连
- 12:28 起 dsh-plugin 目录有另一 agent 初始化 CloudBase Sites 项目（src/pages/HomePage.tsx、src/utils/cloudbase.ts、cloudbaserc.json、.cursor/、index.html 等 untracked）—— 这些**不是我们的工作**，不 commit；全量 tsc 会被它们干扰，验证用临时 tsconfig 只检查 `src/client+shared+server+tests`

## 九、相关 skill / 工具

- `agent-browser` skill：自动化 dsh web 截图 + JS 注入验证
- `dsh-agent` / `dsh-web` etc. 在 `~/.npm/_npx/.../node_modules/@deepseek-ai/`
- 测试：`npm test`（vitest 20/20）
- 类型：`npx tsc -p tsconfig.check.json --noEmit`（绕过 Sites 杂散）
- 构建：`npm run build`（esbuild server + client + skill-cli）
- 截图上传：`POST https://uploads.github.com/user-attachments/assets?name=<file>&content_type=image/png&repository_id=988892963` + `Authorization: Bearer $(gh auth token)` + `--data-binary @file` → 返回 `https://github.com/user-attachments/assets/<uuid>`
- 评论：`gh pr comment 933 --repo TencentCloudBase/CloudBase-AI-Toolkit --body-file <file>`
