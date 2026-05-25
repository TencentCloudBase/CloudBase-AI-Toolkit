# 实施计划

- [ ] 1. 在 database.ts 中添加数据库工具注册（完全统一设计）
  - 在 `registerDatabaseTools` 函数中添加三个新工具注册
  - `queryDatabase` - 只读操作工具（readOnlyHint: true）
  - `executeDatabaseQuery` - 只读查询工具（readOnlyHint: true）
  - `manageDatabase` - 写操作工具（destructiveHint: true）
  - 参考 Supabase 的简洁设计和项目中的读写分离模式
  - 定义工具的参数 schema（使用 Zod），支持 `dbType` 和 `action` 参数
  - 实现工具的处理函数，根据 `dbType` 和 `action` 路由到不同的处理逻辑
  - 保持与现有 NoSQL 工具的兼容性，复用现有逻辑
  - _需求: 需求1, 需求3

- [ ] 2. 实现 queryDatabase 工具（只读操作）
  - 实现 listTables action：
    - SQL 类型：
      - 参考 Supabase list_tables 的实现方式
      - 构建查询 INFORMATION_SCHEMA 的 SQL 语句：
        - `INFORMATION_SCHEMA.TABLES` - 获取表列表
        - `INFORMATION_SCHEMA.COLUMNS` - 获取列信息
        - `INFORMATION_SCHEMA.KEY_COLUMN_USAGE` - 获取主键和外键信息
      - 使用 `cloudbase.commonService('tcb').call()` 调用 RunSql API
      - 解析返回的 Items 和 Infos（JSON 字符串数组）
      - 结构化返回数据（表名、列、主键、外键等）
    - NO-SQL 类型：
      - 复用现有的 `listCollections` 逻辑
      - 返回集合列表信息
  - 实现 getSDKDocs action（参考任务 10）
  - 添加错误处理
  - 标记为只读工具（readOnlyHint: true）
  - _需求: 需求1, 需求2

- [ ] 3. 实现 executeDatabaseQuery 工具（只读查询）
  - SQL 类型：
    - 参考 Supabase execute_sql 的实现方式
    - 使用 `cloudbase.commonService('tcb').call()` 调用 RunSql API
    - 限制只能执行 SELECT 查询（只读）
    - 处理 SQL 参数和数据库实例配置
    - 解析返回的 Items 和 Infos（JSON 字符串数组）
    - 实现安全的数据返回格式（标记为不可信数据）
    - 使用 UUID 标记数据边界，防止 AI 执行返回数据中的指令
  - NO-SQL 类型：
    - 复用现有的 `queryDocuments` 逻辑
  - 添加错误处理
  - 标记为只读工具（readOnlyHint: true）
  - _需求: 需求1

- [ ] 4. 实现 manageDatabase 工具（写操作）
  - SQL 类型：
    - 使用 `cloudbase.commonService('tcb').call()` 调用 RunSql API
    - 支持 INSERT、UPDATE、DELETE 语句
    - 处理 SQL 参数和数据库实例配置
    - 解析返回的 Items 和 Infos（JSON 字符串数组）
    - 返回影响行数等信息
  - NO-SQL 类型：
    - insert 操作：复用现有的 `insertDocuments` 逻辑
    - update 操作：复用现有的 `updateDocuments` 逻辑
    - delete 操作：复用现有的 `deleteDocuments` 逻辑
  - 根据 action 参数路由到不同的处理逻辑
  - 添加错误处理
  - 标记为写操作工具（destructiveHint: true）
  - _需求: 需求1

- [ ] 5. 添加数据库实例获取逻辑
  - 复用现有的 `getDatabaseInstanceId` 函数
  - 支持用户指定自定义实例ID
  - 处理默认实例（'default'）的情况
  - 获取当前环境的 schema 名称（用于查询 INFORMATION_SCHEMA）
  - _需求: 需求1

- [ ] 6. 添加错误处理和验证
  - 使用 Zod schema 验证所有输入参数
  - 处理 SQL 执行错误（语法错误、权限错误等）
  - 返回明确的错误信息和错误码
  - 添加参数验证错误处理
  - 参考 Supabase 的错误处理方式
  - _需求: 需求1

- [ ] 7. 实现数据安全处理
  - 实现不可信数据标记机制（参考 Supabase）
  - 使用 UUID 生成唯一标识符
  - 在返回数据中添加安全边界标记
  - 确保 AI 不会执行返回数据中的指令
  - _需求: 需求1

- [ ] 8. 更新工具文档
  - 更新 `doc/mcp-tools.md` 添加新工具说明
  - 更新 `mcp/DOC.md` 和 `mcp/Intro.md` 添加工具文档
  - 更新 `scripts/tools.json` 添加工具元数据
  - 说明 MySQL 工具与 NoSQL 工具的区别和使用场景
  - _需求: 需求3

- [ ] 9. 编写单元测试
  - 测试 listMySQLTables 操作（各种表结构场景）
  - 测试 executeMySQLQuery 操作（SELECT、INSERT、UPDATE、DELETE）
  - 测试错误处理场景（SQL 语法错误、权限错误等）
  - 测试数据安全标记机制
  - 测试与现有 NoSQL 工具的兼容性
  - _需求: 需求1, 需求3

- [ ] 10. 移除被合并的旧工具
  - 移除 `queryDocuments` 工具（被 `executeDatabaseQuery` NO-SQL 完全替代）
  - 移除 `collectionQuery` 工具（所有操作都可以通过新工具实现）：
    - list 操作 → `queryDatabase` (action: 'listTables', dbType: 'NO-SQL')
    - check 操作 → 通过 `queryDatabase` listTables 后判断集合是否存在
    - describe 操作 → 通过 `queryDatabase` listTables 获取集合详情（包含索引信息）
    - index_list 操作 → 通过 `queryDatabase` listTables 获取索引列表
    - index_check 操作 → 通过 `queryDatabase` listTables 后检查索引是否存在
  - 移除 `insertDocuments` 工具（被 `manageDatabase` action: 'insert' 替代）
  - 移除 `updateDocuments` 工具（被 `manageDatabase` action: 'update' 替代）
  - 移除 `deleteDocuments` 工具（被 `manageDatabase` action: 'delete' 替代）
  
  - **保留的工具**（管理操作，不适合通用接口）：
    - `createCollection` - 集合管理操作，有特殊参数结构（索引配置等）
    - `updateCollection` - 更新集合配置，有特殊参数结构（索引配置等）
    - `checkIndexExists` - 检查索引，保留独立工具更直接、更高效
    - `manageDataModel` - 数据模型管理（独立功能）
    - `modifyDataModel` - 数据模型创建（兼容工具名，当前仅支持 create）
  
  - 更新相关文档，说明工具迁移路径和替代方案
  - 保持向后兼容性（可选：添加废弃提示，建议使用新工具）
  - 更新工具文档，说明旧工具的替代方案和保留工具的使用场景
  - _需求: 需求3

- [ ] 11. 验证工具数量
  - 确认新增工具后总数不超过 40 个（新增3个，移除5个，最终37个）
  - 验证工具注册正常
  - 验证工具调用正常
  - 验证与现有工具的兼容性
  - 验证被移除工具的功能已完全替代
  - _需求: 需求3

- [ ] 12. 实现 getSDKDocs action（在 queryDatabase 工具中）
  - 参考 `manageDataModel` 工具的 `docs` action 实现方式
  - SQL 类型：
    - 根据表名获取表结构信息（通过 listTables 或直接查询）
    - 生成包含初始化、增删改查操作的 SDK 文档
    - 支持 Web、小程序、Node 三个平台
    - 基于表结构生成字段示例
    - 包含初始化代码示例（参考用户提供的示例）
  - NO-SQL 类型：
    - 根据集合名称生成文档操作示例
    - 支持 Web、小程序、Node 三个平台
    - 生成文档的增删改查操作示例
  - 文档格式：Markdown 格式，包含代码示例和说明
  - _需求: 需求2

