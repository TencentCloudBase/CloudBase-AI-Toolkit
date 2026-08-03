# 需求文档：HTTP 网关总开关查询与开关能力（gateway privilege）

## 介绍

MCP 的 `manageGateway`/`queryGateway` 工具目前只覆盖 Domain/Route 管理，无法感知或控制环境的「HTTP 网关」总开关（`ModifyCloudBaseGWPrivilege` / `DescribeCloudBaseGWPrivilege`）。当总开关未开启时，`createRoute` 返回成功、路由状态 Enable，但实际访问返回 `HTTPSERVICE_NONACTIVATED`（403），AI 无法从工具结果中定位原因，用户只能手动通过控制台或 curl 私有 API 开启。

本次需求为 MCP 补齐 HTTP 网关总开关的查询与开关能力，并在 `createRoute` 结果中主动提示开关状态，避免「创建成功但访问 403」的误导。

背景事实（2026-08-03 验证）：
- Manager SDK `@cloudbase/manager-node` 的 `AccessService` 已内置能力：`getDomainList()`（返回 `EnableService`）、`getAccessList()`（返回 `EnableService`）、`switchAuth(auth)`（调 `ModifyCloudBaseGWPrivilege`，`Options:[{Key:'serviceswitch',...}]`，即总开关）、`switchPathAuth()`（路径级鉴权）。
- CLI `tcb service switch` 通过 tcb 云 API `DescribeCloudBaseGWPrivilege` / `ModifyCloudBaseGWPrivilege` 实现，参数为 `ServiceId` + `EnableService` + `Options`。
- 注意：`ModifyCloudBaseGWPrivilege` 在 `Options` 存在时 `EnableService` 会被忽略，实际生效的是 `Options`。

## 需求

### 需求 1 - queryGateway 支持查询 HTTP 网关总开关状态

**用户故事：** 作为 AI 开发者，当访问网关路由失败时，我希望通过 `queryGateway` 直接查询当前环境的 HTTP 网关总开关状态（`EnableService`）与访问鉴权状态（`EnableAuth`），以便快速判断是否是总开关未开启导致的问题。

#### 验收标准

1. When 调用 `queryGateway(action="getPrivilege")`，the MCP 应当返回当前环境的 HTTP 网关总开关状态（`EnableService: boolean`）与访问鉴权状态（`EnableAuth: boolean`），无需额外参数（envId 来自当前绑定环境）。
2. When `getPrivilege` 查询成功，the MCP 应当返回 `success: true`，并在 `data` 中给出开关状态的用户可读提示（如「HTTP 网关已开启/未开启」）。
3. When 底层 API 调用失败（网络、鉴权等），the MCP 应当返回 `success: false` 并包含错误信息，不应抛出未捕获异常。
4. When `EnableService=false`，the MCP 的返回中应当包含 `nextActions` 引导调用 `manageGateway(action="enableService")` 开启总开关。

### 需求 2 - manageGateway 支持开关 HTTP 网关总开关与访问鉴权

**用户故事：** 作为 AI 开发者，当发现 HTTP 网关总开关未开启时，我希望通过 `manageGateway` 直接开启或关闭，而不需要离开 MCP 手动操作控制台。

#### 验收标准

1. When 调用 `manageGateway(action="enableService", enable=true)`，the MCP 应当开启当前环境的 HTTP 网关总开关，并在成功后返回 `success: true` 与新的开关状态。
2. When 调用 `manageGateway(action="enableService", enable=false)`，the MCP 应当关闭当前环境的 HTTP 网关总开关。
3. When 调用 `manageGateway(action="enableService")` 未提供 `enable` 参数，the MCP 应当返回明确的参数错误提示（`success: false`），不应猜测默认值。
4. When 调用 `manageGateway(action="authSwitch", enable=true/false)`，the MCP 应当开启/关闭 HTTP 访问服务的访问鉴权（`authswitch`）。
5. When 开关操作成功，the MCP 的返回消息应当包含操作结果与当前状态，并给出 `nextActions` 提示可调用 `queryGateway(action="getPrivilege")` 复核状态。

### 需求 3 - createRoute 创建后提示 HTTP 网关总开关状态

**用户故事：** 作为 AI 开发者，当调用 `createRoute` 创建路由时，如果环境的 HTTP 网关总开关未开启，我希望工具结果中能直接看到提示，避免误以为路由创建成功即可访问。

#### 验收标准

1. When 调用 `manageGateway(action="createRoute")` 且当前环境 `EnableService=false`，the MCP 应当返回 `success: true`（路由本身创建成功），但在返回消息与 `nextActions` 中提示「HTTP 网关总开关未开启，访问将返回 HTTPSERVICE_NONACTIVATED，建议调用 manageGateway(action="enableService") 开启」。
2. When `EnableService=true`，the MCP 的 `createRoute` 返回不应包含开关未开启的误导提示。
3. When `EnableService` 查询本身失败（网络异常等），the MCP 不应让整个 `createRoute` 失败，而应在消息中附加「无法确认 HTTP 网关开关状态」的弱提示后继续返回路由创建结果。

### 需求 4 - 工具 schema 与文档同步更新

**用户故事：** 作为维护者，新增/修改的 MCP 工具参数需要有清晰的 schema 描述与文档说明，确保 AI 能正确调用。

#### 验收标准

1. When `manageGateway` 新增 `enableService`/`authSwitch` action，the MCP 的 action 枚举、参数 schema（`enable` 布尔字段）、description 应当同步更新，且描述中说明枚举含义。
2. When 工具实现变更，the MCP 的生成产物（`scripts/tools.json`、`doc/mcp-tools.md`）应当重新生成并保持与代码一致。
3. When 工具行为变更，the MCP 的单元测试（`mcp/src/tools/gateway.test.ts`）应当覆盖新增 action 的成功、参数错误与异常分支。

### 需求 5 - 修正 manageFunctions 的 protocolType schema 枚举

**用户故事：** 作为 AI 开发者，当我尝试创建 HTTP 云函数时，如果误传 `protocolType: "HTTP"` 会收到 `ProtocolType取值与规范不符` 的报错，因为该字段的唯一合法取值是 `WS`（WebSockets）。我希望 schema 描述能准确说明这一点，避免误导。

背景事实（2026-08-03 查证）：SCF `CreateFunction.ProtocolType` 官方文档（`https://cloud.tencent.com/document/product/583/18586`）说明「HTTP函数支持的访问协议，当前支持WebSockets协议，值为 `WS`」。MCP schema（`mcp/src/tools/functions.ts:300`）当前为 `z.enum(["HTTP", "WS"])`，其中 `"HTTP"` 是非法值。

#### 验收标准

1. When 查看 `manageFunctions` 的 `func.protocolType` schema，the MCP 的枚举应当只包含合法值 `WS`（`z.enum(["WS"])`），不再包含 `"HTTP"`。
2. When 查看 `func.protocolType` 的 description，the MCP 应当说明该字段仅用于 WebSocket 函数（配合 `protocolParams.wsParams`），普通 HTTP 函数不要传此字段。
3. When 工具 schema 变更，the MCP 的生成产物（`scripts/tools.json`、`doc/mcp-tools.md`）应当重新生成并保持与代码一致。
4. When schema 变更完成，the MCP 的单元测试（`mcp/src/tools/functions.test.ts` 或对应测试）应当覆盖 `protocolType` 枚举校验。

