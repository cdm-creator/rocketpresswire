do $$
declare
    test_order_id uuid;
    test_suffix text := to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
begin
    insert into public.orders (
        order_number,
        customer_email,
        customer_name,
        writing_option,
        source,
        external_order_id,
        amount_total,
        currency,
        payment_status,
        order_status
    )
    values (
        'TEST-JOURNALIST-' || test_suffix,
        'teenacoozmoo@gmail.com',
        'Teena Coozmoo',
        'journalist',
        'stripe',
        'manual_test_journalist_' || test_suffix,
        100,
        'usd',
        'paid',
        'processing'
    )
    returning id into test_order_id;

    insert into public.order_items (
        order_id,
        product_id,
        product_name,
        quantity,
        unit_amount,
        item_status,
        delivery_text,
        expected_completion_at,
        published_url
    )
    values (
        test_order_id,
        'dummy',
        'Dummy',
        1,
        100,
        'processing',
        'Journalist-writing test order',
        null,
        null
    );
end
$$;
