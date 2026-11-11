import React,{useCallback,useEffect,useState} from 'react';
import {Clock3,NotebookPen,CheckCircle2,AlertCircle,CalendarClock,ArrowUpRight} from 'lucide-react';
import {supabase} from './supabase';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-support-private';
const localInput=value=>{
 if(!value)return '';
 const date=new Date(value);
 if(Number.isNaN(date.getTime()))return '';
 return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);
};

async function ownerAction(payload){
 const {data:{session},error:authError}=await supabase.auth.getSession();
 if(authError||!session)throw Error('Please sign in again.');
 const response=await fetch(endpoint,{
  method:'POST',headers:{'Content-Type':'application/json',
   Authorization:'Bearer '+session.access_token,
   apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
  body:JSON.stringify(payload)
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error(result.error||'Private support operation failed.');
 return result;
}

export function useSupportFollowups(){
 const [followups,setFollowups]=useState([]);
 const refresh=useCallback(async()=>{
  if(!supabase)return;
  try{
   const {data,error}=await supabase.from('mykioo_support_followups')
    .select('ticket_id,due_at,status,completed_at,updated_at')
    .order('due_at',{ascending:true}).limit(500);
   if(error)throw error;
   setFollowups(previous=>JSON.stringify(previous)===JSON.stringify(data||[])?previous:data||[]);
  }catch(error){console.warn('MYKIOO follow-up list refresh',error?.message||error)}
 },[]);
 useEffect(()=>{
  refresh();
  const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},20000);
  const onResume=()=>{if(document.visibilityState==='visible')refresh()};
  window.addEventListener('focus',onResume);
  window.addEventListener('online',onResume);
  document.addEventListener('visibilitychange',onResume);
  return()=>{clearInterval(timer);window.removeEventListener('focus',onResume);
   window.removeEventListener('online',onResume);document.removeEventListener('visibilitychange',onResume)};
 },[refresh]);
 return {followups,refresh};
}

export function OwnerFollowUpBoard({followups=[],tickets=[],language='en',compact=false,onOpenTicket}){
 const fr=language==='fr',tr=(english,french)=>fr?french:english;
 const [now,setNow]=useState(Date.now());
 useEffect(()=>{
  const timer=setInterval(()=>setNow(Date.now()),60000);
  return()=>clearInterval(timer);
 },[]);
 const pending=followups.filter(f=>f.status==='pending');
 const due=pending.filter(f=>Date.parse(f.due_at)<=now);
 const soon=pending.filter(f=>Date.parse(f.due_at)>now&&Date.parse(f.due_at)<now+86400000);
 const upcoming=pending.filter(f=>Date.parse(f.due_at)>=now+86400000);
 const dateText=value=>new Date(value).toLocaleString(fr?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short'});
 return <section className={'mykioo-followup-board '+(compact?'compact':'')}>
  <div className="mykioo-followup-heading"><div>
   <div className="mykioo-followup-eyebrow"><CalendarClock size={17}/>{tr('PRIVATE OWNER TASKS','TÂCHES PRIVÉES DU PROPRIÉTAIRE')}</div>
   <h2>{tr('Support follow-ups','Rappels de suivi des demandes')}</h2>
   <p>{tr('Your personal reminders to revisit support tickets. Members cannot see these dates or notes.','Vos rappels personnels pour revenir aux demandes. Les membres ne voient ni ces dates ni ces notes.')}</p>
  </div></div>
  <div className="mykioo-followup-counts">
   <div className={due.length?'attention':''}><strong>{due.length}</strong><span>{tr('Due now / overdue','À faire / en retard')}</span></div>
   <div><strong>{soon.length}</strong><span>{tr('Next 24 hours','Prochaines 24 heures')}</span></div>
   <div><strong>{upcoming.length}</strong><span>{tr('Later','Plus tard')}</span></div>
  </div>
  {!compact&&<>
   {pending.length===0?<div className="mykioo-followup-empty"><CheckCircle2 size={18}/>{tr('No outstanding follow-ups. Set one inside a ticket below.','Aucun suivi en attente. Créez-en un dans une demande ci-dessous.')}</div>:
    <div className="mykioo-followup-items">{pending.slice(0,15).map(item=>{
     const ticket=tickets.find(t=>t.id===item.ticket_id);
     const passed=Date.parse(item.due_at)<=now;
     return <button type="button" key={item.ticket_id} onClick={()=>onOpenTicket?.({id:item.ticket_id})} className={'mykioo-followup-item '+(passed?'late':'')}>
      {passed?<AlertCircle size={18}/>:<Clock3 size={18}/>}
      <span><strong>{ticket?.subject||tr('Open support ticket','Ouvrir la demande')}</strong><small>{dateText(item.due_at)} · {passed?tr('Due','À faire'):tr('Upcoming','À venir')}</small></span>
      <ArrowUpRight size={17}/>
     </button>;
    })}</div>}
   {pending.length>15&&<small>{tr('Showing the next 15 reminders.','Affichage des 15 prochains rappels.')}</small>}
  </>}
 </section>;
}

export function OwnerPrivateTicketPanel({ticket,language='en',followup=null,onChanged}){
 const fr=language==='fr',tr=(english,french)=>fr?french:english;
 const [expanded,setExpanded]=useState(false),[notes,setNotes]=useState([]);
 const [body,setBody]=useState(''),[editing,setEditing]=useState(null);
 const [due,setDue]=useState(''),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[loading,setLoading]=useState(false);
 const refreshNotes=useCallback(async()=>{
  if(!supabase)return;
  try{
   const {data,error:readError}=await supabase.from('mykioo_support_internal_notes')
    .select('id,ticket_id,body,created_at,updated_at')
    .eq('ticket_id',ticket.id).order('created_at',{ascending:false}).limit(100);
   if(readError)throw readError;
   setNotes(data||[]);
  }catch(err){setError(tr('Unable to load private notes.','Impossible de charger les notes privées.'))}
 },[ticket.id,fr]);
 useEffect(()=>{
  if(!expanded)return;
  setLoading(true);
  setDue(localInput(followup?.status==='pending'?followup.due_at:null));
  refreshNotes().finally(()=>setLoading(false));
 },[expanded,ticket.id]);
 async function act(payload,message){
  if(saving)return false;
  setSaving(true);setError('');setNotice('');
  try{
   await ownerAction({ticket_id:ticket.id,...payload});
   setNotice(message);
   await Promise.all([refreshNotes(),onChanged?.()]);
   return true;
  }catch(err){setError(err.message||tr('Unable to save.','Impossible d’enregistrer.'));return false}
  finally{setSaving(false)}
 }
 async function submitNote(e){
  e.preventDefault();
  const text=body.trim();
  if(text.length<2||text.length>3000)return;
  const ok=await act({action:editing?'edit_note':'add_note',note_id:editing?.id,body:text},
   tr('Private note saved.','Note privée enregistrée.'));
  if(ok){setBody('');setEditing(null)}
 }
 async function removeNote(note){
  if(!window.confirm(tr('Delete this private note?','Supprimer cette note privée ?')))return;
  await act({action:'delete_note',note_id:note.id},tr('Note deleted.','Note supprimée.'));
  if(editing?.id===note.id){setEditing(null);setBody('')}
 }
 async function saveFollowup(e){
  e.preventDefault();
  if(!due||Number.isNaN(new Date(due).getTime()))return;
  await act({action:'set_followup',due_at:new Date(due).toISOString()},
   tr('Follow-up reminder saved.','Rappel de suivi enregistré.'));
 }
 async function complete(){
  const ok=await act({action:'complete_followup'},tr('Follow-up marked done.','Suivi marqué comme terminé.'));
  if(ok)setDue('');
 }
 const isPending=followup?.status==='pending';
 return <section className="mykioo-private-ticket">
  <button type="button" className="mykioo-private-toggle" aria-expanded={expanded} onClick={()=>{setExpanded(value=>!value);setNotice('');setError('')}}>
   <NotebookPen size={17}/>{tr('Private notes & follow-up','Notes privées et rappel de suivi')}
   {isPending&&<span className="mykioo-private-due-marker"><Clock3 size={13}/>{new Date(followup.due_at).toLocaleDateString(fr?'fr-CA':'en-CA')}</span>}
  </button>
  {expanded&&<div className="mykioo-private-body">
   <p className="mykioo-private-disclaimer">{tr('Visible only to you. These notes and reminder dates are never shared with members or sent by email.','Visible uniquement par vous. Ces notes et rappels ne sont jamais communiqués aux membres ni envoyés par courriel.')}</p>
   <div className="mykioo-private-layout">
    <div className="mykioo-private-notes-area">
     <h4>{tr('Internal notes','Notes internes')}</h4>
     <form onSubmit={submitNote} className="mykioo-private-note-form">
      <label htmlFor={'mykioo-internal-note-'+ticket.id}>{editing?tr('Edit note','Modifier la note'):tr('New note','Nouvelle note')}</label>
      <textarea id={'mykioo-internal-note-'+ticket.id} rows={3} maxLength={3000} minLength={2} required
       placeholder={tr('What have you checked? What should you do next?','Qu’avez-vous vérifié ? Quelle est la prochaine étape ?')}
       value={body} onChange={e=>setBody(e.target.value)}/>
      <div className="mykioo-private-actions">
       <button type="submit" disabled={saving||body.trim().length<2}>{saving?tr('Saving…','Enregistrement…'):editing?tr('Save changes','Enregistrer les modifications'):tr('Add private note','Ajouter une note privée')}</button>
       {editing&&<button type="button" disabled={saving} onClick={()=>{setEditing(null);setBody('')}}>{tr('Cancel edit','Annuler')}</button>}
      </div>
     </form>
     {loading?<p>{tr('Loading private notes…','Chargement des notes privées…')}</p>:
      notes.length===0?<p className="mykioo-private-muted">{tr('No private notes yet.','Aucune note privée.')}</p>:
      <div className="mykioo-private-note-list">{notes.map(note=><article key={note.id}>
       <p>{note.body}</p>
       <small>{new Date(note.created_at).toLocaleString(fr?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short'})}
        {note.updated_at!==note.created_at?' · '+tr('edited','modifiée'):''}</small>
       <div className="mykioo-private-actions">
        <button type="button" disabled={saving} onClick={()=>{setEditing(note);setBody(note.body)}}>{tr('Edit','Modifier')}</button>
        <button type="button" disabled={saving} onClick={()=>removeNote(note)}>{tr('Delete','Supprimer')}</button>
       </div>
      </article>)}</div>}
    </div>
    <div className="mykioo-private-followup-area">
     <h4>{tr('Follow-up reminder','Rappel de suivi')}</h4>
     {isPending&&<p className="mykioo-private-reminder-current">{tr('Scheduled','Prévu')}: {new Date(followup.due_at).toLocaleString(fr?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short'})}</p>}
     <form onSubmit={saveFollowup} className="mykioo-private-followup-form">
      <label htmlFor={'mykioo-followup-date-'+ticket.id}>{tr('Date and time','Date et heure')}</label>
      <input id={'mykioo-followup-date-'+ticket.id} type="datetime-local" required value={due} onChange={e=>setDue(e.target.value)}/>
      <button type="submit" disabled={saving||!due}>{tr('Save follow-up','Enregistrer le rappel')}</button>
     </form>
     {isPending&&<button type="button" className="mykioo-private-complete" disabled={saving} onClick={complete}>
      <CheckCircle2 size={15}/>{tr('Mark follow-up done','Marquer le suivi terminé')}
     </button>}
     <small>{tr('Reminders appear in your owner dashboard. No customer email is sent.','Les rappels apparaissent dans votre tableau de bord. Aucun courriel n’est envoyé au client.')}</small>
    </div>
   </div>
   {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
   {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  </div>}
 </section>;
}
