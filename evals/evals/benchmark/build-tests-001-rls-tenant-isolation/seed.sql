create table if not exists public.posts (
  id text primary key,
  tenant_id text not null,
  author_id text not null,
  body text not null
);
