create unique index if not exists press_releases_user_email_order_number_unique
    on public.press_releases (user_email, order_number)
    where order_number is not null;
