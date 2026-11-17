-- Save connection details in the same transaction that queues the completion email.
create or replace function public.mykioo_complete_subscription_with_details(p_details jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
 v_result jsonb;
 v_subscription_id uuid := (p_details->>'p_subscription_id')::uuid;
 v_member_id uuid := (p_details->>'p_member_id')::uuid;
 v_host text := nullif(btrim(p_details->>'service_host'),'');
 v_epg text := nullif(btrim(p_details->>'epg_url'),'');
 v_iv text := p_details->>'p_credential_iv';
 v_cipher text := p_details->>'p_credential_cipher';
begin
 if v_host is not null and (char_length(v_host)>4096 or v_host !~* '^https?://[^[:space:]]+$') then
  raise exception 'Invalid service host';
 end if;
 if v_epg is not null and (char_length(v_epg)>4096 or v_epg !~* '^https?://[^[:space:]]+$') then
  raise exception 'Invalid EPG URL';
 end if;
 if (v_iv is not null or v_cipher is not null) and
    (coalesce(char_length(v_iv),0)<10 or coalesce(char_length(v_cipher),0)<10) then
  raise exception 'Invalid encrypted credential';
 end if;
 if p_details->>'kind'='renewal' then
  v_result := public.mykioo_complete_subscription_renewal(
   (p_details->>'p_request_id')::uuid, v_member_id, v_subscription_id,
   (p_details->>'p_actor_id')::uuid, p_details->>'p_service_name',
   p_details->>'p_service_username', p_details->>'p_supplier_reference',
   p_details->>'p_status', (p_details->>'p_contract_days')::integer,
   (p_details->>'p_expires_at')::timestamptz
  );
 elsif p_details->>'kind'='new' then
  v_result := public.mykioo_complete_new_subscription_request(
   (p_details->>'p_request_id')::uuid, v_member_id,
   (p_details->>'p_actor_id')::uuid, v_subscription_id,
   p_details->>'p_service_name', p_details->>'p_service_username',
   p_details->>'p_supplier_reference', p_details->>'p_status',
   (p_details->>'p_contract_days')::integer,
   (p_details->>'p_starts_at')::timestamptz,
   (p_details->>'p_expires_at')::timestamptz,
   p_details->>'p_credential_iv', p_details->>'p_credential_cipher'
  );
 else
  raise exception 'Invalid subscription completion kind';
 end if;
 update public.mykioo_subscriptions
 set service_host=coalesce(v_host,service_host),
     epg_url=case when p_details ? 'epg_url' then v_epg else epg_url end
 where id=v_subscription_id and member_id=v_member_id;
 if not found then
  raise exception 'Subscription connection details could not be saved';
 end if;
 if p_details->>'kind'='renewal' and v_cipher is not null then
  insert into public.mykioo_subscription_credentials(subscription_id,iv,cipher_text,updated_at)
  values(v_subscription_id,v_iv,v_cipher,clock_timestamp())
  on conflict(subscription_id) do update
   set iv=excluded.iv,cipher_text=excluded.cipher_text,updated_at=excluded.updated_at;
  update public.mykioo_subscriptions set has_password=true
   where id=v_subscription_id and member_id=v_member_id;
 end if;
 return v_result;
end;
$$;
revoke all on function public.mykioo_complete_subscription_with_details(jsonb) from public,anon,authenticated;
grant execute on function public.mykioo_complete_subscription_with_details(jsonb) to service_role;
