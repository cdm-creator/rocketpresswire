create table if not exists public.release_email_verifications (
    id uuid primary key default gen_random_uuid(),
    user_id uuid not null references auth.users(id) on delete cascade,
    release_type text not null check (release_type in ('paid', 'free')),
    email text not null,
    code_hash text,
    code_salt text,
    code_expires_at timestamptz,
    verified_at timestamptz,
    consumed_at timestamptz,
    last_sent_at timestamptz not null,
    send_window_started_at timestamptz not null,
    send_count integer not null default 1 check (send_count > 0),
    failed_attempts integer not null default 0 check (failed_attempts >= 0),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (user_id, release_type)
);

alter table public.release_email_verifications enable row level security;

-- No browser-facing policies are intentional. Only the existing service-role
-- backend can create, inspect, verify, or consume these records.
revoke all on table public.release_email_verifications from anon, authenticated;

create index if not exists release_email_verifications_email_lookup
    on public.release_email_verifications (user_id, release_type, email);
