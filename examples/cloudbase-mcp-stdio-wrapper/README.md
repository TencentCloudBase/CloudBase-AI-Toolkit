# CloudBase MCP stdio wrapper 示例

一个可以跑的参考实现，把官方 MCP 包成企业自己的 stdio 服务：可用工具按业务裁剪，动作越权直接拒绝，参数由 wrapper 注入。

## 目录

| 文件 | 职责 |
|---|---|
| `index.mjs` | 入口。建上游 server、建 wrapper、接 stdio、管信号 |
| `policy.mjs` | 工具与动作的白名单，参数注入规则 |
| `probe.mjs` | 协议层自检，不接 IDE，用假凭证跑四条断言 |

## 跑起来

```bash
npm install
npm run probe
```

`probe` 会起一个 wrapper 子进程，走标准 MCP 握手，检查四件事：

1. `initialize` 能过，说明 stdout 没被日志污染
2. `tools/list` 只返回白名单里的两个工具
3. `deleteApp` 被拒，说明动作层生效
4. 未暴露的工具被拒

接真实环境时把环境变量换成真值：

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "node",
      "args": ["/绝对路径/examples/stdio-wrapper/index.mjs"],
      "env": {
        "CLOUDBASE_ENV_ID": "env-xxxxx",
        "CLOUDBASE_API_KEY": "ak-xxxxx",
        "CBW_ALLOW_TOOLS": "manageApps,queryApps",
        "CBW_SERVICE_PREFIX": "crm-"
      }
    }
  }
}
```

## 与官方远端托管的关系

官方托管的远端 MCP 和本示例用的是同一个工厂 `createCloudBaseMcpServer`，差别只在传输和凭证接入方式：

| | 官方远端托管 | 本示例（本地） |
|---|---|---|
| 创建 server | `createCloudBaseMcpServer` | 同一个工厂 |
| 传输 | `StreamableHTTPServerTransport`，每个 HTTP 请求即时建连接 | `InMemoryTransport`（进程内对接官方 server）+ `StdioServerTransport`（对 IDE） |
| 多连接 | 需要实例缓存与会话隔离 | 一进程一实例，无需缓存 |
| 凭证 | OAuth 或静态凭证 header | 环境变量里的 API Key |
| 插件裁剪 | `pluginsEnabled` / `pluginsDisabled` | 同，再加一层 `tools/list` 过滤做工具级控制 |

把传输换掉之后，其余逻辑（插件裁剪、拦截、审计）两边完全一致——这也是本示例选择进程内方案的原因：代码与远端形态同源，将来迁移远端时只换传输层。

## 三层结构

```
IDE ──stdio──▶ wrapper Server ──in-memory──▶ 官方 MCP Server ──HTTPS──▶ CloudBase
                    │
                    ├─ tools/list 响应按白名单过滤
                    ├─ tools/call 校验 action，注入 serviceName
                    └─ 审计写 stderr
```

## 实测记录

2026-10-26，Node v22.22.2，`@cloudbase/cloudbase-mcp@2.36.1`，`@modelcontextprotocol/sdk@1.22.0`。`npm run probe` 四条断言全过。

三个坑值得记下来：

1. **必须走 CJS 入口。** 直接 `import { createCloudBaseMcpServer } from '@cloudbase/cloudbase-mcp'` 会连挂两次：先报找不到 `@cloudbase/cals`（这个包没写进 dependencies），装上后又报 `@cloudbase/cals` 的 CJS 文件里相对 import 缺 `.js` 扩展名。改用 `createRequire` 加载后正常，因为 `dist/index.cjs` 是 12MB 自包含 bundle，不依赖任何外部包。
2. **`pluginsEnabled: ['apps','env']` 确实生效。** 上游 `tools/list` 只返回 6 个工具，被包装层裁到 2 个。
3. **别二次打包官方 MCP。** `dist/index.cjs` 是 webpack bundle，用 esbuild 卷进自己的产物会破坏内部模块包装（启动时报 `i.default is not a constructor`）；把 `@cloudbase/cloudbase-mcp` 标成 external，运行时用 `createRequire` 直接 require。CJS 入口是具名导出，不需要 `.default` fallback。

## 还没验证

1. **真 Key 下能否自动换 STS。** 假 Key 的 `auth(status)` 返回 `auth_status=REQUIRED`、`credential_source=null`：换证失败是换证函数直接返回空，不会用假 Key 继续跑。真环境下的完整换证链路还没跑过。
2. **`createCloudBaseMcpServer` 的稳定性。** 有完整 d.ts，文档站的「封装企业专属 MCP」教程与 `cloud-api-operations` skill 的实操 recipe 都公开用它。升级包版本时要回归一次。
3. **同进程的环境变量隔离做不到。** wrapper 和官方 server 共享 `process.env`，没法做到"只传白名单变量"。这条只有 spawn 子进程时才成立，本示例选择不 spawn，接受这个代价。

## 已知限制

- 审计只写 stderr，员工可以丢进黑洞。合规审计要放 CI。
- 没有实现 `getBuildLog` 的日志截断，长日志会整段返回给模型。
