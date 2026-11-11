import {useEffect,useState,useCallback} from 'react';
import {supabase} from './supabase';

export function useSupportUnread(userId,tickets){
 const [counts,setCounts]=useState({});
 const ticketIds=(tickets||[]).map(t=>t.id).filter(Boolean);
 const key=ticketIds.slice().sort().join(',');
 const sync=useCallback(async()=>{
  if(!supabase||!userId||ticketIds.length===0){setCounts({});return}
  try{
   const [messages,reads]=await Promise.all([
    supabase.from('mykioo_support_messages').select('ticket_id,sender_id,created_at')
      .in('ticket_id',ticketIds).order('created_at',{ascending:false}).limit(2000),
    supabase.from('mykioo_support_reads').select('ticket_id,last_read_at')
      .eq('user_id',userId).in('ticket_id',ticketIds)
   ]);
   if(messages.error||reads.error)return;
   const dates=Object.fromEntries((reads.data||[]).map(x=>[x.ticket_id,Date.parse(x.last_read_at)]));
   const totals={};
   for(const m of messages.data||[]){
    if(m.sender_id===userId)continue;
    if(Date.parse(m.created_at)>(dates[m.ticket_id]||0))totals[m.ticket_id]=(totals[m.ticket_id]||0)+1;
   }
   setCounts(old=>JSON.stringify(old)===JSON.stringify(totals)?old:totals);
  }catch(e){console.warn('MYKIOO unread sync error',e)}
 },[userId,key]);
 useEffect(()=>{
  if(!supabase||!userId)return;
  let channel=supabase.channel('mykioo-unread-'+userId)
    .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_support_messages'},()=>sync())
    .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_support_reads',filter:'user_id=eq.'+userId},()=>sync());
  channel.subscribe(status=>{if(status==='SUBSCRIBED')sync()});
  const interval=setInterval(()=>{if(document.visibilityState==='visible')sync()},12000);
  const resume=()=>{if(document.visibilityState==='visible')sync()};
  window.addEventListener('focus',resume);document.addEventListener('visibilitychange',resume);
  sync();
  return()=>{clearInterval(interval);window.removeEventListener('focus',resume);document.removeEventListener('visibilitychange',resume);supabase.removeChannel(channel)};
 },[userId,key,sync]);
 const total=Object.values(counts).reduce((sum,n)=>sum+n,0);
 return {counts,total,sync};
}
