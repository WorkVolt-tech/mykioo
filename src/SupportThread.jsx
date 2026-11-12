import {SupportScreenshots} from './SupportScreenshots';
import {useReplyTemplates} from './ReplyTemplates';
import React,{useEffect,useState,useRef} from 'react';
import {supabase} from './supabase';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-support';

export default function SupportThread({ticket,userId,language='en',owner=false,recipientLanguage='en',unread=0,onRead}){
 const fr=language==='fr',tr=(en,frText)=>fr?frText:en;
 const {templates}=useReplyTemplates(owner);
 const [draftLanguage,setDraftLanguage]=useState(recipientLanguage==='fr'?'fr':'en');
 const [selectedTemplate,setSelectedTemplate]=useState('');
 const latestReadRef=useRef('');const [expanded,setExpanded]=useState(false);const [messages,setMessages]=useState([]),[body,setBody]=useState(''),[loading,setLoading]=useState(true),[sending,setSending]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  if(!expanded)return;
  let active=true,fetching=false;
  async function markRead(){
   try{
    const {data:{session}}=await supabase.auth.getSession();
    if(!active||!session)return;
    const response=await fetch(endpoint,{method:'POST',headers:{
      'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
      'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    },body:JSON.stringify({action:'mark_read',ticket_id:ticket.id})});
    if(response.ok)onRead?.();
   }catch(e){console.warn('MYKIOO read receipt failed',e)}
  }
  async function reload(){
   if(!active||fetching)return;
   fetching=true;
   try{
    const {data,error:err}=await supabase.from('mykioo_support_messages')
     .select('id,ticket_id,sender_id,body,created_at')
     .eq('ticket_id',ticket.id).order('created_at',{ascending:true}).limit(200);
    if(err)throw err;
    if(active){
     setMessages(data||[]);setError('');
     const latest=(data||[]).filter(m=>m.sender_id!==userId).at(-1);
     if(latest&&latest.id!==latestReadRef.current){
      latestReadRef.current=latest.id;
      markRead();
     }
    }
   }catch(e){if(active)setError(tr('Unable to load messages.','Impossible de charger les messages.'))}
   finally{fetching=false;if(active)setLoading(false)}
  }
  latestReadRef.current='';setMessages([]);setLoading(true);reload();
  const channel=supabase.channel('mykioo-thread-'+ticket.id)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'mykioo_support_messages',filter:'ticket_id=eq.'+ticket.id},reload)
   .subscribe(status=>{if(status==='SUBSCRIBED')reload()});
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')reload()},12000);
  const onResume=()=>{if(document.visibilityState==='visible')reload()};
  window.addEventListener('focus',onResume);
  window.addEventListener('online',onResume);
  document.addEventListener('visibilitychange',onResume);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',onResume);window.removeEventListener('online',onResume);document.removeEventListener('visibilitychange',onResume);supabase.removeChannel(channel)};
 },[ticket.id,language,expanded,userId]);
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
   setBody('');setSelectedTemplate('');
   setMessages(previous=>previous.some(m=>m.id===result.message.id)?previous:[...previous,result.message]);
   setNotice(tr('Reply sent.','Réponse envoyée.'));
  }catch(err){setError(err.message||tr('Unable to send reply.','Impossible d’envoyer la réponse.'))}
  finally{setSending(false)}
 }
 return <div className="mykioo-thread">
  <button type="button" className="mykioo-thread-toggle" aria-expanded={expanded} onClick={()=>setExpanded(value=>!value)}>{expanded?tr("Hide conversation","Masquer la conversation"):tr("View conversation / Reply","Voir la conversation / Répondre")}{!expanded&&unread>0&&<span className="mykioo-unread-dot">{unread>99?"99+":unread}</span>}</button>
  {expanded&&<div className="mykioo-thread-content"><h4>{tr('Conversation','Conversation')}</h4>
  {loading?<p>{tr('Loading messages…','Chargement des messages…')}</p>:
   messages.length===0?<p className="mykioo-thread-empty">{tr('No replies yet. Start the conversation below.','Aucune réponse. Commencez la conversation ci-dessous.')}</p>:
   <div className="mykioo-thread-messages">{messages.map(m=><div key={m.id} className={'mykioo-thread-message '+(m.sender_id===userId?'mine':'theirs')}>
    <div className="mykioo-thread-who">{m.sender_id===userId?tr('You','Vous'):owner?tr('Member','Membre'):'MYKIOO'}</div>
    <p>{m.body}</p><small>{new Date(m.created_at).toLocaleString(fr?'fr-CA':'en-CA')}</small>
   </div>)}</div>}
  <SupportScreenshots ticket={ticket} language={language} owner={owner} userId={userId}/>
  {ticket.status==='closed'?<p className="mykioo-thread-empty">{tr('This ticket is closed.','Cette demande est fermée.')}</p>:
   <form onSubmit={send} className="mykioo-thread-form">
    {owner&&<div className="mykioo-template-insert">
     <label htmlFor={'mykioo-template-language-'+ticket.id}>{tr('Reply language','Langue de la réponse')}</label>
     <select id={'mykioo-template-language-'+ticket.id} value={draftLanguage} onChange={e=>{setDraftLanguage(e.target.value);setSelectedTemplate('')}}>
      <option value="en">English</option><option value="fr">Français</option>
     </select>
     <label htmlFor={'mykioo-template-select-'+ticket.id}>{tr('Saved reply','Réponse enregistrée')}</label>
     <select id={'mykioo-template-select-'+ticket.id} value={selectedTemplate} onChange={e=>{
       const id=e.target.value;setSelectedTemplate(id);
       const chosen=templates.find(t=>t.id===id);
       if(chosen){setBody(chosen[draftLanguage==='fr'?'body_fr':'body_en']);setNotice('')}
     }}>
      <option value="">{tr('Select a reply to insert (optional)','Choisir une réponse à insérer (facultatif)')}</option>
      {templates.filter(t=>t.is_active).sort((a,b)=>Number(b.category===ticket.category)-Number(a.category===ticket.category))
       .map(t=><option key={t.id} value={t.id}>{t.category===ticket.category?'★ ':''}{draftLanguage==='fr'?t.title_fr:t.title_en}</option>)}
     </select>
     <small>{tr('Selecting a reply fills the editor; nothing is sent until you press Send reply.','La sélection remplit le brouillon; rien n’est envoyé avant de cliquer sur Envoyer la réponse.')}</small>
    </div>}

    <label htmlFor={'mykioo-reply-'+ticket.id}>{tr('Your reply','Votre réponse')}</label>
    <textarea id={'mykioo-reply-'+ticket.id} rows={3} maxLength={4000} required value={body} onChange={e=>{setBody(e.target.value);setNotice('')}} placeholder={tr('Write a message…','Écrivez un message…')}/>
    <button type="submit" disabled={sending||!body.trim()}>{sending?tr('Sending…','Envoi…'):tr('Send reply','Envoyer la réponse')}</button>
   </form>}
  {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
  {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}</div>}
 </div>;
}
