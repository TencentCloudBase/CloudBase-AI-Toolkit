# 实施计划：MCP 环境创建工具

- [x] 1. **`manageEnv` 工具注册骨架**
  - 在 `mcp/src/tools/env.ts` 的 `registerEnvTools` 函数中注册 `manageEnv` 工具
  - 定义 `manageEnvAction` 枚举：`listPackages` | `create` | `destroy` | `modifyPlan` | `renew`
  - 定义入参 schema（action、envId、alias、packageId、region、resources、duration、force、bypassCheck、confirm）
  - 实现 action 路由分发逻辑
  - _需求: 需求 1、2、4、5、6_

- [x] 2. **`listPackages` 实现**
  - 调用 `manager.env.describeBaasPackageList({ TargetAction: "new" })`
  - 格式化返回套餐列表（ID、名称、适用场景、价格）
  - _需求: 需求 1_

- [x] 3. **`create` 实现**
  - 校验必填参数：alias、packageId
  - 校验 `confirm="yes"`，否则返回配置摘要并要求确认
  - 调用 `manager.env.createEnv({ Alias, PackageId, Resources, Period, Region })`
  - 返回新环境 ID + 引导用户通过 `queryEnv(action="info")` 轮询状态
  - _需求: 需求 2、3_

- [x] 4. **`destroy` 实现**
  - 校验必填参数：envId
  - 校验 `confirm="yes"`
  - 调用 `manager.env.destroyEnvWithParams({ EnvId, IsForce, BypassCheck })`
  - 返回销毁结果
  - _需求: 需求 4_

- [x] 5. **`modifyPlan` 实现**
  - 校验必填参数：envId、packageId
  - 校验 `confirm="yes"`
  - 调用 `manager.env.modifyEnvPlan({ EnvId, PackageId })`
  - _需求: 需求 5_

- [x] 6. **`renew` 实现**
  - 校验必填参数：envId
  - 校验 `confirm="yes"`
  - 调用 `manager.env.renewEnv({ EnvId, Period })`
  - _需求: 需求 6_

- [x] 7. **单元测试**
  - 在 `mcp/src/tools/env.test.ts` 中补充 `manageEnv` 测试用例（12 个）
  - 测试各 action 的入参校验（缺少必填参数、缺少 confirm 等）
  - 测试各 action 的正常调用路径
  - _需求: 非功能性需求_

- [x] 8. **工具描述与文档更新**
  - 更新 `doc/mcp-tools.md` 中新增的 `manageEnv` 工具说明
  - _需求: 非功能性需求_
