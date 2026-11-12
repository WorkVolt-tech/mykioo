import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './supabase';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-subscription-requests';
const statuses={
 pending:['Pending review','En attente de traitement'],
 in_review:['Being reviewed','En cours de traitement'],
 fulfilled:['Completed','Terminé'],
 declined:['Declined','Refusé']
};
const durations=[30,90,183,365,730];
const displayDuration=(days,tr)=>({
 30:tr('1 month (30 days)','1 mois (30 jours)'),
 90:tr('3 months (90 days)','3 mois (90 jours)'),
 183:tr('6 months (183 days)','6 mois (183 jours)'),
 365:tr('1 year (365 days)','1 an (365 jours)'),
 730:tr('2 years (730 days)','2 ans (730 jours)')
})[days]||tr('Custom duration','Durée personnalisée');

export default function SubscriptionRequests({userId,subscriptions=[],language='en',owner=false,members=[],requests=[],onSaved}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [targetId,setTargetId]=useState(userId||'');
 const [requestType,setRequestType]=useState('new');
 const [service,setService]=useState(''),[contractDays,setContractDays]=useState(365),[notes,setNotes]=useState(''),[renewalId,setRenewalId]=useState('');
 const [ownRows,setOwnRows]=useState([]),[loading,setLoading]=useState(!owner),
  [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{if(userId&&(!targetId||!owner))setTargetId(userId)},[userId,owner]);
 useEffect(()=>{
  if(owner||!supabase||!userId)return;
  let active=true,running=false;
  async function load(){
   if(!active||running)return;running=true;
   try{
    const {data,error:readError}=await supabase.from('mykioo_subscription_requests')
      .select('id,service_name,contract_days,notes,status,created_at,updated_at,subscription_id,request_type,renewal_subscription_id')
      .eq('member_id',userId).order('created_at',{ascending:false}).limit(50);
    if(!readError&&active){setOwnRows(data||[]);setError('')}
   }finally{running=false;if(active)setLoading(false)}
  }
  load();
  const channel=supabase.channel('mykioo-my-subscription-requests-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_subscription_requests',filter:'member_id=eq.'+userId},load)
   .subscribe(status=>{if(status==='SUBSCRIBED')load()});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')load()},60000);
  const resume=()=>{if(document.visibilityState==='visible')load()};
  window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);supabase.removeChannel(channel)};
 },[userId,owner]);
 const users=useMemo(()=>members.filter(m=>m.status==='approved'&&(m.role==='member'||(m.role==='owner'&&m.user_id===userId))),[members,userId]);
 const rows=owner?requests.filter(r=>r.member_id===targetId):ownRows;
 const selectedSubs=subscriptions.filter(s=>s.member_id===(owner?targetId:userId));
 const eligible=selectedSubs.filter(s=>['active','expired'].includes(s.status));
 const pendingRenewals=new Set(rows.filter(r=>r.request_type==='renewal'&&['pending','in_review'].includes(r.status)).map(r=>r.renewal_subscription_id));
 function chooseType(value){setRequestType(value);setRenewalId('');setError('');setNotice('')}
 function chooseAccount(value){setTargetId(value);setRenewalId('');setRequestType('new');setError('');setNotice('')}
 async function submit(e){
  e.preventDefault();if(saving)return;
  const renewal=requestType==='renewal';
  if(!owner&&renewal&&(!renewalId||pendingRenewals.has(renewalId)))return;
  if(owner&&!users.some(m=>m.user_id===targetId)){setError(tr('Select an approved account.','Choisissez un compte approuvé.'));return}
  if(renewal&&!eligible.some(s=>s.id===renewalId&&!pendingRenewals.has(s.id))){
   setError(tr('Choose an eligible subscription without a pending renewal.','Choisissez un abonnement admissible sans renouvellement en attente.'));return;
  }
  setSaving(true);setError('');setNotice('');
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error(tr('Your session expired. Sign in again.','Votre session a expiré. Reconnectez-vous.'));
   const payload=owner?
     {action:'owner_create',member_id:targetId,request_type:requestType,
       service_name:renewal?undefined:service.trim(),subscription_id:renewal?renewalId:undefined,
       contract_days:contractDays,notes:notes.trim()}:
     renewal?
      {action:'renew',subscription_id:renewalId,contract_days:contractDays,notes:notes.trim()}:
      {action:'create',service_name:service.trim(),contract_days:contractDays,notes:notes.trim()};
   const response=await fetch(endpoint,{method:'POST',headers:{
     'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
     'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
   },body:JSON.stringify(payload)});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Could not send subscription request.','Impossible d’envoyer la demande d’abonnement.'));
   const selected=eligible.find(s=>s.id===renewalId);
   if(!owner)setOwnRows(previous=>[{
      ...result.request,request_type:requestType,
      renewal_subscription_id:renewal?renewalId:null,
      service_name:renewal?(selected?.service_name||'Renewal'):service.trim(),
      contract_days:contractDays,notes:notes.trim(),status:'pending'
    },...previous.filter(r=>r.id!==result.request.id)]);
   setService('');setRenewalId('');setNotes('');setContractDays(365);setRequestType('new');
   setNotice(owner?tr('Request created for the selected account. Complete it in the subscription manager below.','Demande créée pour le compte sélectionné. Terminez-la dans le gestionnaire d’abonnements ci-dessous.'):
     renewal?tr('Renewal requested. Your existing login will be kept.','Renouvellement demandé. Vos identifiants actuels seront conservés.'):
     tr('Your request was sent for review. You can track its status below.','Votre demande a été envoyée pour examen. Vous pouvez suivre son statut ci-dessous.'));
   if(owner)await onSaved?.();
  }catch(err){setError(err.message||tr('Request could not be submitted.','Impossible d’envoyer la demande.'))}
  finally{setSaving(false)}
 }
 return <section className={'mykioo-request-area '+(owner?'mykioo-owner-request-area':'')}>
  <div className="mykioo-support-card">
   <h2>{owner?tr('Create a subscription request','Créer une demande d’abonnement'):tr('Request a subscription','Demander un abonnement')}</h2>
   <p>{owner?
     tr('Create a new or renewal request for your own account or an approved member. Complete requests using the subscription manager below.','Créez une demande nouvelle ou de renouvellement pour votre compte ou un membre approuvé. Terminez les demandes avec le gestionnaire ci-dessous.'):
     tr('Select whether you need a new subscription or want to renew your existing service. MYKIOO will review the request before activation.','Choisissez si vous voulez un nouvel abonnement ou renouveler votre service existant. MYKIOO examinera la demande avant l’activation.')}</p>
   <form onSubmit={submit}>
    {owner&&<>
     <label htmlFor="mykioo-request-account">{tr('Request for account','Demande pour le compte')}</label>
     <select id="mykioo-request-account" required value={targetId} onChange={e=>chooseAccount(e.target.value)}>
      <option value="">{tr('Choose account','Choisir un compte')}</option>
      {users.map(m=><option value={m.user_id} key={m.user_id}>
       {m.user_id===userId?tr('My owner account','Mon compte propriétaire'):m.display_name||m.email} ({m.email})
      </option>)}
     </select>
    </>}
    <label htmlFor="mykioo-request-kind">{tr('Request type','Type de demande')}</label>
    <select id="mykioo-request-kind" value={requestType} onChange={e=>chooseType(e.target.value)}>
     <option value="new">{tr('New subscription','Nouvel abonnement')}</option>
     <option value="renewal" disabled={!eligible.length}>{tr('Renew existing subscription','Renouveler un abonnement existant')}</option>
    </select>
    {requestType==='new'?<>
     <label htmlFor="mykioo-request-service">{tr('Service or package requested','Service ou forfait demandé')}</label>
     <input id="mykioo-request-service" required minLength={3} maxLength={80} value={service}
      onChange={e=>setService(e.target.value)} placeholder={tr('Which service would you like?','Quel service souhaitez-vous ?')}/>
    </>:<>
     <label htmlFor="mykioo-request-renewal-sub">{tr('Existing subscription','Abonnement existant')}</label>
     <select id="mykioo-request-renewal-sub" required value={renewalId} onChange={e=>setRenewalId(e.target.value)}>
      <option value="">{tr('Choose a subscription','Choisir un abonnement')}</option>
      {eligible.map(sub=><option key={sub.id} value={sub.id} disabled={pendingRenewals.has(sub.id)}>
       {sub.service_name||tr('Service','Service')} · {sub.service_username||tr('Account','Compte')} {pendingRenewals.has(sub.id)?tr('(renewal pending)','(renouvellement en attente)'):''}
      </option>)}
     </select>
     <p className="mykioo-request-hint">{tr('Renewal extends this subscription. Your existing login details will be retained.','Le renouvellement prolonge cet abonnement. Vos identifiants existants seront conservés.')}</p>
    </>}
    <label htmlFor="mykioo-request-duration">{requestType==='renewal'?tr('Renewal duration','Durée du renouvellement'):tr('Subscription duration','Durée de l’abonnement')}</label>
    <select id="mykioo-request-duration" value={contractDays} onChange={e=>setContractDays(Number(e.target.value))}>
     {durations.map(days=><option key={days} value={days}>{displayDuration(days,tr)}</option>)}
    </select>
    <label htmlFor="mykioo-request-notes">{tr('Additional details (optional)','Détails supplémentaires (facultatif)')}</label>
    <textarea id="mykioo-request-notes" maxLength={1000} rows={3} value={notes} onChange={e=>setNotes(e.target.value)}
     placeholder={tr('Anything else we should know?','Autres renseignements utiles ?')}/>
    <button type="submit" disabled={saving||(requestType==='renewal'&&(!renewalId||pendingRenewals.has(renewalId)))||(owner&&!targetId)}>
     {saving?tr('Sending…','Envoi…'):requestType==='renewal'?tr('Submit renewal request','Envoyer la demande de renouvellement'):tr('Submit new request','Envoyer la nouvelle demande')}
    </button>
   </form>
   {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
   {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  </div>
  <div className="mykioo-support-card">
   <h2>{owner?tr('Requests for selected account','Demandes du compte sélectionné'):tr('Your subscription requests','Vos demandes d’abonnement')}</h2>
   {loading?<p>{tr('Loading requests…','Chargement des demandes…')}</p>:rows.length===0?
    <p>{tr('No subscription requests yet.','Aucune demande d’abonnement pour le moment.')}</p>:
    <div className="mykioo-ticket-list">{rows.map(r=><article className="mykioo-ticket" key={r.id}>
     <div className="mykioo-ticket-heading">
      <strong>{r.request_type==='renewal'?tr('Renewal: ','Renouvellement : '):''}{r.service_name}</strong>
      <span className="mykioo-ticket-status">{statuses[r.status]?.[fr?1:0]||r.status}</span>
     </div>
     <p>{tr('Duration','Durée')}: {displayDuration(r.contract_days,tr)}</p>
     {r.notes&&<p>{r.notes}</p>}
     <small>{new Date(r.created_at).toLocaleDateString(fr?'fr-CA':'en-CA')}</small>
     {r.status==='fulfilled'&&<p className="mykioo-request-completed">
      {r.request_type==='renewal'?tr('Renewed. Your existing subscription was extended.','Renouvelé. Votre abonnement existant a été prolongé.'):
       tr('Completed. Subscription details are now available.','Demande terminée. Les détails de l’abonnement sont disponibles.')}
     </p>}
    </article>)}</div>}
  </div>
 </section>;
}
