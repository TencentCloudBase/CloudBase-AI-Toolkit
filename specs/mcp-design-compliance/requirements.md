# 需求文档 - MCP 工具设计合规性改进

## 介绍

CloudBase MCP 工具包当前存在设计不一致的问题，影响了 AI 的使用体验和代码的可维护性。本需求旨在通过标准化工具设计，提升整体质量和一致性。

**背景**：
- 当前设计合规性评分：65/100
- 主要问题：命名不一致、返回格式混乱、缺少安全确认、缺少 nextActions 指导
- 影响：AI 难以预测工具行为、响应解析困难、工作流效率低、安全风险

**目标**：
- 将设计合规性评分提升至 90/100 以上
- 建立统一的工具设计规范
- 提升 AI 人机工程学体验
- 降低维护成本

---

## 需求

### 需求 1 - 统一命名规范

**用户故事**：作为 AI Agent，我希望能够根据资源类型预测工具名称，以便快速找到正确的工具。

#### 验收标准

1. When 开发者创建新的生命周期资源工具时，the 系统 shall 使用 `query{Domain}` / `manage{Domain}` 命名模式。
2. When 开发者创建新的声明式资源工具时，the 系统 shall 使用 `read{Domain}` / `write{Domain}` 或 `query{Domain}` / `manage{Domain}` 命名模式。
3. When 开发者创建新的执行动作工具时，the 系统 shall 使用 `execute{Action}` 或 `invoke{Action}` 命名模式，或将其折叠到 `manage(action=...)` 中。
4. When 命名规范文档创建后，the 系统 shall 在 `specs/mcp-tool-naming-convention.md` 中提供清晰的命名指南和示例。
5. When 命名规范发布后，the 系统 shall 在开发文档中引用该规范，确保新工具遵循规范。
6. When 统计命名一致性时，the 系统 shall 达到 95% 以上的一致性。

---

### 需求 2 - 标准化返回格式

**用户故事**：作为 AI Agent，我希望所有工具返回统一的数据结构，以便可靠地解析响应，并在必要时获取包含核心参数的下一步建议。

#### 验收标准

1. When 任何工具返回结果时，the 系统 shall 使用标准返回信封格式：`{ success: boolean, data: T, message: string, nextActions?: Array<{tool, params?, reason, priority?}> }`。
2. When 工具执行成功时，the 系统 shall 设置 `success=true` 并在 `data` 字段中返回结果数据。
3. When 工具执行失败时，the 系统 shall 设置 `success=false` 并在 `message` 字段中提供清晰的错误信息。
4. When 工具完成操作后，the 系统 shall 仅在有明确必要的下一步时才提供 `nextActions` 建议。
5. When 提供 nextActions 时，the 系统 shall 在 `params` 字段中包含核心参数，使 AI 可以直接调用或填充占位符。
6. When 发生错误需要用户干预时，the 系统 shall 在 `nextActions` 中建议诊断工具或修复步骤，并提供相关参数。
7. When 操作需要验证或后续配置时，the 系统 shall 在 `nextActions` 中建议相关工具，并提供必要的上下文参数。
8. When 操作是完整的独立操作时，the 系统 shall 不提供 `nextActions`（避免过度推荐）。
9. When 统计返回格式一致性时，the 系统 shall 达到 100% 的一致性。
10. When 提供 nextActions 时，the 系统 shall 确保推荐的操作是上下文相关且有实际价值的，参数准确可用。

---

### 需求 3 - 添加安全确认机制

**用户故事**：作为系统管理员，我希望所有破坏性操作都需要明确确认，以防止意外的数据丢失或服务中断。

#### 验收标准

1. When 工具执行破坏性操作（delete, drop, truncate, overwrite, reset）时，the 系统 shall 要求 `confirm` 或 `force` 参数设置为 `true`。
2. When `confirm` 或 `force` 参数未提供或为 `false` 时，the 系统 shall 拒绝执行破坏性操作并返回错误信息。
3. When SQL 工具检测到 DROP、DELETE、TRUNCATE 等危险操作时，the 系统 shall 要求 `confirm=true` 才能执行。
4. When Function 工具执行删除操作时，the 系统 shall 要求 `confirm` 或 `force` 参数。
5. When Database 工具执行删除操作时，the 系统 shall 要求 `confirm` 或 `force` 参数。
6. When Storage 工具执行删除操作时，the 系统 shall 要求 `force` 参数（已实现）。
7. When CloudRun 工具执行删除操作时，the 系统 shall 要求确认参数（已实现）。
8. When 统计安全确认覆盖率时，the 系统 shall 达到 100% 的覆盖率。

---

### 需求 4 - 优化 Function 工具

**用户故事**：作为 AI Agent，我希望 Function 工具能够提供灵活的视图控制和批量操作支持，以提高效率并减少 token 消耗。

#### 验收标准

1. When 调用 `getFunctionList` 时，the 系统 shall 支持 `view` 参数（summary | detail），默认为 summary。
2. When `view=summary` 时，the 系统 shall 只返回关键字段（name, runtime, status, updateTime）。
3. When `view=detail` 时，the 系统 shall 返回完整的函数信息。
4. When 调用 `getFunctionList` 时，the 系统 shall 支持 `include` 参数，允许选择性包含 layers、triggers、envVariables 等。
5. When 调用 `createFunction` 后，the 系统 shall 返回创建后的函数摘要，并建议 invoke、getLogs、getDetail 等下一步操作。
6. When 调用 `updateFunctionCode` 后，the 系统 shall 返回更新后的函数状态摘要，并建议 invoke、getLogs 等下一步操作。
7. When 调用 `updateFunctionConfig` 时，the 系统 shall 支持 `patchMode` 参数（明确是 merge 模式）。
8. When 调用 `updateFunctionConfig` 时，the 系统 shall 支持 `returnView` 参数（summary | effective），返回更新后的有效配置摘要。
9. When 调用 `getFunctionLogs` 时，the 系统 shall 支持 `view` 参数（summary | detail）。
10. When 调用 `manageFunctionTriggers` 删除触发器时，the 系统 shall 支持 `triggerNames` 数组（批量删除）。
11. When 批量删除触发器时，the 系统 shall 返回逐项结果（成功/失败）。

---

### 需求 5 - 添加缺失的查询工具

**用户故事**：作为 AI Agent，我希望每个资源域都有对应的查询工具，以便在执行管理操作前先了解当前状态。

#### 验收标准

1. When 需要查询静态托管文件时，the 系统 shall 提供 `queryHosting` 工具。
2. When 调用 `queryHosting(action="list")` 时，the 系统 shall 返回托管文件列表。
3. When 调用 `queryHosting(action="info")` 时，the 系统 shall 返回指定文件的详细信息。
4. When 调用 `queryHosting(action="getDomain")` 时，the 系统 shall 返回域名配置信息。
5. When 需要管理静态托管时，the 系统 shall 提供 `manageHosting` 工具。
6. When 调用 `manageHosting(action="upload")` 时，the 系统 shall 上传文件到静态托管。
7. When 调用 `manageHosting(action="delete")` 时，the 系统 shall 删除指定文件（需要 force 确认）。
8. When 调用 `manageHosting(action="configureDomain")` 时，the 系统 shall 配置域名。
9. When 需要查询数据模型时，the 系统 shall 提供 `queryDataModel` 工具。
10. When 调用 `queryDataModel(action="list")` 时，the 系统 shall 返回数据模型列表。
11. When 调用 `queryDataModel(action="get")` 时，the 系统 shall 返回指定模型的详细信息。
12. When 调用 `queryDataModel(action="getSchema")` 时，the 系统 shall 返回模型的 schema 定义。
13. When `modifyDataModel` 的功能合并到 `manageDataModel` 后，the 系统 shall 标记 `modifyDataModel` 为 deprecated 并保持向后兼容。
14. When 需要查询环境域名时，the 系统 shall 提供 `queryEnvDomains` 工具（只读操作）。
15. When 需要管理环境域名时，the 系统 shall 提供 `manageEnvDomains` 工具（写操作）。
16. When `envDomainManagement` 拆分后，the 系统 shall 标记为 deprecated 并保持向后兼容。

---

### 需求 6 - 重构 setup.ts

**用户故事**：作为开发者，我希望 setup.ts 代码结构清晰、模块化，以便于理解、测试和维护。

#### 验收标准

1. When 重构 setup.ts 时，the 系统 shall 创建 `mcp/src/tools/setup/` 目录结构。
2. When 重构完成后，the 系统 shall 将下载逻辑提取到 `download.ts` 模块。
3. When 重构完成后，the 系统 shall 将解压逻辑提取到 `extract.ts` 模块。
4. When 重构完成后，the 系统 shall 将过滤逻辑提取到 `filter.ts` 模块。
5. When 重构完成后，the 系统 shall 将复制逻辑提取到 `copy.ts` 模块。
6. When 重构完成后，the 系统 shall 将类型定义提取到 `types.ts` 模块。
7. When 重构完成后，the 系统 shall 将常量定义提取到 `constants.ts` 模块。
8. When 重构完成后，the 主函数 shall 少于 100 行代码。
9. When 重构完成后，the 系统 shall 为每个提取的模块编写单元测试。
10. When 重构完成后，the 系统 shall 确保所有现有测试仍然通过。
11. When 重构完成后，the 系统 shall 确保测试覆盖率 > 80%。

---

### 需求 7 - 改进工具描述

**用户故事**：作为 AI Agent，我希望工具描述清晰明确，包含 action 边界、参数依赖和使用示例，以便正确使用工具。

#### 验收标准

1. When 工具包含多个 action 时，the 系统 shall 在描述中明确每个 action 的职责范围。
2. When 参数之间存在依赖关系时，the 系统 shall 在 schema 中明确说明。
3. When 参数为条件必填时，the 系统 shall 在描述中说明触发条件。
4. When 参数之间互斥时，the 系统 shall 在描述中明确说明。
5. When 工具较为复杂时，the 系统 shall 在描述中包含常见用例示例。
6. When 工具有特殊行为时，the 系统 shall 在描述中明确说明（如 merge 模式、批量操作等）。

---

### 需求 8 - 改进 searchKnowledgeBase 和文档推荐机制

**用户故事**：作为 AI Agent，我希望在遇到错误或需要指导时，其他工具能够推荐我查阅 searchKnowledgeBase 中的相关文档，并且 searchKnowledgeBase 的命名更加清晰易懂。

**说明**：
- CloudBase skills 文档（22 个固定文档）是使用指南，如 `cloud-functions`、`relational-database-tool`、`ai-model-nodejs` 等
- searchKnowledgeBase 本身返回文档后不推荐 nextActions（AI 自行阅读理解）
- 其他工具在遇到错误或需要指导时，应推荐 AI 查阅相关文档

#### 验收标准

1. When searchKnowledgeBase 的 mode 参数中的 "doc" 选项时，the 系统 shall 将其重命名为 "skills"，以更清晰地表达其用途（查询 CloudBase 使用指南文档）。
2. When 使用 mode="skills" 查询时，the 系统 shall 返回指定文档的完整内容。
3. When searchKnowledgeBase 成功返回文档时（skills/openapi/vector 模式），the 系统 shall 不提供 nextActions（让 AI 自行阅读理解文档）。
4. When 其他工具遇到参数缺失错误时，the 系统 shall 在 nextActions 中推荐查阅相关的 skills 文档。
5. When 其他工具遇到操作需要确认的情况时，the 系统 shall 在 nextActions 中推荐查阅相关文档以理解原因，并提供正确的操作方式。
6. When 其他工具返回多个选项供用户选择时，the 系统 shall 可选地在 nextActions 中推荐查阅相关文档以了解详情。
7. When 推荐 searchKnowledgeBase 时，the 系统 shall 在 params 中提供准确的 mode 和 skillName/apiName 参数。
8. When searchKnowledgeBase 返回结果时，the 系统 shall 使用标准返回格式。

---

### 需求 9 - 长期优化规划

**用户故事**：作为产品负责人，我希望有清晰的长期优化路线图，以持续改进工具包的质量和性能。

#### 验收标准

1. When 评估工具合并可行性时，the 系统 shall 分析是否将所有生命周期资源迁移到 query/manage 模式。
2. When 评估日志提取可行性时，the 系统 shall 分析是否将日志功能提取到独立的观测域。
3. When 评估执行动作合并可行性时，the 系统 shall 分析是否将执行动作合并到 manage 工具中。
4. When 长期规划完成后，the 系统 shall 创建详细的迁移计划文档。
5. When 进行性能优化时，the 系统 shall 分析工具响应时间并优化慢查询。
6. When 进行性能优化时，the 系统 shall 优化大数据返回，减少 token 消耗。
7. When 完善文档时，the 系统 shall 为所有工具提供完整的 API 文档。
8. When 完善文档时，the 系统 shall 提供最佳实践指南和故障排查指南。


