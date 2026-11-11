import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-support';

export default function SupportThread({ticket,userId,language='en',owner=false}){
 const fr=language==='fr',tr=(en,frText)=>fr?frText:en;
 const [messages,setMessages]=useState([]),[body,setBody]=useState(''),[loading,setLoading]=useState(true),[sending,setSending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  let active=true,fetching=false;
  async function reload(){
   if(!active||fetching)return;
   fetching=true;
   try{
    const {data,error:err}=await supabase.from('mykioo_support_messages')
     .select('id,ticket_id,sender_id,body,created_at')
     .eq('ticket_id',ticket.id).order('created_at',{ascending:true}).limit(200);
    if(err)throw err;
    if(active){setMessages(data||[]);setError('')}
   }catch(e){if(active)setError(tr('Unable to load messages.','Impossible de charger les messages.'))}
   finally{fetching=false;if(active)setLoading(false)}
  }
  setMessages([]);setLoading(true);reload();
  const channel=supabase.channel('mykioo-thread-'+ticket.id)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'mykioo_support_messages',filter:'ticket_id=eq.'+ticket.id},reload)
   .subscribe(status=>{if(status==='SUBSCRIBED')reload()});
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')reload()},12000);
  const onResume=()=>{if(document.visibilityState==='visible')reload()};
  window.addEventListener('focus',onResume);
  window.addEventListener('online',onResume);
  document.addEventListener('visibilitychange',onResume);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',onResume);window.removeEventListener('online',onResume);document.removeEventListener('visibilitychange',onResume);supabase.removeChannel(channel)};
 },[ticket.id,language]);
 async function send(e){
  e.preventDefault();if(sending||ticket.status==='closed')return;
  const content=body.trim();if(!content||content.length>4000)return;
  setError('');setNotice('');setSending(true);
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error(tr('Sign in again to continue.','Veuillez vous reconnecter.'));
   const response=await fetch(endpoint,{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify({action:'reply_ticket',ticket_id:ticket.id,body:content})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Unable to send reply.','Impossible d’envoyer la réponse.'));
   setBody('');
   setMessages(previous=>previous.some(m=>m.id===result.message.id)?previous:[...previous,result.message]);
   setNotice(tr('Reply sent.','Réponse envoyée.'));
  }catch(err){setError(err.message||tr('Unable to send reply.','Impossible d’envoyer la réponse.'))}
  finally{setSending(false)}
 }
 return <div className="mykioo-thread">
  <h4>{tr('Conversation','Conversation')}</h4>
  {loading?<p>{tr('Loading messages…','Chargement des messages…')}</p>:
   messages.length===0?<p className="mykioo-thread-empty">{tr('No replies yet. Start the conversation below.','Aucune réponse. Commencez la conversation ci-dessous.')}</p>:
   <div className="mykioo-thread-messages">{messages.map(m=><div key={m.id} className={'mykioo-thread-message '+(m.sender_id===userId?'mine':'theirs')}>
    <div className="mykioo-thread-who">{m.sender_id===userId?tr('You','Vous'):owner?tr('Member','Membre'):'MYKIOO'}</div>
    <p>{m.body}</p><small>{new Date(m.created_at).toLocaleString(fr?'fr-CA':'en-CA')}</small>
   </div>)}</div>}
  {ticket.status==='closed'?<p className="mykioo-thread-empty">{tr('This ticket is closed.','Cette demande est fermée.')}</p>:
   <form onSubmit={send} className="mykioo-thread-form">
    <label htmlFor={'mykioo-reply-'+ticket.id}>{tr('Your reply','Votre réponse')}</label>
    <textarea id={'mykioo-reply-'+ticket.id} rows={3} maxLength={4000} required value={body} onChange={e=>{setBody(e.target.value);setNotice('')}} placeholder={tr('Write a message…','Écrivez un message…')}/>
    <button type="submit" disabled={sending||!body.trim()}>{sending?tr('Sending…','Envoi…'):tr('Send reply','Envoyer la réponse')}</button>
   </form>}
  {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
  {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
 </div>;
}
