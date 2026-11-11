import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';

const url='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-subscription-requests';
const labels={
 pending:['Pending review','En attente de traitement'],
 in_review:['Being reviewed','En cours de traitement'],
 fulfilled:['Completed','Terminé'],
 declined:['Declined','Refusé']
};
export default function SubscriptionRequests({userId,language='en'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [service,setService]=useState(''),[device,setDevice]=useState(''),[notes,setNotes]=useState('');
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  if(!supabase||!userId)return;
  let active=true,running=false;
  async function load(){
   if(!active||running)return;running=true;
   try{
    const {data,error:err}=await supabase.from('mykioo_subscription_requests')
     .select('id,service_name,device_label,notes,status,created_at,updated_at,subscription_id')
     .eq('member_id',userId).order('created_at',{ascending:false}).limit(50);
    if(!err&&active){setRows(data||[]);setError('')}
   }finally{running=false;if(active)setLoading(false)}
  }
  load();
  const channel=supabase.channel('mykioo-my-subscription-requests-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_subscription_requests',filter:'member_id=eq.'+userId},load)
   .subscribe(state=>{if(state==='SUBSCRIBED')load()});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')load()},12000);
  const resume=()=>{if(document.visibilityState==='visible')load()};
  window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);supabase.removeChannel(channel)};
 },[userId]);
 async function submit(e){
  e.preventDefault();if(saving)return;
  setSaving(true);setNotice('');setError('');
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error(tr('Your session has expired. Sign in again.','Votre session a expiré. Reconnectez-vous.'));
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({action:'create',service_name:service.trim(),device_label:device.trim(),notes:notes.trim()})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Could not send request.','Impossible d’envoyer la demande.'));
   setService('');setDevice('');setNotes('');
   setRows(previous=>[{id:result.request.id,service_name:service.trim(),device_label:device.trim(),notes:notes.trim(),status:'pending',created_at:result.request.created_at},...previous]);
   setNotice(tr('Your request has been sent for review. You can follow its status below.','Votre demande a été envoyée pour approbation. Vous pouvez suivre son statut ci-dessous.'));
  }catch(err){setError(err.message||tr('Could not send request.','Impossible d’envoyer la demande.'))}
  finally{setSaving(false)}
 }
 return <section className="mykioo-request-area">
  <div className="mykioo-support-card">
   <h2>{tr('Request a subscription','Demander un abonnement')}</h2>
   <p>{tr('Tell us which service and device you need. This is a request, not an active subscription. MYKIOO will review it and add your access details once ready.','Indiquez le service et l’appareil souhaités. Il s’agit d’une demande, et non d’un abonnement actif. MYKIOO l’examinera et ajoutera les accès une fois prêts.')}</p>
   <form onSubmit={submit}>
    <label htmlFor="mykioo-request-service">{tr('Service or package requested','Service ou forfait demandé')}</label>
    <input id="mykioo-request-service" required minLength={3} maxLength={80} value={service} onChange={e=>setService(e.target.value)} placeholder={tr('Which service would you like?','Quel service souhaitez-vous ?')}/>
    <label htmlFor="mykioo-request-device">{tr('Device or location','Appareil ou emplacement')}</label>
    <input id="mykioo-request-device" required minLength={2} maxLength={80} value={device} onChange={e=>setDevice(e.target.value)} placeholder={tr('e.g. Bedroom TV, phone','ex. Télé de la chambre, téléphone')}/>
    <label htmlFor="mykioo-request-notes">{tr('Additional details (optional)','Détails supplémentaires (facultatif)')}</label>
    <textarea id="mykioo-request-notes" maxLength={1000} rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder={tr('Tell us anything else we should know','Autres renseignements utiles')}/>
    <button type="submit" disabled={saving}>{saving?tr('Sending…','Envoi…'):tr('Submit request','Envoyer la demande')}</button>
   </form>
   {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
   {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  </div>
  <div className="mykioo-support-card">
   <h2>{tr('Your subscription requests','Vos demandes d’abonnement')}</h2>
   {loading?<p>{tr('Loading requests…','Chargement des demandes…')}</p>:rows.length===0?<p>{tr('You have not requested any subscriptions yet.','Vous n’avez encore fait aucune demande d’abonnement.')}</p>:
   <div className="mykioo-ticket-list">{rows.map(r=><article className="mykioo-ticket" key={r.id}>
     <div className="mykioo-ticket-heading"><strong>{r.service_name}</strong><span className="mykioo-ticket-status">{labels[r.status]?.[fr?1:0]||r.status}</span></div>
     <p>{tr('Device','Appareil')}: {r.device_label}</p>
     {r.notes&&<p>{r.notes}</p>}
     <small>{new Date(r.created_at).toLocaleDateString(fr?'fr-CA':'en-CA')}</small>
     {r.status==='fulfilled'&&<p className="mykioo-request-completed">{tr('Completed. View your new subscription above for login details.','Demande terminée. Consultez votre nouvel abonnement ci-dessus pour les identifiants.')}</p>}
   </article>)}</div>}
  </div>
 </section>;
}
