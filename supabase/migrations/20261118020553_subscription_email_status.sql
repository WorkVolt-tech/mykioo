create table public.mykioo_subscription_email_log (
 id uuid primary key default gen_random_uuid(),
 subscription_id uuid not null references public.mykioo_subscriptions(id) on delete cascade,
 member_id uuid not null references public.mykioo_members(user_id) on delete cascade,
 kind text not null check (kind in ('login','update')),
 state text not null check (state in ('sending','sent','failed','unknown')),
 subscription_updated_at timestamptz,
 provider_message_id text,
 sent_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index mykioo_subscription_email_log_recent on public.mykioo_subscription_email_log(subscription_id,created_at desc);
alter table public.mykioo_subscription_email_log enable row level security;
revoke all on public.mykioo_subscription_email_log from anon,authenticated;
grant all on public.mykioo_subscription_email_log to service_role;
