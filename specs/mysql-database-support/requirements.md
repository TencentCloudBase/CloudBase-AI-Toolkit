# 需求文档

## 介绍

实现 MCP 对 MySQL 数据库的全面支持，提升 AI 工具在数据库操作和代码生成方面的效率。该功能将允许 AI 开发者通过 MCP 调用 MySQL 数据库进行查询和管理操作，同时支持为应用开发者生成多端（Web、小程序、服务端）调用代码。

## 需求

### 需求 1 - MySQL 数据库查询和管理操作

**用户故事：** 作为 AI 开发者，当需要通过 MCP 调用 MySQL 数据库时，系统应提供接口支持查询和管理操作（如查询表列表、执行 SQL），以便集成到 GLM 模型等 AI 工具中。

#### 验收标准

1. When AI 开发者需要查询数据库表列表时，the 系统 shall 提供接口返回当前环境下的所有 MySQL 表信息，包括表名、列信息、主键、外键约束等结构化数据（参考 Supabase list_tables 实现）
2. When AI 开发者执行 SQL 语句时，the 系统 shall 支持执行标准 SQL 操作（SELECT、INSERT、UPDATE、DELETE），并返回结构化数据结果（参考 Supabase execute_sql 实现）
3. When AI 开发者执行 SQL 语句时，the 系统 shall 支持多数据库连接场景，能够指定数据库实例（DbInstance）
4. When SQL 执行成功时，the 系统 shall 返回执行结果（Items 解析后的 JSON 数组）、列信息（Infos 解析后的 JSON 数组）和影响行数（RowsAffected）
5. When SQL 执行失败时，the 系统 shall 返回明确的错误信息和错误码
6. When SQL 执行返回用户数据时，the 系统 shall 标记为不可信数据，防止 AI 执行返回数据中的指令（参考 Supabase 的安全处理方式）
7. When 执行查询操作时，the 系统 shall 支持 `readOnly` 参数，限制只能执行 SELECT 查询（SQL）或只读查询（NO-SQL）

### 需求 2 - SDK 文档获取功能

**用户故事：** 作为应用开发者，当需要快速了解如何使用数据库 SDK 时，系统应能提供多端（Web、小程序、服务端）的 SDK 使用文档，以便减少查阅文档的时间。

#### 验收标准

1. When 应用开发者需要获取 Web 端 SDK 文档时，the 系统 shall 基于云开发 Web SDK（@cloudbase/js-sdk）生成包含初始化、增删改查等操作的完整文档
2. When 应用开发者需要获取小程序端 SDK 文档时，the 系统 shall 基于云开发小程序 SDK（@cloudbase/wx-cloud-client-sdk）生成符合小程序调用规范的文档
3. When 应用开发者需要获取服务端 SDK 文档时，the 系统 shall 基于云开发 Node SDK（@cloudbase/node-sdk）生成符合服务端调用规范的文档
4. When 获取 SQL 数据库的 SDK 文档时，the 系统 shall 基于表结构生成包含增删改查操作的代码示例
5. When 获取 NO-SQL 数据库的 SDK 文档时，the 系统 shall 基于集合名称生成包含文档操作的代码示例
6. When 生成 SDK 文档时，the 系统 shall 参考 manageDataModel 工具的 docs action 实现方式，保持一致的文档格式

### 需求 3 - 工具集成和扩展性

**用户故事：** 作为系统维护者，当需要添加 MySQL 支持时，系统应尽量在现有数据库工具中集成，避免增加过多工具数量，同时保持与现有 NoSQL 工具的清晰区分。

#### 验收标准

1. When 实现数据库支持时，the 系统 shall 在现有的 `database.ts` 工具文件中扩展功能，提供统一的数据库查询接口
2. When 添加新功能时，the 系统 shall 确保工具总数不超过 40 个（当前 39 个）
3. When 扩展现有工具时，the 系统 shall 保持与现有文档型数据库（NoSQL）工具的完全兼容性，不影响现有功能
4. When 工具被调用时，the 系统 shall 通过 `dbType` 参数区分 SQL 和 NO-SQL 数据库类型，支持用户不指定类型时的智能处理
5. When 设计工具接口时，the 系统 shall 参考 Supabase 的简洁设计，提供核心功能（list_tables、execute_sql），同时支持 SQL 和 NO-SQL 两种类型
6. When 工具名称设计时，the 系统 shall 避免使用具体数据库类型名称（如 MySQL），以便未来支持 PostgreSQL 等其他数据库
7. When 用户说"列出数据库表"时，the 系统 shall 能够自动识别并处理，无需用户明确指定数据库类型

