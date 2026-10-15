# Recipe 9 — 收口 Agent：工具裁剪、封装审计、专家约束

## When to use

企业侧对「Agent 能做什么」有硬要求时：

- 要按角色裁剪工具表面：给终端用户的会话不该能调通用云 API，也不该能碰本地文件
- 要能审计：谁、在哪个会话、调了哪个工具、传了什么参数，事后查得到
- 要让 Agent 遵守公司规范：新建云函数必须挂内网 VPC、对外服务必须绑自定义域名

不管什么：凭证怎么进到 Agent 见 [Recipe 8](./platform-agent-connect.md)；自定义域名的具体接口序列见 [custom-domain.md](./custom-domain.md)。

## 前置权限

- 能改客户端侧的 MCP 配置（本地 stdio），或能改远端 MCP 的连接 URL
- 网关/代理与审计存储由企业自己提供；云开发侧只提供工具与插件开关

## 接口序列

### A. 裁剪工具表面

MCP 的工具按**插件**分组，用一个变量就能整组关掉：本地 stdio 用 `CLOUDBASE_MCP_PLUGINS_DISABLED`，远端 URL 用 `disable_plugins`（逗号分隔多值）。

| 目的 | 配置 |
| --- | --- |
| 去掉通用云 API 工具（`callCloudApi`） | `"CLOUDBASE_MCP_PLUGINS_DISABLED": "capi"` |
| 只保留白名单（比逐项禁用更严） | `CLOUDBASE_MCP_PLUGINS_ENABLED=env,functions,hosting` |
| 去掉本地文件与进程类工具（自托管调用方） | `CLOUDBASE_MCP_CLOUD_MODE=true` |

插件名取自 `mcp/src/server.ts` 的 `DEFAULT_PLUGINS`，共 20 个：

```
env  database  pg_database  pg_storage  mysql_database  functions  hosting
storage  setup  rag  cloudrun  deploy  gateway  app-auth  apps  permissions
logs  agents  capi  feedback
```

`capi` 这个插件注册的工具就是 `callCloudApi`（通用云 API 通道）。**禁它是有代价的：平台版那套管控面接口（`CreatePlatformEnv` / `DescribePlatforms` / `CreateApiKey` …）在这个会话里也一起调不了了。**

所以常见做法是**两套配置**：

| 配置 | 谁用 | `capi` |
| --- | --- | --- |
| 运维侧 | 平台自己的运营/发放流程 | 保留 |
| 终端用户侧 | 发给用户的 MCP 配置 | 禁用 |

### B. 封装 MCP 做审计与审批

把 MCP 调用收敛到自己的一个进程/端点后面，是「可观测 + 可拦截」的前提。两种形态：

| 形态 | 做法 | 能拦到什么 |
| --- | --- | --- |
| 本地 stdio 代理 | 客户端连你的代理进程，代理起真正的 MCP 子进程，转发 `initialize` / `tools/list` / `tools/call` | 单机上的全部工具调用；可对破坏性调用挂起等审批 |
| 远端网关 | 客户端连公司网关的 MCP 端点，网关解析 `tools/call` 后决定放行或阻断，再转发给云开发的远端 MCP | 所有接入该网关的调用；可做限流、配额、集中审计 |

审计要能回答「是谁做的」，就有两点必须遵守：

1. **身份在你的这一层取**（员工登录态 / 网关的鉴权结果），不要取工具参数里的自报字段。
2. **连 `params` 一起记**。只记工具名查不出"改了什么" —— 写操作的入参里才有 `EnvId`、`Alias`、上游资源名这些定位信息。

### C. 用自定义专家固化企业约束

系统提示词与专家提示词适合放**软约束**：命名规范、必须带哪个参数、先做什么后做什么。写法上只有一条要求 —— **落到具体的参数名**，"注意安全""遵循规范"这类句子没法执行也没法验收。

两个可以照抄的例子：

**新建云函数必须挂内网 VPC。** 要求调 `manageFunctions(action="createFunction")` 时 `func.vpc` 必须传 `{ vpcId, subnetId }`。这句话是可判定的：`func.vpc` 没有就是违规。不要写成同一入口顶层的 `vpc` —— 建函数只读 `func`，顶层那个只在改配置（`updateFunctionConfig`）时生效。

```json
{
  "action": "createFunction",
  "func": {
    "name": "order-hook",
    "vpc": { "vpcId": "<企业 VPC ID>", "subnetId": "<子网 ID>" }
  }
}
```

**对外服务必须先绑自定义域名。** 要求站点/服务对外前先用 `manageGateway` 完成域名接入；平台版场景下域名池是按 `PlatformId` 维度管理的，两套同形接口别混用，见 [custom-domain.md](./custom-domain.md)。

### 软约束不是防线

提示词会被改写、也可能被注入绕过。真正的收口放在另外两层：

| 层 | 手段 | 拦什么 |
| --- | --- | --- |
| 提示词 | 专家里的规范 | 让 Agent 默认做对（不保证） |
| 网关 / 代理 | 工具裁剪、破坏性调用审批 | 让违规调用发不出去 |
| 数据层 | 数据库安全规则 / 行级安全 | 即使调用发出去了，越权请求在物理层被拒 |

## 踩坑清单

| 坑 | 现象 | 正确做法 |
| --- | --- | --- |
| 以为裁剪工具就等于收口 | 参数换个写法又能调通 | 裁剪只缩小工具表面；硬约束要放网关与数据层 |
| 禁 `capi` 之后平台运维也用同一套配置 | 管控面接口调不了 | 运维侧一套配置、终端用户侧一套配置 |
| 专家提示词里写死内网域名、子网 ID | 换环境即失效，且内部信息进了会被分发的产物 | 参数从环境变量或自家配置读取；提示词里只写规则、不写值 |
| 审计只记工具名 | 事后查不出改了什么 | 记 `tools/call` 的 `params` 原文 |
| 报名身份的字段做审计 | 身份可伪造 | 身份在自己的网关/代理层取，不取工具参数 |
| 把 `MCP_CLOUD_MODE` 当安全开关 | 以为它也挡住了云资源操作 | 它只关本地文件与进程类工具，不限制云资源调用 |
| 用 `enable_plugins` 写在本地 stdio 配置里 | 不生效 | 本地用 `CLOUDBASE_MCP_PLUGINS_ENABLED`，`enable_plugins` 是远端 URL 的参数 |

## 验证步骤

1. 连接后看工具清单：被禁插件对应的工具**确实不在列表里**（不是"应该不在"）。
2. 直接调一次被禁的工具名：应报未知工具，而不是执行成功。
3. 走一次写操作（例如建一个函数），在代理或网关日志里能查到三样东西：工具名、`params` 原文、发起者身份。
4. 反向测试专家规范：故意让 Agent 不提 `vpc` 就建函数，确认它被规范挡住，或你在网关侧收到了违规记录。
