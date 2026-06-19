# PG-CR004 CloudBase PG 场景文件/图片上传推荐使用 Storage v3 API

- **Module**: postgresql (PG storage)
- **Severity**: mixed（`app.storage()` 为 error；旧式/非推荐上传 API 为 warning）
- **Stage**: code-generation
- **适用于**: Web + CloudBase PG 场景

---

## 正则检查 (Lint)

`references/lint-rules/README.md` 中可选 lint 代码块的扫描条件：

仅当项目使用 CloudBase PG（例如出现 `app.rdb()`、`.rdb()` 或 `db.from(...)`）时启用本规则：

- 如果代码中出现 `app.storage()`：记录 **error**。`app.storage` 是属性，不是函数。
- 如果 PG 场景上传逻辑中使用 `app.uploadFile(...)`：记录 **warning**。旧式顶层上传 API 不推荐用于 PG Web 文件/图片上传。
- 如果上传逻辑中出现 `storage.upload({ cloudPath, filePath })`：记录 **warning**。PG 场景推荐 Storage v3 的 `app.storage.from("bucket").upload("key", file)` 参数形态。

## LLM 检查

请人工或 LLM 审查以下问题：

1. 当前项目是否是 CloudBase PG Web 应用，并涉及文件/图片上传？
2. 上传实现是否优先使用 `app.storage.from("bucket").upload("key", file)`，并把 bucket 放在 `from()` 参数里？
3. 是否避免在 `upload(key, file)` 的 key 中重复 bucket 前缀？
4. 是否错误地把 `app.storage` 当函数调用为 `app.storage()`？
5. 是否使用了旧式 `app.uploadFile(...)`；如果使用，是否有明确理由且与当前 SDK/评测约束一致？
6. 上传返回结果是否被检查，失败时是否阻止文章继续保存？

## 修复指引

CloudBase PG Web 场景推荐使用以下模式：

```typescript
const storage = app.storage.from(bucketName)
const { data, error } = await storage.upload(path, file)

if (error) {
  throw new Error(error.message || "上传失败")
}
```

避免以下写法：

```typescript
// ❌ app.storage 不是函数
const storage = app.storage()

// ⚠️ PG Web 场景不推荐优先使用旧式顶层上传 API
await app.uploadFile({ cloudPath, filePath: file })

// ⚠️ 参数形态不符合推荐 Storage v3 API
await storage.upload({ cloudPath, filePath: file })
```

## 边界

这不是通用 CloudBase Storage 规则；它只适用于 CloudBase PG Web 这类需要在 PG 数据模型中关联文件/图片 URL 或 fileID 的场景。非 PG 场景是否使用其他 Storage API，应以对应 skill、SDK 文档和项目约束为准。

## 根因

CloudBase PG Web 场景中，文件/图片上传更适合走 Web Storage v3 API：`app.storage.from("bucket").upload("key", file)`，其中 bucket 必须放在 `from()` 参数中，`upload()` 的 key 不要重复 bucket 前缀。agent 容易从旧示例、顶层 storage API 或类型片段误推成 `app.storage()`、`app.uploadFile(...)` 或 `storage.upload({ cloudPath, filePath })`。其中 `app.storage()` 是确定性运行时错误；旧式 API 则不符合当前 PG 场景的推荐路径。
