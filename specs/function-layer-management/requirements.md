# 需求文档

## 介绍

在 CloudBase MCP 的 `functions` 插件中新增云函数层管理能力，基于 `@cloudbase/manager-node` 实现，采用与现有 `NoSQL`、`SQL`、`CloudRun`、`functions` 一致的工具设计风格，保持读写分离、通过 `action` 区分子能力，并控制工具数量不过度膨胀。本次范围包含层本身的查询与版本管理，以及函数与层之间的绑定、解绑和顺序调整能力；下载能力仅提供层版本下载地址与元信息，不包含下载到本地文件系统。同时，层配置需要被视为函数配置的一部分，新能力必须与现有函数管理工具形成一致的使用路径。

## 需求

### 需求 1 - 提供只读的层查询工具

**用户故事：** 作为开发者，我希望通过一个只读工具查询云函数层、层版本、层版本详情、函数当前绑定的层和层下载信息，以便快速了解当前环境中的层资源状态。

#### 验收标准

1. When 用户调用层查询工具时，the 系统 shall 提供独立的只读工具 `readFunctionLayers`，并通过 `action` 区分不同查询能力。
2. When 用户查询层列表时，the `readFunctionLayers` 工具 shall 支持返回层列表，并支持常见筛选参数，如分页、运行时和搜索关键字。
3. When 用户查询某个层的版本列表时，the `readFunctionLayers` 工具 shall 支持按层名称返回版本列表。
4. When 用户查询某个层版本详情时，the `readFunctionLayers` 工具 shall 支持按层名称和版本号返回版本详细信息。
5. When 用户查询函数当前绑定的层时，the `readFunctionLayers` 工具 shall 支持按函数名称返回当前绑定的层列表及其顺序信息。
6. When 用户查询层下载信息时，the `readFunctionLayers` 工具 shall 返回 manager sdk 可获取的下载地址和相关元信息，而不是将文件下载到本地。

### 需求 2 - 提供写入的层管理工具

**用户故事：** 作为开发者，我希望通过一个写操作工具完成层版本创建、删除以及函数层绑定管理，以便在不增加大量离散工具的情况下完成完整的层管理流程。

#### 验收标准

1. When 用户执行层写操作时，the 系统 shall 提供独立的写工具 `writeFunctionLayers`，并通过 `action` 区分不同管理能力。
2. When 用户创建层版本时，the `writeFunctionLayers` 工具 shall 支持基于本地目录或压缩包路径创建新的层版本，并返回创建结果。
3. When 用户删除层版本时，the `writeFunctionLayers` 工具 shall 支持按层名称和版本号删除指定层版本。
4. When 用户为函数绑定层时，the `writeFunctionLayers` 工具 shall 支持将一个或多个层版本绑定到指定函数，并明确顺序语义。
5. When 用户调整函数绑定层的顺序时，the `writeFunctionLayers` 工具 shall 支持通过显式传入目标层数组完成顺序更新。
6. When 用户解绑函数层时，the `writeFunctionLayers` 工具 shall 支持删除指定绑定层，或通过更新后的目标层数组实现解绑结果。
7. While 执行函数层绑定相关操作时，the 系统 shall 基于函数当前配置进行安全更新，避免误覆盖与层无关的重要函数配置。

### 需求 3 - 使用 manager sdk 并保持设计规范

**用户故事：** 作为维护者，我希望新的层管理能力严格基于 manager sdk，并与现有 MCP 工具风格一致，以便降低维护成本并保持接口可预期。

#### 验收标准

1. While 实现层管理能力时，the 系统 shall 使用 `@cloudbase/manager-node` 提供的层相关接口和云函数配置接口完成核心逻辑。
2. While 设计工具接口时，the 系统 shall 采用“读写分离 + action 区分”的模式，而不是为每个操作单独新增一个工具。
3. While 新增层管理能力时，the 系统 shall 将新增工具数量控制在 2 个，即 `readFunctionLayers` 与 `writeFunctionLayers`。
4. While 设计 schema、描述、注解和返回结构时，the 系统 shall 参考现有 `queryCloudRun/manageCloudRun`、`readNoSqlDatabaseStructure/writeNoSqlDatabaseStructure` 和 `functions.ts` 中现有工具的模式。
5. When 用户传入不完整或不合法参数时，the 系统 shall 返回清晰的参数错误提示，并指出必填字段或可选 action。

### 需求 4 - 与现有函数管理能力保持一致

**用户故事：** 作为开发者，我希望层配置既能作为独立资源管理，也能在函数管理语境下保持一致认知，以便符合 CLI 和 manager sdk 的使用习惯。

#### 验收标准

1. When 用户查看函数详情时，the 系统 shall 能在函数相关查询结果中看到当前函数绑定的层信息。
2. When 用户创建新函数时，the 系统 shall 保持现有函数创建能力对 `layers` 配置的兼容支持，不因新增层工具而削弱已有能力。
3. When 用户修改已存在函数的层配置时，the 系统 shall 通过专门的层管理工具完成更新，并与函数当前配置保持一致。
4. While 设计层管理方案时，the 系统 shall 参考 CLI 与 manager sdk 中“层资源管理 + 函数层配置”并存的模式，而不是割裂成两套互不关联的心智模型。

### 需求 5 - 提供完整测试覆盖

**用户故事：** 作为维护者，我希望新能力具备完整测试，确保工具注册、schema、action 路由和关键调用路径稳定可用。

#### 验收标准

1. When 构建并运行测试时，the 系统 shall 覆盖 `readFunctionLayers` 和 `writeFunctionLayers` 在 MCP 服务中的注册结果。
2. When 校验工具定义时，the 测试 shall 覆盖工具 schema 中的关键字段、action 枚举值和 annotations 配置。
3. When 调用工具时，the 测试 shall 覆盖主要 action 的参数校验和基础调用路径，至少包括层列表查询、层版本详情查询、层版本创建、层版本删除和函数层绑定更新。
4. While 进行集成测试时，the 测试 shall 通过 MCP client 的 `listTools` 和 `callTool` 验证新增工具可被发现并可被调用。
5. When 新能力合入后，the 测试 shall 不破坏现有 `functions` 插件和整体工具注册行为。

### 需求 6 - 保持文档和工具元数据完整

**用户故事：** 作为使用者，我希望新增的层管理工具能够出现在工具文档和工具规格中，以便在 IDE 和文档中被正确发现和理解。

#### 验收标准

1. When 新增层管理工具后，the 系统 shall 能将工具元数据正确纳入工具规格生成流程。
2. When 生成工具文档时，the 文档 shall 包含 `readFunctionLayers` 和 `writeFunctionLayers` 的用途与输入说明。
3. While 描述下载相关能力时，the 文档 shall 明确说明当前仅返回下载地址和元信息，不包含下载到本地文件系统。
