# cloudbase-intl 连接器 — 提交说明

面向海外客户（新加坡等）的 CloudBase 国际站连接器。**登录走腾讯云国际站账号 OAuth，用户不需要粘贴任何密钥。**

提交包由 `npm run build:connector:intl` 生成：`dist/cloudbase-intl-connector.zip`（含 `connector-meta.json`、`mcp.json`、`icon.svg`、`skills/`；本文件与 `extra/` 不进包）。包名不带版本号，版本在 `connector-meta.json` 的 `version` 字段里；本仓每次发布 release 会自动重建该 zip 并挂到 release assets（与专家包 `dist/<专家名>.zip` 同一机制），也可手动触发 `Release Plugin Zips` workflow 补挂。取包时请以 `connector-meta.json` 里的版本为准。

## 为什么必须新建而不是改现有 `cloudbase` 连接器

现有 `cloudbase` 连接器是 **CLI + 本地 stdio MCP** 形态、跑在国内站、用 `tcb` CLI 做认证。本连接器是 **纯远端 MCP + 标准 MCP OAuth**、跑在国际站。两者站点、认证链路、依赖都不同；连接器文档也明确要求「同一服务若要提供两种接入方式，必须用两个不同的 source 分别提交」。

| 项 | `cloudbase`（现有） | `cloudbase-intl`（本包） |
| --- | --- | --- |
| source | `cloudbase` | `cloudbase-intl` |
| 站点 | 国内站 | 国际站 |
| MCP | 本地 stdio（`npx @cloudbase/cloudbase-mcp`） | 远端 `streamableHttp` → `https://tcb-api.tencentcloud.com/mcp/v1` |
| 认证 | `preAuth: "cli"` + `tcb` CLI（`tcb login`） | 标准 MCP OAuth，`auth_mode` 省略 |
| 本机依赖 | 需要 Node（npx 拉起 CLI 与 MCP） | 无（远端服务） |
| 受影响的能力 | 全部 | 远端模式下「本地文件上传 / 模板下载」不可用 |

## 重新生成

```bash
npm run build:connector:intl
```

脚本 `scripts/build-connector-cloudbase-intl.mjs` 做四件事：聚合 skill → 改写站点域名 → 注入国际站说明 → 校验并打包。**`connectors/cloudbase-intl/skills/` 是生成产物，不要手改**；改内容请改 `config/source/**`（全站共享）或 `connectors/cloudbase-intl/extra/**`（仅国际站）。

## 需要市场侧补充的字段

`id` 与 `visible_in` **不是 `connector-meta.json` 的字段**（官方文档的 meta 字段表里没有它们），由 WorkBuddy 侧写入市场配置，因此这里只给值、不上传。提交时请一并登记：

| 字段 | 取值 | 说明 |
| --- | --- | --- |
| `id` | `cloudbase-intl` | 与 `source` 一致 |
| `visible_in` | `["internal", "iOA", "cloudhosted", "selfhosted"]` | 四个入口全开，与国内 `cloudbase` 保持一致 |

构建脚本每次运行结束会把这组值打印出来，避免提交时漏登记。

## 已验证的事实

| 项 | 结论 | 证据（可复现） |
| --- | --- | --- |
| MCP 端点存活 | `GET/POST https://tcb-api.tencentcloud.com/mcp/v1` 无凭证返回 `401`，错误文案指明 `Bearer token (OAuth)` 或 `X-TencentCloud-SecretId/SecretKey` | `curl -s -X POST .../mcp/v1` |
| OAuth 资源元数据 | `/.well-known/oauth-protected-resource` → `200`，`resource` 指向该 MCP 端点，`scopes_supported=["mcp:full"]` | `curl .../.well-known/oauth-protected-resource` |
| OAuth 授权服务器元数据 | `/.well-known/oauth-authorization-server` → `200`，`token_endpoint_auth_methods_supported=["none"]`（公共客户端）、`code_challenge_methods_supported=["S256"]`、`grant_types` 含 `refresh_token`、带 `registration_endpoint` 与 `revocation_endpoint` | `curl .../.well-known/oauth-authorization-server` |
| 动态客户端注册 | `POST /mcp/oauth2/register` → `201`，**回显 `redirect_uris`**（文档要求，否则流程无法继续） | 用 `workbuddy://workbuddy/mcp/connector%3Acloudbase-intl/oauth/callback` 实测通过 |
| 授权页落点 | `/mcp/oauth2/authorize` → `302 /mcp/oauth2/consent` → 最终 `https://tcb.tencentcloud.com/login?...`，即**国际站控制台**，未跳中国站（`tcb.cloud.tencent.com`） | 跟随重定向实测 |
| 国际站域名可达 | `console.tencentcloud.com` `302`、`buy.tencentcloud.com` `302`（未登录 302 属预期）、`scf.intl.tencentcloudapi.com` `200`、`tcr.intl.tencentcloudapi.com` `200` | `dig` + `curl` |

站点域名映射的代码真源：`mcp/src/utils/site-map.ts`（`SITE_REGION_MAP.intl`：console/authHost `tcb.tencentcloud.com`、地域 `ap-singapore`、`capabilities.noSql: false`）。

## skills 打包与站点适配

- 复用 `scripts/build-allinone-skill.ts` 聚合 `config/source/**` —— 与国内连接器**同一内容源**，31 个 skill + 6 个 reference 摊平进 `skills/references/`，不复制、不分叉。
- 站点域名改写（逐条经可达性验证后才写入规则）：控制台 20 处、数据面网关 27 处、控制面/SCF/TCR API host 各 1 处。
- 移除 `http-api-cloudbase` 的「Domestic Regions」小节：该处是 domestic/国际对比排版，只改域名会让标题与 URL 自相矛盾（标题写国内、URL 是国际）。连接器钉死国际站，故整段删除而非改写。
- 新增 `skills/references/international-site.md`（国际站权威说明：端点表、登录方式、能力范围、落手前检查），并在入口 `SKILL.md` 的 `## Workflow` 之前注入「read first」指引。
- 构建脚本带硬守卫：`SKIP_REWRITE_LINE` 之外若还存在国内站 host、或「`ap-shanghai` 与站点域名同行」这类矛盾签名，构建直接失败而不是产出半转换的文档。

**有意保留的国内站引用 13 处**（不建议直接改写，见下节）：

| 处数 | 位置 | 为什么保留 |
| --- | --- | --- |
| 1 | `cloud-api-operations/references/calling-methods.md:114` | CAM 角色载体事实表，`principal` 的 base64 编码了国内站载体，只换 host 会做出失效链接 |
| 8 | `console.cloud.tencent.com`（API Explorer ×2、CAM 角色授权/详情 ×3、`/tcb/*` 控制台页 ×3） | 国际站对应入口未确认 |
| 5 | `buy.cloud.tencent.com/lowcode?...`（AI Token Credits 购买链接） | 国际站购买域名与路径未确认 |

当前由 `references/international-site.md` 明确禁止 AI 把这几类链接转发给用户，并改为引导到国际站控制台。

## 已知限制 / 后续改进方向

1. **上面 13 处国内站链接的国际站等价入口尚未确认。** 确认后加进构建脚本的改写规则（守卫会强制处理，不会静默漏掉）。
2. **国际站是否提供内置大模型 / Token Credits 资源包未验证**，因此 `ai-model-*` skill 原样保留，但由说明文档划了范围。
3. **是否按站点裁剪 domestic-only skill**（`miniprogram-development`、`auth-wechat-miniprogram`、`ai-model-wechat`、`cloudbase-wechat-integration`、NoSQL 系列）。当前选择保留全部 + 用说明文档划范围，理由是保持与国内连接器同一内容源、零分叉；若上下文体积成为问题，可在构建脚本里加排除清单。
4. **`noSql` 能力**：国际站按站点裁剪不注册 NoSQL 工具（`mcp/src/server.ts` 读 `capabilities.noSql`）。说明文档已写明改用 PostgreSQL / MySQL；若国际站后续开放 NoSQL，需同步更新该文档与 `site-map.ts`。
5. **构建期文本改写是权宜手段**：长期方向是语料按站点生成、去掉改写补丁，即让站点域名从单一真源（`mcp/src/utils/site-map.ts`）流到全部语料，而不是在构建脚本里做字面替换。
