begin;

alter table public.press_releases
    add column if not exists same_content_for_all_outlets boolean not null default false,
    add column if not exists outlet_ids text[] not null default '{}'::text[],
    add column if not exists outlet_names text[] not null default '{}'::text[];

drop index if exists public.press_releases_user_email_order_number_unique;

create or replace function public.prevent_duplicate_press_release_outlets()
returns trigger
language plpgsql
set search_path = public
as $$
declare
    existing_release_has_no_outlets boolean;
    overlaps_existing_release boolean;
begin
    if new.order_number is null then
        return new;
    end if;

    perform pg_advisory_xact_lock(
        hashtextextended(new.user_email || E'\x1f' || new.order_number, 0)
    );

    select
        coalesce(bool_or(coalesce(cardinality(pr.outlet_ids), 0) = 0), false),
        coalesce(
            bool_or(
                coalesce(cardinality(pr.outlet_ids), 0) > 0
                and pr.outlet_ids && new.outlet_ids
            ),
            false
        )
    into
        existing_release_has_no_outlets,
        overlaps_existing_release
    from public.press_releases as pr
    where pr.user_email = new.user_email
      and pr.order_number = new.order_number
      and pr.id is distinct from new.id;

    if existing_release_has_no_outlets then
        raise exception using
            errcode = 'P0001',
            message = 'All outlets in this order already have submitted releases.';
    end if;

    if overlaps_existing_release then
        raise exception using
            errcode = 'P0001',
            message = 'A release has already been submitted for one or more selected outlets.';
    end if;

    return new;
end;
$$;

drop trigger if exists prevent_duplicate_press_release_outlets
    on public.press_releases;

create trigger prevent_duplicate_press_release_outlets
before insert or update of user_email, order_number, outlet_ids
on public.press_releases
for each row
execute function public.prevent_duplicate_press_release_outlets();

commit;
