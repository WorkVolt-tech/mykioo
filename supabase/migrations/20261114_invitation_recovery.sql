alter table public.mykioo_invitations
 add column if not exists managed_link boolean not null default false,
 add column if not exists sent_at timestamptz,
 add column if not exists renewal_requested_at timestamptz,
 add column if not exists exchange_started_at timestamptz;

create or replace function public.mykioo_track_invite_acceptance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.email_confirmed_at is not null then
  update public.mykioo_invitations set accepted_at=coalesce(accepted_at,new.last_sign_in_at,new.email_confirmed_at),status='accepted',renewal_requested_at=null
   where accepted_by=new.id and status in ('pending','expired');
 end if;
 return new;
end;
$$;
revoke all on function public.mykioo_track_invite_acceptance() from public,anon,authenticated;
drop trigger if exists mykioo_track_invite_acceptance on auth.users;
create trigger mykioo_track_invite_acceptance after update of email_confirmed_at,last_sign_in_at on auth.users
 for each row execute function public.mykioo_track_invite_acceptance();
update public.mykioo_invitations i set accepted_at=u.email_confirmed_at,status='accepted'
 from auth.users u where i.accepted_by=u.id and u.email_confirmed_at is not null
 and i.accepted_at is null and i.status in ('pending','expired');

create or replace function public.mykioo_request_invitation_renewal(request_email text)
returns void language plpgsql security definer set search_path = '' as $$
declare invitation record;
begin
 if request_email is null or length(request_email)>254 then return; end if;
 for invitation in
  update public.mykioo_invitations i set renewal_requested_at=now()
   where lower(i.email)=lower(trim(request_email)) and i.status<>'revoked'
   and (i.renewal_requested_at is null or i.renewal_requested_at<now()-interval '1 hour')
   and exists(select 1 from public.mykioo_members m where m.user_id=i.accepted_by
    and m.status in ('pending','approved') and (i.accepted_at is null or nullif(trim(m.display_name),'') is null))
   returning i.id,i.email
 loop
  insert into public.mykioo_notifications(user_id,kind,source_id,destination,title_en,title_fr,body_en,body_fr)
   select m.user_id,'invitation_renewal_requested',invitation.id,'invitations',
    'New invitation link requested','Nouveau lien d’invitation demandé',
    invitation.email||' requested a fresh account-setup link.',invitation.email||' demande un nouveau lien de création de compte.'
   from public.mykioo_members m where m.role='owner' and m.status='approved'
   on conflict(user_id,kind,source_id) do update set body_en=excluded.body_en,body_fr=excluded.body_fr;
 end loop;
end;
$$;
revoke all on function public.mykioo_request_invitation_renewal(text) from public;
grant execute on function public.mykioo_request_invitation_renewal(text) to anon,authenticated;
