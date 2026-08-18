# @cloudbase/dsh-plugin

> **在 DeepSeek Harness 里，从一句话到可用的全栈应用。**
>
> 你在 DSH 里 vibecoding 时，最烦的事是什么？模型很聪明，但写完代码没地方跑——数据库要开控制台建、文件要自己传、部署要切去另一个网站。**一离开对话，心流就断了。**
>
> `@cloudbase/dsh-plugin` 把 CloudBase 的整个后端搬进 DSH：
>
> - **对话里建全栈应用**：说需求 → AI 拉模板、建 PG 表、写前端 → 右侧面板实时看数据
> - **右侧资源面板**：数据库（表树 / 数据表格 / SQL 编辑器）、存储、认证、配置、用量分析，5 个 tab 即点即得
> - **一键部署拿域名**：产物预览、部署上线、链接直接发出去
>
> 你的模型（DeepSeek / Claude / 随便换）、你的后端（自己的 CloudBase 环境）、你的数据（本地会话 + 自己数据库）。**Lovable 的体验，开放式的底座。**

English follows the Chinese sections.

CloudBase backend for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Compatible with **DSH `>=0.1.0-rc.6 <0.2.0`**. MCP tools follow `@cloudbase/cloudbase-mcp@latest`.

一句话卖点 / one-liner: **DSH 的 CloudBase 后端插件——对话建全栈应用、右侧数据库/存储/认证面板、一键部署拿域名.**

## 安装（≤ 2 步）

**Web UI（含右侧面板与工具卡片）：**

```bash
curl -fsSL https://raw.githubusercontent.com/TencentCloudBase/CloudBase-AI-Toolkit/main/dsh-plugin/scripts/install.sh | bash
```

或手动：

```bash
dsh plugin --profile web add @cloudbase/dsh-plugin
# pnpm ≥9 默认禁止依赖的 install 脚本（protobufjs 会失败）
echo "enable-scripts=true" >> ~/.dsh/profiles/web/.npmrc
(cd ~/.dsh/profiles/web && pnpm install)
# UI 插件需要重建 DSH web 前端
pnpm --dir "$(dirname "$(dirname "$(command -v dsh)")")" run build:web || true
dsh --profile web
```

**Headless（只要 MCP 桥，不要前端构建）：**

```bash
dsh plugin --profile headless add @cloudbase/dsh-plugin
dsh --profile headless "列出所有 mcp__cloudbase__ 工具"
```

Headless 用户**不必**执行 `build:web`。

本地开发（仓库路径）：

```bash
cd dsh-plugin && npm install && npm run build
dsh plugin --profile web add .
dsh --profile web --dump-config   # 应出现 # == @cloudbase/dsh-plugin 与 mcp-cloudbase
```

## 登录（device-code，无需 API Key）

插件**不传 `CLOUDBASE_API_KEY`**。无效 Key 会挡住 device-code 流程。本机已有 `tcb login` 登录态时直接复用。

无登录态时，对模型说：

> 调用 `mcp__cloudbase__auth`，`action=start_auth`，`authMode=device`，把 verification URL 给我。

浏览器授权一次后登录态持久化。CI / 无头自动化才需要有效 API Key，且必须写在用户自己的 patch `env` 里（见下方「凭据 scrubbing」）。

默认透传的环境 ID 是 `CLOUDBASE_ENV_ID`（未设置时为 `ai-share-d2guukyxybb63b206`，仅防止 `!!js` 得到 `undefined`）。请用你自己的环境 ID：

```bash
export CLOUDBASE_ENV_ID=your-env-id
```

## 功能

| 能力 | 说明 |
|---|---|
| MCP 桥 | 注册 `mcp__cloudbase__*`（与 `@cloudbase/cloudbase-mcp` 工具集一致，当前 38 个） |
| DataTableCard | `queryPgDatabase` / `queryMysqlDatabase` / `readNoSqlDatabaseContent` 结果表格：分页、排序、复制 JSON、导出 CSV |
| DeployPreviewCard | `manageHosting` upload 后 iframe 预览真实域名 + 打开按钮。**无回滚按钮**（托管无版本回滚 API） |
| 交付物行 | `conversation.chat.turnTail` 展示产物路径 + 域名 |
| 右侧 details 面板 | 数据库 / 存储 / 认证 / 配置 / 分析。登录后自动 `openDetails()` |
| 数据通道 | 面板走 Host `cloudbaseData` 服务（typert RPC），**不消耗模型 token** |
| Sites | 携带 `sites` skill：downloadTemplate(react) → Vite → 建表 → manageHosting → 域名 |

写操作（SQL / 上传 / 删行）一律注入会话，由模型按 DSH approval 执行，插件 UI 不绕过权限模型。

## 已知坑（必读）

1. **`!!js` 求值为 `undefined` 会让 dsh 启动崩溃。** `env` 里每个值必须是字符串。本插件只透传 `CLOUDBASE_ENV_ID`，并给了默认值。不要加未设置的 `TENCENTCLOUD_SECRETKEY` 等键。
2. **pnpm v9+ 默认禁止依赖 install 脚本。** `@cloudbase/cloudbase-mcp` 间接依赖 protobufjs，必须 `enable-scripts=true` 后再 `pnpm install`。一键脚本已包含此步。
3. **UI 插件要重建 web 前端。** 装完后若看不到表格卡片 / 右侧面板，从 DSH 安装目录执行 `pnpm run build:web`，再重启 `dsh --profile web`。Headless 不需要。
4. **凭据 scrubbing。** DSH stdio 桥会丢掉名字匹配 `KEY|PASSWORD|SECRET|TOKEN` 的环境变量。需要传给 MCP 的变量必须写在 mcp-client 的 `env` 字段。本插件只显式透传 `CLOUDBASE_ENV_ID`。`HOME` 会继承，因此本机 tcb 登录态可用。
5. **首次 npx 拉包可能 10–90s。** headless 首轮工具列表可能还是空的；重试即可。Web 长驻进程无此问题。本地验收：`cd dsh-plugin && npm run build && npm run e2e:live`。
6. **不要塞无效 API Key。** cloudbase-mcp 检测到 Key 会走 Key 模式，device-code 会被挡住。

## 隐私

凭据只走本机 tcb 登录态或 `~/.dsh/.credentials.yaml`（权限 600）。插件不上传密钥。面板读操作只查询你自己的 CloudBase 环境。

## 兼容性

- DSH `>=0.1.0-rc.6 <0.2.0`（以 `@deepseek-ai/dsh@0.1.0-rc.6` 验证）
- Node `>=18`
- `@cloudbase/cloudbase-mcp@latest`

## 开发

```bash
cd dsh-plugin
npm install
npm test
npm run build
npm run e2e:live   # spawns cloudbase-mcp; needs network + local tcb login for EnvList
```

产物：`dist/index.js`（Host）+ `dist/client.js`（Web ModuleLoader factory）。除 peer（cordis / react）外运行时 0 依赖。

---

# English

> **From one sentence to a working full-stack app — inside DeepSeek Harness.**
>
> You're vibecoding in DSH. The model is smart, but when the code is written there's nowhere to run it — databases need a console, files need uploading, deploys need another website. **The flow breaks the moment you leave the chat.**
>
> `@cloudbase/dsh-plugin` brings the whole CloudBase backend into DSH:
>
> - **Full-stack apps from chat**: describe → AI scaffolds templates, creates PG tables, writes the frontend → watch data live in the side panel
> - **Resource panel on the right**: Database (table tree / data browser / SQL editor), Storage, Auth, Config, Usage analytics — 5 tabs, click and it's there
> - **One-click deploy with a domain**: preview the build, go live, share the link
>
> Your model (DeepSeek / Claude / any), your backend (your own CloudBase env), your data (local sessions + your database). **The Lovable experience, on an open base.**

## Install (≤ 2 steps)

**Web UI:**

```bash
curl -fsSL https://raw.githubusercontent.com/TencentCloudBase/CloudBase-AI-Toolkit/main/dsh-plugin/scripts/install.sh | bash
```

**Headless (bridge only, no frontend rebuild):**

```bash
dsh plugin --profile headless add @cloudbase/dsh-plugin
```

Compatibility: DSH `>=0.1.0-rc.6 <0.2.0`. Node `>=18`.

## Login

The plugin **does not pass `CLOUDBASE_API_KEY`**. Reuse local `tcb login` state. If unsigned, ask the model to call `mcp__cloudbase__auth` with `action=start_auth` and `authMode=device`.

## Known pitfalls

1. `!!js` evaluating to `undefined` crashes dsh. Every `env` value must be a string. This plugin only forwards `CLOUDBASE_ENV_ID` with a fallback.
2. pnpm v9+ blocks dependency install scripts. Set `enable-scripts=true` then `pnpm install` (the one-shot script does this).
3. UI plugins need `pnpm run build:web` on the DSH install. Headless does not.
4. Credential scrubbing: variables matching `KEY|PASSWORD|SECRET|TOKEN` are stripped unless listed under mcp-client `env`. We only forward `CLOUDBASE_ENV_ID`.
5. First `npx` fetch can take 10–90s; retry the headless turn if tools are missing. Local gate: `npm run e2e:live`.
6. Never inject an invalid API Key — it blocks device-code.

## Privacy

Credentials stay in local tcb login state or `~/.dsh/.credentials.yaml` (mode 600). The plugin does not upload secrets.

## License

MIT
