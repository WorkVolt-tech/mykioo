-- MYKIOO Agent system (STAGED, DO NOT APPLY WITHOUT LIVE-SCHEMA REVIEW)
-- This migration adds isolated agent records without modifying existing member roles,
-- subscription price tables, provider credentials, or other applications' auth.
-- Owner/agent mutations MUST go through owner-authenticated server endpoints.
begin;

create table if not exists public.mykioo_agent_accounts (
  agent_user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','active','suspended')),
  access_type text not null default 'free' check (access_type in ('free','paid')),
  access_fee_cad numeric(10,2) not null default 0 check (access_fee_cad >= 0),
  access_fee_period text not null default 'none' check (access_fee_period in ('none','one_time','monthly','yearly')),
  discount_cad numeric(10,2) not null default 5 check (discount_cad = 5),
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mykioo_agent_customers (
  customer_user_id uuid primary key references auth.users(id) on delete cascade,
  agent_user_id uuid not null references public.mykioo_agent_accounts(agent_user_id),
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id),
  constraint mykioo_no_self_assignment check (customer_user_id <> agent_user_id)
);
create index if not exists mykioo_agent_customers_agent_idx
  on public.mykioo_agent_customers(agent_user_id);

create table if not exists public.mykioo_agent_renewal_requests (
  id uuid primary key default gen_random_uuid(),
  customer_user_id uuid not null references auth.users(id),
  agent_user_id uuid not null references public.mykioo_agent_accounts(agent_user_id),
  subscription_id uuid null,
  status text not null default 'pending' check (status in ('pending','contacted','submitted','closed')),
  message text not null default '' check (length(message) <= 1000),
  agent_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mykioo_agent_renewals_agent_idx
  on public.mykioo_agent_renewal_requests(agent_user_id, created_at desc);

-- Order ledger is non-authoritative until existing server checkout + owner completion
-- independently validate amount and successful payment.
create table if not exists public.mykioo_agent_order_intents (
  id uuid primary key default gen_random_uuid(),
  agent_user_id uuid not null references public.mykioo_agent_accounts(agent_user_id),
  customer_user_id uuid not null references auth.users(id),
  kind text not null check (kind in ('new','renewal','trial')),
  contract_days integer check (contract_days in (365,730)),
  device_count integer check (device_count between 1 and 5),
  customer_price_cad numeric(10,2) check (customer_price_cad >= 0),
  wholesale_price_cad numeric(10,2) check (wholesale_price_cad >= 0),
  payment_method text check (payment_method in ('interac','zelle','cash','manual','btc','shib')),
  payment_reference text check (length(payment_reference) <= 160),
  payment_verified_at timestamptz,
  owner_request_id uuid null,
  status text not null default 'draft' check (status in ('draft','pending_payment','owner_review','completed','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mykioo_agent_invitation_requests (
  id uuid primary key default gen_random_uuid(),
  agent_user_id uuid not null references public.mykioo_agent_accounts(agent_user_id),
  invitee_email text not null check (length(invitee_email) <= 254),
  status text not null default 'pending' check (status in ('pending','sent','accepted','declined')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists mykioo_agent_invite_agent_idx
 on public.mykioo_agent_invitation_requests(agent_user_id,created_at desc);

create index if not exists mykioo_agent_order_agent_idx
  on public.mykioo_agent_order_intents(agent_user_id, created_at desc);

create or replace function public.mykioo_is_owner_for_agents()
returns boolean language sql stable security invoker set search_path = ''
as $$
  select exists (
    select 1 from public.mykioo_members m
    where m.user_id = (select auth.uid()) and m.role = 'owner' and m.status = 'approved'
  );
$$;

alter table public.mykioo_agent_accounts enable row level security;
alter table public.mykioo_agent_customers enable row level security;
alter table public.mykioo_agent_renewal_requests enable row level security;
alter table public.mykioo_agent_order_intents enable row level security;
alter table public.mykioo_agent_invitation_requests enable row level security;

revoke all on public.mykioo_agent_accounts, public.mykioo_agent_customers,
  public.mykioo_agent_renewal_requests, public.mykioo_agent_order_intents,
  public.mykioo_agent_invitation_requests from anon;
grant select on public.mykioo_agent_accounts, public.mykioo_agent_customers,
  public.mykioo_agent_renewal_requests, public.mykioo_agent_order_intents,
  public.mykioo_agent_invitation_requests to authenticated;
grant insert on public.mykioo_agent_renewal_requests to authenticated;

create policy mykioo_agent_account_read on public.mykioo_agent_accounts
  for select to authenticated using
  (agent_user_id = (select auth.uid()) or public.mykioo_is_owner_for_agents());

create policy mykioo_agent_customer_read on public.mykioo_agent_customers
  for select to authenticated using
  (customer_user_id = (select auth.uid()) or
   (agent_user_id = (select auth.uid()) and exists (
    select 1 from public.mykioo_agent_accounts a where a.agent_user_id = (select auth.uid()) and a.status = 'active'
   )) or public.mykioo_is_owner_for_agents());

create policy mykioo_agent_renewal_read on public.mykioo_agent_renewal_requests
  for select to authenticated using
  (customer_user_id = (select auth.uid()) or
   (agent_user_id = (select auth.uid()) and exists (
     select 1 from public.mykioo_agent_accounts a where a.agent_user_id = (select auth.uid()) and a.status = 'active'
   )) or public.mykioo_is_owner_for_agents());

create policy mykioo_agent_renewal_insert on public.mykioo_agent_renewal_requests
  for insert to authenticated with check (
  customer_user_id = (select auth.uid())
  and status = 'pending' and agent_notified_at is null
  and exists (
    select 1 from public.mykioo_agent_customers c
    join public.mykioo_agent_accounts a on a.agent_user_id = c.agent_user_id
    where c.customer_user_id = (select auth.uid())
      and c.agent_user_id = mykioo_agent_renewal_requests.agent_user_id
      and a.status = 'active'
  ));

create policy mykioo_agent_order_read on public.mykioo_agent_order_intents
  for select to authenticated using
  (agent_user_id = (select auth.uid()) or public.mykioo_is_owner_for_agents());

create policy mykioo_agent_invite_read on public.mykioo_agent_invitation_requests
  for select to authenticated using
  (agent_user_id = (select auth.uid()) or public.mykioo_is_owner_for_agents());

-- Deliberately NO browser insert/update/delete policy for agent accounts,
-- agent/customer assignments, or order intents. Privileged server checks
-- ownership and computes wholesale pricing from authoritative catalog.
-- Existing member/support/order RLS and Edge Function authorization MUST
-- be audited and hardened before enabling these roles in production.
commit;
