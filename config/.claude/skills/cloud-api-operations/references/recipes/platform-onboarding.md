# 平台版接入：从建环境到 Agent 连通

## When to use

- 平台型客户要给下游用户或员工开 CloudBase 环境，而这些用户没有腾讯云账号
- 环境已经建好、API Key 也发了，卡在「怎么把凭证交给用户侧的 Agent」
- 一个用户会有多套环境与多把 key，需要按项目或工作区隔离

不管什么：单个开发者自己注册开通，走 getting-started 那条路，不用本文。

## 前置权限

- 账号已开通平台版套餐（未开通时建环境会失败）
- 调用方凭证具备创建环境与 API Key 的权限（`CreateEnv`、`CreateApiKey`）
- 客户端侧能跑 Node.js（MCP 与 CLI 都依赖它）

## 接口序列

### 一、平台侧：把环境与凭证发给用户

1. 建环境：调 `CreateEnv` 创建用户专属环境，记下 `envId`，见 [CreateEnv](https://cloud.tencent.com/document/product/876/128592)。
2. 发凭证：调 `CreateApiKey` 为该环境创建 API Key，见 [CreateApiKey](https://cloud.tencent.com/document/product/876/129835)。**单环境最多 5 个。**
3. 落表：服务端保存「用户 ↔ envId ↔ API Key」映射，后面的轮换与回收都靠它。

### 二、客户端侧：把凭证交给 Agent

三条路径选一条，终点都是让 Agent 拿着这份凭证操作对应环境。

**配置文件：** 写进客户端的 MCP 配置。

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["@cloudbase/cloudbase-mcp@latest"],
      "env": {
        "CLOUDBASE_API_KEY": "<平台下发的 API Key>",
        "CLOUDBASE_ENV_ID": "<平台下发的环境 ID>"
      }
    }
  }
}
```

**CLI 非交互登录：** 用户机器上已经有 CloudBase CLI 时，一条命令写凭证，不需要交互。

```bash
tcb login --cloudbase-api-key <平台下发的 API Key> -e <envId>
```

**本地授权回调（平台内嵌）：** 想让用户完全不碰密钥时用这条。

1. 平台在客户端侧起一个只监听 `127.0.0.1` 的本地服务（端口随机）。
2. 打开 CloudBase 授权页（`/login?cliAuth=1`，带上 `_redirect_uri` 与 `authCallbackUrl`）。
3. 用户在页面上完成一次授权，回调带回 `authSource=api_key`、`envId`、`apiKey`。
4. 本地进程拿它换临时密钥，写进本机凭证文件（toolbox 的 `~/.config/.cloudbase/auth.json`），字段为 `credential.{tmpSecretId, tmpSecretKey, tmpToken, tmpExpired, envId, authSource, apiKey}`。
5. 收起本地服务，提示用户启用连接器并新开会话。

换临时密钥这一步用 `@cloudbase/toolbox` 的 `loginByApiKey()`（或 `exchangeApiKeyForCredential()`），不要自己拼换证请求。确实要自己实现时，注意换证地址可被环境变量 `CLOUDBASE_API_ENDPOINT` 覆盖，客户内网网关场景要用它。

### 三、接入后

4. 启用连接器（或重启 Agent），**新开一个会话**——工具在会话初始化时加载凭证。
5. 让用户说一句话验证，例如「列一下这个环境里的集合」。

## 踩坑清单

- **一把 key 只对一个环境。** key 与 envId 是同一次登录一起写进去的，换环境必然换 key。
- **key 进了对话就留在本机。** 写进对话记录后删记录没有用，只能换一把新的；要么给用户一个不用打字的输入入口，要么把 key 的权限做小。
- **凭证在会话启动时加载。** 替换凭证后必须在**新会话**里验证，老会话看不到。
- **本地回调只监听 `127.0.0.1`、只用一次。** 收到回调立即关掉服务；默认等待 600 秒，超时让用户重新发起。
- **国内站与国际站是两套账号体系。** 域名分别是 `tcb-api.cloud.tencent.com` 与 `tcb-api.tencentcloud.com`，凭证与环境都不互通；错站的典型表现是「登录成功但看不到环境」。
- **API Key 只留在服务端与用户本机。** 不进业务前端、不进代码仓库、不进公开渠道；写盘后收紧权限（`chmod 600`），打印时脱敏。

## 验证步骤

1. 查凭证状态：在 Agent 里调 auth 工具，`status` 应为已登录。
2. 查环境对不对：调 `queryEnv`（或读环境信息）确认返回的 `envId` 与用户应得的一致。
3. 跑一次只读查询（列集合或列云函数），确认能取到该环境的资源。
4. 反向验一次：换另一个环境的 key 重复第 2 步，应查不到本环境的资源。
