-- MYKIOO owner-only mailbox/member associations.
-- No authenticated or anonymous direct table permissions. The owner-checked Edge Function uses service role.
create table if not exists public.mykioo_mail_links (
 message_id text primary key check (char_length(message_id) between 3 and 512),
 member_id uuid not null references public.mykioo_members(user_id) on delete cascade,
 linked_by uuid not null references auth.users(id),
 updated_at timestamptz not null default now()
);
create index if not exists mykioo_mail_links_member_idx on public.mykioo_mail_links(member_id);
alter table public.mykioo_mail_links enable row level security;
revoke all on public.mykioo_mail_links from anon,authenticated;
comment on table public.mykioo_mail_links is 'Owner-only member linking for IONOS mailbox messages; accessed solely by authenticated MYKIOO Mail Center Edge Function.';
