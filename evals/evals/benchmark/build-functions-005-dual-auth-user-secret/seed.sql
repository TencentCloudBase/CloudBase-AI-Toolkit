create table if not exists public.secrets_notes (
  id text primary key,
  user_id text not null,
  body text not null
);
