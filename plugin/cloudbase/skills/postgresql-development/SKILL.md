---
name: postgresql-development-cloudbase
description: "Use when building, debugging, or evaluating CloudBase PostgreSQL / CloudBase PG / PG mode apps, including Postgres schema setup, queryPgDatabase/managePgDatabase, JS SDK v3 app.rdb() CRUD/RPC, PG HTTP API fallback, RLS-style permissions, username-password auth, and Web CMS/admin CRUD flows backed by CloudBase PG."
version: 2.23.8
alwaysApply: false
---

## Standalone Install Note

If this environment only installed the current skill, start from the CloudBase main entry and use the published `cloudbase/references/...` paths for sibling skills.

- CloudBase main entry: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/SKILL.md`
- Current skill raw source: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/postgresql-development/SKILL.md`

# CloudBase PostgreSQL Development

## Activation Contract

### Use this first when

- The task says CloudBase PG, PostgreSQL, Postgres, PG mode, RLS, JS SDK v3 PostgreSQL, `app.rdb()`, `queryPgDatabase`, or `managePgDatabase`.
- A Web app or CMS must persist business data in CloudBase PostgreSQL instead of NoSQL or MySQL.

### Then also read

- Web auth provider readiness -> `../auth-tool/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-tool/SKILL.md`)
- Web login implementation -> `../auth-web/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/auth-web/SKILL.md`)
- General Web implementation and verification -> `../web-development/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/web-development/SKILL.md`)
- Browser storage upload -> `../cloud-storage-web/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/cloud-storage-web/SKILL.md`)
- Raw HTTP API details only when SDK coverage is blocked -> `../http-api/SKILL.md` (standalone fallback: `https://cnb.cool/tencent/cloud/cloudbase/cloudbase-skills/-/git/raw/main/skills/cloudbase/references/http-api/SKILL.md`)
- PG reference index -> `references/index.md`
- PG mode overview -> `references/pg-mode-overview.md`
- Auth / GRANT / RLS details -> `references/auth-and-rls.md`
- End-to-end PG app closure -> `references/app-workflow.md`
- PG storage details -> `references/storage-pg.md`
- HTTP API fallback -> `references/http-api.md`
- Troubleshooting -> `references/troubleshooting.md`

### Do NOT use first

- `relational-database-tool` / `queryMysqlDatabase` / `manageMysqlDatabase`: those are MySQL-oriented.
- `no-sql-web-sdk` / collection APIs for business data that must live in CloudBase PG.

## Required Flow

### 🚨 CRITICAL: PG mode API is NOT the same as NoSQL

CloudBase PG (`app.rdb()`, `app.storage.from('bucket')`) uses **different API method names** than CloudBase NoSQL (`app.database()`, `app.uploadFile()`). Low-capability models often paste legacy NoSQL/auth snippets from training; reject that path immediately. If this task is PG-backed, **do not** write `app.database()`, `db.collection(...)`, `app.uploadFile()`, `getLoginState()`, or route guards based on `auth.getUser()`. Use `app.rdb()`, PG storage v3, and `auth.getSession()` instead. If you are used to writing `.where()`, `.orderBy()`, `.count()` from other ORMs or NoSQL — **stop and read the table below**.

| ❌ Do NOT use these (NoSQL / ORM habits) | ✅ Use these in PG mode |
|------------------------------------------|------------------------|
| `.where({ field: value })` | `.match({ field: value })` or `.eq("field", value)` |
| `.where("field", "ilike", "%v%")` | `.ilike("field", "%v%")` |
| `.orderBy("field", { ascending: false })` | `.order("field", { ascending: false })` |
| `.count()` | `.select("*", { count: "exact" })` — count is in response |
| `.offset(n)` | `.range(from, to)` |
| `app.uploadFile()` (legacy NoSQL upload) | `app.storage.from('bucket').upload(key, file)` |
| `app.getTempFileURL()` (legacy NoSQL URL) | `app.storage.from('bucket').createSignedUrl(key, expiresIn)` |
| `app.storage.from()` (no bucket name) | `app.storage.from('bucket')` — **must** pass bucket name |

**If you find yourself typing `.where()` or `.orderBy()` or `.count()` — stop and use the correct method from the right column.**

0. **First, confirm this environment actually has PostgreSQL provisioned.** Call `envQuery(action="info", envId=...)` and read the derived `EnvInfo.RuntimeBackends` block (`{ postgresql, nosql, mysql }`) along with `EnvInfo.RuntimeMode`. It is only safe to apply this skill's PG-specific guidance when `RuntimeBackends.postgresql === true` (equivalently, `EnvInfo.PostgreSQL` is non-empty AND/OR `EnvInfo.Meta` contains `postgresql=enable`).
   - PG mode is a **new-environment mode** selected when creating a CloudBase environment with PostgreSQL. Do not try to "upgrade" a legacy environment in place; create/select a PG-mode environment instead.
   - If `RuntimeBackends.postgresql === false`, STOP — this is a legacy NoSQL-only env: switch to `no-sql-web-sdk` for browser data and `cloud-storage-web` (with `app.uploadFile()`) for uploads. Do not write `app.rdb()` code, do not enable RLS, do not create a pgstore bucket here.
   - If both `postgresql` and `nosql` are `true` (the common case in a PG environment), they coexist. Apply this skill to NEW business data the task asks you to put in PG (e.g. articles / role tables explicitly described as PG). Existing NoSQL collections, the bucket reported in `EnvInfo.Storages[]`, and any `managePermissions(resourceType="noSqlDatabase")` rules continue to govern the legacy NoSQL data — do NOT migrate or rewrite them unless the task explicitly asks.
   - `RuntimeBackends.mysql === false` is the only hard "do not use" signal: when MySQL is absent, do not use `manageMysqlDatabase` / `queryMysqlDatabase` and do not consult the `relational-database-tool` skill; those are MySQL-specific and have nothing to do with CloudBase PG.
   - Note: in a PG env, `EnvInfo.Storages[]` is the legacy NoSQL bucket. It still works for legacy `app.uploadFile()` flows but is NOT a usable pgstore bucket — never reuse it as the `<bucket>` segment in `app.storage.from('<bucket>').upload('<key>', file)`.

> **Creating a PG-mode environment**
>
> If step 0 shows `RuntimeBackends.postgresql === false` and you need PostgreSQL, create a new environment with PG enabled:
>
> - **Via MCP**: `manageEnv(action="create", alias="my-env", packageId="baas_personal", resources=["flexdb","storage","function","postgresql"], confirm="yes")`
> - **Via CLI**: `tcb env create --alias my-env --package baas_personal --postgresql --yes`
> - **Via Console**: [Create environment](https://console.cloud.tencent.com/tcb/env/create)

1. Inspect the existing app surfaces first: `src/lib/backend.*`, `src/lib/auth.*`, `src/lib/*service.*`, route guards, and the handlers bound to existing forms.
2. Check PG state through MCP: use `queryPgDatabase` for schema/read-only inspection and `managePgDatabase` for DDL/DML. Do not switch to MySQL tools. For the complete route map, read `references/index.md`.
3. **Understand PG roles before writing code:** Publishable Key maps to `anon`; a logged-in user's access token maps to `authenticated`; API Key maps to `service_role` and bypasses RLS. Never expose API Key / `service_role` credentials in frontend code. See `references/auth-and-rls.md`.
4. **Use schema management (`managePgDatabase`) before writing CRUD code:** Create tables via `managePgDatabase(action=execute, confirm=true)` with CREATE TABLE SQL, then apply GRANT + RLS before browser access. The minimum SQL bundle is: `CREATE TABLE`, `GRANT SELECT/INSERT/UPDATE/DELETE TO authenticated`, `GRANT USAGE, SELECT ON SEQUENCE ... TO authenticated` when using `serial`/`bigserial`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, and `CREATE POLICY ... USING / WITH CHECK`. See `references/auth-and-rls.md` for the full template. For structured schema changes, use the migration workflow:
   - `managePgDatabase(action=planMigration, sql=...)` — preview migration plan via `PreviewPGUserMigrations`
   - `managePgDatabase(action=applyMigration, sql=..., confirm=true)` — batch-apply migrations via `PushPGUserMigrations`
   - `managePgDatabase(action=listMigrations)` — list all applied migrations
   - `managePgDatabase(action=migrationDetail, objectName=...)` — inspect a single migration
   - `managePgDatabase(action=rollbackMigration, objectName=..., confirm=true)` — roll back a migration

   **🚨 CRITICAL: Inspect table existence and column names before CREATE TABLE.** `CREATE TABLE IF NOT EXISTS` silently skips when the table already exists, even if the column names are wrong. Always call `queryPgDatabase(action="sql", sql="SELECT column_name, data_type FROM information_schema.columns WHERE table_name='xxx'")` first to check whether the table exists and what exact column names it uses. If the table already exists with mismatched column names (e.g. `user_id` instead of `uid`), you must either:
   - `ALTER TABLE` to add/rename/drop columns, or
   - `DROP TABLE IF EXISTS ... CASCADE` and recreate (only when data loss is acceptable, e.g. disposable/evaluation environments).
   - Do NOT rely on `CREATE TABLE IF NOT EXISTS` silent skip — it will cause all downstream CRUD queries to fail with wrong field names.
   - After DDL, re-query the schema and compare every column name used by frontend code, insert/update payloads, filters, ordering, and RLS policies.
5. Check username-password auth before coding login:
   - Call `queryAppAuth(action="getLoginConfig")`.
   - If `loginMethods.usernamePassword !== true`, call `manageAppAuth(action="patchLoginStrategy", patch={ usernamePassword: true })`.
   - In Web login code, use `auth.signInWithPassword({ username, password })` for plain usernames like `admin` or `editor`.
   - Do not assume `auth.signUp({ username, password })` can directly create username/password users. Confirm `queryAppAuth` `sdkHints` and the installed `@cloudbase/js-sdk` behavior first; if direct username signup is unsupported, implement registration through a backend/management boundary instead of exposing secret keys in the browser.
6. Implement Web auth state with `auth.getSession()` before writing CRUD:
   - Route guards must check `data.session`, not `auth.getUser()` and not deprecated `getLoginState()`.
   - Treat login as successful only when `signInWithPassword(...)` returns no `error` and includes `data.session`.
   - Get the UID for `author_id` / role rows from `data.session.user.id` (fall back to `sub`/`uid` only after inspecting the actual session object).
   - Do not use `auth.getUser()` as proof of login; it can return a non-null wrapper or anonymous-looking user data when there is no real username/password session.
7. Implement browser-side business data with the CloudBase JS SDK v3 PostgreSQL API first: `app.rdb().from(table)`. Use the latest `@cloudbase/js-sdk` when `app.rdb` is missing (`xxx.rdb is not a function` means the SDK is too old).
8. Do not manually fetch a CloudBase Auth bearer token from browser code for PG CRUD. In particular, do not call non-canonical helpers such as `currentUser.getIdToken()` unless you have verified that exact method exists in the installed SDK. Prefer `app.rdb()` so the SDK carries the active session.
9. Use the official CloudBase PG SQL auth helpers in policies: `auth.uid()` for JWT `sub`, `auth.role()` for `anon` / `authenticated` / `service_role`, `auth.jwt()` for full claims, and `auth.email()` when email is needed. Still verify the policy through the real app session before claiming it works:
   - Log in through the real app path.
   - Insert a test row using `author_id = session.user.id`.
   - Read it back with `queryPgDatabase`.
   - If INSERT/SELECT fails, inspect the exact RLS error and fix the policy or switch to a server/RPC boundary. Do not leave browser-facing tables with broken RLS.
   - **⚠️ Do NOT use `current_user` or `current_setting(...)` in RLS policies.** `current_user` in PostgreSQL returns the database role name (e.g. `authenticated`), NOT the CloudBase auth user ID. Always use `auth.uid()` for user identity checks. If you are unsure whether the auth helpers are available, run `SELECT proname FROM pg_proc WHERE pronamespace = 'auth'::regnamespace` to list all available `auth.*` functions.
10. Use PG HTTP API only as a fallback after reading OpenAPI docs and verifying the auth model in the installed SDK. Do not guess URLs such as `/api/v1/rdb/rest`; the documented base is `https://<envId>.api.tcloudbasegateway.com/v1/rdb/rest/<table>` and auth is `Authorization: Bearer <Publishable Key | access_token | API Key>`.
11. Keep cover images in CloudBase Storage. Store only the final file URL or file metadata in PG.
12. Verify both layers before claiming done: project build/typecheck and browser E2E for login/CRUD, then read back rows with `queryPgDatabase`. When debugging RLS, run SQL as `authenticated` / `anon` if the tool supports role simulation; admin/default execution can bypass the user-facing failure.

## Exploration Budget

- Optimize for a working user flow before broad research.
- If the task is a Web app with PG-backed CRUD, read `references/app-workflow.md` and follow that closure path before looking up optional HTTP API details.
- Do not query the same documentation family more than twice for the same question. If the second lookup does not unblock you, inspect the installed SDK surface or the exact runtime error instead.
- Once you choose `app.rdb()` for browser CRUD, stop researching raw PG HTTP APIs unless `app.rdb()` is missing or demonstrably fails.
- After a DDL failure, retry SQL at most twice. Then call `queryPgDatabase(action="objects")` to find the schema-qualified table name, then `queryPgDatabase(action="schema", objectName="public.your_table")`, read the exact error, and simplify the schema or permission plan.
- Avoid long task-management loops for targeted repairs. Read the active files, execute the minimum platform setup, edit code, and verify.
- **File read budget**: Do NOT read the same file more than **2 times**. If you need to re-read a file after 2 reads, use `Grep` for targeted search or `Read` with explicit `offset`/`limit` to target specific line ranges. Move on to editing or verifying instead of re-reading.

## Data Model Rules

- Use CloudBase Auth / CloudBase PG built-in auth identity as the user source. Do not copy an extra identity table unless the app needs one.
- Keep business roles in PG when the app needs admin/editor behavior, e.g. `user_roles` with `uid`, `username`, and `role`. The `uid` value must be the same value the Web session uses as `session.user.id`, and must match any database policy expression you use.
- Keep content tables in PG, e.g. `articles` or `posts` with owner UID columns.
- Prefer snake_case physical columns (`author_id`, `author_name`, `cover_image`, `created_at`, `updated_at`) for PG tables. If UI fields are camelCase, map them explicitly at the service boundary.
- Treat the schema returned by `queryPgDatabase(action="schema", objectName="public.your_table")` as the source of truth. `objectName` is required and must be schema-qualified; if you do not know it yet, call `queryPgDatabase(action="objects")` first. If an existing table has `authorid`/`updatedat`, either use those exact column names in code or explicitly migrate/drop-recreate the table before writing code that expects `author_id`/`updated_at`.
- `CREATE TABLE IF NOT EXISTS` does not change an existing incompatible schema. In evaluation or disposable environments, prefer a deliberate `DROP TABLE IF EXISTS ... CASCADE` followed by `CREATE TABLE ...` when you need a known schema.
- After DDL, query the table schema again and compare every column used by frontend code, insert/update payloads, filters, ordering, and RLS policies.
- Backend permission must exist in the database or server/RPC layer. Hiding buttons in the UI is not enough.
- Do not leave a browser-facing table with RLS enabled and zero policies. PostgreSQL denies user reads/writes by default in that state, so `app.rdb().from("articles").insert(...)` can fail while the UI only shows a generic save failure. If you enable RLS, create and verify SELECT/INSERT/UPDATE/DELETE policies before testing the app.
- Use CloudBase PG's official SQL auth helpers in policies: `auth.uid()` (JWT `sub`), `auth.role()` (`anon` / `authenticated` / `service_role`), `auth.jwt()` (full claims), and `auth.email()` when relevant. Prefer owner columns such as `owner_id varchar(64) DEFAULT auth.uid()` so the database, not the browser, assigns ownership.
- If you need detailed GRANT/RLS rules, read `references/rls-patterns.md` before writing policies.
- For admin/editor flows, make `admin` able to operate all rows and `editor` only rows where owner UID matches the current user.

## JS SDK v3 PostgreSQL Patterns

**Table name rules (important):**
- ✅ `db.from("articles")` — recommended
- ✅ `db.from("public.articles")` — also valid (single schema prefix)
- ❌ `db.from("public.public.articles")` — WRONG, double schema prefix, will fail with `PGRST205`
- `objectName="public.articles"` in `queryPgDatabase()` is the MCP tool format — do NOT copy this into `db.from()`.

Use static imports and one shared `app.rdb()` client:

```ts
import cloudbase from "@cloudbase/js-sdk";
const app = cloudbase.init({ env: import.meta.env.VITE_CLOUDBASE_ENV_ID });
export const auth = app.auth;
export const db = app.rdb();
```

Minimal auth helpers — **only use `auth.getSession()`**, never `auth.getUser()`:

```ts
async function getActiveSession() {
  const { data, error } = await auth.getSession();
  if (error || !data?.session || data.session.user?.is_anonymous) return null;
  return data.session;
}
```

Canonical CRUD shapes (copy these exactly):

```ts
// READ
const { data, error } = await db.from("articles").select("*");
// CREATE — omit owner_id/author_id when the table defines DEFAULT auth.uid()
const { data, error } = await db.from("articles").insert({ title, status: "draft" });
// UPDATE
await db.from("articles").update({ status }).eq("id", id);
// DELETE
await db.from("articles").delete().eq("id", id);
// RPC
const { data } = await db.rpc("function_name", { id });
```

Common query helpers: `.eq()`, `.neq()`, `.gt()`, `.gte()`, `.lt()`, `.lte()`, `.like()`, `.ilike()`, `.in()`, `.is()`, `.order()`, `.limit()`, `.range()`, `.single()`.

### ⚠️ Critical: PG API is NOT the same as CloudBase NoSQL or other ORMs

CloudBase PG (`app.rdb()`) uses **postgREST-style** query helpers, **NOT** CloudBase NoSQL (`app.database()`) API and **NOT** common ORM conventions. Do NOT use:

| ❌ Wrong (NoSQL / ORM habit) | ✅ Correct (postgREST / PG) |
|-----------------------------|---------------------------|
| `.where({ field: value })` | `.match({ field: value })` 或 `.eq("field", value)` |
| `.where("field", "ilike", "%v%")` | `.ilike("field", "%v%")` |
| `.orderBy("field", { ascending: false })` | `.order("field", { ascending: false })` |
| `.count()` | `.select("*", { count: "exact" })` — 通过 `select` 的 `count` 参数获取总数，返回结果中有 `count` 字段 |
| `.offset(n)` | `.range(from, to)` — 注意 range 是包含两端的分页 |

**Golden rule**: `app.rdb()` 的查询链只使用上方 "Common query helpers" 列出的 helper 方法。如果你习惯写 `.where()` / `.orderBy()` / `.count()`，请立即改用对应的 postgREST 方法。Supabase 的 `@supabase/postgrest-js` 同样不使用这些方法名。

Storage (v3): use `app.storage.from('<bucket>').upload('<key>', file)` — check installed SDK surface before copying:

```ts
const { data } = await app.storage.from('covers').upload(`${file.name}`, file);
```

### Bucket existence is mandatory (Supabase parity)

CloudBase PG storage uses the `pgstore` backend and follows the same model as Supabase Storage: **every upload must target a bucket that already exists**. The browser SDK cannot create one. Before writing any upload code:

1. Confirm a usable pgstore bucket exists for your target prefix (e.g. `covers`). The legacy NoSQL bucket exposed by `DescribeEnvs.Storages[]` (e.g. `6d63-…-1409864723`) is for the old NoSQL backend and does NOT serve pgstore uploads.
2. If no usable bucket exists, create one through the PG storage management surface (PG storage HTTP API / CLI / console / SQL on `storage.buckets` when appropriate). Do not assume traditional-mode storage tools or adding `covers/` as a JS path prefix will create a PG bucket.
3. The bucket name belongs in `from('<bucket>')`; the key passed to `upload(key, file)` is inside that bucket and must **not** repeat the bucket prefix. Correct: `app.storage.from('covers').upload('a.png', file)`. Wrong: `app.storage.from('covers').upload('covers/a.png', file)`.
4. **After creating the bucket, configure RLS on `storage.objects`** via `managePgDatabase(action="execute", confirm=true)`. The default RLS is deny all; without permissive policies the browser receives `STORAGE_PERMISSION_DENIED`. See `cloud-storage-web/SKILL.md` "Post-bucket: storage RLS" section for the exact SQL policies.

Failure-mode cheat sheet (read DevTools network tab on the FAILED `POST .../v1/storages/get-objects-upload-info`):

| `code` returned by `/v1/storages/get-objects-upload-info` | Meaning | Fix |
| -------------------------------------------------------- | ------- | --- |
| `STORAGE_BUCKET_NOT_FOUND` | The bucket in the path does not exist in this PG environment. | Create the bucket via management surface, then retry. |
| `STORAGE_PERMISSION_DENIED` | The bucket exists but RLS on `storage.objects` blocks the upload. | Run `managePgDatabase(action="execute", confirm=true)` to configure storage RLS. See `cloud-storage-web/SKILL.md` "Post-bucket: storage RLS". |
| `INVALID_PARAM` for bucket/key | The SDK/API did not receive a valid bucket/key pair (for example `from()` missing the bucket, or key is empty). | Use `app.storage.from('covers').upload('a.png', file)`; bucket goes in `from()`, key goes in `upload()`. |
| `STORAGE_CONTENT_LENGTH_REQUIRED` | Your code stripped or omitted the `Content-Length` signed header. | Pass `headers: { 'Content-Length': String(file.size) }` to `uploadFile`, or use `app.storage.from('<bucket>').upload('<key>', file)` with a `Blob`/`File` so the SDK fills it in. |

If you see `PUT https://undefined/` and `net::ERR_NAME_NOT_RESOLVED` in DevTools, that is the symptom of one of the three rows above — the upstream metadata response had no `uploadUrl` field, and the SDK fed `undefined` into a follow-up `PUT`. Always inspect the upstream `get-objects-upload-info` response first; do not chase the `https://undefined/` URL itself.

Hard rule: never let an upload error be silently swallowed. If `uploadCoverImage()` rejects, the surrounding `createArticle()` flow MUST reject too — do not insert into PG with a fabricated cover URL, do not show a success toast, and do not retry with a guessed bucket name.

## ExecutePGSql / DDL Troubleshooting

- `ExecutePGSql` / `managePgDatabase(action="execute")` is an admin/control-plane path. Do not expose Tencent Cloud SecretKey or CloudBase API Key in frontend code.
- Execute one SQL statement per call. Split batches explicitly instead of sending semicolon-joined multi-statements.
- Some DDL (`CREATE` / `ALTER` / `DROP` / `GRANT` / `REVOKE` / `TRUNCATE` / `COMMENT`) can fail directly with transient `InternalError`. If that happens, retry once by wrapping the DDL in `DO $$ BEGIN EXECUTE '...'; END $$` and escaping single quotes inside the string.
- When validating permissions, use the user-facing role (`anon` or `authenticated`) when the tool/API supports a role parameter. Default admin execution can hide missing GRANT/RLS policies.

## HTTP API Fallback

- PG HTTP API is in the CloudBase relational database HTTP API family, together with MySQL. In MCP docs/search this appears under `mysqldb`.
- Before writing raw `fetch()` code, query OpenAPI docs: `searchKnowledgeBase(mode="openapi", apiName="mysqldb", query="PostgreSQL fetch insert update rpc")`.
- Do not construct `/api/v1/rdb/rest` or `/api/v1/rdb/rest/rpc` from memory. A guessed path that returns 404 is a hard blocker; switch back to JS SDK v3 or read the OpenAPI contract.
- If environment variables expose `TCB_HTTP_API_BASE_URL` / `VITE_TCB_HTTP_API_BASE_URL`, treat them as the base only. The path, method, headers, and auth model must still come from OpenAPI docs or an existing working helper.

## Frontend Guardrails

Avoid dynamic helper traps:

- Do not write `function getAuth() { return (await import("./backend")).auth; }`; either use a top-level static import or make the function `async`.
- Do not write `typeof import !== "undefined"` in Vite; use `import.meta.env` directly.
- Do not keep editing after Vite reports a transform error. Fix syntax first, rerun build, then test the browser flow.
- Do not spend time reverse-engineering unrelated SDK internals when a documented v3 surface exists. Use the documented `app.rdb()` / `app.storage.from()` APIs first.

## Quick Checks

- PG schema exists and matches the service code.
- Username login is enabled and code uses username APIs, not email APIs.
- Data writes reach CloudBase PG via JS SDK v3 `app.rdb()` or a documented HTTP API path, not local state, mock arrays, or guessed 404 endpoints.
- Browser PG code must not depend on `user.getIdToken()` or invented token helpers. If raw HTTP is unavoidable, first inspect the installed CloudBase Web SDK/auth API and prove the request succeeds with the current user session.
- Editor permission is enforced outside the UI.
- A pgstore bucket that matches the upload path (e.g. `covers`) exists BEFORE any browser upload runs. If it does not, create it via a management surface; the v3 SDK will not create one for you.
- Storage upload returns a usable URL and that URL is persisted with the article. Upload errors must propagate — do not insert an article row with a placeholder cover URL.
