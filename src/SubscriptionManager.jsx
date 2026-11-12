import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';

const blank={id:'',member_id:'',service_name:'',service_username:'',supplier_reference:'',status:'active',starts_at:'',expires_at:'',contract_days:365,service_password:'',request_id:''};
const todayLocal=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const addDays=(date,days)=>{if(!date||!days)return '';const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(days));return d.toISOString().slice(0,10)};
const newForm=()=>({...blank,starts_at:todayLocal(),expires_at:addDays(todayLocal(),365)});
const dateOnly=value=>value?new Date(value).toISOString().slice(0,10):'';

export default function SubscriptionManager({members=[],subscriptions=[],requests=[],cancellations=[],language='en',onSaved}){
 const fr=language==='fr',tr=(en,frText)=>fr?frText:en;
 const [form,setForm]=useState(newForm),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const clients=members.filter(m=>m.role==='member'||m.role==='owner');
 const pendingCancellationIds=new Set(cancellations.filter(c=>c.status==='pending').map(c=>c.request_id));
 function update(field,value){
  setForm(current=>{
    const next={...current,[field]:value};
    if((field==='starts_at'||field==='contract_days')&&next.starts_at&&next.contract_days)
      next.expires_at=addDays(next.starts_at,next.contract_days);
    return next;
  });setNotice('');setError('');
}
 function edit(row){setForm({id:row.id,member_id:row.member_id,service_name:row.service_name||'',contract_days:row.contract_days??'',service_username:row.service_username||'',supplier_reference:row.supplier_reference||'',status:row.status,starts_at:dateOnly(row.starts_at),expires_at:dateOnly(row.expires_at),service_password:'',request_id:''});setError('');setNotice('')}
 function completeRequest(r){
   const today=todayLocal(),days=r.contract_days||365;
   if(r.request_type==='renewal'){
     const previous=subscriptions.find(sub=>sub.id===r.renewal_subscription_id&&sub.member_id===r.member_id);
     if(!previous){setError(tr('The original subscription could not be found.','Impossible de trouver l’abonnement initial.'));return}
     const base=previous.expires_at&&dateOnly(previous.expires_at)>today?dateOnly(previous.expires_at):today;
     setForm({...blank,id:previous.id,request_id:r.id,member_id:r.member_id,service_name:previous.service_name||r.service_name,
       service_username:previous.service_username||'',supplier_reference:previous.supplier_reference||'',status:'active',
       contract_days:days,starts_at:base,expires_at:addDays(base,days)});
   }else{
     setForm({...blank,request_id:r.id,member_id:r.member_id,service_name:r.service_name,contract_days:days,starts_at:today,expires_at:addDays(today,days),status:'active'});
   }
   setNotice(pendingCancellationIds.has(r.id)?tr('Cancellation approval is pending. Completing this order will automatically deny cancellation. No refunds after activation.','Une demande d’annulation attend votre approbation. La finalisation de cette commande refusera automatiquement l’annulation. Aucun remboursement après activation.'):'' );setError('');
   document.getElementById('mykioo-subscription-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
 }
 async function markActivated(r){
  if(saving||r.service_activated_at||!['pending','in_review'].includes(r.status))return;
  if(!window.confirm(tr(
   'Confirm this service was ALREADY activated outside MYKIOO? This records an irreversible activation event and denies any pending cancellation request. It does not finish entering the subscription details. Continue?',
   'Confirmez-vous que ce service a DÉJÀ été activé en dehors de MYKIOO ? Cette action enregistre l’activation de façon irréversible et refuse toute demande d’annulation en attente. Elle ne termine pas la saisie des détails de l’abonnement. Continuer ?'
  )))return;
  setSaving(true);setError('');setNotice('');
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error(tr('Please sign in again.','Veuillez vous reconnecter.'));
   const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-subscription-requests',{
    method:'POST',headers:{'Content-Type':'application/json',
     'Authorization':'Bearer '+session.access_token,
     'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify({action:'mark_activated',request_id:r.id})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Unable to record activation.','Impossible d’enregistrer l’activation.'));
   setNotice(tr(
    'External activation recorded. Cancellation is now unavailable. Finish the subscription details using Complete / add login.',
    'Activation externe enregistrée. L’annulation est maintenant impossible. Terminez les détails de l’abonnement avec Terminer / ajouter les accès.'
   ));
   await onSaved?.();
  }catch(err){setError(err.message||tr('Unable to record activation.','Impossible d’enregistrer l’activation.'))}
  finally{setSaving(false)}
 }
 async function changeRequest(r,status){
  if(saving)return;setSaving(true);setError('');setNotice('');
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error(tr('Please sign in again.','Veuillez vous reconnecter.'));
   const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-subscription-requests',{
     method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
     body:JSON.stringify({action:'change_status',request_id:r.id,status})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Could not update request.','Impossible de mettre à jour la demande.'));
   setNotice(tr('Request updated.','Demande mise à jour.'));onSaved?.();
  }catch(err){setError(err.message||tr('Could not update request.','Impossible de mettre à jour la demande.'))}
  finally{setSaving(false)}
 }
 async function save(e){
  e.preventDefault();if(saving)return;
  if(form.request_id&&pendingCancellationIds.has(form.request_id)&&
     !window.confirm(tr('A member has requested cancellation approval. Completing this subscription will deny the cancellation and activate or extend service without a refund. Continue?','Un membre a demandé une approbation d’annulation. Finaliser cet abonnement refusera l’annulation et activera ou prolongera le service sans remboursement. Continuer ?')))return;
  setSaving(true);setError('');setNotice('');
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error(tr('Please sign in again.','Veuillez vous reconnecter.'));
   const payload={action:'save',...form,contract_days:form.contract_days||null,starts_at:form.starts_at||null,expires_at:form.expires_at||null};
   const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-subscriptions',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
    'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Unable to save subscription.','Impossible d’enregistrer l’abonnement.'));
   setForm(newForm());setNotice(tr('Subscription saved.','Abonnement enregistré.'));onSaved?.();
  }catch(err){setError(err.message||tr('Unable to save subscription.','Impossible d’enregistrer l’abonnement.'))}
  finally{setSaving(false)}
 }
 return <div className="mykioo-sub-manager">
  <section className="mykioo-sub-requests">
   <h2>{tr('Subscription requests','Demandes d’abonnement')}{requests.some(r=>r.status==='pending')&&<span className="mykioo-unread-dot">{requests.filter(r=>r.status==='pending').length}</span>}</h2>
   <p>{tr('Review member requests. Complete one to assign a subscription and its service login.','Examinez les demandes des membres. Terminez une demande pour attribuer un abonnement et ses identifiants.')}</p>
   {requests.length===0?<p>{tr('No requests yet.','Aucune demande pour le moment.')}</p>:
    requests.map(r=>{
      const client=clients.find(m=>m.user_id===r.member_id);
      const status=fr?({pending:'En attente',in_review:'En cours',fulfilled:'Terminé',declined:'Refusé',cancelled:'Annulé avant activation'})[r.status]:({pending:'Pending',in_review:'In review',fulfilled:'Completed',declined:'Declined',cancelled:'Cancelled before activation'})[r.status];
      return <article key={r.id} className="mykioo-sub-request-row">
       <div className="mykioo-sub-request-content"><strong>{r.request_type==='renewal'?tr('Renewal: ','Renouvellement : '):''}{r.service_name}</strong><span>{client?.display_name||client?.email||tr('Member','Membre')} · {({30:tr('1 month','1 mois'),90:tr('3 months','3 mois'),183:tr('6 months','6 mois'),365:tr('1 year','1 an'),730:tr('2 years','2 ans')})[r.contract_days]||tr('Custom duration','Durée personnalisée')}</span>
       {r.notes&&<p>{r.notes}</p>}{r.first_reviewed_at&&<small>{tr('Review started','Traitement commencé')}: {new Date(r.first_reviewed_at).toLocaleString(fr?'fr-CA':'en-CA')}</small>}{r.service_activated_at&&<p className="mykioo-external-activation-flag">{tr('Service activated externally','Service activé à l’extérieur')} · {new Date(r.service_activated_at).toLocaleString(fr?'fr-CA':'en-CA')} · {tr('Complete the MYKIOO record next.','Terminez ensuite le dossier MYKIOO.')}</p>}{pendingCancellationIds.has(r.id)&&<p className="mykioo-cancellation-inline-warning">{tr('Cancellation approval requested — completing will automatically deny it.','Demande d’annulation en attente — la finalisation la refusera automatiquement.')}</p>}<small>{new Date(r.created_at).toLocaleDateString(fr?'fr-CA':'en-CA')}</small></div>
       <span className="mykioo-ticket-status">{status||r.status}</span>
       {['pending','in_review'].includes(r.status)&&<div className="mykioo-sub-request-actions">
         <button type="button" disabled={saving} onClick={()=>completeRequest(r)}>{r.request_type==='renewal'?tr('Approve / extend contract','Approuver / prolonger le contrat'):tr('Complete / add login','Terminer / ajouter les accès')}</button>
         {!r.service_activated_at&&<button type="button" disabled={saving} className="mykioo-record-external-activation" onClick={()=>markActivated(r)}>{tr('Mark already activated','Marquer comme déjà activé')}</button>}
         {r.status==='pending'&&<button type="button" disabled={saving} onClick={()=>changeRequest(r,'in_review')}>{tr('Mark reviewing','Marquer en cours')}</button>}
         {!r.service_activated_at&&<button type="button" disabled={saving} onClick={()=>changeRequest(r,'declined')}>{tr('Decline','Refuser')}</button>}
       </div>}
       {r.status==='declined'&&<button type="button" disabled={saving} onClick={()=>changeRequest(r,'in_review')}>{tr('Reopen','Rouvrir')}</button>}
      </article>;
    })}
  </section>
  <section className="admin-invite" id="mykioo-subscription-editor">
   <strong>{form.request_id&&form.id?tr('Complete renewal','Terminer le renouvellement'):form.request_id?tr('Complete member request','Terminer la demande du membre'):form.id?tr('Edit subscription','Modifier l’abonnement'):tr('Add a member subscription','Ajouter un abonnement membre')}</strong>
   <p>{form.request_id&&form.id?tr("This extends the existing subscription and keeps the same login and encrypted password. The expiry date is prefilled and may be adjusted.","Cette opération prolonge l’abonnement existant et conserve ses identifiants et son mot de passe chiffré. La date d’expiration est préremplie et modifiable."):form.request_id?tr("Add the service credentials and dates to complete this request. The member will then see the subscription in their account.","Ajoutez les identifiants et les dates pour terminer cette demande. Le membre verra alors l’abonnement dans son compte."):tr("Each service login can have its own subscription, contract and status.","Chaque identifiant de service peut avoir son propre abonnement, sa durée et son statut.")}</p>
   <form className="mykioo-sub-form" onSubmit={save}>
    <label>{tr('Member','Membre')}<select required value={form.member_id} onChange={e=>update('member_id',e.target.value)}>
     <option value="">{tr('Choose a member','Choisir un membre')}</option>
     {clients.map(m=><option key={m.user_id} value={m.user_id}>{m.display_name||m.email} ({m.email})</option>)}
    </select></label>
    <label>{tr('Service / package name','Service / nom du forfait')}<input required maxLength={80} value={form.service_name} onChange={e=>update('service_name',e.target.value)} placeholder={tr('e.g. Premium package','ex. Forfait premium')}/></label>

    <label>{tr('Service login username','Identifiant du service')}<input required={Boolean(form.request_id&&!form.id)} maxLength={160} autoComplete="off" value={form.service_username} onChange={e=>update('service_username',e.target.value)} placeholder={tr('Username / login ID','Nom d’utilisateur / identifiant')}/></label>
    <label>{form.id?tr('Replace service password (leave blank to keep)','Remplacer le mot de passe du service (laisser vide pour conserver)'):tr('Service password','Mot de passe du service')}
      <input type="password" required={Boolean(form.request_id&&!form.id)} autoComplete="new-password" maxLength={256} value={form.service_password} onChange={e=>update('service_password',e.target.value)}
       placeholder={tr('Encrypted when saved','Chiffré lors de l’enregistrement')}/></label>
    <label>{tr('Provider reference (optional)','Référence du fournisseur (facultatif)')}<input maxLength={160} value={form.supplier_reference} onChange={e=>update('supplier_reference',e.target.value)}/></label>
    <label>{tr('Status','Statut')}<select value={form.status} onChange={e=>update('status',e.target.value)}>
     {['pending','active','expired','suspended','cancelled'].map(status=><option key={status} value={status}>{tr(({pending:'Pending',active:'Active',expired:'Expired',suspended:'Suspended',cancelled:'Cancelled'})[status],({pending:'En attente',active:'Actif',expired:'Expiré',suspended:'Suspendu',cancelled:'Annulé'})[status])}</option>)}
    </select></label>
    <label>{tr('Service contract','Durée du contrat')}
     <select value={form.contract_days} onChange={e=>update('contract_days',e.target.value?Number(e.target.value):'')}>
      <option value={30}>{tr('1 month (30 days)','1 mois (30 jours)')}</option>
      <option value={90}>{tr('3 months (90 days)','3 mois (90 jours)')}</option>
      <option value={183}>{tr('6 months (183 days)','6 mois (183 jours)')}</option>
      <option value={365}>{tr('1 year (365 days)','1 an (365 jours)')}</option>
      <option value={730}>{tr('2 years (730 days)','2 ans (730 jours)')}</option>
      <option value="">{tr('Custom / no preset','Personnalisé / sans durée prédéfinie')}</option>
     </select></label>
    <label>{tr('Start date','Date de début')}<input type="date" value={form.starts_at} onChange={e=>update('starts_at',e.target.value)}/></label>
    <label>{tr('Expiry date — automatically calculated; editable','Date d’expiration — calculée automatiquement, modifiable')}<input type="date" value={form.expires_at} onChange={e=>update('expires_at',e.target.value)}/></label>
    <p className="mykioo-sub-note">{tr('Passwords are encrypted on the server. Members must verify their email before viewing them. Encryption must first be configured in Supabase.','Les mots de passe sont chiffrés sur le serveur. Les membres doivent vérifier leur adresse courriel avant de les afficher. Le chiffrement doit d’abord être configuré dans Supabase.')}</p>
    {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
    {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
    <div className="mykioo-sub-actions"><button type="submit" disabled={saving||!clients.length} className="admin-action primary">{saving?tr('Saving…','Enregistrement…'):tr('Save subscription','Enregistrer l’abonnement')}</button>
     {(form.id||form.request_id)&&<button className="admin-action" type="button" onClick={()=>{setForm(newForm());setError('')}}>{tr("Cancel editing","Annuler")}</button>}
    </div>
   </form>
  </section>
  <section className="mykioo-sub-list">
   <h2>{tr('Member subscriptions','Abonnements des membres')}</h2>
   {subscriptions.length===0?<p>{tr('No subscriptions yet.','Aucun abonnement pour le moment.')}</p>:
    subscriptions.map(sub=>{
      const member=clients.find(m=>m.user_id===sub.member_id);
      return <article className="mykioo-sub-item" key={sub.id}>
       <div><strong>{sub.service_name||tr('Unnamed service','Service sans nom')}</strong><span>{member?.display_name||member?.email||sub.member_id}</span>
       <small>{[sub.service_username,sub.expires_at&&dateOnly(sub.expires_at)].filter(Boolean).join(' · ')}</small></div>
       <span className="mykioo-ticket-status">{sub.status}</span>{sub.has_password&&<span className="mykioo-credentials-chip">{tr('Password saved','Mot de passe enregistré')}</span>}
       <button className="admin-mini" onClick={()=>edit(sub)}>{tr('Edit','Modifier')}</button>
      </article>
    })}
  </section>
 </div>;
}
