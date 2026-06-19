# PG-CR001 PG 表必须显式创建（CREATE TABLE）

- **Module**: postgresql
- **Severity**: error
- **Stage**: code-generation
- **适用于**: Web, CloudRun

---

## 正则检查 (Lint)

`references/lint-rules/README.md` 中可选 lint 代码块的扫描条件：

- 在项目所有 `.ts/.tsx/.js/.jsx` 文件中搜索 `db.from("表名")` 模式
- 如果发现 `db.from("articles")` 或 `db.from("posts")` 等调用
- 检查是否同时存在 `CREATE TABLE` / `createTable` / `executePgSql` / `manageSqlDatabase` 等建表操作
- 如果只有 `db.from()` 调用但没有建表操作，触发 PG-CR001

## LLM 检查

请人工或 LLM 审查以下问题：

1. 项目代码中使用了哪些 PG 表名（`db.from("xxx")`）？
2. 这些表是否已在 PG 中被创建？
3. 建表是通过什么方式完成的？
   - MCP 工具 `executePgSql` 或 `manageSqlDatabase`？
   - SQL 脚本？
   - ORM migration？
4. 表结构是否包含必要字段？
   - articles 表：`title`, `content`, `author_id`, `status`, `created_at`, `updated_at`
   - users 表：`id/uid`, `username`, `role`
5. 建表操作是否在实际 CRUD 调用**之前**执行？顺序对吗？

## 修复指引

通过 MCP 工具执行建表 SQL。对于 CloudBase PG 环境，使用 `managePgDatabase(action=execute, confirm=true)`；对于 MySQL 环境，使用 `manageSqlDatabase(action=executeSQL)`。

示例 SQL：```sql
CREATE TABLE IF NOT EXISTS public.articles (
  id BIGSERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT,
  cover_image TEXT,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  author_id TEXT NOT NULL,
  author_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

- 确保建表 SQL 在 CRUD 代码之前执行
- 如果已有 `db.from("users")` 调用但使用 CloudBase Auth 内置的 `auth.users` 表，可以不额外建表
- 业务角色扩展表（`user_roles` / `profiles` 等）仍需显式创建

## 根因

CloudBase PG 不会自动根据 `db.from("表名")` 建表。agent 写了 CRUD 代码但没有建表步骤，运行时所有查询都会返回 404。
