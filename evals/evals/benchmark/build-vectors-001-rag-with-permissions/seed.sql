create table if not exists public.document_sections (
  id text primary key,
  user_id text not null,
  body text not null
);
