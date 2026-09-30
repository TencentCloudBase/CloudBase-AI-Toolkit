create table if not exists public.inventory (
  sku text primary key,
  qty int not null
);
insert into public.inventory (sku, qty) values ('pen', 2) on conflict (sku) do nothing;
