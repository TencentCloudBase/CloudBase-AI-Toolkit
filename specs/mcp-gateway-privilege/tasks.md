# 实施计划：HTTP 网关总开关查询与开关能力（gateway privilege）

## 前置

- [x] 需求定稿：`specs/mcp-gateway-privilege/requirements.md`（需求 1-5）
- [x] 方案定稿：`specs/mcp-gateway-privilege/design.md`

## 任务

- [ ] 1. `gateway.ts` 实现 `queryGateway(action="getPrivilege")`
  - 用 `cloudbase.commonService("tcb", "2018-06-08").call({ Action: "DescribeCloudBaseGWPrivilege", Param: { ServiceId } })` 查询
  - 返回 `enableService`、`enableAuth`、`raw`，message 中给出用户可读状态
  - `EnableService=false` 时 nextActions 引导 `manageGateway(action="enableService")`
  - 抽出内部 `getGatewayPrivilege()` 供 createRoute 复用
  - _需求: 需求 1

- [ ] 2. `gateway.ts` 实现 `manageGateway(action="enableService")`
  - 必填 `enable: boolean`，缺失时返回参数错误（不猜默认值）
  - 调 Manager SDK `cloudbase.access.switchAuth(enable)`（serviceswitch）
  - 返回结果 + nextActions 引导 `queryGateway(action="getPrivilege")` 复核
  - _需求: 需求 2

- [ ] 3. `gateway.ts` 实现 `manageGateway(action="authSwitch")`
  - 必填 `enable: boolean`，缺失时返回参数错误
  - 调 `commonService` `ModifyCloudBaseGWPrivilege`（`Options:[{Key:'authswitch',Value:'true'/'false'}]`）
  - 返回结果 + nextActions 引导复核
  - _需求: 需求 2

- [ ] 4. `gateway.ts` 的 `createRoute` 增加开关探测提示
  - 路由创建成功后调用 `getGatewayPrivilege()`（try/catch 包裹，失败不阻断）
  - `EnableService=false`：message 追加「HTTP 网关总开关未开启，访问将返回 HTTPSERVICE_NONACTIVATED」+ nextActions 前置 `enableService` 引导
  - `EnableService=true`：不追加
  - 探测失败：message 追加弱提示「无法确认 HTTP 网关开关状态」
  - _需求: 需求 3

- [ ] 5. `functions.ts` 修正 `protocolType` schema
  - `z.enum(["HTTP","WS"])` → `z.enum(["WS"])`，描述说明仅 WebSocket 函数使用（配合 `protocolParams.wsParams`），普通 HTTP 函数不要传
  - _需求: 需求 5

- [ ] 6. 更新 `gateway.test.ts` 测试
  - getPrivilege 成功返回（mock commonService.call）
  - enableService true/false 调 switchAuth；缺 enable 报参数错误
  - authSwitch 调 ModifyCloudBaseGWPrivilege（authswitch）；缺 enable 报参数错误
  - createRoute + EnableService=false 含提示与引导
  - createRoute + EnableService=true 无误导提示
  - createRoute + 探测失败仍成功返回
  - _需求: 需求 4

- [ ] 7. 更新 `functions.test.ts` 测试
  - protocolType 枚举仅接受 `WS`，拒绝 `HTTP`
  - _需求: 需求 5

- [ ] 8. 重新生成产物并验证
  - `npm run build:tools-json`、`npm run build:tools-doc`（或全量 `npm run build`）
  - 确认 `scripts/tools.json`、`doc/mcp-tools.md` 与代码一致
  - 运行 `npm test`（或对应 vitest 用例）全绿
  - _需求: 需求 4、5

- [ ] 9. 提交与 PR
  - feature 分支（如 `feat/gateway-privilege`）提交，conventional-changelog + emoji
  - `git push origin HEAD`，创建 PR，监控 CI
  - _需求: 全部
