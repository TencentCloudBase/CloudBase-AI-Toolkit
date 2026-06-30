---
name: cloud-storage-web
description: Complete guide for CloudBase cloud storage using Web SDK (@cloudbase/js-sdk) - upload, download, temporary URLs, file management, and best practices.
version: 2.23.6
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloud-storage-web/SKILL.md`

Keep local `references/...` paths for files that ship with the current skill directory. When this file points to a sibling skill such as `auth-tool` or `web-development`, use the standalone fallback URL shown next to that reference.

# Cloud Storage Web SDK

## Activation Contract

### Use this first when

- A browser or Web app must upload, download, or manage CloudBase storage objects through `@cloudbase/js-sdk`.
- The request mentions `uploadFile`, `getTempFileURL`, `deleteFile`, or `downloadFile` in frontend code.

### Read before writing code if

- The task is browser-side storage work but you still need to separate it from Mini Program storage, backend storage management, or static hosting deployment.
- The request may be blocked by security domains or frontend auth.

### Then also read

- Web login and identity -> `../auth-web/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-web/SKILL.md`)
- General Web app setup -> `../web-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/web-development/SKILL.md`)
- Direct storage management through MCP tools -> `../cloudbase-platform/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloudbase-platform/SKILL.md`)

### Do NOT use for

- Mini Program file APIs.
- Backend or agent-side direct storage management through MCP.
- Static website hosting deployment via `manageHosting(action="upload")`.
- Database operations.

### Common mistakes / gotchas

- Uploading from browser code without configuring security domains.
- Using this skill for static hosting instead of storage objects.
- Mixing browser SDK upload flows with server-side file-management tasks.
- Assuming temporary download URLs are permanent links.
- Ignoring `STORAGE_NOT_EXIST`; it means the target storage bucket/resource is not ready, not that the browser upload code should fabricate a URL.
- On local Vite or dev-server tasks, forgetting to whitelist the exact current browser `host:port` before testing `app.uploadFile()`.
- Treating CloudBase PG / `pgstore` like the legacy NoSQL CloudBase storage. PG environments use a separate `pgstore` backend whose buckets are NOT auto-created from your old NoSQL bucket. If `pgstore` has no bucket, every upload returns `STORAGE_BUCKET_NOT_FOUND` and the SDK then issues `PUT https://undefined/` (visible in DevTools as `net::ERR_NAME_NOT_RESOLVED`). Treat bucket existence as a hard prerequisite, just like Supabase: in Supabase Storage every upload must target an already-created bucket; CloudBase PG follows the same model.

### Minimal checklist

- Confirm the caller is a browser/Web app.
- Initialize the Web SDK once.
- Confirm CloudBase storage exists in the current environment before testing upload. Use available MCP management/query tools to inspect or create/select the storage bucket when the environment has no default bucket. **In a PG / pgstore environment, the legacy NoSQL bucket from `DescribeEnvs` does NOT count as a usable pgstore bucket; create one explicitly before any browser upload. The legacy NoSQL bucket itself is still fine for legacy `app.uploadFile()` flows that already target it — PG and NoSQL storage coexist; this skill applies to BOTH.**
- Check security-domain/CORS requirements.
- Pick the right storage method before coding.

### Local dev recipe

When the app runs on a local browser origin and must upload files from the frontend:

1. Use `envQuery` with `action="domains"` to inspect the current security-domain whitelist.
2. Convert the browser origin into the CloudBase whitelist entry format:
   - Browser origin `http://127.0.0.1:4173` -> whitelist entry `127.0.0.1:4173`
   - Browser origin `http://localhost:5173` -> whitelist entry `localhost:5173`
3. If the exact current host entry is missing, call `envDomainManagement` with `action="create"` and add that host entry before relying on `app.uploadFile()`.
4. If the runtime port may change between runs, do not assume any fixed default port list is sufficient. Re-check the actual browser origin you are really using for testing or final validation, then add that exact `host:port`.
5. Tell the user that security-domain changes may take several minutes to propagate.
6. Only after that should you implement and test browser-side `app.uploadFile()` flows.

If `app.uploadFile()` returns `STORAGE_NOT_EXIST`, stop editing frontend code and fix the environment-side storage resource first. Re-check the environment storage list, create or select an available bucket if the task allows it, then retry the same SDK upload flow.

If the task uses browser-side file upload, treat this as a prerequisite rather than an optional cleanup.

### Bucket existence prerequisite (mandatory before any upload code)

Just like Supabase Storage, CloudBase Storage requires the target bucket to exist before any client-side upload. This is true for both legacy CloudBase NoSQL storage (`STORAGE_NOT_EXIST`) and the newer PG / `pgstore` backend (`STORAGE_BUCKET_NOT_FOUND`).

Mental model parity with Supabase:

| Step | Supabase | CloudBase |
| ---- | -------- | --------- |
| Create bucket | `supabase.storage.createBucket('covers', { public: true })` (admin-side, with service role) | In PG mode, create a `storage.buckets` bucket through PG storage HTTP API / CLI / console / SQL on `storage.buckets` when appropriate. The browser SDK cannot create one. |
| Upload | `supabase.storage.from('covers').upload('a.png', file)` | **PG 模式**: `app.storage.from('covers').upload('a.png', file)` — `from(bucketName)` 指定 pgstore 存储桶。<br>**非 PG 模式**: `app.storage.from().upload('covers/a.png', file)` — bucket 名作为路径第一段。|
| Bucket missing error | `Bucket not found` | Browser sees `STORAGE_BUCKET_NOT_FOUND` (PG) or `STORAGE_NOT_EXIST` (NoSQL), then a follow-up `PUT https://undefined/` because the SDK still tries to PUT a missing `metadata.url`. |

Required pre-upload steps in any task that needs browser uploads:

1. List existing buckets first. For PG / pgstore, the legacy NoSQL bucket (the `6d63-…-1409864723` shape returned by `DescribeEnvs.Storages[]`) is NOT a valid pgstore bucket — do not assume it works.
2. If no usable bucket exists for the upload target (e.g. `covers`), create one through the PG storage management surface BEFORE editing frontend upload code. Adding `covers` as a path prefix in code does not auto-create a bucket.
3. After creating the bucket, the upload pattern depends on environment:
   - **PG / pgstore**: `app.storage.from('covers').upload('<file>', file)` — bucket 名传入 `from()`
   - **Non-PG (NoSQL)**: `app.storage.from().upload('covers/<file>', file)` — bucket 名作为路径第一段
4. If you see `net::ERR_NAME_NOT_RESOLVED` going to `https://undefined/` in DevTools, that is the SDK reacting to a missing `metadata.url` field — almost always because the bucket does not exist or the SDK request was rejected upstream. Inspect the failed `POST .../v1/storages/get-objects-upload-info` response in DevTools first; the `code` field (e.g. `STORAGE_BUCKET_NOT_FOUND`, `STORAGE_CONTENT_LENGTH_REQUIRED`, `INVALID_PARAM`) tells you exactly what to fix.

Do not silently swallow upload failures. If `uploadCoverImage()` rejects, the parent `createArticle()` MUST also reject — never proceed to `db.from(...).insert(...)` with a fabricated URL or a placeholder, and never let the UI show a success toast.

### ⚠️ PG mode upload: use `app.storage.from('bucket')`, NOT `app.uploadFile()`

In PG / pgstore environments, use `app.storage.from('covers').upload(key, file)` for uploads and `app.storage.from('covers').createSignedUrl(path, expiresIn)` for getting access URLs.

Do NOT use the legacy NoSQL APIs in PG mode:
- ❌ `app.uploadFile()` — 这是旧 NoSQL 的上传 API
- ❌ `app.getTempFileURL()` — 这是旧 NoSQL 的获取 URL 方式
- ❌ `app.storage.from().upload('covers/file', file)` — 没有传 bucket 名

Use instead:
- ✅ `app.storage.from('covers').upload('file', file)` — PG 模式上传
- ✅ `app.storage.from('covers').createSignedUrl('file', 3600)` — 获取签名 URL（返回 `fullSignedURL` 字段）

### Post-bucket: storage RLS (mandatory in PG / pgstore environments)

In **PG / pgstore** environments, storage access control is enforced through **PostgreSQL Row Level Security (RLS) on `storage.buckets` / `storage.objects`** — exactly like Supabase Storage. These tables are already granted to `anon`, `authenticated`, and `service_role`; RLS is the permission gate. Traditional storage permission labels (`READONLY` / `PRIVATE` / `CUSTOM`) and JSON storage safe rules do not apply. The default RLS policy is deny all, so even if the bucket exists, `app.storage.from('covers').upload()` from a browser will fail with `STORAGE_PERMISSION_DENIED` unless you configure policies.

Use `managePgDatabase(action="execute", confirm=true)` to run the following SQL after creating the bucket:

```sql
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to upload files
CREATE POLICY "authenticated_upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to read/download files
CREATE POLICY "authenticated_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

-- Optional: allow users to update/delete their own files
CREATE POLICY "users_manage_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);
```

Key points:
- `storage.objects` RLS is **separate** from CloudBase legacy NoSQL storage security rules (`managePermissions` / `ModifyStorageSafeRule`). In PG mode, always configure storage RLS via PG SQL, not the legacy security rule API.
- Without these policies, the browser receives `STORAGE_PERMISSION_DENIED` when calling `app.storage.from('covers').upload()` in PG mode.
- Use `IF NOT EXISTS` in a `DO $$` block when re-applying to avoid "policy already exists" errors on re-run.

## Overview

Use this skill for **browser-side cloud storage operations** through the CloudBase Web SDK.

Typical tasks:

- upload files from a browser
- generate temporary download URLs
- delete files
- trigger browser downloads

## SDK initialization

```javascript
import cloudbase from "@cloudbase/js-sdk";

const app = cloudbase.init({
  env: "your-env-id"
});
```

Initialization rules:

- Use synchronous initialization with a shared app instance.
- Do not re-initialize in every component.
- If the operation depends on user identity, handle auth before storage operations.

## Method routing

- Upload from browser -> `app.uploadFile()`
- Temporary preview/download URL -> `app.getTempFileURL()`
- Delete existing files -> `app.deleteFile()`
- Trigger browser download -> `app.downloadFile()`

## Upload

```javascript
const result = await app.uploadFile({
  cloudPath: "uploads/avatar.jpg",
  filePath: selectedFile
});
```

### Upload rules

- `cloudPath` must include the filename.
- Use `/` to create folder structure.
- **In a CloudBase PG / pgstore environment**, the `from(bucketName)` argument is used as the bucket name (e.g. `from('covers')`), and `upload(key, file)` takes a key without bucket prefix. The bucket must already exist. Same model as Supabase Storage — never upload into a not-yet-created bucket.
- Validate file type and size before upload.
- Show upload progress for larger files when UX matters.
- On local dev origins, confirm the exact frontend origin already exists in environment security domains before assuming the upload path is usable.
- Match against the whitelist entry format returned by `envQuery(action="domains")`, which is typically `host:port` instead of a full `http://...` URL.
- If the environment has no storage bucket or the SDK returns `STORAGE_NOT_EXIST` / `STORAGE_BUCKET_NOT_FOUND`, use CloudBase management/MCP storage tools to create or choose a bucket before retrying. Do not treat this as a successful optional upload.
- After `app.uploadFile()` succeeds, do **not** fabricate a public-looking URL by concatenating `envId`, bucket domain, or `cloudPath`. Use the returned `fileID` with `app.getTempFileURL()` and store or display the SDK-resolved URL instead.

### Progress example

```javascript
await app.uploadFile({
  cloudPath: "uploads/avatar.jpg",
  filePath: selectedFile,
  onUploadProgress: ({ loaded, total }) => {
    const percent = Math.round((loaded * 100) / total);
    console.log(percent);
  }
});
```

## Temporary URLs

```javascript
const result = await app.getTempFileURL({
  fileList: [
    {
      fileID: "cloud://env-id/uploads/avatar.jpg",
      maxAge: 3600
    }
  ]
});
```

Use temp URLs when the browser needs to preview or download private files without exposing a permanent public link.

Typical upload + preview flow:

```javascript
const uploadResult = await app.uploadFile({
  cloudPath: "uploads/avatar.jpg",
  filePath: selectedFile
});

const tempUrlResult = await app.getTempFileURL({
  fileList: [{ fileID: uploadResult.fileID, maxAge: 3600 }]
});

const previewUrl = tempUrlResult.fileList?.[0]?.tempFileURL || tempUrlResult.fileList?.[0]?.download_url;
if (!previewUrl) {
  throw new Error("Failed to resolve temporary file URL after upload");
}
```

## Delete files

```javascript
await app.deleteFile({
  fileList: ["cloud://env-id/uploads/old-avatar.jpg"]
});
```

Always inspect per-file results before assuming deletion succeeded.

## Download files

```javascript
await app.downloadFile({
  fileID: "cloud://env-id/uploads/report.pdf"
});
```

Use this for browser-initiated downloads. For programmatic rendering or preview, prefer `getTempFileURL()`.

## Security-domain reminder

To avoid CORS problems, add your frontend domain in CloudBase security domains. In MCP-enabled workflows, prefer checking and updating this through tools before coding browser uploads.

```json
{ "tool": "envQuery", "action": "domains" }
```

Use the actual browser origin when deciding what to add. If the page is running on a custom domain or a local dev port, add that exact `host:port` value instead of guessing from a hard-coded list.

```json
{
  "tool": "envDomainManagement",
  "action": "create",
  "domains": ["<actual-browser-host>:<actual-browser-port>"]
}
```

Match the real browser origin to the whitelist entry format returned by `envQuery(action="domains")`. For local Vite and preview servers, the port can vary between runs, so avoid assuming any fixed default port is sufficient.

Typical examples:

- `<your-local-host>:<actual-port>`
- `<your-custom-domain>`

## Best practices

1. Use a clear folder structure such as `uploads/`, `avatars/`, `documents/`.
2. Validate file size and type in the browser before upload.
3. Use temporary URLs with reasonable expiration windows.
4. Clean up obsolete files instead of leaving orphaned storage objects.
5. Route privileged batch-management tasks to backend or MCP flows instead of browser direct access.

## Error handling

```javascript
try {
  const result = await app.uploadFile({
    cloudPath: "uploads/file.jpg",
    filePath: selectedFile
  });
  console.log(result.fileID);
} catch (error) {
  console.error("Storage operation failed:", error);
}
```
