# 需求文档

## 介绍

当前云开发平台只提供了数据模型的读取操作（通过 `manageDataModel` 工具），缺少数据模型的创建和更新能力。同时，现有的数据模型管理无法满足AI Agent通过自然语言描述快速生成符合业务需求的数据模型的场景。

为了提升开发效率，需要新增AI驱动的数据模型建模和创建功能，让AI Agent能够根据业务描述生成Mermaid格式的ER图，并基于该图表创建真实的MySQL数据模型。这样可以利用MySQL的强大数据类型支持，提供更专业的数据建模能力。

## 需求

### 需求 1 - AI数据模型建模规则配置

**用户故事：** 作为AI Agent，我希望有一套完整的数据建模规则和最佳实践指导，以便能够根据用户的业务需求生成高质量的Mermaid ER图表。

#### 验收标准

1. When AI Agent收到数据建模需求时，the 系统 shall 提供完整的Mermaid ER图语法规范
2. When AI Agent进行数据建模时，the 系统 shall 提供MySQL数据类型映射指导
3. When AI Agent设计数据模型时，the 系统 shall 提供关联关系建模最佳实践
4. When AI Agent生成数据模型时，the 系统 shall 提供业务场景到数据结构的转换指导
5. When AI Agent处理复杂业务时，the 系统 shall 提供数据库设计规范和约束建议

### 需求 2 - 数据模型创建和更新工具

**用户故事：** 作为开发者，我希望能够通过Mermaid ER图描述来创建和更新云开发数据模型，以便快速实现业务数据结构的落地。

#### 验收标准

1. When 提供Mermaid ER图描述时，the 系统 shall 解析图表并创建对应的MySQL数据模型
2. When 创建数据模型时，the 系统 shall 支持可选的发布参数控制模型状态
3. When 数据模型已存在时，the 系统 shall 支持基于Mermaid描述的增量更新
4. When 创建过程出现错误时，the 系统 shall 提供详细的错误信息和建议
5. When 创建任务异步执行时，the 系统 shall 提供任务状态查询能力

### 需求 3 - 数据模型Mermaid导出增强

**用户故事：** 作为开发者，我希望在查询数据模型详情时能够获得Mermaid格式的ER图，以便可视化理解数据结构和关联关系。

#### 验收标准

1. When 调用 `manageDataModel` 的 `get` 方法时，the 系统 shall 支持返回Mermaid格式的ER图
2. When 数据模型包含关联关系时，the 系统 shall 在Mermaid图中正确表示关联
3. When 数据模型包含复杂字段类型时，the 系统 shall 在Mermaid图中准确映射字段类型
4. When JSON Schema转换失败时，the 系统 shall 提供错误信息但不影响其他字段显示
5. When 导出的Mermaid图表时，the 系统 shall 保持与创建时使用的格式一致性

### 需求 4 - 工具数量优化

**用户故事：** 作为系统管理员，我希望保持MCP工具总数在合理范围内，避免工具过多影响AI Agent的选择效率。

#### 验收标准

1. When 添加新的数据模型创建工具时，the 系统 shall 移除不常用的 `distribution` 工具
2. When 工具总数统计时，the 系统 shall 确保总数不超过40个工具
3. When 移除工具时，the 系统 shall 不影响现有功能的正常使用
4. When 工具调整后，the 系统 shall 保持所有核心数据库操作功能完整
5. When 文档更新时，the 系统 shall 同步更新工具列表和使用说明

### 需求 5 - 配置和索引管理

**用户故事：** 作为AI系统，我希望数据建模规则能够被正确索引和引用，以便在合适的场景下自动应用这些规则。

#### 验收标准

1. When 数据建模规则创建时，the 系统 shall 将规则文件放置在 `config/rules/` 目录中
2. When 规则文件创建后，the 系统 shall 在 `config/.cursor/rules/cloudbase-rules.mdc` 中添加索引
3. When AI Agent进行数据建模时，the 系统 shall 能够自动读取并应用相关规则
4. When 规则更新时，the 系统 shall 保持索引的同步更新
5. When 多个规则文件存在时，the 系统 shall 避免规则冲突和重复应用 