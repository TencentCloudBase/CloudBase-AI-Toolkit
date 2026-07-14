# CloudBase PG Storage

PG storage stores file metadata in PostgreSQL `storage` schema and enforces permissions through RLS.

## Model

- `storage.buckets`: one row per bucket.
- `storage.objects`: one row per object.
- File bytes live in object storage, but metadata and permissions are coordinated through Storage API + PostgreSQL.
- `storage.buckets` / `storage.objects` are granted to `anon`, `authenticated`, and `service_role`; RLS is the effective permission gate.
- Traditional storage permission labels (`READONLY` / `PRIVATE` / `CUSTOM`) and JSON storage safe rules do not apply to PG storage.

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

## Failure signals

- `STORAGE_BUCKET_NOT_FOUND`: bucket does not exist in PG storage.
- `STORAGE_PERMISSION_DENIED`: bucket exists but storage RLS denies the request.
- `PUT https://undefined/`: usually a downstream symptom after the upstream storage metadata/signing response did not include an upload URL; inspect the failed Storage API response first.
