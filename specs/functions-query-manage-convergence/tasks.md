# 实施计划

- [x] 1. 完成 `functions` 域主入口收敛
  - 移除 `functions` 域中的 HTTP access 动作
  - 保留 `queryFunctions` / `manageFunctions` 作为函数域唯一主入口
  - 统一函数域 action 和字段命名
  - _需求: 需求1, 需求4, 需求5_

- [x] 2. 完成 `gateway` 域主入口收敛
  - 新增 `queryGateway` / `manageGateway`
  - 让函数 HTTP access 通过 `gateway` 域处理
  - 使用 `targetType` / `targetName` 作为网关域目标标识
  - _需求: 需求2, 需求4_

- [x] 3. 硬下线历史工具
  - 删除旧函数兼容别名注册
  - 删除旧函数层兼容工具
  - 删除 `createFunctionHTTPAccess`
  - _需求: 需求3_

- [x] 4. 补齐 cloud mode 保护
  - 为 `manageFunctions` 增加动作级限制
  - 对依赖本地路径的动作返回明确错误
  - _需求: 需求5_

- [x] 5. 更新测试与集成用例
  - 重写工具注册和 schema 测试到新主入口
  - 调整函数层真实集成测试到 `queryFunctions` / `manageFunctions`
  - 更新运行时验证测试到 `manageFunctions`
  - _需求: 需求6_

- [x] 6. 更新文档、prompt 和工具清单
  - 更新 manifest、connection modes、cloud function prompt 和规则文档
  - 更新 AI IDE 配置中的旧工具引用
  - 重新生成 `tools.json` 和 `mcp-tools.md`
  - _需求: 需求3, 需求6_

- [x] 7. 更新 review 规则 / skills
  - 保留本次已补充的 review 约束
  - 将“一个域一个 query / 一个 manage”与“跨域边界不可硬塞”固化到评审心智
  - _需求: 需求2, 需求4_
