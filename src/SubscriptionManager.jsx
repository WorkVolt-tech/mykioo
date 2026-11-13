import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';
import SubscriptionDirectory from './SubscriptionDirectory';

const blank={id:'',member_id:'',service_name:'',service_username:'',supplier_reference:'',status:'active',starts_at:'',expires_at:'',contract_days:365,device_count:1,service_password:'',request_id:''};
const todayLocal=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
const addDays=(date,days)=>{if(!date||!days)return '';const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+Number(days));return d.toISOString().slice(0,10)};
const newForm=()=>({...blank,starts_at:todayLocal(),expires_at:addDays(todayLocal(),365)});
const dateOnly=value=>value?new Date(value).toISOString().slice(0,10):'';

export default function SubscriptionManager({members=[],subscriptions=[],requests=[],cancellations=[],language='en',onSaved,view='all',onViewChange}){
 const fr=language==='fr',tr=(en,frText)=>fr?frText:en;
 const [form,setForm]=useState(newForm),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [customerEmail,setCustomerEmail]=useState(''),[createdInvite,setCreatedInvite]=useState(null);
 const [requestFilter,setRequestFilter]=useState('open');
 const [paidRequests,setPaidRequests]=useState(new Set());
 useEffect(()=>{
  let active=true;
  const refresh=async()=>{
   const {data,error}=await supabase.from('mykioo_billing_invoices').select('request_id,state').eq('state','paid').limit(500);
   if(active&&!error)setPaidRequests(new Set((data||[]).map(i=>i.request_id)));
  };
  refresh();const timer=setInterval(refresh,30000);
  return()=>{active=false;clearInterval(timer)};
 },[requests]);
 const clients=members.filter(m=>m.role==='member'||m.role==='owner');
 const pendingCancellationIds=new Set(cancellations.filter(c=>c.status==='pending').map(c=>c.request_id));
 const pendingRequests=requests.filter(r=>['pending','in_review'].includes(r.status));
 const displayedRequests=requestFilter==='open'?pendingRequests:requests;
 function openEditor(){
  onViewChange?.('editor');
  window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{
   document.getElementById('mykioo-subscription-editor')?.scrollIntoView({behavior:'smooth',block:'start'});
  }));
 }
 function startNewSubscription(){
  setForm(newForm());setCustomerEmail('');setCreatedInvite(null);setError('');setNotice('');openEditor();
 }
 function update(field,value){
  setForm(current=>{
    const next={...current,[field]:value};
    if((field==='starts_at'||field==='contract_days')&&next.starts_at&&next.contract_days)
      next.expires_at=addDays(next.starts_at,next.contract_days);
    return next;
  });setNotice('');setError('');
}
 function edit(row){setCustomerEmail(clients.find(m=>m.user_id===row.member_id)?.email||'');setCreatedInvite(null);setForm({id:row.id,member_id:row.member_id,service_name:row.service_name||'',contract_days:row.contract_days??'',service_username:row.service_username||'',supplier_reference:row.supplier_reference||'',status:row.status,starts_at:dateOnly(row.starts_at),expires_at:dateOnly(row.expires_at),service_password:'',device_count:row.device_count||1,request_id:''});setError('');setNotice('');openEditor()}
 function completeRequest(r){
   setCustomerEmail(clients.find(m=>m.user_id===r.member_id)?.email||'');setCreatedInvite(null);
   if(r.preferred_payment_method&&!paidRequests.has(r.id)){
     setError(tr('Verify payment in Billing before completing this request.','Vérifiez le paiement dans Facturation avant de terminer cette demande.'));
     return;
   }
   const today=todayLocal(),days=r.contract_days||365;
   if(r.request_type==='renewal'){
     const previous=subscriptions.find(sub=>sub.id===r.renewal_subscription_id&&sub.member_id===r.member_id);
     if(!previous){setError(tr('The original subscription could not be found.','Impossible de trouver l’abonnement initial.'));return}
     const base=previous.expires_at&&dateOnly(previous.expires_at)>today?dateOnly(previous.expires_at):today;
     setForm({...blank,id:previous.id,request_id:r.id,member_id:r.member_id,service_name:previous.service_name||r.service_name,
       service_username:previous.service_username||'',supplier_reference:previous.supplier_reference||'',status:'active',
       contract_days:days,device_count:r.device_count||1,starts_at:base,expires_at:addDays(base,days)});
   }else{
     setForm({...blank,request_id:r.id,member_id:r.member_id,service_name:r.service_name,contract_days:days,device_count:r.device_count||1,starts_at:today,expires_at:addDays(today,days),status:'active'});
   }
   setNotice(pendingCancellationIds.has(r.id)?tr('Cancellation approval is pending. Completing this order will automatically deny cancellation. No refunds after activation.','Une demande d’annulation attend votre approbation. La finalisation de cette commande refusera automatiquement l’annulation. Aucun remboursement après activation.'):'' );setError('');
   openEditor();
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
  let invitationSent=false;
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error(tr('Please sign in again.','Veuillez vous reconnecter.'));
   const email=customerEmail.trim().toLowerCase();
   if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254)
    throw Error(tr('Enter the customer email address.','Saisissez l’adresse courriel du client.'));
   const matchingMember=clients.find(m=>m.email?.trim().toLowerCase()===email);
   let resolvedMemberId=matchingMember?.user_id||null;
   if(form.id||form.request_id){
    if(!resolvedMemberId||resolvedMemberId!==form.member_id)
     throw Error(tr('This subscription belongs to a different member. Use the existing account email.','Cet abonnement appartient à un autre membre. Utilisez le courriel du compte existant.'));
   }else if(!resolvedMemberId){
    if(createdInvite?.email===email){
     resolvedMemberId=createdInvite.member_id;
    }else{
     const invitationResponse=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-admin',{
      method:'POST',headers:{'Content-Type':'application/json',
       'Authorization':'Bearer '+session.access_token,
       'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
      body:JSON.stringify({action:'invite',email,language})
     });
     const invitation=await invitationResponse.json().catch(()=>({}));
     if(!invitationResponse.ok||!invitation.ok||!invitation.member_id)
      throw Error(invitation.error||tr('Could not issue the customer invitation.','Impossible d’envoyer l’invitation au client.'));
     resolvedMemberId=invitation.member_id;
     invitationSent=true;
     setCreatedInvite({email,member_id:resolvedMemberId});
     setForm(previous=>({...previous,member_id:resolvedMemberId}));
    }
   }
   const payload={action:'save',...form,member_id:resolvedMemberId,contract_days:form.contract_days||null,
    starts_at:form.starts_at||null,expires_at:form.expires_at||null};
   const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-subscriptions',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
    'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Unable to save subscription.','Impossible d’enregistrer l’abonnement.'));
   setForm(newForm());setCustomerEmail('');setCreatedInvite(null);
   setNotice(invitationSent?
    tr('Subscription saved. MYKIOO issued the new customer a site invitation. The account must be approved before access is granted.','Abonnement enregistré. MYKIOO a envoyé une invitation au nouveau client. Le compte doit être approuvé avant l’accès.'):
    tr('Subscription saved for this customer.','Abonnement enregistré pour ce client.'));
   onSaved?.();
  }catch(err){
   setError(((createdInvite||invitationSent)?tr('A site invitation may already have been issued. ','Une invitation a peut-être déjà été envoyée. '):'')+
    (err.message||tr('Unable to save subscription.','Impossible d’enregistrer l’abonnement.')));
  }finally{setSaving(false)}
 }
 return <div className="mykioo-sub-manager mykioo-sub-manager-separated">
  {(error||notice)&&<div className="mykioo-manager-feedback" aria-live="polite">
   {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
   {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  </div>}
  {(view==='all'||view==='requests')&&<section className="mykioo-sub-requests">
   <div className="mykioo-owner-section-tools">
    <div><h2>{tr('Subscription requests','Demandes d’abonnement')} {pendingRequests.length>0&&<span className="mykioo-owner-count">{pendingRequests.length}</span>}</h2>
     <p>{tr('Review requests and open one to complete it. Payment verification happens in Billing.','Examinez les demandes et ouvrez une demande pour la finaliser. La vérification des paiements se fait dans Facturation.')}</p></div>
    <label className="mykioo-manager-filter">{tr('Show requests','Afficher les demandes')}
     <select value={requestFilter} onChange={e=>setRequestFilter(e.target.value)}>
      <option value="open">{tr('Awaiting action','À traiter')}</option><option value="all">{tr('All history','Tout l’historique')}</option>
     </select>
    </label>
   </div>
   {displayedRequests.length===0?<p className="mykioo-owner-empty">{requestFilter==='open'?tr('No requests waiting for action.','Aucune demande en attente.'):tr('No requests yet.','Aucune demande pour le moment.')}</p>:
    displayedRequests.map(r=>{
      const client=clients.find(m=>m.user_id===r.member_id);
      const status=fr?({pending:'En attente',in_review:'En cours',fulfilled:'Terminé',declined:'Refusé',cancelled:'Annulé avant activation'})[r.status]:({pending:'Pending',in_review:'In review',fulfilled:'Completed',declined:'Declined',cancelled:'Cancelled before activation'})[r.status];
      return <article key={r.id} id={"mykioo-process-request-"+r.id} tabIndex={-1} className="mykioo-sub-request-row">
       <div className="mykioo-sub-request-content"><strong>{r.request_type==='renewal'?tr('Renewal: ','Renouvellement : '):''}{r.service_name}</strong><span>{client?.display_name||client?.email||tr('Member','Membre')} · {({30:tr('1 month','1 mois'),90:tr('3 months','3 mois'),183:tr('6 months','6 mois'),365:tr('1 year','1 an'),730:tr('2 years','2 ans')})[r.contract_days]||tr('Custom duration','Durée personnalisée')}</span>
       {r.notes&&<p>{r.notes}</p>}{r.first_reviewed_at&&<small>{tr('Review started','Traitement commencé')}: {new Date(r.first_reviewed_at).toLocaleString(fr?'fr-CA':'en-CA')}</small>}{r.service_activated_at&&<p className="mykioo-external-activation-flag">{tr('Service activated externally','Service activé à l’extérieur')} · {new Date(r.service_activated_at).toLocaleString(fr?'fr-CA':'en-CA')} · {tr('Complete the MYKIOO record next.','Terminez ensuite le dossier MYKIOO.')}</p>}{pendingCancellationIds.has(r.id)&&<p className="mykioo-cancellation-inline-warning">{tr('Cancellation approval requested — completing will automatically deny it.','Demande d’annulation en attente — la finalisation la refusera automatiquement.')}</p>}{r.preferred_payment_method&&<p className="mykioo-package-request-summary">
       {r.device_count||1} {tr('device(s)','appareil(s)')} · {r.contract_days===365?tr('12 months','12 mois'):tr('24 months','24 mois')} · CA$ {Number(r.quoted_price_cad||0).toFixed(2)} · {r.preferred_payment_method.toUpperCase()}
      </p>}
      {r.preferred_payment_method&&<span className={'mykioo-payment-ready '+(paidRequests.has(r.id)?'verified':'pending')}>
       {paidRequests.has(r.id)?tr('Payment verified — ready to complete','Paiement vérifié — prêt à finaliser'):tr('Awaiting verified payment','En attente de vérification du paiement')}
      </span>}
      <small>{new Date(r.created_at).toLocaleDateString(fr?'fr-CA':'en-CA')}</small></div>
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
  </section>}
  {(view==='all'||view==='directory')&&<section className="mykioo-owner-subscriptions-list">
   <div className="mykioo-owner-section-tools">
    <div><h2>{tr('Customer subscriptions','Abonnements des clients')}</h2>
     <p>{tr('Search existing subscriptions and open a record to edit it.','Recherchez les abonnements existants et ouvrez un dossier pour le modifier.')}</p></div>
    <button className="admin-action primary" type="button" onClick={startNewSubscription}>{tr('Add subscription','Ajouter un abonnement')}</button>
   </div>
   <SubscriptionDirectory subscriptions={subscriptions} members={clients} language={language} owner onEdit={edit}/>
  </section>}
  {(view==='all'||view==='editor')&&<section className="admin-invite mykioo-manager-editor" id="mykioo-subscription-editor">
   <div className="mykioo-manager-editor-head">
    <h2>{form.request_id&&form.id?tr('Complete renewal','Terminer le renouvellement'):form.request_id?tr('Complete member request','Terminer la demande du membre'):form.id?tr('Edit subscription','Modifier l’abonnement'):tr('Add a member subscription','Ajouter un abonnement membre')}</h2>
    {view!=='all'&&<button type="button" className="admin-action" onClick={()=>onViewChange?.(form.request_id?'requests':'directory')}>{tr('Back to list','Retour à la liste')}</button>}
   </div>
   <p>{form.request_id&&form.id?tr("This extends the existing subscription and keeps the same login and encrypted password. The expiry date is prefilled and may be adjusted.","Cette opération prolonge l’abonnement existant et conserve ses identifiants et son mot de passe chiffré. La date d’expiration est préremplie et modifiable."):form.request_id?tr("Add the service credentials and dates to complete this request. The member will then see the subscription in their account.","Ajoutez les identifiants et les dates pour terminer cette demande. Le membre verra alors l’abonnement dans son compte."):tr("Each service login can have its own subscription, contract and status.","Chaque identifiant de service peut avoir son propre abonnement, sa durée et son statut.")}</p>
   <form className="mykioo-sub-form" onSubmit={save}>
    <div className="mykioo-owner-customer-email">
     <label htmlFor="mykioo-owner-subscription-email">{tr('Customer email address','Adresse courriel du client')} *</label>
     <input id="mykioo-owner-subscription-email" type="email" autoComplete="email" list="mykioo-owner-member-email-options"
      value={customerEmail} onChange={e=>{setCustomerEmail(e.target.value);setCreatedInvite(null)}} required maxLength={254}
      readOnly={Boolean(form.id||form.request_id)} placeholder="customer@example.com"/>
     <datalist id="mykioo-owner-member-email-options">
      {clients.map(m=><option key={m.user_id} value={m.email}>{m.display_name||m.email}</option>)}
     </datalist>
     <small>{form.id||form.request_id?
      tr('This service belongs to the specified customer. To change ownership, contact support.','Ce service appartient au client indiqué. Pour changer de titulaire, contactez l’assistance.'):
      tr('Existing email: save to that account. New email: create an invitation automatically and attach this subscription to the new account.','Courriel existant : enregistrer dans ce compte. Nouveau courriel : créer automatiquement une invitation et associer cet abonnement au nouveau compte.')}</small>
    </div>
    <label>{tr('Service / package name','Service / nom du forfait')}<input required maxLength={80} value={form.service_name} onChange={e=>update('service_name',e.target.value)} placeholder={tr('e.g. Premium package','ex. Forfait premium')}/></label>

    <label>{tr('Service login username','Identifiant du service')}<input required={Boolean(form.request_id&&!form.id)} maxLength={160} autoComplete="off" value={form.service_username} onChange={e=>update('service_username',e.target.value)} placeholder={tr('Username / login ID','Nom d’utilisateur / identifiant')}/></label>
    <label>{form.id?tr('Replace service password (leave blank to keep)','Remplacer le mot de passe du service (laisser vide pour conserver)'):tr('Service password','Mot de passe du service')}
      <input type="password" required={Boolean(form.request_id&&!form.id)} autoComplete="new-password" maxLength={256} value={form.service_password} onChange={e=>update('service_password',e.target.value)}
       placeholder={tr('Encrypted when saved','Chiffré lors de l’enregistrement')}/></label>
    <label>{tr('Provider reference (optional)','Référence du fournisseur (facultatif)')}<input maxLength={160} value={form.supplier_reference} onChange={e=>update('supplier_reference',e.target.value)}/></label>
    <label>{tr('Status','Statut')}<select value={form.status} onChange={e=>update('status',e.target.value)}>
     {['pending','active','expired','suspended','cancelled'].map(status=><option key={status} value={status}>{tr(({pending:'Pending',active:'Active',expired:'Expired',suspended:'Suspended',cancelled:'Cancelled'})[status],({pending:'En attente',active:'Actif',expired:'Expiré',suspended:'Suspendu',cancelled:'Annulé'})[status])}</option>)}
    </select></label>
    <label>{tr('Number of devices','Nombre d’appareils')}
      <select value={form.device_count} onChange={e=>update('device_count',Number(e.target.value))}>
       {[1,2,3,4,5].map(count=><option key={count} value={count}>{count} {count===1?tr('device','appareil'):tr('devices','appareils')}</option>)}
      </select></label>
     <label>{tr('Service contract','Durée du contrat')}
     <select value={form.contract_days} onChange={e=>update('contract_days',e.target.value?Number(e.target.value):'')}>
      {[30,90,183].includes(Number(form.contract_days))&&<option value={form.contract_days}>{tr('Legacy contract','Ancien contrat')} · {form.contract_days} {tr('days','jours')}</option>}
      <option value={365}>{tr('1 year (365 days)','1 an (365 jours)')}</option>
      <option value={730}>{tr('2 years (730 days)','2 ans (730 jours)')}</option>
      <option value="">{tr('Custom / no preset','Personnalisé / sans durée prédéfinie')}</option>
     </select></label>
    <label>{tr('Start date','Date de début')}<input type="date" value={form.starts_at} onChange={e=>update('starts_at',e.target.value)}/></label>
    <label>{tr('Expiry date — automatically calculated; editable','Date d’expiration — calculée automatiquement, modifiable')}<input type="date" value={form.expires_at} onChange={e=>update('expires_at',e.target.value)}/></label>
    <p className="mykioo-sub-note">{tr('Passwords are encrypted on the server. Members must verify their email before viewing them. Encryption must first be configured in Supabase.','Les mots de passe sont chiffrés sur le serveur. Les membres doivent vérifier leur adresse courriel avant de les afficher. Le chiffrement doit d’abord être configuré dans Supabase.')}</p>
    <div className="mykioo-sub-actions"><button type="submit" disabled={saving||!customerEmail.trim()} className="admin-action primary">{saving?tr('Saving…','Enregistrement…'):tr('Save subscription','Enregistrer l’abonnement')}</button>
     {(form.id||form.request_id)&&<button className="admin-action" type="button" onClick={()=>{setForm(newForm());setCustomerEmail('');setCreatedInvite(null);setError('')}}>{tr("Cancel editing","Annuler")}</button>}
    </div>
   </form>
  </section>}

 </div>;
}
