import React,{useEffect,useState,useCallback} from 'react';
import {Bell,CheckCheck,LifeBuoy,CalendarDays,AlertTriangle,ClipboardList,MessageSquarePlus} from 'lucide-react';
import {supabase} from './supabase';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-notifications';
export function useNotifications(userId){
 const [items,setItems]=useState([]);
 const sync=useCallback(async()=>{
  if(!supabase||!userId){setItems([]);return}
  try{
   const {data,error}=await supabase.from('mykioo_notifications')
    .select('id,kind,source_id,title_en,title_fr,body_en,body_fr,destination,created_at,read_at')
    .eq('user_id',userId).order('created_at',{ascending:false}).limit(100);
   if(!error)setItems(old=>JSON.stringify(old)===JSON.stringify(data||[])?old:data||[]);
  }catch(err){console.warn('MYKIOO notification fetch error',err)}
 },[userId]);
 useEffect(()=>{
  if(!userId||!supabase)return;
  sync();
  const channel=supabase.channel('mykioo-notifications-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_notifications',filter:'user_id=eq.'+userId},sync)
   .subscribe(status=>{if(status==='SUBSCRIBED')sync()});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')sync()},12000);
  const onResume=()=>{if(document.visibilityState==='visible')sync()};
  window.addEventListener('focus',onResume);window.addEventListener('online',onResume);document.addEventListener('visibilitychange',onResume);
  return()=>{clearInterval(timer);window.removeEventListener('focus',onResume);window.removeEventListener('online',onResume);document.removeEventListener('visibilitychange',onResume);supabase.removeChannel(channel)};
 },[userId,sync]);
 const markRead=useCallback(async(id)=>{
  if(!id)return false;
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)return false;
   const response=await fetch(endpoint,{method:'POST',headers:{
    'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
    'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
   },body:JSON.stringify({action:'mark_read',id})});
   if(!response.ok)return false;
   setItems(previous=>previous.map(x=>(id==='all'||x.id===id)?{...x,read_at:x.read_at||new Date().toISOString()}:x));
   sync();
   return true;
  }catch(err){console.warn('MYKIOO notification read error',err);return false}
 },[sync]);
 return {notifications:items,unread:items.filter(x=>!x.read_at).length,markRead};
}
const icons={support_reply:LifeBuoy,support_ticket:MessageSquarePlus,subscription_update:CalendarDays,subscription_request:ClipboardList,service_alert:AlertTriangle};
export function NotificationCenter({items=[],language='en',owner=false,onSelect,markRead,compact=false}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [error,setError]=useState('');
 const unread=items.filter(n=>!n.read_at).length;
 async function select(n){
  setError('');
  if(!n.read_at){const ok=await markRead(n.id);if(!ok)setError(tr('Could not update read status.','Impossible de mettre à jour la lecture.'))}
  onSelect?.(n.destination==='subscription'?(owner?'subscriptions':'Subscription'):(owner?'support':'Support'),n);
 }
 return <section className={'mykioo-notification-center '+(compact?'compact':'')}>
  <div className="mykioo-notification-header">
   <div><h2><Bell size={19}/>{tr('Notifications','Notifications')}{unread>0&&<span className="mykioo-unread-dot">{unread>99?'99+':unread}</span>}</h2>
    <p>{tr('Updates to your subscriptions, support, and service announcements.','Nouvelles de vos abonnements, de l’assistance et des annonces de service.')}</p></div>
   {unread>0&&<button type="button" className="mykioo-mark-all" onClick={async()=>{const ok=await markRead('all');if(!ok)setError(tr('Could not mark notifications as read.','Impossible de marquer les notifications comme lues.'))}}><CheckCheck size={16}/>{tr('Mark all read','Tout marquer comme lu')}</button>}
  </div>
  {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
  {!items.length?<p className="mykioo-notifications-empty">{tr('No notifications yet.','Aucune notification pour le moment.')}</p>:
   <div className="mykioo-notification-list">{items.slice(0,compact?6:60).map(n=>{
    const Icon=icons[n.kind]||Bell;
    return <button key={n.id} type="button" className={'mykioo-notification-item '+(!n.read_at?'unread':'')} onClick={()=>select(n)}>
     <Icon size={18}/><span><strong>{fr?n.title_fr:n.title_en}</strong><small>{fr?n.body_fr:n.body_en}</small>
     <small>{new Date(n.created_at).toLocaleString(fr?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short'})}</small></span>
     {!n.read_at&&<span className="mykioo-notification-indicator" aria-label={tr('Unread','Non lue')}/>}
    </button>
   })}</div>}
 </section>;
}
