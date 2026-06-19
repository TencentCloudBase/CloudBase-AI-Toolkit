# 实施计划

- [x] 1. 在 `functions.ts` 中搭建 layer 工具骨架
  - 在 `mcp/src/tools/functions.ts` 中新增 `readFunctionLayers` 与 `writeFunctionLayers` 两个工具注册
  - 定义读写工具各自的 Zod schema、action 枚举、输入类型和 annotations
  - 复用现有的 `getManager`、`logCloudBaseResult` 和 `functions` 分类
  - 保持代码风格与 `queryCloudRun/manageCloudRun`、`readNoSqlDatabaseStructure/writeNoSqlDatabaseStructure` 一致
  - _需求: 需求1, 需求2, 需求3_

- [x] 2. 实现 `readFunctionLayers` 的查询能力
  - 实现 `listLayers`，支持分页、运行时和搜索关键字
  - 实现 `listLayerVersions`，按层名称查询版本列表
  - 实现 `getLayerVersion`，返回版本详情以及下载地址/元信息
  - 实现 `getFunctionLayers`，从函数详情中提取并结构化返回 `Layers`
  - 为每个 action 补齐参数校验、错误提示和统一返回结构
  - _需求: 需求1, 需求3, 需求4_

- [x] 3. 实现 `writeFunctionLayers` 的版本管理能力
  - 实现 `createLayerVersion`，支持 `contentPath` 或 `base64Content` 输入
  - 实现 `deleteLayerVersion`，按层名称和版本号删除指定版本
  - 对创建和删除操作补齐参数校验与错误处理
  - 保留 manager sdk 返回中的关键字段，避免过度包装
  - _需求: 需求2, 需求3_

- [x] 4. 实现函数层绑定与顺序管理能力
  - 实现 `attachLayer`，基于 manager sdk 追加绑定函数层
  - 实现 `detachLayer`，基于 manager sdk 解绑指定层
  - 实现 `updateFunctionLayers`，通过显式目标数组完成排序调整和批量更新
  - 对函数不存在、层不存在、解绑目标不存在等场景提供清晰报错
  - 确保层管理路径与函数配置语义一致，符合 CLI / manager sdk 的使用习惯
  - _需求: 需求2, 需求4_

- [x] 5. 保持与现有函数工具的兼容关系
  - 确认 `createFunction` 现有 `layers` 输入能力保持可用
  - 确认 `getFunctionList(action="detail")` 仍可返回完整函数详情和 `Layers`
  - 评估是否需要对现有描述文字做最小补充，使用户理解“创建走 createFunction，后续层管理走新工具”
  - 避免把 layer 更新逻辑重复塞入 `updateFunctionConfig`
  - _需求: 需求4_

- [x] 6. 编写并补充测试
  - 新增 `tests/function-layer-tools.test.js`
  - 覆盖工具注册、schema、action 枚举、annotations 校验
  - 覆盖 `listTools` 与关键 `callTool` 路径验证
  - 覆盖关键参数缺失和非法输入的报错场景
  - 补充向后兼容断言，确保现有 `functions` 工具未被破坏
  - _需求: 需求5_

- [x] 7. 验证工具元数据与文档生成链路
  - 确认新增工具标题、描述和 schema 能正确进入工具规格生成流程
  - 执行工具规格与工具文档生成，检查 `scripts/tools.json` 和 `doc/mcp-tools.md` 结果
  - 明确文档中“仅返回下载地址，不下载到本地”的边界说明
  - _需求: 需求6_

- [x] 8. 执行构建与回归验证
  - 运行 `mcp` 构建与相关测试，修复编译或测试问题
  - 检查新增工具后的整体工具注册结果和数量变化
  - 验证 `functions` 插件在默认启用场景下工作正常
  - _需求: 需求1, 需求2, 需求3, 需求5, 需求6_
