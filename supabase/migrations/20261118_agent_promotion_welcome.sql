-- Track the one-time Agent orientation per activation.
-- Existing active agents see it once on their next login; it is rearmed on re-promotion.
alter table public.mykioo_agent_accounts
 add column if not exists onboarding_acknowledged_at timestamptz;
