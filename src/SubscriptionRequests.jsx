import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';

const url='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-subscription-requests';
const labels={
 pending:['Pending review','En attente de traitement'],
 in_review:['Being reviewed','En cours de traitement'],
 fulfilled:['Completed','Terminé'],
 declined:['Declined','Refusé']
};
export default function SubscriptionRequests({userId,subscriptions=[],language='en'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [service,setService]=useState(''),[contractDays,setContractDays]=useState(365),[notes,setNotes]=useState(''),[renewalId,setRenewalId]=useState(''),[renewalDays,setRenewalDays]=useState(365),[renewalNotes,setRenewalNotes]=useState('');
 const [rows,setRows]=useState([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{
  if(!supabase||!userId)return;
  let active=true,running=false;
  async function load(){
   if(!active||running)return;running=true;
   try{
    const {data,error:err}=await supabase.from('mykioo_subscription_requests')
     .select('id,service_name,contract_days,notes,status,created_at,updated_at,subscription_id,request_type,renewal_subscription_id')
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
   const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify({action:'create',service_name:service.trim(),contract_days:contractDays,notes:notes.trim()})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Could not send request.','Impossible d’envoyer la demande.'));
   setService('');setContractDays(365);setNotes('');
   setRows(previous=>[{id:result.request.id,service_name:service.trim(),contract_days:contractDays,notes:notes.trim(),status:'pending',created_at:result.request.created_at},...previous]);
   setNotice(tr('Your request has been sent for review. You can follow its status below.','Votre demande a été envoyée pour approbation. Vous pouvez suivre son statut ci-dessous.'));
  }catch(err){setError(err.message||tr('Could not send request.','Impossible d’envoyer la demande.'))}
  finally{setSaving(false)}
 }
 async function requestRenewal(e){
  e.preventDefault();if(saving||!renewalId)return;
  setSaving(true);setNotice('');setError('');
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error(tr('Please sign in again.','Veuillez vous reconnecter.'));
   const response=await fetch(url,{method:'POST',headers:{
    'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
    'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
   },body:JSON.stringify({action:'renew',subscription_id:renewalId,contract_days:renewalDays,notes:renewalNotes.trim()})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Could not send renewal request.','Impossible d’envoyer la demande de renouvellement.'));
   const sub=subscriptions.find(x=>x.id===renewalId);
   setRows(old=>[{...result.request,request_type:'renewal',renewal_subscription_id:renewalId,service_name:sub?.service_name||'Renewal',contract_days:renewalDays,notes:renewalNotes.trim()},...old]);
   setRenewalId('');setRenewalDays(365);setRenewalNotes('');
   setNotice(tr('Renewal requested. Your existing login details will be kept.','Renouvellement demandé. Vos identifiants actuels seront conservés.'));
  }catch(err){setError(err.message||tr('Could not send renewal request.','Impossible d’envoyer la demande de renouvellement.'))}
  finally{setSaving(false)}
 }
 const renewable=subscriptions.filter(x=>['active','expired'].includes(x.status));
 const blockedIds=new Set(rows.filter(r=>r.request_type==='renewal'&&['pending','in_review'].includes(r.status)).map(r=>r.renewal_subscription_id));
 return <section className="mykioo-request-area">
  <div className="mykioo-support-card">
   <h2>{tr('Request a subscription','Demander un abonnement')}</h2>
   <p>{tr('Tell us which service and subscription duration you need. This is a request, not an active subscription. MYKIOO will review it and add your access details once ready.','Indiquez le service et la durée d’abonnement souhaités. Il s’agit d’une demande, et non d’un abonnement actif. MYKIOO l’examinera et ajoutera les accès une fois prêts.')}</p>
   <form onSubmit={submit}>
    <label htmlFor="mykioo-request-service">{tr('Service or package requested','Service ou forfait demandé')}</label>
    <input id="mykioo-request-service" required minLength={3} maxLength={80} value={service} onChange={e=>setService(e.target.value)} placeholder={tr('Which service would you like?','Quel service souhaitez-vous ?')}/>
    <label htmlFor="mykioo-request-duration">{tr('Subscription duration','Durée de l’abonnement')}</label>
    <select id="mykioo-request-duration" value={contractDays} onChange={e=>setContractDays(Number(e.target.value))}>
     <option value={30}>{tr('1 month (30 days)','1 mois (30 jours)')}</option>
     <option value={90}>{tr('3 months (90 days)','3 mois (90 jours)')}</option>
     <option value={183}>{tr('6 months (183 days)','6 mois (183 jours)')}</option>
     <option value={365}>{tr('1 year (365 days)','1 an (365 jours)')}</option>
     <option value={730}>{tr('2 years (730 days)','2 ans (730 jours)')}</option>
    </select>
    <label htmlFor="mykioo-request-notes">{tr('Additional details (optional)','Détails supplémentaires (facultatif)')}</label>
    <textarea id="mykioo-request-notes" maxLength={1000} rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder={tr('Tell us anything else we should know','Autres renseignements utiles')}/>
    <button type="submit" disabled={saving}>{saving?tr('Sending…','Envoi…'):tr('Submit request','Envoyer la demande')}</button>
   </form>
   {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
   {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  </div>
  {renewable.length>0&&<div className="mykioo-support-card">
   <h2>{tr('Renew an existing subscription','Renouveler un abonnement existant')}</h2>
   <p>{tr('Keep your current service login. Choose the subscription you want to extend and the renewal period. Approval is required.','Conservez vos identifiants actuels. Choisissez l’abonnement à prolonger et la durée du renouvellement. L’approbation est requise.')}</p>
   <form onSubmit={requestRenewal}>
    <label htmlFor="mykioo-renewal-sub">{tr('Existing subscription','Abonnement existant')}</label>
    <select id="mykioo-renewal-sub" required value={renewalId} onChange={e=>setRenewalId(e.target.value)}>
     <option value="">{tr('Choose a subscription','Choisir un abonnement')}</option>
     {renewable.map(sub=><option key={sub.id} value={sub.id} disabled={blockedIds.has(sub.id)}>
       {sub.service_name||tr('Service','Service')} · {sub.service_username||tr('Account','Compte')} {blockedIds.has(sub.id)?tr('(renewal pending)','(renouvellement en attente)'):''}
     </option>)}
    </select>
    <label htmlFor="mykioo-renewal-duration">{tr('Renewal duration','Durée du renouvellement')}</label>
    <select id="mykioo-renewal-duration" value={renewalDays} onChange={e=>setRenewalDays(Number(e.target.value))}>
     <option value={30}>{tr('1 month (30 days)','1 mois (30 jours)')}</option>
     <option value={90}>{tr('3 months (90 days)','3 mois (90 jours)')}</option>
     <option value={183}>{tr('6 months (183 days)','6 mois (183 jours)')}</option>
     <option value={365}>{tr('1 year (365 days)','1 an (365 jours)')}</option>
     <option value={730}>{tr('2 years (730 days)','2 ans (730 jours)')}</option>
    </select>
    <label htmlFor="mykioo-renewal-notes">{tr('Notes (optional)','Notes (facultatif)')}</label>
    <textarea id="mykioo-renewal-notes" rows={3} maxLength={1000} value={renewalNotes} onChange={e=>setRenewalNotes(e.target.value)}/>
    <button type="submit" disabled={saving||!renewalId||blockedIds.has(renewalId)}>{saving?tr('Sending…','Envoi…'):tr('Request renewal','Demander le renouvellement')}</button>
   </form>
  </div>}
  <div className="mykioo-support-card">
   <h2>{tr('Your subscription requests','Vos demandes d’abonnement')}</h2>
   {loading?<p>{tr('Loading requests…','Chargement des demandes…')}</p>:rows.length===0?<p>{tr('You have not requested any subscriptions yet.','Vous n’avez encore fait aucune demande d’abonnement.')}</p>:
   <div className="mykioo-ticket-list">{rows.map(r=><article className="mykioo-ticket" key={r.id}>
     <div className="mykioo-ticket-heading"><strong>{r.request_type==='renewal'?tr('Renewal: ','Renouvellement : '):''}{r.service_name}</strong><span className="mykioo-ticket-status">{labels[r.status]?.[fr?1:0]||r.status}</span></div>
     <p>{tr('Duration','Durée')}: {({30:tr('1 month','1 mois'),90:tr('3 months','3 mois'),183:tr('6 months','6 mois'),365:tr('1 year','1 an'),730:tr('2 years','2 ans')})[r.contract_days]||tr('Not specified','Non précisée')}</p>
     {r.notes&&<p>{r.notes}</p>}
     <small>{new Date(r.created_at).toLocaleDateString(fr?'fr-CA':'en-CA')}</small>
     {r.status==='fulfilled'&&<p className="mykioo-request-completed">{r.request_type==='renewal'?tr('Renewed. Your existing subscription was extended.','Renouvelé. Votre abonnement existant a été prolongé.'):tr('Completed. View your new subscription above for login details.','Demande terminée. Consultez votre nouvel abonnement ci-dessus pour les identifiants.')}</p>}
   </article>)}</div>}
  </div>
 </section>;
}
