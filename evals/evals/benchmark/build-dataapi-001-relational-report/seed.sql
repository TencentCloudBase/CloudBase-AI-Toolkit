create table if not exists public.customers (id text primary key, name text not null);
create table if not exists public.orders (
  id text primary key,
  customer_id text not null,
  total int not null
);
insert into public.customers (id, name) values ('c1','Ada') on conflict (id) do nothing;
insert into public.orders (id, customer_id, total) values ('o1','c1',10) on conflict (id) do nothing;
