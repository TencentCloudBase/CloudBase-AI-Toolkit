-- Starting state: two organizations, row security off.
-- The agent repairs this. The scorer checks behavior, not this file.

create table if not exists notes (
  id text primary key,
  org_id text not null,
  author_id text not null,
  body text not null
);

insert into notes (id, org_id, author_id, body) values
  ('a1', 'org-a', 'user-a', 'org a note'),
  ('b1', 'org-b', 'user-b', 'org b note')
on conflict (id) do nothing;
