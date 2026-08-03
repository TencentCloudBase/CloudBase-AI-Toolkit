# 技术方案：HTTP 网关总开关查询与开关能力（gateway privilege）

## 背景

验证 v2.25.3 时发现：`manageGateway(createRoute)` 创建路由成功、路由状态 Enable，但访问仍报 `HTTPSERVICE_NONACTIVATED`（403），根因是环境「HTTP 网关」总开关未开启。MCP 目前无法查询/控制该开关，AI 无法定位原因，只能手动通过控制台操作。

同时发现 `manageFunctions` 的 `func.protocolType` schema 枚举含非法值 `"HTTP"`（SCF 官方文档仅支持 `"WS"`），需要一并修正。

## 架构与选型

### 1. 底层 API 能力（已查证）

| 能力 | 云 API Action | 参数 | Manager SDK 覆盖 |
|---|---|---|---|
| 查询开关状态 | `DescribeCloudBaseGWPrivilege` | `ServiceId` | ❌ 无（`access.getDomainList()` 只返回 `EnableService`，无 `EnableAuth`） |
| 开关总开关 | `ModifyCloudBaseGWPrivilege` | `ServiceId` + `Options:[{Key:'serviceswitch',Value:'true'/'false'}]` | ✅ `access.switchAuth(auth)`（方法名有误导性，实为总开关） |
| 开关访问鉴权 | `ModifyCloudBaseGWPrivilege` | `ServiceId` + `Options:[{Key:'authswitch',Value:'true'/'false'}]` | ❌ 无（`switchPathAuth` 是按 APIId 的 `ModifyCloudBaseGWAPIPrivilegeBatch`，非全局） |

注意：`ModifyCloudBaseGWPrivilege` 在 `Options` 存在时 `EnableService` 字段被忽略，实际生效的是 `Options`（CLI 源码注释确认）。

### 2. 调用方式

- **查询 `getPrivilege`**：使用 `cloudbase.commonService("tcb", "2018-06-08").call({ Action: "DescribeCloudBaseGWPrivilege", Param: { ServiceId } })`（MCP 已有此底层调用模式，见 `cloudbase-manager.ts:86`，`listAvailableEnvCandidates` 同款用法）
- **开关 `enableService`**：优先使用 Manager SDK `cloudbase.access.switchAuth(enable)`（符合项目规则"SDK 优先"）
- **开关 `authSwitch`**：SDK 无全局鉴权开关方法，使用 `commonService` 调 `ModifyCloudBaseGWPrivilege`（`Options:[{Key:'authswitch',...}]`）
- **createRoute 探测**：复用 `getPrivilege` 的内部实现

## 接口设计

### `queryGateway` 新增 action: `getPrivilege`

```
输入: { action: "getPrivilege" }   // envId 来自当前绑定环境，无需额外参数
输出:
{
  success: true,
  data: {
    action: "getPrivilege",
    enableService: boolean,   // HTTP 网关总开关
    enableAuth: boolean,      // 访问鉴权开关
    raw: { EnableService, EnableAuth, ... }
  },
  message: "HTTP 网关已开启/未开启（访问鉴权已开启/未开启）",
  nextActions?: [ { tool: "manageGateway", action: "enableService", reason: "..." } ]  // 仅 EnableService=false 时
}
```

### `manageGateway` 新增 action: `enableService` / `authSwitch`

```
输入: { action: "enableService" | "authSwitch", enable: boolean }  // enable 必填
输出:
{
  success: true,
  data: { action, enable, enableService?, raw }
  message: "HTTP 网关总开关已开启/关闭"（或"访问鉴权已开启/关闭"）
  nextActions: [ { tool: "queryGateway", action: "getPrivilege", reason: "复核开关状态" } ]
}
```

- `enable` 缺失时：`success: false` + 明确参数错误提示（不猜测默认值）
- 成功后可调用 `getPrivilege` 复核新状态（可选，直接在 message 中附建议）

### `manageGateway(createRoute)` 增加开关探测提示

在现有 createRoute 成功返回前，调用 `getPrivilege` 内部实现：
- `EnableService === false`：message 追加「⚠️ HTTP 网关总开关未开启，访问将返回 HTTPSERVICE_NONACTIVATED（403），建议调用 manageGateway(action="enableService", enable=true) 开启」；nextActions 前置插入该引导
- `EnableService === true`：保持现有 message，不追加
- 探测失败（网络等）：不阻断 createRoute 返回，message 追加「（无法确认 HTTP 网关开关状态）」弱提示

### `manageFunctions` schema 修正（需求 5）

`mcp/src/tools/functions.ts:300`：
```ts
// 修改前
protocolType: z.enum(["HTTP", "WS"]).optional().describe("HTTP 云函数协议类型"),
// 修改后
protocolType: z.enum(["WS"]).optional().describe(
  "HTTP 函数访问协议，当前仅支持 WebSockets，取值为 WS（配合 protocolParams.wsParams 使用）。普通 HTTP 函数不要传此字段。"
),
```

## 测试策略

`mcp/src/tools/gateway.test.ts`（现有 20 用例，mock `describeHttpServiceRoute`）新增：

1. `queryGateway(action=getPrivilege)` 返回 EnableService/EnableAuth（mock `commonService.call` 或 `access` 模块）
2. `manageGateway(action=enableService)` 传 `enable=true/false` 调用 `access.switchAuth`，断言参数与返回
3. `manageGateway(action=enableService)` 缺 `enable` 返回参数错误
4. `manageGateway(action=authSwitch)` 传 enable 调 `ModifyCloudBaseGWPrivilege`（authswitch），缺参报错
5. `manageGateway(action=createRoute)` 且 EnableService=false 时 message 含「HTTP 网关总开关未开启」提示 + nextActions 引导
6. `manageGateway(action=createRoute)` 且 EnableService=true 时无误导提示
7. `manageGateway(action=createRoute)` 探测失败时仍成功返回路由（弱提示）

`functions` 相关测试：`protocolType` schema 枚举仅接受 `WS`（拒绝 `HTTP`）。

## 安全性

- 只读查询与开关操作均走当前登录身份（Manager SDK / commonService），无新增密钥
- 开关操作有明确 `enable` 参数，不猜测默认值，避免误关
- createRoute 的探测不阻塞主流程，避免因探测失败导致路由创建结果丢失

## 涉及文件

| 文件 | 变更 |
|---|---|
| `mcp/src/tools/gateway.ts` | 新增 getPrivilege/enableService/authSwitch 分支 + createRoute 探测提示 + schema 更新 |
| `mcp/src/tools/functions.ts` | `protocolType` 枚举修正为 `z.enum(["WS"])` + 描述 |
| `mcp/src/tools/gateway.test.ts` | 新增上述用例 |
| `mcp/src/tools/functions.test.ts` | protocolType 枚举校验用例 |
| `scripts/tools.json`、`doc/mcp-tools.md` | 重新生成 |
| `specs/mcp-gateway-privilege/requirements.md` | 已定稿 |
