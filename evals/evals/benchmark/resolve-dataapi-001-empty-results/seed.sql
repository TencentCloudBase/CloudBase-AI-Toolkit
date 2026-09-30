create table if not exists public.bookmarks (
  id text primary key,
  user_id text not null,
  url text not null
);
insert into public.bookmarks (id, user_id, url) values ('b1','user-a','https://example.com') on conflict (id) do nothing;
