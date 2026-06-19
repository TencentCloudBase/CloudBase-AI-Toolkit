# 设计评审 - 工具设计清晰度分析

## 当前设计的问题

### 1. 不一致性
- **SQL 数据库**：查询和写操作都用 `executeDatabaseQuery`（统一）
- **NO-SQL 数据库**：查询用 `executeDatabaseQuery`，但写操作用独立的 `insertDocuments`、`updateDocuments`、`deleteDocuments`（不一致）

### 2. 用户困惑点
- 用户说"列出数据库表"时，不知道用哪个工具
- SQL 和 NO-SQL 的操作方式不一致，学习成本高
- 查询统一了，但写操作没有统一

### 3. 工具职责不清
- `executeDatabaseQuery` 既用于查询，又用于写操作（SQL）
- NO-SQL 的写操作有独立工具，但 SQL 的写操作没有

## 更清晰的设计方案

### 方案 A：完全统一（推荐）

**设计思路**：所有数据库操作（SQL 和 NO-SQL）都通过统一接口

**工具设计**：
1. `queryDatabase` - 只读操作
   - `action: 'listTables'` - 列出表/集合
   - `action: 'getSDKDocs'` - 获取 SDK 文档
   - 支持 SQL 和 NO-SQL

2. `executeDatabaseQuery` - 执行查询（只读查询）
   - SQL: `query: 'SELECT ...'`
   - NO-SQL: `query: {...}` (查询条件对象)
   - 标记为只读：`readOnlyHint: true`

3. `manageDatabase` - 数据操作（写操作）
   - `action: 'insert' | 'update' | 'delete'`
   - SQL: `query: 'INSERT/UPDATE/DELETE ...'`
   - NO-SQL: 
     - insert: `documents: [...]`
     - update: `query: {...}, update: {...}`
     - delete: `query: {...}`

**优势**：
- 完全统一，SQL 和 NO-SQL 操作方式一致
- 职责清晰：查询 vs 写操作
- 用户学习成本低

**劣势**：
- `manageDatabase` 的参数结构可能较复杂（需要支持 SQL 和 NO-SQL 的不同参数）

### 方案 B：保持现状但优化

**设计思路**：查询统一，写操作保留独立工具，但明确说明原因

**工具设计**：
- 保持当前设计
- 但明确文档说明：
  - SQL 写操作：通过 `executeDatabaseQuery` 执行 SQL 语句（因为 SQL 本身就是统一的语言）
  - NO-SQL 写操作：使用独立工具（因为参数结构特殊，不适合通用接口）

**优势**：
- 实现简单，改动小
- SQL 写操作已经统一（通过 SQL 语句）

**劣势**：
- 仍然存在不一致性
- 用户需要理解两种不同的操作方式

### 方案 C：SQL 和 NO-SQL 完全分开

**设计思路**：SQL 和 NO-SQL 使用不同的工具集

**工具设计**：
- SQL 工具：`querySQL`, `executeSQL`
- NO-SQL 工具：保留现有的 `queryDocuments`, `insertDocuments` 等

**优势**：
- 职责非常清晰
- 每种数据库类型有专门工具

**劣势**：
- 失去统一性
- 工具数量增加
- 用户说"列出数据库表"时，需要明确指定类型

## 推荐方案

**推荐采用方案 A（完全统一）**，原因：
1. 用户体验最好：统一的操作方式
2. 职责清晰：查询 vs 写操作
3. 易于扩展：未来支持 PostgreSQL 等数据库时，只需扩展 `dbType`

**实现要点**：
- `manageDatabase` 工具需要支持 SQL 和 NO-SQL 的不同参数结构
- 可以通过 `action` 参数区分操作类型
- SQL 操作通过 `query` 参数传递 SQL 语句
- NO-SQL 操作通过专门的参数（`documents`, `query`, `update` 等）


