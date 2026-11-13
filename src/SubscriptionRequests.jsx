import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './supabase';
import SubscriptionHistory from './SubscriptionHistory';
import {MemberBilling} from './Billing';
import {priceCAD,PAYMENT_LABELS} from './PackagePricing';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-subscription-requests';
const statuses={
 pending:['Pending review','En attente de traitement'],
 in_review:['Being reviewed','En cours de traitement'],
 fulfilled:['Completed','Terminé'],
 declined:['Declined','Refusé']
};
const durations=[365,730];
const displayDuration=(days,tr)=>({
 30:tr('1 month (30 days)','1 mois (30 jours)'),
 90:tr('3 months (90 days)','3 mois (90 jours)'),
 183:tr('6 months (183 days)','6 mois (183 jours)'),
 365:tr('1 year (365 days)','1 an (365 jours)'),
 730:tr('2 years (730 days)','2 ans (730 jours)')
})[days]||tr('Custom duration','Durée personnalisée');

export default function SubscriptionRequests({userId,subscriptions=[],language='en',owner=false,members=[],requests=[],cancellations=[],onSaved,view='all'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [targetId,setTargetId]=useState(userId||'');
 const [ownerEmail,setOwnerEmail]=useState(''),[createdInvite,setCreatedInvite]=useState(null);
 const [requestType,setRequestType]=useState('new');
 const [service,setService]=useState(owner?'':'MYKIOO TV'),[contractDays,setContractDays]=useState(365),[notes,setNotes]=useState(''),[renewalId,setRenewalId]=useState('');
 const [deviceCount,setDeviceCount]=useState(1),[paymentMethod,setPaymentMethod]=useState('interac');
 const [checkout,setCheckout]=useState(null),[checkoutLoading,setCheckoutLoading]=useState(false);
 const [submittedInvoiceId,setSubmittedInvoiceId]=useState(null);
 const [ownRows,setOwnRows]=useState([]),[ownCancellations,setOwnCancellations]=useState([]),[loading,setLoading]=useState(!owner),
  [saving,setSaving]=useState(false),[cancellingId,setCancellingId]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{if(userId&&(!targetId||!owner))setTargetId(userId)},[userId,owner]);
 useEffect(()=>{
  if(owner||!supabase||!userId)return;
  let active=true,running=false;
  async function load(){
   if(!active||running)return;running=true;
   try{
    const [requestsResult,cancellationsResult]=await Promise.all([
     supabase.from('mykioo_subscription_requests')
      .select('id,service_name,contract_days,notes,status,created_at,updated_at,completed_at,first_reviewed_at,last_declined_at,service_activated_at,previous_expires_at,renewed_expires_at,subscription_id,request_type,renewal_subscription_id,device_count,preferred_payment_method,quoted_price_cad')
      .eq('member_id',userId).order('created_at',{ascending:false}).limit(50),
     supabase.from('mykioo_subscription_cancellation_requests')
      .select('request_id,status,reason,decision_note,created_at,updated_at,reviewed_at')
      .eq('member_id',userId).order('created_at',{ascending:false}).limit(50)
    ]);
    if(!requestsResult.error&&!cancellationsResult.error&&active){
     setOwnRows(requestsResult.data||[]);setOwnCancellations(cancellationsResult.data||[]);setError('');
    }
   }finally{running=false;if(active)setLoading(false)}
  }
  load();
  const channel=supabase.channel('mykioo-my-subscription-requests-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_subscription_requests',filter:'member_id=eq.'+userId},load)
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_subscription_cancellation_requests',filter:'member_id=eq.'+userId},load)
   .subscribe(status=>{if(status==='SUBSCRIBED')load()});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')load()},60000);
  const resume=()=>{if(document.visibilityState==='visible')load()};
  window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);supabase.removeChannel(channel)};
 },[userId,owner]);
 useEffect(()=>{
  if(!supabase||view==='history')return;
  let live=true;const controller=new AbortController();
  setCheckout(null);setCheckoutLoading(true);
  async function loadCheckout(){
   try{
    const {data:{session},error:authError}=await supabase.auth.getSession();
    if(authError||!session)throw Error('Sign in again to view payment instructions');
    const response=await fetch(endpoint,{method:'POST',signal:controller.signal,headers:{
      'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
      'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    },body:JSON.stringify({action:'get_checkout',contract_days:contractDays,device_count:deviceCount,preferred_payment_method:paymentMethod})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw Error(result.error||'Payment information unavailable');
    if(live)setCheckout(result);
   }catch(err){
    if(live&&!controller.signal.aborted)setCheckout({available:false,reason:err.message||'Payment information unavailable'});
   }finally{if(live)setCheckoutLoading(false)}
  }
  loadCheckout();
  return()=>{live=false;controller.abort()};
 },[contractDays,deviceCount,paymentMethod,view]);
 const isBankPayment=paymentMethod==='interac'||paymentMethod==='zelle';
 const bankReady=isBankPayment&&checkout?.available===true&&!!checkout?.destination&&Number(checkout?.amount_due)>0;
 const users=useMemo(()=>members.filter(m=>['approved','pending'].includes(m.status)&&(m.role==='member'||(m.role==='owner'&&m.user_id===userId))),[members,userId]);
 const rows=owner?requests.filter(r=>r.member_id===targetId):ownRows;
 const cancellationRows=owner?cancellations.filter(c=>c.member_id===targetId):ownCancellations;
 const selectedSubs=subscriptions.filter(s=>s.member_id===(owner?targetId:userId));
 const eligible=selectedSubs.filter(s=>['active','expired'].includes(s.status));
 const pendingRenewals=new Set(rows.filter(r=>r.request_type==='renewal'&&['pending','in_review'].includes(r.status)).map(r=>r.renewal_subscription_id));
 const selectedRenewal=eligible.find(s=>s.id===renewalId);
 const renewalExpiry=sub=>sub.expires_at?new Date(sub.expires_at).toLocaleDateString(fr?'fr-CA':'en-CA',{year:'numeric',month:'short',day:'numeric'}):tr('Not available','Non disponible');
 function chooseType(value){setRequestType(value);setRenewalId('');if(value==='new')setDeviceCount(1);setError('');setNotice('')}
 function chooseAccount(value){setTargetId(value);setRenewalId('');setError('');setNotice('')}
 function chooseOwnerEmail(value){
  setOwnerEmail(value);setCreatedInvite(null);
  const member=users.find(m=>m.email?.trim().toLowerCase()===value.trim().toLowerCase());
  chooseAccount(member?.user_id||'');
 }
 async function requestCancellation(request){
  if(owner||saving||cancellingId||!['pending','in_review'].includes(request.status)||request.subscription_id||request.completed_at||request.service_activated_at)return;
  if(cancellationRows.some(c=>c.request_id===request.id))return;
  if(!window.confirm(tr('Ask MYKIOO to cancel this request? Owner approval is required. If the service is completed or activated first, cancellation will be denied and no refund will be given.','Demander à MYKIOO d’annuler cette demande ? L’approbation du propriétaire est obligatoire. Si le service est terminé ou activé avant, l’annulation sera refusée et aucun remboursement ne sera accordé.')))return;
  setCancellingId(request.id);setError('');setNotice('');
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error(tr('Please sign in again.','Veuillez vous reconnecter.'));
   const response=await fetch(endpoint,{method:'POST',headers:{
    'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
    'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
   },body:JSON.stringify({action:'request_cancellation',request_id:request.id})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Unable to request cancellation.','Impossible de demander une annulation.'));
   setOwnCancellations(previous=>[{request_id:request.id,status:'pending',reason:'',created_at:new Date().toISOString()},...previous.filter(c=>c.request_id!==request.id)]);
   setNotice(tr('Cancellation approval requested. Your order remains active until the owner approves it.','Demande d’annulation envoyée. Votre commande reste valide jusqu’à l’approbation du propriétaire.'));
  }catch(err){setError(err.message||tr('Unable to request cancellation.','Impossible de demander une annulation.'))}
  finally{setCancellingId('')}
 }
 async function submit(e){
  e.preventDefault();if(saving)return;
  const renewal=requestType==='renewal';
  if(!priceCAD(contractDays,deviceCount)||!PAYMENT_LABELS[paymentMethod]){setError(tr('Choose a valid package and payment method.','Choisissez un forfait et un mode de paiement valides.'));return;}
  if(isBankPayment&&(!bankReady||checkoutLoading)){
   setError(tr('Bank payment instructions are not ready. Select a configured method or contact MYKIOO.','Les instructions de paiement bancaire ne sont pas prêtes. Choisissez un autre mode configuré ou contactez MYKIOO.'));return;
  }
  if(!owner&&renewal&&(!renewalId||pendingRenewals.has(renewalId))){
   setError(tr('Choose the subscription you want to renew before continuing.','Choisissez l’abonnement à renouveler avant de continuer.'));return;
  }
  if(owner&&(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail.trim())||ownerEmail.trim().length>254)){setError(tr('Enter the customer email address.','Saisissez l’adresse courriel du client.'));return;}
  if(renewal&&!eligible.some(s=>s.id===renewalId&&!pendingRenewals.has(s.id))){
   setError(tr('Choose an eligible subscription without a pending renewal.','Choisissez un abonnement admissible sans renouvellement en attente.'));return;
  }
  setSaving(true);setError('');setNotice('');
  let invitationSent=false;
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error(tr('Your session expired. Sign in again.','Votre session a expiré. Reconnectez-vous.'));
   let resolvedTargetId=targetId;
   if(owner){
    const email=ownerEmail.trim().toLowerCase();
    const matching=users.find(m=>m.email?.trim().toLowerCase()===email);
    if(matching)resolvedTargetId=matching.user_id;
    else if(createdInvite?.email===email)resolvedTargetId=createdInvite.member_id;
    else{
     if(requestType==='renewal')throw Error(tr('Renewal requires an existing subscription.','Le renouvellement nécessite un abonnement existant.'));
     const invitedResponse=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-admin',{
      method:'POST',headers:{'Content-Type':'application/json',
       'Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
      body:JSON.stringify({action:'invite',email,language})
     });
     const invited=await invitedResponse.json().catch(()=>({}));
     if(!invitedResponse.ok||!invited.ok||!invited.member_id)
      throw Error(invited.error||tr('Unable to issue invitation.','Impossible d’envoyer l’invitation.'));
     resolvedTargetId=invited.member_id;
     invitationSent=true;
     setTargetId(resolvedTargetId);
     setCreatedInvite({email,member_id:resolvedTargetId});
    }
   }
   const payload=owner?
     {action:'owner_create',member_id:resolvedTargetId,request_type:requestType,
       service_name:renewal?undefined:service.trim(),subscription_id:renewal?renewalId:undefined,
       contract_days:contractDays,device_count:deviceCount,preferred_payment_method:paymentMethod,notes:notes.trim()}:
     renewal?
      {action:'renew',subscription_id:renewalId,contract_days:contractDays,device_count:deviceCount,preferred_payment_method:paymentMethod,notes:notes.trim()}:
      {action:'create',service_name:service.trim(),contract_days:contractDays,device_count:deviceCount,preferred_payment_method:paymentMethod,notes:notes.trim()};
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
      contract_days:contractDays,device_count:deviceCount,preferred_payment_method:paymentMethod,notes:notes.trim(),quoted_price_cad:priceCAD(contractDays,deviceCount),status:'pending'
    },...previous.filter(r=>r.id!==result.request.id)]);
   setService(owner?'':'MYKIOO TV');setRenewalId('');if(owner){setOwnerEmail('');setCreatedInvite(null)}setNotes('');setContractDays(365);setDeviceCount(1);setPaymentMethod('interac');setRequestType('new');
   setNotice(owner?
    (invitationSent?tr('Request created and a customer invitation was issued. The new member must be approved before they can access MYKIOO.','Demande créée et invitation envoyée au client. Le nouveau membre doit être approuvé avant d’accéder à MYKIOO.'):tr('Request created for the existing customer.','Demande créée pour le client existant.')):
    isBankPayment?tr('Request submitted. Complete payment in the next step. The owner verifies actual receipt before activation.','Demande envoyée. Effectuez le paiement à la prochaine étape. Le propriétaire vérifiera la réception avant activation.'):
    renewal?tr('Renewal requested. Your existing login will be kept.','Renouvellement demandé. Vos identifiants actuels seront conservés.'):
    tr('Your request was sent for review.','Votre demande a été envoyée pour examen.'));
   if(!owner&&isBankPayment&&result.invoice?.id)setSubmittedInvoiceId(result.invoice.id);
   if(owner)await onSaved?.();
  }catch(err){setError((invitationSent||createdInvite?tr('A site invitation may already have been issued. ','Une invitation a peut-être déjà été envoyée. '):'')+(err.message||tr('Request could not be submitted.','Impossible d’envoyer la demande.')))}
  finally{setSaving(false)}
 }
 if(!owner&&submittedInvoiceId)return <section className="mykioo-request-area mykioo-payment-after-request">
  <div className="mykioo-support-card mykioo-payment-next-card">
   <span className="mykioo-payment-success-check">✓</span>
   <h2>{tr('Request received — now send payment','Demande reçue — effectuez le paiement')}</h2>
   <p>{tr('Step 1 is complete. Follow the instructions below. After sending payment, select “Confirm I’ve sent payment.” The owner will verify receipt before activating service.','La première étape est terminée. Suivez les instructions ci-dessous. Après le paiement, cliquez sur « Confirmer l’envoi du paiement ». Le propriétaire vérifiera la réception avant l’activation.')}</p>
   <button type="button" className="mykioo-payment-other-request" onClick={()=>setSubmittedInvoiceId(null)}>{tr('Create another subscription request','Créer une autre demande d’abonnement')}</button>
  </div>
  <MemberBilling userId={userId} language={language} highlightInvoiceId={submittedInvoiceId}/>
 </section>;
 if(view==='history')return <section className="mykioo-request-history-page">
    <SubscriptionHistory requests={rows} cancellations={cancellationRows} subscriptions={selectedSubs} language={language} owner={owner} onRequestCancellation={owner?undefined:requestCancellation} cancellingId={cancellingId}/>
  </section>;
 return <section className={'mykioo-request-area '+(owner?'mykioo-owner-request-area':'')}>
  <div className="mykioo-support-card">
   <h2>{owner?tr('Create a subscription request','Créer une demande d’abonnement'):tr('New subscription or renewal','Nouvel abonnement ou renouvellement')}</h2>
   <p>{owner?
     tr('Create a new or renewal request for your own account or an approved member. Complete requests using the subscription manager below.','Créez une demande nouvelle ou de renouvellement pour votre compte ou un membre approuvé. Terminez les demandes avec le gestionnaire ci-dessous.'):
     tr('Choose a plan and payment method. You can finish in just a few steps.','Choisissez un forfait et un mode de paiement. Quelques étapes suffisent.')}</p>
   {owner&&<p className="mykioo-request-policy-note">{tr('Cancellation requests need owner approval and must be approved before we complete or activate the service. Once the service is activated, no cancellation or refund is offered, subject to applicable law.','Les demandes d’annulation doivent être approuvées par le propriétaire avant la finalisation ou l’activation du service. Une fois le service activé, aucune annulation ni aucun remboursement ne sont offerts, sous réserve des lois applicables.')}</p>}
   <form onSubmit={submit}>
    {!owner&&<div className="mykioo-checkout-step"><span>1</span><strong>{tr('Choose your plan','Choisissez votre forfait')}</strong></div>}
    {owner&&<>
     <label htmlFor="mykioo-request-account">{tr('Customer email address','Adresse courriel du client')} *</label>
     <input id="mykioo-request-account" type="email" autoComplete="email" required maxLength={254}
      list="mykioo-owner-request-emails" placeholder="customer@example.com" value={ownerEmail}
      onChange={e=>chooseOwnerEmail(e.target.value)}/>
     <datalist id="mykioo-owner-request-emails">
      {users.map(m=><option key={m.user_id} value={m.email}>{m.display_name||m.email}</option>)}
     </datalist>
     <small className="mykioo-request-hint">{tr('Existing email: link the request to that account. New email: automatically issue a site invitation and create an account.','Courriel existant : associer la demande au compte. Nouveau courriel : envoyer automatiquement une invitation et créer un compte.')}</small>
    </>}
    <label htmlFor="mykioo-request-kind">{tr('Request type','Type de demande')}</label>
    <select id="mykioo-request-kind" value={requestType} onChange={e=>chooseType(e.target.value)}>
     <option value="new">{tr('New subscription','Nouvel abonnement')}</option>
     <option value="renewal">{tr('Renew existing subscription','Renouveler un abonnement existant')}</option>
    </select>
    {requestType==='new'?<>{owner&&<>
     <label htmlFor="mykioo-request-service">{tr('Service or package requested','Service ou forfait demandé')}</label>
     <input id="mykioo-request-service" required minLength={3} maxLength={80} value={service}
      onChange={e=>setService(e.target.value)} placeholder={tr('Which service would you like?','Quel service souhaitez-vous ?')}/>
    </>}</>:<>
     <label htmlFor="mykioo-request-renewal-sub">{tr('Which subscription would you like to renew?','Quel abonnement souhaitez-vous renouveler ?')}</label>
     <select id="mykioo-request-renewal-sub" required value={renewalId} onChange={e=>{
      const id=e.target.value;
      setRenewalId(id);setError('');setNotice('');
      const previous=eligible.find(sub=>sub.id===id);
      if(previous?.device_count)setDeviceCount(previous.device_count);
     }}>
      <option value="">{tr('Select the subscription to renew','Sélectionnez l’abonnement à renouveler')}</option>
      {eligible.map(sub=><option key={sub.id} value={sub.id} disabled={pendingRenewals.has(sub.id)}>
       {sub.service_name||tr('Subscription','Abonnement')} · {sub.service_username||sub.supplier_reference||'#'+sub.id.slice(0,8)} · {renewalExpiry(sub)} {pendingRenewals.has(sub.id)?tr('(renewal already pending)','(renouvellement déjà en attente)'):''}
      </option>)}
     </select>
     {eligible.length===0&&<p className="mykioo-request-hint" role="status">{tr('No active or expired subscriptions are available to renew. Visit My subscriptions to review your services, or choose New subscription.','Aucun abonnement actif ou expiré n’est disponible pour le renouvellement. Consultez Mes abonnements ou choisissez Nouvel abonnement.')}</p>}
     {selectedRenewal&&<div className="mykioo-renewal-selection" aria-live="polite">
      <strong>{tr('You are renewing','Vous renouvelez')} : {selectedRenewal.service_name||tr('Subscription','Abonnement')}</strong>
      <span>{tr('Service login','Identifiant du service')} : {selectedRenewal.service_username||tr('Not provided','Non fourni')}</span>
      {selectedRenewal.supplier_reference&&<span>{tr('Subscription reference','Référence de l’abonnement')} : {selectedRenewal.supplier_reference}</span>}
      <span>{tr('Current devices','Appareils actuels')} : {selectedRenewal.device_count||1}</span>
      <span>{tr('Current expiry','Expiration actuelle')} : {renewalExpiry(selectedRenewal)}</span>
      {pendingRenewals.has(selectedRenewal.id)&&<span>{tr('A renewal is already pending for this subscription.','Un renouvellement est déjà en attente pour cet abonnement.')}</span>}
     </div>}
     <p className="mykioo-request-hint">{tr('Only the selected subscription will be renewed. Your existing service login is kept.','Seul l’abonnement sélectionné sera renouvelé. Vos identifiants de service seront conservés.')}</p>
    </>}
    <label id="mykioo-request-duration-label">{requestType==='renewal'?tr('Renewal duration','Durée du renouvellement'):tr('Subscription duration','Durée de l’abonnement')}</label>
    <div className="mykioo-duration-options" role="group" aria-labelledby="mykioo-request-duration-label">
     {durations.map(days=><button key={days} type="button" aria-pressed={contractDays===days} className={'mykioo-duration-option '+(contractDays===days?'selected':'')} onClick={()=>setContractDays(days)}>
      <strong>{days===365?tr('12 months','12 mois'):tr('24 months','24 mois')}</strong>
      <span>{days===365?tr('1 year','1 an'):tr('2 years','2 ans')}</span>
     </button>)}
    </div>
    <label htmlFor="mykioo-request-devices">{tr('How many devices?','Combien d’appareils ?')}</label>
     <select id="mykioo-request-devices" required value={deviceCount} onChange={e=>setDeviceCount(Number(e.target.value))}>
      {[1,2,3,4,5].map(count=><option value={count} key={count}>{count} {count===1?tr('device','appareil'):tr('devices','appareils')}</option>)}
     </select>
     <div className="mykioo-package-quote" aria-live="polite">
      <span>{tr('Subscription price (CAD)','Prix de l’abonnement (CAD)')}</span>
      <strong>CA$ {priceCAD(contractDays,deviceCount)?.toFixed(2)}</strong>
      <small>{tr('Total for','Total pour')} {deviceCount} {deviceCount===1?tr('device','appareil'):tr('devices','appareils')} · {contractDays===365?tr('12 months','12 mois'):tr('24 months','24 mois')} · CA$ {(priceCAD(contractDays,deviceCount)/deviceCount).toFixed(2)} {tr('per device','par appareil')}</small>
     </div>
     {!owner&&<div className="mykioo-checkout-step"><span>2</span><strong>{tr('Choose how to pay','Choisissez comment payer')}</strong></div>}
    <label htmlFor="mykioo-request-payment-method">{tr('Payment method','Mode de paiement')}</label>
     <select id="mykioo-request-payment-method" required value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value)}>
      {Object.entries(PAYMENT_LABELS).map(([value,label])=><option key={value} value={value}>{label}</option>)}
     </select>
     {isBankPayment&&<div className="mykioo-inline-bank-payment mykioo-bank-after-request">
      <h3>{tr('Payment comes next','Paiement à l’étape suivante')}</h3>
      {checkoutLoading?<p className="mykioo-request-payment-note">{tr('Checking the selected payment method…','Vérification du mode de paiement choisi…')}</p>:
       !bankReady?<p className="mykioo-request-payment-note" role="status">
        {tr('This payment method is not fully configured. Choose an available option before submitting. Do not send money yet.','Ce mode de paiement n’est pas entièrement configuré. Choisissez une option disponible avant de soumettre. N’envoyez pas d’argent pour le moment.')}
       </p>:
       <p className="mykioo-request-payment-note">{tr('Submit your request first. Your exact amount, receiving details and separate payment confirmation button will then appear.','Soumettez d’abord votre demande. Le montant exact, les coordonnées de paiement et le bouton distinct de confirmation seront ensuite affichés.')}</p>}
     </div>}
     {(paymentMethod==='btc'||paymentMethod==='shib')&&<div className="mykioo-crypto-request-note">
       <strong>{tr('Cryptocurrency invoice provided by MYKIOO','Facture crypto fournie par MYKIOO')}</strong>
       <p>{tr('Send your request now. Your exact amount and receiving address will appear in a crypto invoice under Payments. Pay only after it arrives.','Envoyez votre demande maintenant. Le montant exact et l’adresse de réception figureront dans une facture crypto sous Paiements. Ne payez qu’après sa réception.')}</p>
       <p>{paymentMethod==='btc'?tr('BTC on Bitcoin Mainnet only — never send Bitcoin Cash (BCH).','BTC uniquement sur Bitcoin Mainnet — jamais Bitcoin Cash (BCH).'):
          tr('SHIB on Ethereum Mainnet (ERC-20) only — not Shibarium, Base, Polygon or BNB Chain.','SHIB uniquement sur Ethereum Mainnet (ERC-20) — pas Shibarium, Base, Polygon ou BNB Chain.')}</p>
     </div>}
     {owner?<><label htmlFor="mykioo-request-notes">{tr('Additional details (optional)','Détails supplémentaires (facultatif)')}</label>
      <textarea id="mykioo-request-notes" maxLength={1000} rows={3} value={notes} onChange={e=>setNotes(e.target.value)}
       placeholder={tr('Anything else we should know?','Autres renseignements utiles ?')}/></>:
      <details className="mykioo-checkout-optional">
       <summary>{tr('Add a note (optional)','Ajouter une note (facultatif)')}</summary>
       <label htmlFor="mykioo-request-notes">{tr('Message for MYKIOO','Message pour MYKIOO')}</label>
       <textarea id="mykioo-request-notes" maxLength={1000} rows={3} value={notes} onChange={e=>setNotes(e.target.value)}
        placeholder={tr('Anything else we should know?','Autres renseignements utiles ?')}/>
      </details>}
    <button type="submit" disabled={saving||(isBankPayment&&(!bankReady||checkoutLoading))||(requestType==='renewal'&&(!selectedRenewal||pendingRenewals.has(renewalId)))||(owner&&!ownerEmail.trim())}>
     {saving?tr('Sending…','Envoi…'):isBankPayment?tr('Submit request — continue to payment','Soumettre — continuer vers le paiement'):requestType==='renewal'?tr('Request renewal — crypto invoice follows','Demander le renouvellement — facture crypto à suivre'):tr('Request subscription — crypto invoice follows','Demander l’abonnement — facture crypto à suivre')}
    </button>
   </form>
   {!owner&&<details className="mykioo-checkout-policy">
    <summary>{tr('Cancellation and refund policy','Politique d’annulation et de remboursement')}</summary>
    <p className="mykioo-request-policy-note">{tr('Cancellation requests need owner approval and must be approved before we complete or activate the service. Once the service is activated, no cancellation or refund is offered, subject to applicable law.','Les demandes d’annulation doivent être approuvées par le propriétaire avant la finalisation ou l’activation du service. Une fois le service activé, aucune annulation ni aucun remboursement ne sont offerts, sous réserve des lois applicables.')}</p>
   </details>}
   {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
   {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  </div>
  {view!=='form'&&<SubscriptionHistory requests={rows} cancellations={cancellationRows} subscriptions={selectedSubs} language={language} owner={owner} onRequestCancellation={owner?undefined:requestCancellation} cancellingId={cancellingId}/>}
 </section>;
}
