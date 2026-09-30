create table if not exists public.documents (
  id text primary key,
  org_id text not null,
  author_id text not null,
  body text not null
);
