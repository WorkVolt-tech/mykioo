-- Owner-controlled agent removal and per-agent CAD discounts.
-- Original payments/orders remain unchanged; removed agents keep member accounts.
begin;
alter table public.mykioo_agent_accounts
 drop constraint if exists mykioo_agent_accounts_status_check;
alter table public.mykioo_agent_accounts
 add constraint mykioo_agent_accounts_status_check
 check (status in ('pending','active','suspended','removed'));

alter table public.mykioo_agent_accounts
 drop constraint if exists mykioo_agent_accounts_discount_cad_check;
alter table public.mykioo_agent_accounts
 add constraint mykioo_agent_accounts_discount_cad_check
 check (discount_cad >= 0 and discount_cad <= 1000);

-- Return former agents (but NOT suspended agents) to normal member pricing.
drop policy if exists "approved regular members can view package prices" on public.mykioo_package_prices;
create policy "approved regular members can view package prices"
 on public.mykioo_package_prices for select to authenticated using (
   exists(select 1 from public.mykioo_members m
     where m.user_id=(select auth.uid()) and m.status='approved')
   and not exists(select 1 from public.mykioo_agent_accounts a
     where a.agent_user_id=(select auth.uid()) and a.status <> 'removed')
   and not exists(select 1 from public.mykioo_agent_customers c
     where c.customer_user_id=(select auth.uid()))
 );

drop policy if exists mykioo_orders_own_approved on public.mykioo_orders;
create policy mykioo_orders_own_approved on public.mykioo_orders
 for select to authenticated using (
   member_id=(select auth.uid())
   and exists(select 1 from public.mykioo_members m
     where m.user_id=(select auth.uid()) and m.status='approved')
   and not exists(select 1 from public.mykioo_agent_accounts a
     where a.agent_user_id=(select auth.uid()) and a.status <> 'removed')
   and not exists(select 1 from public.mykioo_agent_customers c
     where c.customer_user_id=(select auth.uid()))
 );

drop policy if exists mykioo_subscription_requests_own on public.mykioo_subscription_requests;
create policy mykioo_subscription_requests_own on public.mykioo_subscription_requests
 for select to authenticated using (
   member_id=(select auth.uid())
   and exists(select 1 from public.mykioo_members m
     where m.user_id=(select auth.uid()) and m.status='approved')
   and not exists(select 1 from public.mykioo_agent_accounts a
     where a.agent_user_id=(select auth.uid()) and a.status <> 'removed')
   and not exists(select 1 from public.mykioo_agent_customers c
     where c.customer_user_id=(select auth.uid()))
 );

drop policy if exists mykioo_billing_invoices_member_read on public.mykioo_billing_invoices;
create policy mykioo_billing_invoices_member_read on public.mykioo_billing_invoices
 for select to authenticated using (
   member_id=(select auth.uid())
   and exists(select 1 from public.mykioo_members m
     where m.user_id=(select auth.uid()) and m.status='approved')
   and not exists(select 1 from public.mykioo_agent_accounts a
     where a.agent_user_id=(select auth.uid()) and a.status <> 'removed')
   and not exists(select 1 from public.mykioo_agent_customers c
     where c.customer_user_id=(select auth.uid()))
 );

-- Removed agents retain no access to their historic reseller customer/order data.
drop policy if exists mykioo_agent_order_read on public.mykioo_agent_order_intents;
create policy mykioo_agent_order_read on public.mykioo_agent_order_intents
 for select to authenticated using (
   public.mykioo_is_owner_for_agents()
   or (agent_user_id=(select auth.uid()) and exists(
      select 1 from public.mykioo_agent_accounts a
      where a.agent_user_id=(select auth.uid()) and a.status='active'))
 );
drop policy if exists mykioo_agent_invite_read on public.mykioo_agent_invitation_requests;
create policy mykioo_agent_invite_read on public.mykioo_agent_invitation_requests
 for select to authenticated using (
   public.mykioo_is_owner_for_agents()
   or (agent_user_id=(select auth.uid()) and exists(
      select 1 from public.mykioo_agent_accounts a
      where a.agent_user_id=(select auth.uid()) and a.status='active'))
 );
notify pgrst, 'reload schema';
commit;
