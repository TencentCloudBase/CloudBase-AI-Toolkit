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

The browser SDK cannot create buckets. Create/select the PG storage bucket before writing upload code, through PG storage HTTP API / CLI / console / SQL on `storage.buckets` when appropriate.

The legacy NoSQL bucket returned by `EnvInfo.Storages[]` is not a PG storage bucket.

## Storage RLS

After bucket creation, configure RLS on `storage.objects` for the intended role and bucket.

Example authenticated upload/read policy:

```sql
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE POLICY covers_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'covers' AND auth.role() = 'authenticated');

CREATE POLICY covers_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'covers' AND auth.role() = 'authenticated');
```

For owner-scoped files, use `owner_id = auth.uid()` or join against business tables only after verifying the schema columns.

## Failure signals

- `STORAGE_BUCKET_NOT_FOUND`: bucket does not exist in PG storage.
- `STORAGE_PERMISSION_DENIED`: bucket exists but storage RLS denies the request.
- `PUT https://undefined/`: usually a downstream symptom after the upstream storage metadata/signing response did not include an upload URL; inspect the failed Storage API response first.
