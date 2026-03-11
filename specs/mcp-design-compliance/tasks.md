# 实施计划 - MCP 工具设计合规性改进

## 概述

本实施计划基于 MCP 工具设计审查报告，旨在将工具包的设计合规性从当前的 65/100 提升至 90/100 以上。

**总体时间估算**: 3-4 个月  
**优先级**: P0 (关键) → P1 (高) → P2 (中) → P3 (低)

---

## 阶段 0: 准备工作 (1-2 天)

- [ ] 0.1 创建重构分支
  - 创建 `refactor/mcp-design-compliance` 分支
  - 设置测试环境，确保所有测试通过
  - 建立代码质量基线（函数长度、any 使用次数等）
  - _需求: 所有需求_

- [ ] 0.2 建立质量基线
  - 运行现有测试套件，记录通过率
  - 统计当前命名模式分布
  - 统计当前返回格式分布
  - 统计 nextActions 覆盖率
  - 统计安全确认覆盖率
  - _需求: 所有需求_

---

## 阶段 1: P0 - 关键优先级 (1-2 周)

### 任务组 1.1: 标准化返回信封 (2-3 天)

- [ ] 1.1.1 创建响应构建工具
  - 创建 `mcp/src/utils/response-builder.ts`
  - 实现 `buildJsonToolResult()` 函数（如果不存在）
  - 定义标准返回类型 `ToolResult<T>`
  - 定义 `NextAction` 类型（包含 tool, params, reason, priority 字段）
  - 实现 `buildNextAction()` 辅助函数
  - 编写单元测试
  - _需求: 需求 2 - 返回格式标准化_

- [ ] 1.1.2 迁移 Storage 工具
  - 更新 `queryStorage` 使用标准返回格式
  - 更新 `manageStorage` 使用标准返回格式
  - 添加 `nextActions` 建议
  - 运行测试验证功能不变
  - _需求: 需求 2 - 返回格式标准化_

- [ ] 1.1.3 迁移 CloudRun 工具
  - 更新 `queryCloudRun` 使用标准返回格式
  - 更新 `manageCloudRun` 使用标准返回格式
  - 添加 `nextActions` 建议
  - 运行测试验证功能不变
  - _需求: 需求 2 - 返回格式标准化_

- [ ] 1.1.4 迁移 Function 工具
  - 更新 `getFunctionList` 使用标准返回格式
  - 更新 `createFunction` 使用标准返回格式
  - 更新 `updateFunctionCode` 使用标准返回格式
  - 更新 `updateFunctionConfig` 使用标准返回格式
  - 更新 `invokeFunction` 使用标准返回格式
  - 更新 `getFunctionLogs` 使用标准返回格式
  - 更新 `getFunctionLogDetail` 使用标准返回格式
  - 更新 `manageFunctionTriggers` 使用标准返回格式
  - 添加 `nextActions` 建议到所有工具
  - 运行测试验证功能不变
  - _需求: 需求 2 - 返回格式标准化_

- [ ] 1.1.5 迁移 Database 工具
  - 更新 `readNoSqlDatabaseStructure` 使用标准返回格式
  - 更新 `writeNoSqlDatabaseStructure` 使用标准返回格式
  - 更新 `readNoSqlDatabaseContent` 使用标准返回格式
  - 更新 `writeNoSqlDatabaseContent` 使用标准返回格式
  - 更新 `executeReadOnlySQL` 使用标准返回格式
  - 更新 `executeWriteSQL` 使用标准返回格式
  - 添加 `nextActions` 建议到所有工具
  - 运行测试验证功能不变
  - _需求: 需求 2 - 返回格式标准化_

- [ ] 1.1.6 迁移其他工具
  - 更新 `uploadFiles` (hosting) 使用标准返回格式
  - 更新 `manageDataModel` 使用标准返回格式
  - 更新 `modifyDataModel` 使用标准返回格式
  - 更新 `searchWeb` 使用标准返回格式
  - 更新 `searchKnowledgeBase` 使用标准返回格式
  - 更新 `readSecurityRule` 使用标准返回格式
  - 更新 `writeSecurityRule` 使用标准返回格式
  - 更新 `downloadTemplate` 使用标准返回格式
  - 更新 `downloadRemoteFile` 使用标准返回格式
  - 添加 `nextActions` 建议到所有工具
  - 运行测试验证功能不变
  - _需求: 需求 2 - 返回格式标准化_

- [ ] 1.1.7 验证和测试
  - 运行完整测试套件
  - 验证所有工具返回格式一致
  - 验证 nextActions 仅在必要时提供（避免过度推荐）
  - 更新文档
  - _需求: 需求 2 - 返回格式标准化_

### 任务组 1.2: 添加安全确认 (1 天)

- [ ] 1.2.1 审计破坏性操作
  - 列出所有破坏性操作（delete, drop, overwrite, reset 等）
  - 检查每个操作是否有确认标志
  - 记录缺失的确认标志
  - _需求: 需求 3 - 安全确认_

- [ ] 1.2.2 添加 SQL 安全确认
  - 在 `executeWriteSQL` 中添加 `confirm` 参数
  - 检测 DROP、DELETE、TRUNCATE 等危险操作
  - 要求 `confirm=true` 才能执行
  - 更新 schema 和描述
  - 编写测试验证
  - _需求: 需求 3 - 安全确认_

- [ ] 1.2.3 添加 Function 删除确认
  - 检查 function 工具中的删除操作
  - 添加 `confirm` 或 `force` 参数
  - 更新 schema 和描述
  - 编写测试验证
  - _需求: 需求 3 - 安全确认_

- [ ] 1.2.4 添加 Database 删除确认
  - 检查 database 工具中的删除操作
  - 添加 `confirm` 或 `force` 参数
  - 更新 schema 和描述
  - 编写测试验证
  - _需求: 需求 3 - 安全确认_

- [ ] 1.2.5 验证安全确认覆盖率
  - 运行测试套件
  - 验证所有破坏性操作都有确认标志
  - 更新文档
  - _需求: 需求 3 - 安全确认_

### 任务组 1.3: 文档化命名规范 (1 天)

- [ ] 1.3.1 创建命名规范文档
  - 创建 `specs/mcp-tool-naming-convention.md`
  - 定义生命周期资源命名规则
  - 定义声明式资源命名规则
  - 定义执行动作命名规则
  - 提供示例和反例
  - _需求: 需求 1 - 命名规范_

- [ ] 1.3.2 分类现有工具
  - 将所有工具分类为生命周期/声明式/执行动作
  - 记录每个工具的当前命名和推荐命名
  - 创建迁移计划
  - _需求: 需求 1 - 命名规范_

- [ ] 1.3.3 更新开发文档
  - 在 `CONTRIBUTING.md` 中添加命名规范引用
  - 更新工具开发指南
  - 添加命名检查清单
  - _需求: 需求 1 - 命名规范_

---

## 阶段 2: P1 - 高优先级 (2-4 周)

### 任务组 2.1: 重构 Function 工具 (3-5 天)

- [ ] 2.1.1 添加 view 参数支持
  - 在 `getFunctionList` 中添加 `view` 参数 (summary | detail)
  - 实现摘要视图（只返回关键字段）
  - 实现详情视图（返回完整信息）
  - 更新 schema 和描述
  - 编写测试验证
  - _需求: 需求 4 - Function 工具优化_

- [ ] 2.1.2 添加 include 参数支持
  - 在 `getFunctionList` 中添加 `include` 参数
  - 支持选择性包含 layers、triggers、envVariables 等
  - 更新 schema 和描述
  - 编写测试验证
  - _需求: 需求 4 - Function 工具优化_

- [ ] 2.1.3 优化 createFunction 返回
  - 返回创建后的函数摘要
  - 添加 `nextActions` 建议（invoke, getLogs, getDetail）
  - 更新 schema 和描述
  - 编写测试验证
  - _需求: 需求 4 - Function 工具优化_

- [ ] 2.1.4 优化 updateFunctionCode 返回
  - 返回更新后的函数状态摘要
  - 添加 `nextActions` 建议（invoke, getLogs）
  - 更新 schema 和描述
  - 编写测试验证
  - _需求: 需求 4 - Function 工具优化_

- [ ] 2.1.5 优化 updateFunctionConfig 返回
  - 添加 `patchMode` 参数（明确是 merge 模式）
  - 添加 `returnView` 参数（summary | effective）
  - 返回更新后的有效配置摘要
  - 添加 `nextActions` 建议
  - 更新 schema 和描述
  - 编写测试验证
  - _需求: 需求 4 - Function 工具优化_

- [ ] 2.1.6 优化 getFunctionLogs 返回
  - 添加 `view` 参数（summary | detail）
  - 实现摘要视图（只返回关键字段）
  - 添加 `nextActions` 建议（getFunctionLogDetail）
  - 更新 schema 和描述
  - 编写测试验证
  - _需求: 需求 4 - Function 工具优化_

- [ ] 2.1.7 优化 manageFunctionTriggers 批量支持
  - 支持 `triggerNames` 数组（批量删除）
  - 返回逐项结果（成功/失败）
  - 添加 `nextActions` 建议
  - 更新 schema 和描述
  - 编写测试验证
  - _需求: 需求 4 - Function 工具优化_

- [ ] 2.1.8 更新 Function 工具文档
  - 更新 `doc/mcp-tools.md` 中的 function 工具说明
  - 添加使用示例
  - 更新 API 参考
  - _需求: 需求 4 - Function 工具优化_

### 任务组 2.2: 添加缺失的查询工具 (2-3 天)

- [ ] 2.2.1 创建 queryHosting 工具
  - 实现 `list` action（列出托管文件）
  - 实现 `info` action（获取文件信息）
  - 实现 `getDomain` action（获取域名配置）
  - 使用标准返回格式
  - 添加 `nextActions` 建议
  - 编写测试验证
  - _需求: 需求 5 - 添加查询工具_

- [ ] 2.2.2 创建 manageHosting 工具
  - 实现 `upload` action（上传文件）
  - 实现 `delete` action（删除文件，需要 force 确认）
  - 实现 `configureDomain` action（配置域名）
  - 使用标准返回格式
  - 添加 `nextActions` 建议
  - 编写测试验证
  - _需求: 需求 5 - 添加查询工具_

- [ ] 2.2.3 迁移现有 uploadFiles 功能
  - 将 `uploadFiles` 标记为 deprecated
  - 引导用户使用 `manageHosting(action="upload")`
  - 保持向后兼容
  - 更新文档
  - _需求: 需求 5 - 添加查询工具_

- [ ] 2.2.4 创建 queryDataModel 工具
  - 实现 `list` action（列出数据模型）
  - 实现 `get` action（获取模型详情）
  - 实现 `getSchema` action（获取模型 schema）
  - 使用标准返回格式
  - 添加 `nextActions` 建议
  - 编写测试验证
  - _需求: 需求 5 - 添加查询工具_

- [ ] 2.2.5 合并 modifyDataModel 到 manageDataModel
  - 将 `modifyDataModel` 的功能合并到 `manageDataModel`
  - 添加 `create` 和 `update` action
  - 标记 `modifyDataModel` 为 deprecated
  - 保持向后兼容
  - 更新文档
  - _需求: 需求 5 - 添加查询工具_

- [ ] 2.2.6 拆分 envDomainManagement
  - 创建 `queryEnvDomains` 工具（只读操作）
  - 创建 `manageEnvDomains` 工具（写操作）
  - 迁移现有功能
  - 标记 `envDomainManagement` 为 deprecated
  - 保持向后兼容
  - 更新文档
  - _需求: 需求 5 - 添加查询工具_

### 任务组 2.3: 重构 setup.ts (2-3 天)

- [ ] 2.3.1 创建模块化结构
  - 创建 `mcp/src/tools/setup/` 目录
  - 创建 `download.ts`（下载逻辑）
  - 创建 `extract.ts`（解压逻辑）
  - 创建 `filter.ts`（过滤逻辑）
  - 创建 `copy.ts`（复制逻辑）
  - 创建 `types.ts`（类型定义）
  - 创建 `constants.ts`（常量定义）
  - _需求: 需求 6 - 重构 setup.ts_

- [ ] 2.3.2 提取下载逻辑
  - 将下载相关代码移到 `download.ts`
  - 导出 `downloadTemplateArchive()` 函数
  - 编写单元测试
  - _需求: 需求 6 - 重构 setup.ts_

- [ ] 2.3.3 提取解压逻辑
  - 将解压相关代码移到 `extract.ts`
  - 导出 `extractArchive()` 函数
  - 编写单元测试
  - _需求: 需求 6 - 重构 setup.ts_

- [ ] 2.3.4 提取过滤逻辑
  - 将 IDE 过滤相关代码移到 `filter.ts`
  - 导出 `filterFilesByIDE()` 函数
  - 编写单元测试
  - _需求: 需求 6 - 重构 setup.ts_

- [ ] 2.3.5 提取复制逻辑
  - 将文件复制相关代码移到 `copy.ts`
  - 导出 `copyFiles()` 函数
  - 编写单元测试
  - _需求: 需求 6 - 重构 setup.ts_

- [ ] 2.3.6 重构主函数
  - 更新 `setup/index.ts` 使用提取的函数
  - 确保主函数 < 100 行
  - 使用标准返回格式
  - 添加 `nextActions` 建议
  - 运行测试验证功能不变
  - _需求: 需求 6 - 重构 setup.ts_

- [ ] 2.3.7 更新测试
  - 更新现有测试适配新结构
  - 添加新的单元测试
  - 验证覆盖率 > 80%
  - _需求: 需求 6 - 重构 setup.ts_

---

## 阶段 3: P2 - 中优先级 (1-2 月)

### 任务组 3.1: 统一数据库工具返回 (1-2 天)

- [ ] 3.1.1 标准化 NoSQL 工具返回
  - 确保所有 NoSQL 工具使用标准返回格式
  - 添加缺失的 `nextActions`
  - 更新文档
  - _需求: 需求 2 - 返回格式标准化_

- [ ] 3.1.2 标准化 SQL 工具返回
  - 确保所有 SQL 工具使用标准返回格式
  - 添加缺失的 `nextActions`
  - 更新文档
  - _需求: 需求 2 - 返回格式标准化_

### 任务组 3.2: 优化 nextActions 推荐策略 (2-3 天)

- [ ] 3.2.1 审计 nextActions 使用情况
  - 检查所有工具的 `nextActions` 实现
  - 识别过度推荐的场景（简单查询、完整操作等）
  - 识别应该推荐但未推荐的场景（错误、异步操作等）
  - 创建优化计划
  - _需求: 需求 2 - 返回格式标准化_

- [ ] 3.2.2 移除不必要的 nextActions
  - 移除简单查询操作的 nextActions（如 list、get）
  - 移除完整独立操作的 nextActions（如 upload 成功）
  - 保留错误场景的 nextActions
  - 保留异步操作的 nextActions
  - 更新测试
  - _需求: 需求 2 - 返回格式标准化_

- [ ] 3.2.3 改进 searchKnowledgeBase 和文档推荐机制
  - 将 mode="doc" 改为 mode="skills"（更清晰地表达查询使用指南文档）
  - 确保 searchKnowledgeBase 返回文档后不提供 nextActions（让 AI 自行阅读）
  - 在其他工具中添加推荐 searchKnowledgeBase 的 nextActions
  - 参数缺失错误 → 推荐查阅相关 skills 文档
  - 需要确认的操作 → 推荐查阅文档理解原因 + 提供正确操作
  - 多选项场景 → 可选地推荐查阅文档了解详情
  - 更新测试
  - _需求: 需求 8 - 改进 searchKnowledgeBase_

- [ ] 3.2.4 改进错误场景 nextActions
  - 确保所有错误都提供诊断或修复建议
  - 添加认证错误的 auth 工具建议
  - 添加资源不存在的查询工具建议
  - 更新测试
  - _需求: 需求 2 - 返回格式标准化_

- [ ] 3.2.5 改进异步操作 nextActions
  - 在 CloudRun deploy 后建议查询状态
  - 在 Function create/update 后建议查询状态（如果是异步）
  - 在 DataModel import 后建议查询进度
  - 更新测试
  - _需求: 需求 2 - 返回格式标准化_

- [ ] 3.2.6 验证 nextActions 质量
  - 运行测试套件
  - 验证推荐的准确性和相关性
  - 验证没有过度推荐
  - 更新文档
  - _需求: 需求 2 - 返回格式标准化_

### 任务组 3.3: 改进工具描述 (1-2 天)

- [ ] 3.3.1 明确 action 边界
  - 审查所有工具的 action 描述
  - 明确每个 action 的职责范围
  - 更新 schema 描述
  - _需求: 需求 7 - 改进工具描述_

- [ ] 3.3.2 添加参数依赖说明
  - 在 schema 中明确参数依赖关系
  - 添加条件必填说明
  - 添加互斥参数说明
  - _需求: 需求 7 - 改进工具描述_

- [ ] 3.3.3 添加使用示例
  - 为复杂工具添加使用示例
  - 在 description 中包含常见用例
  - 更新文档
  - _需求: 需求 7 - 改进工具描述_

---

## 阶段 4: P3 - 低优先级 (持续进行)

### 任务组 4.1: 长期优化规划

- [ ] 4.1.1 评估工具合并可行性
  - 评估是否将所有生命周期资源迁移到 query/manage 模式
  - 评估是否提取日志到独立观测域
  - 评估是否合并执行动作到 manage
  - 创建长期迁移计划
  - _需求: 需求 8 - 长期优化_

- [ ] 4.1.2 性能优化
  - 分析工具响应时间
  - 优化慢查询
  - 优化大数据返回
  - _需求: 需求 8 - 长期优化_

- [ ] 4.1.3 文档完善
  - 完善所有工具的 API 文档
  - 添加最佳实践指南
  - 添加故障排查指南
  - _需求: 需求 8 - 长期优化_

---

## 验收标准

### 阶段 1 完成标准
- ✅ 所有工具使用标准返回格式（100%）
- ✅ nextActions 仅在必要时提供（无过度推荐）
- ✅ 所有破坏性操作有安全确认（100%）
- ✅ 命名规范文档完成并发布
- ✅ 所有测试通过

### 阶段 2 完成标准
- ✅ Function 工具支持 view/include 参数
- ✅ 所有缺失的查询工具已创建
- ✅ setup.ts 主函数 < 100 行
- ✅ 所有测试通过
- ✅ 文档更新完成

### 阶段 3 完成标准
- ✅ nextActions 推荐准确且相关（无过度推荐）
- ✅ searchKnowledgeBase 支持 skills 模式并推荐 skill 工具
- ✅ 所有工具描述清晰明确
- ✅ 参数依赖关系文档化
- ✅ 所有测试通过

### 最终验收标准
- ✅ 设计合规性评分 > 90/100
- ✅ 命名一致性 > 95%
- ✅ 返回格式一致性 = 100%
- ✅ nextActions 质量高（准确、相关、无过度推荐）
- ✅ 安全确认覆盖率 = 100%
- ✅ 所有测试通过
- ✅ 文档完整且准确


