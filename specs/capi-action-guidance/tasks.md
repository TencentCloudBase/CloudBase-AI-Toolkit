# 实施计划

- [x] 1. 强化 `callCloudApi` 工具描述
  - 更新 `mcp/src/tools/capi.ts` 中 `callCloudApi` 的 `description`
  - 明确区分数据面 OpenAPI / Swagger 与管控面 API 文档
  - 补充两份官方文档入口
  - _需求: 需求 1, 需求 2

- [x] 2. 强化参数说明与错误提示
  - 更新 `action` 与 `params` 参数描述
  - 调整 `buildCapiErrorMessage()`，在 action 无效时补充“不要猜 action”和正确文档入口
  - _需求: 需求 2, 需求 3

- [x] 3. 同步 `mcp-tools` 文档
  - 更新 `doc/mcp-tools.md` 中 `callCloudApi` 的描述
  - 确保文档中有数据面 / 管控面边界说明和两份官方文档入口
  - _需求: 需求 2

- [x] 4. 完成自检
  - 检查源码描述、报错提示与 `doc/mcp-tools.md` 一致
  - 确认未引入 action 枚举或新的工具能力
  - _需求: 需求 4
