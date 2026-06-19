# PG-CR005 PG 模式下存储上传必须配置 storage.objects RLS

- **Module**: postgresql
- **Severity**: error
- **Stage**: code-generation
- **适用于**: Web (PG / pgstore)

---

## 正则检查 (Lint)

`references/lint-rules/README.md` 中可选 lint 代码块的扫描条件：

- 检查项目中是否包含 `uploadFile` / `upload` / `storage` / 文件字段 URL 写入等关键词
- 如果存在上传逻辑，检查项目文件中是否包含 `ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY` 或 `CREATE POLICY.*ON storage.objects` 或 `authenticated_upload`
- 如果只有上传逻辑但没有 storage RLS 配置语句，触发 PG-CR005（error）

## LLM 检查

请人工或 LLM 审查以下问题：

1. 项目是否运行在 CloudBase PG / pgstore 环境？
2. 如果是，存储桶创建后是否配置了 `storage.objects` 表的 RLS 策略？
3. 存储 RLS 策略是否至少允许认证用户上传（`FOR INSERT TO authenticated WITH CHECK (auth.role() = 'authenticated')`）和读取（`FOR SELECT TO authenticated USING (auth.role() = 'authenticated')`）？
4. 配置方式是否正确使用了 `managePgDatabase(action="execute", confirm=true)` 执行 SQL？不要使用 CloudBase 传统安全规则 API（`managePermissions` / `ModifyStorageSafeRule`），那是 NoSQL 环境用的。
5. 如果上传失败（`STORAGE_PERMISSION_DENIED`），是否检查了 storage RLS 配置？

## 修复指引

通过 `managePgDatabase(action="execute", confirm=true)` 执行以下 SQL：

```sql
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');
```

详细指引见 `cloud-storage-web/SKILL.md` "Post-bucket: storage RLS" 章节。

## 根因

PG / pgstore 模式下，存储权限通过 PostgreSQL RLS 在 `storage.objects` 表上控制（类似 Supabase Storage），**不是** CloudBase 传统 NoSQL 安全规则。默认 RLS 为 deny all，上传前必须配置允许策略，否则浏览器端 `app.uploadFile()` 会返回 `STORAGE_PERMISSION_DENIED`。Agent 通常只配置了数据库业务表（articles/user_roles）的 RLS，不知道存储桶也需要配置。
