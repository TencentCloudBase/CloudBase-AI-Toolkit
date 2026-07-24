# CloudBase PG Storage

PG storage stores file metadata in PostgreSQL `storage` schema and enforces permissions through RLS.

> ⚠️ **PG 存储 ≠ 旧 COS 存储**：PG 环境的存储使用 pgstore + HTTP API，与旧 NoSQL 环境的 COS 存储是两套独立系统。以下情况请改用 `manageStorage`：非 PG 环境。

## Decision Tree: Which Storage to Use

```mermaid
flowchart TD
    A[当前环境是 PG 模式？] -->|是| B[使用 pgstore]
    A -->|否| C[使用旧 COS / NoSQL 存储]
    
    B --> B1{需要做什么？}
    B1 -->|创建 bucket| B2[INSERT INTO storage.buckets<br>或 HTTP API POST /v1/storages/bucket/]
    B1 -->|上传文件| B3[前端 SDK: app.storage.from().upload()<br>或 HTTP API]
    B1 -->|下载/签名| B4[HTTP API POST /v1/storages/object/sign/]
    B1 -->|查询文件| B5[HTTP API / storage.objects 表查询]
    B1 -->|配置权限| B6[ALTER TABLE storage.objects ENABLE RLS<br>CREATE POLICY ...]
    
    C --> C1{需要做什么？}
    C1 -->|上传/下载| C2[manageStorage / queryStorage 工具]
    C1 -->|查询| C3[queryStorage 工具]
```

**核心规则：**
- PG 环境 → 用 `queryPgStorage`（规划方案） +  HTTP API / 前端 SDK（执行）
- 旧 COS 环境 → 用 `manageStorage` / `queryStorage`（直接执行）

## Model

- `storage.buckets`: one row per bucket.
- `storage.objects`: one row per object.
- File bytes live in object storage, but metadata and permissions are coordinated through Storage API + PostgreSQL.
- `storage.buckets` / `storage.objects` are granted to `anon`, `authenticated`, and `service_role`; RLS is the effective permission gate.
- Traditional storage permission labels (`READONLY` / `PRIVATE` / `CUSTOM`) and JSON storage safe rules do not apply to PG storage.

## How Supabase Does Storage (Reference)

Supabase 和 CloudBase PG storage 的设计理念高度一致，可以对照理解：

| Concept | Supabase | CloudBase PG |
|---------|----------|-------------|
| **Schema** | `storage.buckets` / `storage.objects` | 相同（内置 pgstore schema） |
| **Anonymous access** | `anon` key (public, safe for client) | `anon` key（即 publishable key） |
| **Server access** | `service_role` key (secret, bypass RLS) | API Key（`manageAppAuth(action="createApiKey")`） |
| **User auth** | User JWT from `supabase.auth.signIn()` | User JWT from `auth.signInWithPassword()` 等 |
| **RLS** | `CREATE POLICY ... ON storage.objects` | 相同 |
| **Bucket creation** | `supabase.storage.createBucket()` | `INSERT INTO storage.buckets` 或 HTTP API |
| **Upload** | `supabase.storage.from('b').upload()` | `app.storage.from('b').upload()` |
| **Signed URL** | `createSignedUrl()` | HTTP API `POST /v1/storages/object/sign/` |

## JWT Token Acquisition for PG Storage API

PG Storage HTTP API 需要 Bearer JWT 认证。以下是三种角色对应的 token 获取方式：

### 1. service_role（服务端、旁路 RLS）

用于后端脚本、管理任务。对应 Supabase 的 `service_role` key。

```mermaid
flowchart LR
    A[manageAppAuth<br>action=createApiKey] -->|返回| B[API Key (token)]
    B --> C[Authorization: Bearer {token}]
    C --> D[调用 PG Storage HTTP API<br>旁路 RLS, 全权限]
```

**获取方式：**
```
manageAppAuth(action="createApiKey", name="my-server-key", description="服务端存储用")
```

返回的 `token` 就是 `service_role` 级别的凭据。

### 2. authenticated（已登录用户、受 RLS 约束）

用户通过前端登录后获取 JWT，用于浏览器端上传。

**前端登录：**
```js
// Web SDK
import { CloudBase } from '@cloudbase/js-sdk';
const app = CloudBase.init({ env: 'your-env-id' });
await app.auth.signInWithPassword({ username, password });
// 登录后 app 自动携带 JWT
await app.storage.from('covers').upload('a.png', file);
```

**手动获取 JWT token：**
```js
const token = await app.auth.getAuthHeader();
// token 形如 { 'x-cloudbase-uid': 'xxx', 'Authorization': 'Bearer xxx' }
```

### 3. anon（匿名、受 RLS 约束）

不需要携带 Authorization 头，或使用 anon key。只能访问 `public` bucket 且 RLS 放行的资源。

**获取 anon key（即 publishable key）：**
```
manageAppAuth(action="ensurePublishableKey")
```

返回的 `token` 即为 anon key，可安全暴露给客户端。

### Supabase 对照

```
Supabase                              CloudBase PG
────────────────────────────────────────────────────
Dashboard > Settings > API            manageAppAuth(action="createApiKey")
  → anon key (public)                   → publishable key (anon)
  → service_role key (secret)           → API Key (service_role)
supabase.auth.signIn()                 app.auth.signInWithPassword()
  → user JWT                             → user JWT
```

## Full HTTP API Reference

PG Storage 提供完整的 RESTful API，共 21 个端点，通过 OpenAPI 规范管理。

**Base URL:** `https://{envId}.api.tcloudbasegateway.com`

**Auth:** `Authorization: Bearer <token>` (service_role / user JWT / anon key)

### How to Query the API Spec

AI 助手可以通过以下方式获取完整 API 文档：

```
searchKnowledgeBase(mode="openapi", apiName="storage")
```

或直接查看文档：
- OpenAPI YAML: `https://docs.cloudbase.net/openapi/storage.v1.postgres.openapi.yaml`
- 文档首页: `https://docs.cloudbase.net/http-api/storage-pg/pg-storage-api`

### Endpoint Summary

| Category | Method | Endpoint | Description |
|----------|--------|----------|-------------|
| **Bucket** | POST | `/v1/storages/bucket/` | Create bucket |
| | GET | `/v1/storages/bucket/` | List buckets |
| | GET | `/v1/storages/bucket/{id}` | Get bucket info |
| | PUT | `/v1/storages/bucket/{id}` | Update bucket |
| | DELETE | `/v1/storages/bucket/{id}` | Delete bucket (must be empty) |
| **Object** | POST | `/v1/storages/object/{bucket}/{name}` | Upload |
| | PUT | `/v1/storages/object/{bucket}/{name}` | Upsert |
| | GET | `/v1/storages/object/{bucket}/{name}` | Download |
| | HEAD | `/v1/storages/object/{bucket}/{name}` | Object headers |
| | DELETE | `/v1/storages/object/{bucket}/{name}` | Delete single |
| | DELETE | `/v1/storages/object/{bucket}` | Delete batch (max 100) |
| | POST | `/v1/storages/object/list/{bucket}` | List objects |
| | POST | `/v1/storages/object/copy` | Copy object |
| | POST | `/v1/storages/object/move` | Move object |
| | GET | `/v1/storages/object/info/{bucket}/{name}` | Object metadata |
| **Signed URL** | POST | `/v1/storages/object/sign/{bucket}/{name}` | Signed download URL (single) |
| | POST | `/v1/storages/object/sign/{bucket}` | Signed download URL (batch, max 500) |
| | POST | `/v1/storages/object/upload/sign/{bucket}/{name}` | Signed upload URL |
| | GET | `/v1/storages/object/sign/{bucket}/{name}` | Download via signed URL |
| | HEAD | `/v1/storages/object/sign/{bucket}/{name}` | Head via signed URL |
| | PUT | `/v1/storages/object/upload/sign/{bucket}/{name}` | Upload via signed URL |

## Bucket and key semantics

Use bucket-native SDK semantics:

```ts
const { data, error } = await app.storage
  .from('covers')      // bucket id
  .upload('a.png', file); // object key inside the bucket
```

Do not repeat the bucket in the key:

```ts
// Wrong in PG mode
await app.storage.from('covers').upload('covers/a.png', file);
```

Do not use legacy NoSQL storage APIs for PG storage:

```ts
// Wrong for PG storage
await app.uploadFile({ cloudPath: 'covers/a.png', filePath: file });
await app.getTempFileURL({ fileList: [...] });
await app.storage.from().upload('covers/a.png', file);
```

## Bucket creation

The browser SDK cannot create buckets. Create the PG storage bucket **before** writing upload code.

### `storage.buckets` schema

| Column | Type | Description |
|--------|------|-------------|
| `id` | `text` | Bucket ID (primary key), e.g. `avatars` |
| `name` | `text` | Bucket display name (≤ 100 chars) |
| `public` | `boolean` | Whether public read is allowed (default `false`). Does **not** bypass RLS. |
| `file_size_limit` | `bigint` | Max file size in bytes |
| `allowed_mime_types` | `text[]` | Allowed MIME types whitelist |
| `owner_id` | `text` | Creator user ID |

### Via MCP tool (recommended for AI agents)

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', false, 5 * 1024 * 1024, ARRAY['image/png', 'image/jpeg', 'image/webp']);
```

Call via `managePgDatabase(action="execute", confirm=true, sql="...")`.

### Via HTTP API (service_role only)

```bash
curl -X POST "https://{envId}.api.tcloudbasegateway.com/v1/storages/bucket/" \
  -H "Authorization: Bearer {service_role_token}" \
  -H "Content-Type: application/json" \
  -d '{"name": "avatars", "public": false, "file_size_limit": 5242880, "allowed_mime_types": ["image/png", "image/jpeg"]}'
```

### Via queryPgStorage (get executable example)

```
queryPgStorage(action="createBucket", bucket="avatars")
```

Returns a complete plan with SQL, HTTP API curl, and SDK code examples.

### Via CloudBase CLI

```bash
tcb db execute -e <envId> --sql "INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types) VALUES ('avatars', 'avatars', false, 5 * 1024 * 1024, ARRAY['image/png', 'image/jpeg', 'image/webp']);"
```

### Post-creation: configure RLS (mandatory)

After creating the bucket, configure RLS on `storage.objects` — see "Storage RLS" section below.
The default RLS is deny all; without permissive policies the browser receives `STORAGE_PERMISSION_DENIED`.

The legacy NoSQL bucket returned by `EnvInfo.Storages[]` is not a PG storage bucket.

## Storage RLS

After bucket creation, configure RLS on `storage.objects` for the intended role and bucket.

The default RLS is deny all. Use `storage.foldername(name)` to extract the first path segment (usually the user ID) and compare with `auth.uid()`.

Example: per-user isolation for bucket `avatars` (object path: `<uid>/filename.png`):

```sql
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow each authenticated user to read their own files
CREATE POLICY avatars_select_own ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid());

-- Allow each authenticated user to upload to their own directory
CREATE POLICY avatars_insert_own ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid());

-- Allow each authenticated user to update their own files
CREATE POLICY avatars_update_own ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid())
  WITH CHECK (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid());

-- Allow each authenticated user to delete their own files
CREATE POLICY avatars_delete_own ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND (storage.foldername(name))[1] = auth.uid());
```

Key points:
- `storage.foldername(name)` is a built-in helper that splits `'<uid>/avatar.png'` into `{'<uid>'}`.
- `auth.uid()` returns the current JWT `sub`.
- `storage.objects` does **not** need extra `GRANT` — `anon`/`authenticated`/`service_role` already have `ALL`; RLS is the only gate.
- Do **not** `DELETE FROM storage.objects` directly — a `protect_delete` trigger blocks it. Use SDK / Storage API.
- For simpler authenticated-only access (not per-user), replace `(storage.foldername(name))[1] = auth.uid()` with `auth.role() = 'authenticated'`.

## Typical Pattern: Upload + Register Metadata

这是你在 CRM 等业务中需要完整遵循的「三步走」模式（对应 Supabase 的 storage + 业务表分离模式）：

```
1. 创建 bucket（仅一次）
   managePgDatabase(action="execute", confirm=true, sql="INSERT INTO storage.buckets ...")

2. 前端或后端上传文件
   // 前端 SDK
   await app.storage.from('crm').upload('contracts/2026/renewal.pdf', file);
   
3. 在业务表中记录文件元信息
   INSERT INTO crm_attachments (customer_id, file_name, file_size, mime_type, storage_path, category)
   VALUES (1, 'renewal.pdf', 102400, 'application/pdf', 'contracts/2026/renewal.pdf', 'contract');
```

注意：Supabase 的 `storage.objects` 表自带元信息记录，CloudBase PG storage 也有 `storage.objects` 表。如果你的需求只是「上传文件 + 按 bucket 列表查询」，可以直接查 `storage.objects` 表。只有当需要自定义业务元信息（如 `customer_id`, `category`）时，才需要额外建业务关联表。

## Failure signals

- `STORAGE_BUCKET_NOT_FOUND`: bucket does not exist in PG storage.
- `STORAGE_PERMISSION_DENIED`: bucket exists but storage RLS denies the request.
- `PUT https://undefined/`: usually a downstream symptom after the upstream storage metadata/signing response did not include an upload URL; inspect the failed Storage API response first.
