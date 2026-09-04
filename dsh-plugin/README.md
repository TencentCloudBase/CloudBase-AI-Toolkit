# @cloudbase/dsh-plugin

> **在 DeepSeek Harness 里，从一句话到可用的全栈应用。**
>
> 你在 DSH 里 vibecoding 时，最烦的事是什么？模型很聪明，但写完代码没地方跑——数据库要开控制台建、文件要自己传、部署要切去另一个网站。**一离开对话，心流就断了。**
>
> `@cloudbase/dsh-plugin` 把 CloudBase 后端搬进 DSH：
>
> - **对话里建全栈应用**：说需求 → AI 拉模板、建 PG 表、写前端、部署拿域名
> - **查询结果变卡片**：数据库 / MySQL / NoSQL 查询直接渲染成表格——分页、排序、导出 CSV；部署后有 iframe 预览和打开按钮
> - **38 个 MCP 工具**：建表、查询、托管、认证、环境配置，全在对话里调用
>
> 你的模型（DeepSeek / Claude / 随便换）、你的后端（自己的 CloudBase 环境）、你的数据（本地会话 + 自己数据库）。

CloudBase backend for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Compatible with **DSH `>=0.1.0-rc.6 <0.2.0`** · Node `>=18` · MCP tools follow `@cloudbase/cloudbase-mcp@latest`.

## 安装

**Web UI（含工具卡片）：**

```bash
curl -fsSL https://raw.githubusercontent.com/TencentCloudBase/CloudBase-AI-Toolkit/main/dsh-plugin/scripts/install.sh | bash
```

或手动：

```bash
dsh plugin --profile web add @cloudbase/dsh-plugin
# pnpm ≥9 默认禁止依赖 install 脚本（protobufjs 会失败）
echo "enable-scripts=true" >> ~/.dsh/profiles/web/.npmrc
(cd ~/.dsh/profiles/web && pnpm install)
# UI 插件需要重建 DSH web 前端
pnpm --dir "$(dirname "$(dirname "$(command -v dsh)")")" run build:web || true
dsh --profile web
```

**Headless（只要 MCP 工具，不要前端构建）：**

```bash
dsh plugin --profile headless add @cloudbase/dsh-plugin
dsh --profile headless "列出所有 mcp__cloudbase__ 工具"
```

## 登录（device-code，无需 API Key）

插件不传任何 CloudBase env、不传 API Key，登录走 cloudbase-mcp 自身的 device-code 流程（本机已有 `tcb login` 登录态时直接复用）。无登录态时，对模型说：

> 调用 `mcp__cloudbase__auth`，`action=start_auth`，`authMode=device`，把 verification URL 给我。

浏览器授权一次后登录态持久化。再用 `mcp__cloudbase__auth`（`action=set_env`）选择环境，后续工具自动使用该环境。

## 功能

| 能力 | 说明 |
|---|---|
| MCP 桥 | 注册 `mcp__cloudbase__*`（与 `@cloudbase/cloudbase-mcp` 工具集一致，当前 38 个） |
| DataTableCard | `queryPgDatabase` / `queryMysqlDatabase` / `readNoSqlDatabaseContent` 结果表格：分页、排序、复制 JSON、导出 CSV |
| DeployPreviewCard | `manageHosting` upload 后 iframe 预览真实域名 + 打开按钮 |
| 交付物行 | 会话尾部展示产物路径 + 域名 |
| Sites skill | downloadTemplate(react) → Vite → 建表 → manageHosting → 域名 |

写操作（SQL / 上传 / 删行）一律注入会话，由模型按 DSH approval 执行，插件 UI 不绕过权限模型。

## 注意事项

1. **pnpm v9+ 默认禁止依赖 install 脚本**：必须 `enable-scripts=true` 后再 `pnpm install`（一键脚本已包含此步）。
2. **Web UI 插件要重建 DSH web 前端**：装完看不到卡片时，从 DSH 安装目录执行 `pnpm run build:web` 再重启；Headless 不需要。
3. **首次 npx 拉包可能 10–90s**：headless 首轮工具列表可能为空，重试即可。
4. **不要给插件配置 `CLOUDBASE_API_KEY`**：无效 Key 会挡住 device-code 登录。登录与环境选择全部走 `mcp__cloudbase__auth`。

## 隐私

凭据只存本机（tcb 登录态或 `~/.dsh/.credentials.yaml`，权限 600），插件不上传密钥，读操作只访问你自己的 CloudBase 环境。

## 开发

```bash
cd dsh-plugin
npm install
npm test          # vitest 单测
npm run build     # dist/index.js（Host）+ dist/client.js（Web ModuleLoader factory）
npm run e2e:live  # 需要网络 + 本机 tcb 登录态
```

除 peer（cordis / react）外运行时 0 依赖。

## License

MIT

---

# English

CloudBase backend for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). Brings the whole backend into DSH: full-stack apps from chat (scaffold → PG tables → frontend → deploy with a domain), query results rendered as table cards (paginate / sort / export CSV), deploy preview with iframe, and 38 MCP tools (`mcp__cloudbase__*`).

## Install

**Web UI:**

```bash
curl -fsSL https://raw.githubusercontent.com/TencentCloudBase/CloudBase-AI-Toolkit/main/dsh-plugin/scripts/install.sh | bash
```

**Headless (MCP bridge only, no frontend rebuild):**

```bash
dsh plugin --profile headless add @cloudbase/dsh-plugin
```

## Login

No env and no API key are forwarded — login goes through cloudbase-mcp's device-code flow (reuses local `tcb login` state). If unsigned, ask the model to call `mcp__cloudbase__auth` with `action=start_auth`, `authMode=device`, then pick an environment with `action=set_env`.

## Notes

1. pnpm v9+ blocks dependency install scripts — set `enable-scripts=true` first (the one-shot script handles this).
2. Web UI plugins require rebuilding the DSH frontend: `pnpm run build:web` in the DSH install dir. Headless does not.
3. First `npx` fetch can take 10–90s; retry the headless turn if tools are missing.
4. Never configure `CLOUDBASE_API_KEY` — an invalid key blocks device-code login.

## Privacy

Credentials stay local (tcb login state or `~/.dsh/.credentials.yaml`, mode 600). The plugin does not upload secrets.

## License

MIT
