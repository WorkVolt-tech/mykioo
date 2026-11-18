-- Free MYKIOO agents: CAD $5 off; paid MYKIOO agents: CAD $10 off.
-- Applies prospectively to new orders; historical order intents are unchanged.
begin;
alter table public.mykioo_agent_accounts
  drop constraint if exists mykioo_agent_accounts_discount_cad_check;

update public.mykioo_agent_accounts
  set discount_cad = case when access_type = 'paid' then 10 else 5 end,
      updated_at = now()
  where discount_cad is distinct from case when access_type = 'paid' then 10 else 5 end;

alter table public.mykioo_agent_accounts
  add constraint mykioo_agent_accounts_discount_cad_check
  check (
    (access_type = 'free' and discount_cad = 5)
    or (access_type = 'paid' and discount_cad = 10)
  );
commit;
