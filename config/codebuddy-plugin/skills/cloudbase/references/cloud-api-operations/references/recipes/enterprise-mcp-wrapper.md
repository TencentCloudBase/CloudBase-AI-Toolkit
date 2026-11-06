# Recipe 13 — 封装企业专属 MCP

## When to use

已按 [Recipe 7](./platform-onboarding.md) 发了环境与凭证、按 [Recipe 8](./platform-agent-connect.md) 完成接入、按 [Recipe 9](./platform-agent-guardrails.md) 做了收口，下一步要把这套策略**固化成一个开箱即用的企业专属 MCP**：

- 员工装一个包就拿到「裁剪过的工具面 + 默认拦截 + 审计」，不用每份配置重复写开关
- 危险动作要在**协议层**拦（提示词约束拦不住误删与越权，见 Recipe 9 §C 的软硬之分）
- 要把封装升级为远端形态：wrapper 部署为企业服务端点，员工零安装（见 §5）

不管什么：环境/凭证还没发 → [Recipe 7](./platform-onboarding.md)；只是给单份配置做限制、不打算维护一个包 → Recipe 9 的配置开关就够，不用写代码。

本篇就是被 `cloud-api-operations` skill 路由到的实操文档：当用户请求包含「企业接入 / 封装 MCP / 企业专属 MCP」时，SKILL.md 的 description 会命中并加载本 skill——提示词里直接点名 skill 名，是最精准的激活方式。

## 前置权限

- Node.js ≥ 18.15（工厂与 MCP SDK 依赖）
- 能发布 npm 包：公共源、企业内部源（制品库 / verdaccio）或内部 git 仓库三选一
- 员工机器能装 Node ≥ 18.15（本地 stdio 形态的前提）

## 接口序列

### 1. 骨架：进程内工厂，不 spawn 子进程

官方包导出 `createCloudBaseMcpServer` 工厂（与官方托管远端 MCP 同源）。外层自建一个 MCP Server 对 IDE 暴露 stdio，进程内用 in-memory 传输对接官方实例，在两处下手：`tools/list` 裁剪、`tools/call` 拦截。

```js
import { createRequire } from 'node:module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// 必须走 CJS 入口（dist/index.cjs）：ESM 入口有未声明的内部依赖
const require = createRequire(import.meta.url);
const { createCloudBaseMcpServer } = require('@cloudbase/cloudbase-mcp');

// 插件组合是平台方策略，写死在 wrapper 里，员工不配置
const PLUGINS = 'env,database,functions,storage,hosting,gateway,cloudrun,apps'.split(',');
// 不传时官方默认全开，含能透传任意云 API 的 capi——企业场景务必排除

const upstream = await createCloudBaseMcpServer({
  name: 'cloudbase-mcp', cloudMode: false,
  pluginsEnabled: PLUGINS,
  cloudBaseOptions: { envId: process.env.CLOUDBASE_ENV_ID },
});

const [ct, st] = InMemoryTransport.createLinkedPair();
await upstream.connect(st);
const client = new Client({ name: 'wrapper', version: '1.0.0' }, { capabilities: {} });
await client.connect(ct);

// 危险动作：官方二次确认清单的删除类，按语义前缀兜底
const isDenied = (tool, action) =>
  /^(delete|destroy|remove|clear|truncate|drop)/i.test(action ?? '');

const wrapper = new Server({ name: 'cloudbase-wrapper', version: '1.0.0' }, { capabilities: { tools: {} } });

wrapper.setRequestHandler(ListToolsRequestSchema, async () => {
  const { tools } = await client.listTools();
  const visible = [];
  for (const tool of tools) {
    // 被禁动作从参数 enum 里剪掉，模型在参数定义层就看不见
    const p = tool.inputSchema?.properties?.action;
    if (p?.enum) {
      p.enum = p.enum.filter((a) => !isDenied(tool.name, a));
      if (p.enum.length === 0) continue;   // enum 剪空 = 整个工具下架
    }
    visible.push(tool);
  }
  return { tools: visible };
});

wrapper.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args = {} } = req.params;
  if (isDenied(name, args.action)) {
    return { content: [{ type: 'text', text: `${name}.${args.action} 被平台策略禁止，重试无效。` }], isError: true };
  }
  console.error('[audit]', JSON.stringify({ ts: Date.now(), env: process.env.CLOUDBASE_ENV_ID, call: `${name}.${args.action ?? ''}` }));
  return client.callTool(req.params);
});

await wrapper.connect(new StdioServerTransport());
console.error('[cbw] ready');
```

可运行的完整版（含策略文件与自检脚本）：本仓库 `examples/cloudbase-mcp-stdio-wrapper/`。

### 2. 凭证自检：只有环境级作用域才放行

环境 API Key 的生效条件是「Key 与 `CLOUDBASE_ENV_ID` **同时**在环境变量」，且换证失败会被静默吞掉、回落到机器上可能存在的全局登录态——wrapper 会带着账号级权限继续跑而不自知。启动时自检一次：

```js
const res = await client.callTool({ name: 'auth', arguments: { action: 'status' } });
const text = (res.content ?? []).map((c) => c.text ?? '').join('\n');
const scope = /credential_scope["'=:\s]+(\w+)/i.exec(text)?.[1];
if (scope && scope !== 'single_env') {
  console.error(`[cbw] 凭证作用域异常（${scope}），API Key 未生效，拒绝服务`);
  process.exit(1);
}
```

`single_env` 且来源为 env 才放行；看到 `account` 说明回落到了全局登录态，直接拒绝服务。三个变量（envId、Key）由平台按人下发到员工配置的 `env` 块，员工不编辑。

**交付给 AI 的凭证形态只有一种：环境 ID + API Key。** API Key 是长期根凭证，MCP 内部用它换 30 分钟有效的 STS 临时凭证出网，过期自动重换。STS 三件套（`TmpSecretId` / `TmpSecretKey` / `Token`）是换证**产物**，不是交付物——只把 STS 交给 AI 或写进配置，过期后整条链路挂掉且无法自愈；拿到 Key + envId 就永远能重新换证。

### 3. 发布与员工配置

配上 `package.json`（`name` 写企业包名）后 `npm publish`；不发公共源就发企业内部源（员工 `.npmrc` 指过去）或直接从内部 git 安装。员工侧配置只剩：

```json
{
  "mcpServers": {
    "cloudbase": {
      "command": "npx",
      "args": ["-y", "@your-org/cloudbase-wrapper@1.0.0"],
      "env": {
        "CLOUDBASE_ENV_ID": "env-xxxxx",
        "CLOUDBASE_API_KEY": "ak-xxxxx"
      }
    }
  }
}
```

版本号固定（升级由平台方发新版推动），避免 `npx` 每次拉到不同版本。Key 的纪律同 Recipe 7：一人一 Key、离职即删、单环境最多 5 个滚着换。

### 4. 用它部署：上传通道统一，三个例子同一骨架

源码统一走 COS 通道：`getUploadUrl` 拿预签名地址 → 调用方 PUT 源码 zip（带返回的 `uploadHeaders`）→ `deployApp` 带 `source: { type: 'zip', cosTimestamp: unixTimestamp }`（即第 1 步返回的 `unixTimestamp`）。这套流程不依赖本地文件，调用方在本地或远端都能执行。

```js
// 例 1 · 静态 / 标准框架
await manageApps({
  action: 'deployApp', serviceName: 'crm-portal',
  source: { type: 'zip', cosTimestamp: unixTimestamp },
  framework: 'react', installCmd: 'npm ci', buildCmd: 'npm run build', buildPath: 'dist',
});

// 例 2 · http 函数（自定义镜像后端）：构建与部署两段
await manageApps({
  action: 'deployApp', serviceName: 'order-api', deployType: 'custom',
  source: { type: 'zip', cosTimestamp: unixTimestamp },
  customSteps: [
    { name: 'build', command: 'docker build -t $IMAGE:$CLOUDBASE_VERSION_NAME .' },
    { name: 'push',  command: 'docker push $IMAGE:$CLOUDBASE_VERSION_NAME' },
  ],
});
// 构建容器里没有部署命令：Stage A 终点是镜像推送；
// 部署用 manageFunctions(action='createFunction', runtime='CustomImage', imageConfig)
// 镜像仓库凭证不用传——容器内置 $API_SECRET_ID / $API_SECRET_KEY / $API_TOKEN

// 例 3 · 前后端一体：serviceList + routes，一次调用一个版本序列
await manageApps({
  action: 'deployApp', serviceName: 'crm-fullstack', deployType: 'custom',
  source: { type: 'zip', cosTimestamp: unixTimestamp },
  serviceList: [
    { serviceType: 'static-hosting', serviceName: 'web',
      buildContext: { path: 'frontend', outPut: 'dist' },
      command: { installCmd: 'npm ci', buildCmd: 'npm run build' } },
    { serviceType: 'http-function', serviceName: 'api',
      buildContext: { path: 'backend' } },
  ],
  routes: [
    { source: '/api', serviceType: 'http-function', serviceName: 'api' },
    { source: '/',    serviceType: 'static-hosting', serviceName: 'web' },
  ],
});

// 轮询与失败日志（三例相同）
await queryApps({ action: 'getAppVersion', serviceName, buildId });
await queryApps({ action: 'getBuildLog',  serviceName, buildId });
```

`deployType: 'custom'` 的完整形态（git 源、`Routes`、`WorkingDir`）见云 API `CreateCloudApp` 文档；`secretRefs` 等敏感项建议由平台预配置。

### 5. 远端形态

传输换成 `StreamableHTTPServerTransport`（短连接、无状态模式），每请求新建一对传输与实例——SDK 硬约束是「一个实例同时只能绑一个 transport」，短连接下每请求新建天然满足，无需会话管理。工具面开 `cloudMode: true` 让官方自动收窄依赖本地文件的工具。鉴权两条通道：员工 → wrapper 走企业 SSO / OAuth 网关；wrapper → CloudBase 走 OAuth 2.1 或静态凭证 header（`X-TencentCloud-SecretId` / `X-TencentCloud-SecretKey`）。行为对照物是官方托管端点 `tcb-api.cloud.tencent.com/mcp/v1`。

## 踩坑清单

- **入口用 CJS**（`dist/index.cjs`）：ESM 入口引用了未声明的内部依赖，装不上直接报模块找不到
- **stdout 只写 JSON-RPC**：所有日志 `console.error`。多一个 `console.log` 客户端握手就崩
- **`pluginsEnabled` 必须显式传**：默认全开含 `capi`（通用云 API 通道），等于绕过整个裁剪
- **enum 剪空要下架整个工具**：留下一个「没有任何合法参数」的工具，模型会反复空参重试
- **两个环境变量必须同时给**：只给 Key 不给 `CLOUDBASE_ENV_ID`，Key 根本不参与解析，静默回落全局登录态
- **错误返回带原因**：拦截时写明「平台策略禁止，重试无效」，不带说明的报错会诱使模型换个姿势再试
- **只交 STS 不交 API Key**：临时凭证 30 分钟过期，过期后没有根凭证可重换，整条链路瘫痪——交付物永远是 `envId + API Key` 对
- **接口名与参数凭记忆猜**：Action 名、参数结构、默认值一律以文档索引（api-reference）与官方文档为准；记忆推断的内容必须标注并先验证再用

## 验证步骤

1. `initialize` 握手成功（stdout 无杂物）
2. `tools/list` 数量与插件组合一致、被禁 action 不在任何 enum 里
3. 拦截表动作全部返回 `isError: true` 且文案明确
4. `auth(action="status")` 返回 `credential_scope=single_env`（假凭证 + 临时跳过自检可先验协议层）
5. 真环境部署一次（例 1 最小路径），确认域名可访问、审计日志有记录

配套：完整教程（三层选型、远端差异表）见文档站「企业平台接入 CloudBase MCP：封装自有 MCP」。
