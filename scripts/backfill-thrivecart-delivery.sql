-- Generic one-time backfill for existing ThriveCart order item delivery fields.
-- Rules:
-- - ThriveCart orders only
-- - only rows with delivery_text IS NULL or expected_completion_at IS NULL
-- - never overwrites non-null delivery_text
-- - never overwrites non-null expected_completion_at
-- - does not modify published_url, item_status, or order_status
-- - expected_completion_at is based on orders.created_at plus maximum delivery days

with product_map as (
    select *
    from (
        values
            (
                'MSN',
                '5 Days',
                5,
                array[
                    'msn',
                    'MSN',
                    'price_1Tq8bFRvo61AD2cgV6by04aS'
                ]::text[]
            ),
            (
                'Reuters',
                '7 Days',
                7,
                array[
                    'reuters',
                    'Reuters',
                    'price_1Tq8cPRvo61AD2cgeWCTcRyd'
                ]::text[]
            ),
            (
                'OpenPR',
                '2 Days',
                2,
                array[
                    'openPR',
                    'openpr',
                    'OpenPR',
                    'Open PR',
                    'open-pr',
                    'price_1Tq8csRvo61AD2cgaOaDm646'
                ]::text[]
            ),
            (
                'Core',
                '5-7 Days Publishing',
                7,
                array[
                    'core',
                    'Core'
                ]::text[]
            ),
            (
                'Growth',
                '5-7 Days Publishing',
                7,
                array[
                    'growth',
                    'Growth',
                    'product_4'
                ]::text[]
            ),
            (
                'Premium',
                '5-7 Days Publishing',
                7,
                array[
                    'premium',
                    'Premium'
                ]::text[]
            ),
            (
                'Enterprise',
                '5-7 Days Publishing',
                7,
                array[
                    'enterprise',
                    'Enterprise'
                ]::text[]
            )
    ) as mapping(canonical_name, delivery_text, expected_days, aliases)
),
resolved_items as (
    select
        oi.id as order_item_id,
        pm.delivery_text,
        pm.expected_days,
        o.created_at
    from public.order_items as oi
    join public.orders as o on o.id = oi.order_id
    join product_map as pm on exists (
        select 1
        from unnest(pm.aliases) as alias(value)
        where
            lower(alias.value) in (lower(oi.product_id), lower(oi.product_name))
            or regexp_replace(lower(alias.value), '[^a-z0-9]', '', 'g') in (
                regexp_replace(lower(oi.product_id), '[^a-z0-9]', '', 'g'),
                regexp_replace(lower(oi.product_name), '[^a-z0-9]', '', 'g')
            )
    )
    where
        lower(o.source) = 'thrivecart'
        and (
            oi.delivery_text is null
            or oi.expected_completion_at is null
        )
)
update public.order_items as oi
set
    delivery_text = coalesce(oi.delivery_text, resolved_items.delivery_text),
    expected_completion_at = coalesce(
        oi.expected_completion_at,
        resolved_items.created_at +
            (resolved_items.expected_days::text || ' days')::interval
    )
from resolved_items
where oi.id = resolved_items.order_item_id;

-- Review remaining unmapped ThriveCart rows that still need manual configuration.
select
    o.order_number,
    o.created_at as order_created_at,
    oi.product_id,
    oi.product_name,
    oi.delivery_text,
    oi.expected_completion_at
from public.orders as o
join public.order_items as oi on oi.order_id = o.id
where
    lower(o.source) = 'thrivecart'
    and (
        oi.delivery_text is null
        or oi.expected_completion_at is null
    )
order by o.created_at desc;
