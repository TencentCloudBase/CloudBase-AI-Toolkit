# Recipe 7 — 把环境接到用户的 Agent

## When to use

环境 ID 与 API Key 已经发到用户手上（见 [Recipe 6](./platform-onboarding.md)），现在要把这份凭证真正接进 Agent：

- 用户在同一台机器上开发多个项目，每个项目一个环境，要求互不串
- 想做到「用户不用手填任何东西」，甚至完全不看到密钥
- 换过 key 或换过环境之后，Agent 还在操作旧的那个

不管什么：环境还没建、凭证还没发，先做 [Recipe 6](./platform-onboarding.md)。要限制 Agent 能调哪些工具、要审计与审批，见 [Recipe 8](./platform-agent-guardrails.md)。

## 前置权限

- 客户端能跑 Node.js（MCP 与 CLI 都依赖它）
- 已经拿到成对的两个值：环境 ID 与环境 API Key
- 凭证的身份边界见 [calling-methods.md §3](../calling-methods.md)：环境级 API Key 只能看到它绑定的那个环境，看不到别的环境不是环境不存在

## 接口序列

三条路径选一条。选择的判据只有一条：**用户能不能看到密钥明文**。

### A. 写进 MCP 配置的 `env`（主流做法，一个项目一套）

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "CLOUDBASE_ENV_ID": "<本项目的环境 ID>",
        "CLOUDBASE_API_KEY": "<本项目的环境 API Key>"
      }
    }
  }
}
```

MCP 进程启动时读这两个变量，读到就已是登录态，用户不需要再走任何登录步骤。

**一个项目一份配置 = 一个项目一个环境。** 隔离靠的是配置的**位置**：把这段 `mcpServers` 放在**项目目录**而不是全局用户目录，换项目就换一份配置，`env` 里那对值跟着换。

变量名与别名：

| 变量 | 说明 |
| --- | --- |
| `CLOUDBASE_API_KEY` | 环境 API Key，主用名 |
| `CLOUDBASE_APIKEY` | 兼容别名，语义相同；新配置写主用名 |
| `CLOUDBASE_ENV_ID` | 环境 ID。单独设置它时不代替登录，只是指定"操作哪个环境" |

同一个环境只设 `CLOUDBASE_ENV_ID`、让用户自己登录也是一种用法（无浏览器环境下的兜底）：它决定用哪个环境，但不提供凭证。

### B. CLI 非交互登录（机器上已有 CloudBase CLI）

```bash
tcb login --cloudbase-api-key <API Key> -e <envId>
```

`--cloudbase-api-key` 必须同时给 `-e`。注意区分两组长得像的参数：

| 参数 | 含义 |
| --- | --- |
| `--cloudbase-api-key` | 云开发**环境** API Key（本 Recipe 用的这个） |
| `--apiKeyId` / `--apiKey` | 腾讯云**账号**级凭据，CI 用，不是同一回事 |

### C. 平台内嵌本地授权回调（用户完全不碰密钥）

1. 平台在客户端侧起一个只监听 `127.0.0.1` 的本地服务，端口随机
2. 打开云开发授权页（`/login?cliAuth=1`，带上 `_redirect_uri` 与 `authCallbackUrl`）
3. 用户完成一次网页授权，回调带回 `authSource=api_key`、`envId`、`apiKey`
4. 本地进程用 `@cloudbase/toolbox` 的 `loginByApiKey()` 换临时密钥，写进本机凭证文件
5. 关掉本地服务，提示用户在客户端里启用连接器并**新开一个会话**

换证地址可用环境变量 `CLOUDBASE_API_ENDPOINT` 覆盖 —— 客户要求走自己内网网关时用它。

### 凭证从哪读、什么时候读

MCP 的登录态只有两个来源，这决定了"为什么换 key 之后老会话不管用"：

| 来源 | 读取时机 | 影响范围 |
| --- | --- | --- |
| `CLOUDBASE_API_KEY` / `CLOUDBASE_ENV_ID` 环境变量 | MCP **进程启动**时 | 这个 MCP 进程，也就是这个会话 |
| 本机凭证文件（toolbox / CLI 写入） | 登录或换证时 | 该机器上之后启动的会话 |

两个来源都不会在会话中途重读 ⇒ **凭证一变就必须新开会话**，改配置后继续用老会话是没用的。

## 踩坑清单

| 坑 | 现象 | 正确做法 |
| --- | --- | --- |
| 改完配置继续用老会话 | 还是旧环境、旧 key | 关掉会话重开；环境变量只在进程启动时读一次 |
| 配置放全局而不是项目目录 | 所有项目共用一份凭证，互相串环境 | 每个项目一份 MCP 配置，放在项目目录内 |
| 以为环境级 key 能看所有环境 | 查别的环境查不到，像"环境不存在" | 这是权限边界（`credential_scope: single_env`），不是环境丢了 |
| 只设 `CLOUDBASE_ENV_ID` 就交付 | 用户没登录，工具报未登录 | 环境 ID 决定用哪个环境，不代替凭证 |
| 环境开在国际站却按国内站登录 | 登录成功但看不到环境 | 国际站环境登录要显式传 `site=intl`（`auth` 工具的 `site` 参数），否则走国内站链路 |
| `--cloudbase-api-key` 不带 `-e` | CLI 报错 | 两者必须同时给 |
| 把账号级 `--apiKey` 当成环境 key | 权限范围与预期不符 | 环境级用 `--cloudbase-api-key`，账号级用 `--apiKeyId`/`--apiKey` |
| 密钥写进会被提交的文件 | 泄漏且不可撤 | MCP 配置加进 `.gitignore`；要更高安全就走路径 C |

## 验证步骤

1. `auth(action="status")`：登录态正常，`envId` 与给用户的那个一致，`credential_scope` 说明这是环境级还是账号级身份。
2. `queryEnv(action="info", envId="<envId>")`：返回的环境就是本项目该用的那个。
3. 跑一次只读资源查询（列集合或列云函数），确认能取到该环境的资源。
4. **反向验证**：在同一台机器上换成另一个项目的配置（另一个环境），确认看不到上一个项目的资源。
5. 换 key 后按第 1 步复查：新会话里 `envId` 不变、凭证已更新，老会话仍是旧凭证 —— 用来确认"必须新开会话"这件事在你这边也成立。
