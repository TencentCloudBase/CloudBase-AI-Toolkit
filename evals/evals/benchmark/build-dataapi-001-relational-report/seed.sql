-- Live customers.id is bigint. orders.customer_id is text.
-- Do not recreate customers with a text primary key.
insert into public.customers (id, name, owner_id)
values (91001, 'Ada', 'eval-seed')
on conflict (id) do nothing;

insert into public.orders (id, customer_id, total)
values ('o1', '91001', 10)
on conflict (id) do update
set customer_id = excluded.customer_id,
    total = excluded.total;
