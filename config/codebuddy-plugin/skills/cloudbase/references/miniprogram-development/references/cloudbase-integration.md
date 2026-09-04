# CloudBase 小程序集成参考

本文补充 `SKILL.md`，提供实用的 **微信小程序 + CloudBase** 集成指引。

## 如何使用本参考（面向 coding agent）

1. **理解平台差异**
   - 微信小程序与 Web 的认证方式完全不同。
   - 必须严格区分平台。
   - 绝不要把 Web 认证方法混入小程序项目。
   - 使用 CloudBase 的小程序天然免登录。

2. **遵循 CloudBase 最佳实践**
   - 小程序客户端使用 `wx.cloud` API。
   - 依赖客户端写入前，先配置合适的数据库权限。
   - 跨集合操作与特权写入优先走云函数。
   - 服务端用 `cloud.getWXContext()` 取得的 `OPENID` 作为稳定用户标识。

3. **使用正确的 SDK 与 API**
   - 小程序客户端按需使用 `wx.cloud.database()`、`wx.cloud.callFunction()`、`wx.cloud.uploadFile()`。
   - 不要在小程序中使用 Web SDK 认证模式。
   - 可用时通过 `envQuery` 获取环境 ID。

4. **选择正确的云执行面**
   - **微信云开发 = CloudBase × 微信。** Nightly 开发者工具 Skills 可用时，日常小程序云操作（环境列表、NoSQL、云函数、云存储）优先用 `wechatide` / `cloudbase-operator` + 微信登录。见 [devtools-debug-preview.md](devtools-debug-preview.md) 与 [wxide-vs-cloudbase-mcp.md](wxide-vs-cloudbase-mcp.md)。
   - Nightly 未覆盖的缺口（进阶权限、数据模型、MySQL/PG、更广的环境治理），或 Nightly / `wechatide` 不可用时，使用 **CloudBase MCP**（IDE MCP 或下方 mcporter）。
   - **不要** 为 `wechatide` 已能完成的日常操作强制单独做腾讯云 MCP 登录。

5. **IDE MCP 不可用 / Nightly 路径不够时，经 mcporter（CLI）使用 CloudBase MCP**
   - **无需** 在配置中硬编码 Secret ID / Secret Key / Env ID。
   - CloudBase MCP 支持通过 `auth` 工具做 device-code 登录，可交互获取凭证。
   - 在 `config/mcporter.json` 中添加 CloudBase MCP server：
     若已有其他 MCP server，保留它们，仅追加 `cloudbase` 条目。
     ```json
     {
       "mcpServers": {
         "cloudbase": {
           "command": "npx",
           "args": ["@cloudbase/cloudbase-mcp@latest"],
           "description": "CloudBase MCP",
           "lifecycle": "keep-alive"
         }
       }
     }
     ```
   - 发现工具与 schema：
     - `npx mcporter list` — 列出已配置 server
     - `npx mcporter describe cloudbase --all-parameters` — 检查 CloudBase server 配置并获取含全部参数的完整工具 schema（⚠️ **必须加 `--all-parameters` 才能获取完整参数信息**）
     - `npx mcporter list cloudbase --schema` — 获取全部 CloudBase 工具的完整 JSON schema
     - `npx mcporter call cloudbase.help --output json` — 发现可用 CloudBase 工具及其 schema
   - 调用 CloudBase 工具（鉴权流程示例）：
     - `npx mcporter call cloudbase.auth action=status --output json`
     - `npx mcporter call cloudbase.auth action=start_auth authMode=device --output json`
     - `npx mcporter call cloudbase.auth action=set_env envId=env-xxx --output json`

## 1. 环境初始化

使用 CloudBase 的小程序应在应用启动时初始化一次 `wx.cloud`。

```js
App({
  onLaunch() {
    wx.cloud.init({
      env: "your-env-id",
      traceUser: true,
    });
  },
});
```

### 规则

- 可用时始终通过 `envQuery` 获取环境 ID。
- 优先在应用级初始化一次，避免在页面级反复初始化。
- 除非有明确理由，使用 `traceUser: true`，以便 CloudBase 将请求与当前微信用户关联。

## 2. 认证模型

小程序 CloudBase **天然免登录**。

### 必须遵守的行为

- **不要** 生成登录页或登录流程。
- **不要** 把 Web 认证模式移植到小程序。
- 在云函数中用 `cloud.getWXContext().OPENID` 获取用户身份。

```js
const cloud = require("wx-server-sdk");
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

exports.main = async () => {
  const wxContext = cloud.getWXContext();
  return {
    openid: wxContext.OPENID,
  };
};
```

## 3. 推荐能力边界

在正确的层级使用正确的 CloudBase 能力。

### 客户端

- `wx.cloud.database()` — 客户端安全读、用户作用域写
- `wx.cloud.uploadFile()` — 用户生成资源
- `wx.cloud.callFunction()` — 调用后端编排

### 云函数

- 特权写入
- 跨集合事务或工作流
- 第三方 API 集成
- 数据规范化 / 校验
- 经 `OPENID` 访问可信用户身份

## 4. 环境选择

- 不要硬编码随意的环境 ID。
- 优先从 `envQuery` 等工具获取环境 ID。
- 通常在 `app.js` / `app.ts` 中初始化一次 CloudBase。

## 5. 微信开发者工具与项目形态

- 请用户打开项目前，确认 `project.config.json` 含有 `appid`。
- 小程序源码通常在 `miniprogram/` 下。
- 云函数通常在 `cloudfunctions/` 下。
- 生成的页面应包含配套配置文件，如 `index.json`。

## 6. AI 与模型使用

- 在支持的基础库版本上，小程序可使用 `wx.cloud.extend.AI`。
- 保持 prompt 与模型选择明确。
- 若使用流式输出，应完整消费流，并在合适处增量更新 UI。

## 7. IDE MCP / Nightly Skills 不可用时的回退

若 Nightly `wechatide` 不可用，且 IDE 原生 MCP 集成也不可用，则通过 `mcporter` 使用 CloudBase MCP，用 device-code 鉴权完成登录，而不是把密钥写进配置。小程序日常操作仍尽量安装 Nightly：https://developers.weixin.qq.com/miniprogram/dev/devtools/nightly_backup.html

## 8. 控制台与运维链接

相关时，引导用户前往 CloudBase 控制台查看：

- 环境设置
- 数据库权限规则
- 云函数部署状态
- 存储管理
- 计费 / 套餐信息

优先用控制台指引，不要臆测权限或环境状态。
