# CloudBase PG App Workflow

Use this reference when building or repairing a real user-facing Web app backed by CloudBase PostgreSQL. The goal is a working product flow, not broad platform exploration. In scaffold/TODO apps, favor vertical closure over repo inventory.

## Closure Path

1. Inspect the active app code first:
   - `src/lib/backend.*`
   - `src/lib/auth.*`
   - `src/lib/*service.*`
   - route guards
   - form submit handlers
   - Open these files directly. Do not begin with generic repo inventory, delegated exploration, or a repo-wide file list.
2. If those files still contain TODOs, implement them in place before optional platform research or helper creation.
3. Confirm the environment has the required capabilities:
   - username/password auth if the app logs in with plain usernames
   - PostgreSQL resource
   - Cloud Storage if the app uploads files. In CloudBase PG, "having storage" means having an explicitly-created `pgstore` bucket — same model as Supabase Storage. Check existing buckets with `queryPgStorage(action="buckets")`. If the upload target (e.g. `covers`) is missing, create/select the bucket through the documented CloudBase management surface or console before writing browser upload code. Browser SDKs cannot create a pgstore bucket; the legacy NoSQL bucket reported in `EnvInfo.Storages[]` is NOT a valid pgstore target.
4. Create or repair the minimal PG schema with `managePgDatabase(action="execute")`: table DDL, required `GRANT` statements, sequence grants for `serial`/`bigserial`, `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, and RLS policies.
5. Immediately call `queryPgDatabase(action="objects")`, then `queryPgDatabase(action="schema", objectName="public.<table>")` for every table touched by the app.
6. Implement browser CRUD with one shared CloudBase Web SDK app instance and `app.rdb()`.
7. Implement auth guards and owner UID lookup with `auth.getSession()`, not `auth.getUser()`.
8. If direct browser `app.rdb()` uses RLS, verify the policy identity through the real browser session before depending on it.
9. Implement browser uploads with the documented CloudBase Storage Web SDK surface. The bucket from step 3 must exist BEFORE this step runs; pass the bucket to `from(bucket)` and pass only the object key to `upload(key, file)` (e.g. `app.storage.from("covers").upload("<file>", file)`). Do not repeat the bucket prefix inside the key.
10. Run the local build/typecheck.
11. Exercise the actual browser flow: login, create, list, edit/delete if required.
12. Read back persisted rows with `queryPgDatabase` before claiming done.

## Minimum Schema Pattern

For CMS/admin-style apps, prefer a small explicit schema:

```sql
create table if not exists public.user_roles (
  uid text primary key,
  username text not null unique,
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.articles (
  _id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  cover_image text,
  content text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  author_id varchar(64) not null default auth.uid(),
  author_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Then grant the user-facing role and create policies before browser CRUD:

```sql
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY articles_owner_all ON public.articles
  FOR ALL TO authenticated
  USING (author_id = auth.uid())
  WITH CHECK (author_id = auth.uid());
```

If a table uses `serial` / `bigserial`, also grant its sequence: `GRANT USAGE, SELECT ON SEQUENCE public.<table>_<column>_seq TO authenticated;`.

If the environment is disposable or the task requires a known schema, prefer an explicit `drop table if exists ... cascade` followed by `create table`. Do not rely on `create table if not exists` to fix incompatible old columns.

## Browser Data Access

Use one shared app:

```ts
import cloudbase from "@cloudbase/js-sdk";

export const app = cloudbase.init({ env: import.meta.env.VITE_ENV_ID });
export const auth = app.auth();
export const db = app.rdb();
```

Use the session as the single source of truth for login state and current UID:

```ts
async function getActiveSession() {
  const { data, error } = await auth.getSession();
  const session = data?.session;
  if (error || !session || session.user?.is_anonymous) return null;
  return session;
}

export async function checkAuth() {
  return Boolean(await getActiveSession());
}

export async function getCurrentUser() {
  const session = await getActiveSession();
  const user = session?.user;
  if (!user) return null;

  const uid = user.id || user.sub || user.uid;
  if (!uid) return null;

  return {
    uid,
    displayName:
      user.user_metadata?.username ||
      user.username ||
      user.email ||
      uid,
  };
}
```

Do not use `auth.getUser()` as a route guard. A non-null `data` wrapper is not proof of a real username/password login. Login is successful only when `signInWithPassword(...)` returns no `error` and includes `data.session`.

Use `app.rdb()` for business data:

```ts
const session = await getActiveSession();
const uid = session?.user?.id;
if (!uid) throw new Error("Please log in first");

const { data, error } = await db.from("articles").insert({
  title,
  author_name: username,
  status: "draft",
});
```

Do not hand-build Bearer-token HTTP requests or call unverified helpers such as `user.getIdToken()` from browser CRUD. If raw HTTP is unavoidable, first prove the installed SDK exposes the required session/token API.

## RLS Identity Verification

When using direct browser `app.rdb()` with RLS, the database policy identity must match the Web session identity:

1. Log in through the actual app with username/password.
2. Read the active session and record `session.user.id`.
3. Insert a test article through `app.rdb()` without passing `author_id` if the column uses `DEFAULT auth.uid()`.
4. Read the inserted row through `queryPgDatabase` and confirm `author_id` equals `session.user.id`.
5. If the browser insert fails, do not continue by hiding the error in the UI. Inspect the exact error and either fix the RLS policy identity expression or move authorization to a server/RPC boundary.

`auth.uid()` is the official CloudBase PG helper for JWT `sub`; still verify it through the real browser session before trusting the policy.

## Verification

After schema setup:

```text
queryPgDatabase(action="schema", objectName="public.articles")
queryPgDatabase(action="schema", objectName="public.user_roles")
```

After browser CRUD:

```sql
select _id, title, author_id, status from public.articles order by created_at desc limit 5;
select uid, username, role from public.user_roles order by created_at desc limit 5;
```

Stop when the user-facing flow works and rows are visible in PG. Do not continue researching optional APIs after this point.
