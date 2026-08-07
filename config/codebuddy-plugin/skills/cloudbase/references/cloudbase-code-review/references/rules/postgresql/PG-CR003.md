# PG-CR003 PG Web 文件/图片上传需要 CloudBase 存储配置

- **Module**: postgresql
- **Severity**: warning
- **Stage**: code-generation
- **适用于**: Web

---

## 正则检查 (Lint)

`references/lint-rules/README.md` 中可选 lint 代码块的扫描条件：

- 检查项目中是否包含 `uploadFile` / `upload` / `storage` / 文件字段 URL 写入等关键词
- 如果存在上传逻辑，检查是否同时处理了：
  - 安全域名（`localhost`）
  - 存储初始化（`app.upload` / `cloudbase.upload`）
- 如果只有上传逻辑但没有安全域名和存储配置，触发 PG-CR003（仅 warning）

## LLM 检查

请人工或 LLM 审查以下问题：

1. 文件/图片上传用的是什么方式？
   - 浏览器直传到 CloudBase 存储？
   - 经过后端代理上传？
2. 如果使用浏览器直传，`localhost:5173`（Vite 默认端口）是否已加入安全域名？
3. 上传失败时是否有错误处理？是否会在 PG 记录创建/更新时静默失败但不提示用户？
4. 如果云存储尚未开通（`STORAGE_NOT_EXIST` 错误），是否先调用了存储相关 API 开通？
5. 上传后的 URL / fileID 是否正确写入对应 PG 记录字段？

## 修复指引

```typescript
// 1. 确保安全域名已配置（通过 MCP 或 CloudBase Console）
// 2. 检查存储是否已开通
// 3. 上传文件
// 具体上传 API 形态以当前 PG Web skill / SDK 文档为准
const result = await uploadFileOrImage(fileObject);
const uploadedUrlOrFileID = result.url || result.fileID;
```

## 根因

浏览器直传 CloudBase 存储需要：
1. 环境已开通存储资源
2. 当前访问 `host:port` 在安全域名白名单中
3. Vite 默认 `localhost:5173` 不在默认白名单中

agent 经常写了上传逻辑但忽略了安全域名配置，导致上传 403/跨域错误，而文章创建时又没做错误处理，让上传失败静默消失。
