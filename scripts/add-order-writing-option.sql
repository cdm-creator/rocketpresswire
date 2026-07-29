begin;

alter table public.orders
    add column if not exists writing_option text;

-- Backfill historical Stripe journalist orders. The writing add-on was included
-- in amount_total but was not stored as an order_item.
update public.orders as orders
set writing_option = 'journalist'
from (
    select
        order_id,
        sum(unit_amount * quantity) as item_total
    from public.order_items
    group by order_id
) as item_totals
where orders.id = item_totals.order_id
  and orders.source = 'stripe'
  and orders.writing_option is null
  and orders.amount_total > item_totals.item_total;

update public.orders
set writing_option = 'own'
where writing_option is null
   or writing_option not in ('own', 'journalist');

alter table public.orders
    alter column writing_option set default 'own',
    alter column writing_option set not null;

do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conname = 'orders_writing_option_check'
          and conrelid = 'public.orders'::regclass
    ) then
        alter table public.orders
            add constraint orders_writing_option_check
            check (writing_option in ('own', 'journalist'));
    end if;
end
$$;

commit;
