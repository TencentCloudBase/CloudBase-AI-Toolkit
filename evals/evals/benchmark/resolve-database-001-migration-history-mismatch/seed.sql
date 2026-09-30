create table if not exists public.profiles (
  id text primary key,
  display_name text
);

-- History records add_avatar_url as applied. The column is not on the table.
insert into cloudbase_migrations.schema_migrations (version, name, statements)
select '20260930140000',
       'add_avatar_url',
       array['alter table public.profiles add column avatar_url text']::text[]
where not exists (
  select 1 from cloudbase_migrations.schema_migrations where version = '20260930140000'
);
