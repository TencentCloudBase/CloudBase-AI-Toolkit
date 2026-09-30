create table if not exists public.private_notes (
  id text primary key,
  user_id text not null,
  body text not null
);
