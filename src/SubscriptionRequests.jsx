import React,{useEffect,useMemo,useRef,useState} from 'react';
import {supabase} from './supabase';
import SubscriptionHistory from './SubscriptionHistory';
import {MemberBilling} from './Billing';
import {priceCAD,PAYMENT_LABELS} from './PackagePricing';
import CountryPackPicker,{countryPackNotes} from './CountryPackPicker';

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
 const [countryPacks,setCountryPacks]=useState([]);
 const [service,setService]=useState(owner?'':'MYKIOO TV'),[contractDays,setContractDays]=useState(365),[notes,setNotes]=useState(''),[renewalId,setRenewalId]=useState('');
 const [deviceCount,setDeviceCount]=useState(1),[paymentMethod,setPaymentMethod]=useState('interac');
 const [acceptedServiceRisks,setAcceptedServiceRisks]=useState(false);
 const [discountDraft,setDiscountDraft]=useState(''),[appliedDiscount,setAppliedDiscount]=useState('');
 const [checkout,setCheckout]=useState(null),[checkoutLoading,setCheckoutLoading]=useState(false);
 const [submittedRequest,setSubmittedRequest]=useState(null);
 const [showSubmittedHistory,setShowSubmittedHistory]=useState(false);
 const confirmationRef=useRef(null);
 useEffect(()=>{
  if(submittedRequest){confirmationRef.current?.focus();confirmationRef.current?.scrollIntoView({block:'start',behavior:'smooth'});}
 },[submittedRequest]);
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
  if(!supabase||submittedRequest||view==='history'||requestType==='trial'){setCheckout(null);setCheckoutLoading(false);return;}
  let live=true;const controller=new AbortController();
  setCheckout(null);setCheckoutLoading(true);
  async function loadCheckout(){
   try{
    const {data:{session},error:authError}=await supabase.auth.getSession();
    if(authError||!session)throw Error('Sign in again to view payment instructions');
    const response=await fetch(endpoint,{method:'POST',signal:controller.signal,headers:{
      'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
      'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
    },body:JSON.stringify({action:'get_checkout',contract_days:contractDays,device_count:deviceCount,preferred_payment_method:paymentMethod,discount_code:appliedDiscount||null})});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw Error(result.error||'Payment information unavailable');
    if(live)setCheckout(result);
   }catch(err){
    if(live&&!controller.signal.aborted)setCheckout({available:false,reason:err.message||'Payment information unavailable'});
   }finally{if(live)setCheckoutLoading(false)}
  }
  loadCheckout();
  return()=>{live=false;controller.abort()};
 },[contractDays,deviceCount,paymentMethod,requestType,view,submittedRequest,appliedDiscount,owner,targetId]);
 const isBankPayment=requestType!=='trial'&&(paymentMethod==='interac'||paymentMethod==='zelle');
 const bankReady=isBankPayment&&checkout?.available===true&&!!checkout?.destination&&Number(checkout?.amount_due)>0;
 const users=useMemo(()=>members.filter(m=>['approved','pending'].includes(m.status)&&(m.role==='member'||(m.role==='owner'&&m.user_id===userId))),[members,userId]);
 const rows=owner?requests.filter(r=>r.member_id===targetId):ownRows;
 const trialRequested=rows.some(r=>r.request_type==='trial');
 const cancellationRows=owner?cancellations.filter(c=>c.member_id===targetId):ownCancellations;
 const selectedSubs=subscriptions.filter(s=>s.member_id===(owner?targetId:userId));
 const eligible=selectedSubs.filter(s=>['active','expired'].includes(s.status));
 const pendingRenewals=new Set(rows.filter(r=>r.request_type==='renewal'&&['pending','in_review'].includes(r.status)).map(r=>r.renewal_subscription_id));
 const selectedRenewal=eligible.find(s=>s.id===renewalId);
 const renewalExpiry=sub=>sub.expires_at?new Date(sub.expires_at).toLocaleDateString(fr?'fr-CA':'en-CA',{year:'numeric',month:'short',day:'numeric'}):tr('Not available','Non disponible');
 function chooseType(value){setCountryPacks([]);setRequestType(value);setRenewalId('');setAcceptedServiceRisks(false);setDiscountDraft('');setAppliedDiscount('');if(value!=='renewal')setDeviceCount(1);setContractDays(365);setError('');setNotice('')}
 function chooseAccount(value){setCountryPacks([]);setTargetId(value);setRenewalId('');setError('');setNotice('')}
 function chooseOwnerEmail(value){
  setOwnerEmail(value);setCreatedInvite(null);
  const member=users.find(m=>m.email?.trim().toLowerCase()===value.trim().toLowerCase());
  chooseAccount(member?.user_id||'');
 }
 async function requestCancellation(request){
  if(owner||saving||cancellingId||!['pending','in_review'].includes(request.status)||request.subscription_id||request.completed_at||request.service_activated_at)return;
  if(cancellationRows.some(c=>c.request_id===request.id))return;
  if(!window.confirm(tr('Ask MYKIOO to cancel this request? Owner approval is required. If service is activated before approval, this voluntary cancellation request cannot be approved. Any rights required by law still apply.','Demander à MYKIOO d’annuler cette demande ? L’approbation du propriétaire est obligatoire. Si le service est activé avant l’approbation, cette demande d’annulation volontaire ne pourra pas être approuvée. Les droits prévus par la loi demeurent applicables.')))return;
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
  const renewal=requestType==='renewal',trial=requestType==='trial';
  if(!owner&&!trial&&!acceptedServiceRisks){
   setError(tr('Please read and acknowledge the subscription risks before submitting.','Veuillez lire et accepter les risques liés à l’abonnement avant de soumettre votre demande.'));
   return;
  }
  const requestNotes=trial?notes.trim():countryPackNotes(countryPacks,notes);
  if(requestNotes.length>1000){
   setError(tr('Please shorten your note. Country selections and notes can contain up to 1000 characters combined.','Veuillez raccourcir votre note. Les pays sélectionnés et la note peuvent contenir 1000 caractères au total.'));
   return;
  }
  if(!trial&&(!priceCAD(contractDays,deviceCount)||!PAYMENT_LABELS[paymentMethod])){setError(tr('Choose a valid package and payment method.','Choisissez un forfait et un mode de paiement valides.'));return;}
  if(!trial&&appliedDiscount&&(checkoutLoading||checkout?.discount_code!==appliedDiscount||checkout?.available!==true)){
   setError(tr('The discount has not been validated for this plan and payment method. Please apply it again before proceeding.','La réduction n’a pas été validée pour ce forfait et ce mode de paiement. Appliquez-la à nouveau avant de continuer.'));
   return;
  }
  if(isBankPayment&&(!bankReady||checkoutLoading)){
   setError(tr('Bank payment instructions are not ready. Select a configured method or contact MYKIOO.','Les instructions de paiement bancaire ne sont pas prêtes. Choisissez un autre mode configuré ou contactez MYKIOO.'));return;
  }
  if(trial&&trialRequested){setError(tr('This account has already requested its one free trial.','Ce compte a déjà demandé son essai gratuit unique.'));return;}
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
       contract_days:trial?1:contractDays,device_count:trial?1:deviceCount,preferred_payment_method:trial?null:paymentMethod,notes:requestNotes}:
     trial?
      {action:'trial',service_name:service.trim()||'MYKIOO TV',notes:requestNotes}:
     renewal?
      {action:'renew',subscription_id:renewalId,contract_days:contractDays,device_count:deviceCount,preferred_payment_method:paymentMethod,notes:requestNotes}:
      {action:'create',service_name:service.trim(),contract_days:contractDays,device_count:deviceCount,preferred_payment_method:paymentMethod,notes:requestNotes};
   if(!trial)payload.discount_code=appliedDiscount||null;
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
      contract_days:trial?1:contractDays,device_count:trial?1:deviceCount,preferred_payment_method:trial?null:paymentMethod,notes:requestNotes,quoted_price_cad:trial?null:priceCAD(contractDays,deviceCount),status:'pending'
    },...previous.filter(r=>r.id!==result.request.id)]);
   setService(owner?'':'MYKIOO TV');setRenewalId('');if(owner){setOwnerEmail('');setCreatedInvite(null)}setNotes('');setCountryPacks([]);setContractDays(365);setDeviceCount(1);setPaymentMethod('interac');setRequestType('new');setAcceptedServiceRisks(false);setDiscountDraft('');setAppliedDiscount('');
   setNotice(owner?
    (invitationSent?tr('Request created and a customer invitation was issued. The new member must be approved before they can access MYKIOO.','Demande créée et invitation envoyée au client. Le nouveau membre doit être approuvé avant d’accéder à MYKIOO.'):trial?tr('Free trial requested for this member. Activate it manually from the subscription manager.','Essai gratuit demandé pour ce membre. Activez-le manuellement dans le gestionnaire d’abonnements.'):tr('Request created for the existing customer.','Demande créée pour le client existant.')):
    trial?tr('Free trial requested. MYKIOO will review it. No payment is required and access is not active yet.','Demande d’essai gratuit envoyée. MYKIOO doit l’examiner. Aucun paiement requis et l’accès n’est pas encore actif.'):
    isBankPayment?tr('Request submitted. Complete payment in the next step. The owner verifies actual receipt before activation.','Demande envoyée. Effectuez le paiement à la prochaine étape. Le propriétaire vérifiera la réception avant activation.'):
    renewal?tr('Renewal requested. Your existing login will be kept.','Renouvellement demandé. Vos identifiants actuels seront conservés.'):
    tr('Your request was sent for review.','Votre demande a été envoyée pour examen.'));
   setSubmittedRequest({id:result.request?.id,type:requestType,invoiceId:!trial&&isBankPayment?result.invoice?.id:null,bankPayment:isBankPayment,service:renewal?(selected?.service_name||'MYKIOO TV'):service.trim()||'MYKIOO TV',days:trial?1:contractDays,devices:trial?1:deviceCount,discountCode:trial?null:result.request?.discount_code||null,netCad:result.request?.quoted_price_cad,netUsd:result.request?.quoted_price_usd});
   if(owner)await onSaved?.();
  }catch(err){setError((invitationSent||createdInvite?tr('A site invitation may already have been issued. ','Une invitation a peut-être déjà été envoyée. '):'')+(err.message||tr('Request could not be submitted.','Impossible d’envoyer la demande.')))}
  finally{setSaving(false)}
 }
 if(submittedRequest)return <section className="mykioo-request-area mykioo-payment-after-request">
  <div className="mykioo-support-card mykioo-payment-next-card" ref={confirmationRef} tabIndex={-1} role="status" aria-live="polite">
   <span className="mykioo-payment-success-check" aria-hidden="true">✓</span>
   <h2>{submittedRequest.type==='trial'?tr('Free trial request received','Demande d’essai gratuit reçue'):submittedRequest.type==='renewal'?tr('Renewal request received','Demande de renouvellement reçue'):tr('Subscription request received','Demande d’abonnement reçue')}</h2>
   <p><strong>{tr('Your request was submitted successfully. You do not need to submit it again.','Votre demande a bien été envoyée. Vous n’avez pas besoin de la soumettre à nouveau.')}</strong></p>
   <p>{submittedRequest.service} · {submittedRequest.type==='trial'?tr('24-hour free trial','Essai gratuit de 24 heures'):displayDuration(submittedRequest.days,tr)+' · '+submittedRequest.devices+' '+tr('device(s)','appareil(s)')}</p>
   {submittedRequest.id&&<p>{tr('Request reference','Référence de la demande')}: <strong>{submittedRequest.id}</strong></p>}
   {submittedRequest.discountCode&&<p>{tr('Discount applied','Réduction appliquée')}: <strong>{submittedRequest.discountCode}</strong> · {tr('CAD total','Total CAD')}: <strong>CA$ {Number(submittedRequest.netCad).toFixed(2)}</strong> · {tr('USD total (Zelle)','Total USD (Zelle)')}: <strong>US$ {Number(submittedRequest.netUsd).toFixed(2)}</strong></p>}
   <p>{owner?tr('The request is saved. Review and complete it from the subscription manager; verify payment first for paid services.','La demande est enregistrée. Examinez-la et finalisez-la dans le gestionnaire d’abonnements; vérifiez d’abord le paiement des services payants.'):
    submittedRequest.type==='trial'?
    tr('No payment is required. MYKIOO will review and activate your trial, then email your service login details. Your trial is not active yet.','Aucun paiement n’est requis. MYKIOO examinera et activera votre essai, puis vous enverra les identifiants du service par courriel. Votre essai n’est pas encore actif.'):
    submittedRequest.bankPayment?
    tr('Your request is awaiting payment verification and activation. If you have already sent payment, do not pay again. Use the payment section below to report it.','Votre demande attend la vérification du paiement et l’activation. Si vous avez déjà envoyé votre paiement, ne payez pas à nouveau. Utilisez la section de paiement ci-dessous pour le signaler.'):
    tr('MYKIOO will review your request and prepare your crypto invoice. Wait for that invoice before paying. Your service is not active yet.','MYKIOO examinera votre demande et préparera votre facture crypto. Attendez cette facture avant de payer. Votre service n’est pas encore actif.')}</p>
   {!owner&&submittedRequest.bankPayment&&!submittedRequest.invoiceId&&<p>{tr('Open Payments to check your payment instructions.','Ouvrez Paiements pour consulter vos instructions de paiement.')}</p>}
   <button type="button" className="mykioo-payment-other-request" onClick={()=>setShowSubmittedHistory(value=>!value)}>{showSubmittedHistory?tr('Hide request history','Masquer l’historique'):tr('View request history','Voir l’historique des demandes')}</button>
   <button type="button" className="mykioo-payment-other-request" onClick={()=>{setSubmittedRequest(null);setShowSubmittedHistory(false);setNotice('');setError('')}}>{tr('Create another request','Créer une autre demande')}</button>
  </div>
  {!owner&&submittedRequest.invoiceId&&<MemberBilling userId={userId} language={language} highlightInvoiceId={submittedRequest.invoiceId}/>}
  {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
  {showSubmittedHistory&&notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  {showSubmittedHistory&&<SubscriptionHistory requests={rows} cancellations={cancellationRows} subscriptions={selectedSubs} language={language} owner={owner} onRequestCancellation={owner?undefined:requestCancellation} cancellingId={cancellingId}/>}
 </section>;
 if(view==='history')return <section className="mykioo-request-history-page">
    <SubscriptionHistory requests={rows} cancellations={cancellationRows} subscriptions={selectedSubs} language={language} owner={owner} onRequestCancellation={owner?undefined:requestCancellation} cancellingId={cancellingId}/>
  </section>;
 return <section className={'mykioo-request-area '+(owner?'mykioo-owner-request-area':'')}>
  <div className="mykioo-support-card">
   <h2>{owner?tr('Create a subscription request','Créer une demande d’abonnement'):tr('New subscription, renewal or free trial','Nouvel abonnement, renouvellement ou essai gratuit')}</h2>
   <p>{owner?
     tr('Create a new subscription, renewal or free trial request for a member. Complete requests using the subscription manager below.','Créez une demande de nouvel abonnement, de renouvellement ou d’essai gratuit pour un membre. Finalisez les demandes dans le gestionnaire ci-dessous.'):
     tr('Choose a subscription or renewal plan, or request a one-time free trial without payment.','Choisissez un abonnement, un renouvellement ou un essai gratuit unique sans paiement.')}</p>
   {owner&&<p className="mykioo-request-policy-note">{tr('Cancellation requests need owner approval and must be approved before we complete or activate the service. After activation, voluntary cancellations and refunds are not offered, except where required by applicable law. Contact support to discuss any statutory rights.','Les demandes d’annulation doivent être approuvées par le propriétaire avant la finalisation ou l’activation du service. Après l’activation, les annulations volontaires et remboursements ne sont pas offerts, sauf lorsque la loi l’exige. Communiquez avec l’assistance pour toute question relative à vos droits légaux.')}</p>}
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
      <option value="trial">{tr('Request free trial','Demander un essai gratuit')}</option>
    </select>
    {requestType!=='renewal'?<>{owner&&<>
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
    {requestType==='trial'?<div className="mykioo-free-trial-callout" role="status">
      <strong>{tr('Free trial · 24 hours · 1 device','Essai gratuit · 24 heures · 1 appareil')}</strong>
      <p>{tr('One free trial per member. No payment or invoice. MYKIOO reviews your request and activates access manually; the 24 hours start when activated.','Un seul essai gratuit par membre. Aucun paiement ni facture. MYKIOO examine votre demande et active l’accès manuellement; les 24 heures commencent à l’activation.')}</p>
      {trialRequested&&<small>{tr('A free trial has already been requested for this account.','Un essai gratuit a déjà été demandé pour ce compte.')}</small>}
     </div>:<>
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
     <div className="mykioo-discount-checkout">
      <label htmlFor="mykioo-discount-code">{tr('Have a discount code?','Vous avez un code de réduction ?')}</label>
      <div className="mykioo-discount-entry">
       <input id="mykioo-discount-code" value={discountDraft} maxLength={32} autoComplete="off" autoCapitalize="characters" disabled={saving}
        onChange={e=>{const code=e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,'');setDiscountDraft(code);if(code!==appliedDiscount)setAppliedDiscount('')}}
        placeholder={tr('Enter your code','Entrez votre code')}/>
       <button type="button" disabled={saving||checkoutLoading||discountDraft.trim().length<3} onClick={()=>setAppliedDiscount(discountDraft.trim())}>{tr('Apply code','Appliquer')}</button>
       {(appliedDiscount||discountDraft)&&<button type="button" className="mykioo-discount-clear" disabled={saving} onClick={()=>{setDiscountDraft('');setAppliedDiscount('')}}>{tr('Clear','Effacer')}</button>}
      </div>
      {appliedDiscount&&checkoutLoading&&<small>{tr('Checking discount…','Vérification de la réduction…')}</small>}
      {appliedDiscount&&!checkoutLoading&&checkout?.discount_code===appliedDiscount&&checkout?.available===true&&<p className="mykioo-discount-success" role="status">
       {tr('Code applied','Code appliqué')}: <strong>{appliedDiscount}</strong> · {tr('You save','Économie')}: CA$ {Number(checkout.discount_amount_cad).toFixed(2)} / US$ {Number(checkout.discount_amount_usd).toFixed(2)}
      </p>}
      {appliedDiscount&&!checkoutLoading&&checkout?.discount_code!==appliedDiscount&&<p className="mykioo-discount-error" role="alert">{checkout?.reason||tr('Discount code cannot be applied to this plan.','Ce code ne peut pas être appliqué à ce forfait.')}</p>}
      <div className="mykioo-discount-totals" aria-live="polite">
       {appliedDiscount&&checkout?.discount_code===appliedDiscount&&<div><span>{tr('Original price','Prix initial')}</span><strong>CA$ {Number(checkout.gross_amount_cad).toFixed(2)} / US$ {Number(checkout.gross_amount_usd).toFixed(2)}</strong></div>}
       <div><span>{tr('Total for Interac / crypto (CAD)','Total Interac / crypto (CAD)')}</span><strong>CA$ {Number(checkout?.amount_cad??priceCAD(contractDays,deviceCount)).toFixed(2)}</strong></div>
       {checkout?.amount_usd!=null&&<div><span>{tr('Total for Zelle (USD)','Total Zelle (USD)')}</span><strong>US$ {Number(checkout.amount_usd).toFixed(2)}</strong></div>}
      </div>
      <small>{tr('Only one code per paid order. Fixed discounts have separate CAD and USD amounts. Payment totals are confirmed by MYKIOO before you send money.','Un seul code par commande payante. Les réductions fixes ont des montants distincts en CAD et USD. MYKIOO confirme les montants avant tout paiement.')}</small>
     </div>
     <CountryPackPicker selected={countryPacks} onChange={setCountryPacks} language={language} disabled={saving}/>
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
    </>}
     {owner?<><label htmlFor="mykioo-request-notes">{tr('Additional details (optional)','Détails supplémentaires (facultatif)')}</label>
      <textarea id="mykioo-request-notes" maxLength={1000} rows={3} value={notes} onChange={e=>setNotes(e.target.value)}
       placeholder={tr('Anything else we should know?','Autres renseignements utiles ?')}/></>:
      <details className="mykioo-checkout-optional">
       <summary>{tr('Add a note (optional)','Ajouter une note (facultatif)')}</summary>
       <label htmlFor="mykioo-request-notes">{tr('Message for MYKIOO','Message pour MYKIOO')}</label>
       <textarea id="mykioo-request-notes" maxLength={1000} rows={3} value={notes} onChange={e=>setNotes(e.target.value)}
        placeholder={tr('Anything else we should know?','Autres renseignements utiles ?')}/>
      </details>}
    {!owner&&requestType!=='trial'&&<section className="mykioo-risk-notice" aria-labelledby="mykioo-risk-notice-heading">
     <h3 id="mykioo-risk-notice-heading">{tr('Important — Please Read Before Subscribing','Important — À lire avant de vous abonner')}</h3>
     <p>{tr('MYKIOO offers free trials so you can evaluate the service before purchasing a subscription.','MYKIOO propose des essais gratuits afin de vous permettre d’évaluer le service avant de souscrire un abonnement.')}</p>
     <p>{tr('IPTV services depend on third-party servers and infrastructure. Temporary interruptions, channel changes, technical difficulties, or permanent service shutdowns may occur without advance notice.','Les services IPTV dépendent de serveurs et d’infrastructures tiers. Des interruptions temporaires, des changements de chaînes, des problèmes techniques ou même un arrêt définitif du service peuvent survenir sans préavis.')}</p>
     <p>{tr('Once your paid subscription is activated, provider credits are consumed and cannot be recovered. For this reason, MYKIOO does not offer voluntary refunds after activation.','Une fois votre abonnement payant activé, les crédits du fournisseur sont consommés et ne peuvent pas être récupérés. Pour cette raison, MYKIOO n’offre aucun remboursement volontaire après l’activation.')}</p>
     <p><strong>{tr('A successful free trial does not guarantee future service availability.','Un essai gratuit réussi ne garantit pas la disponibilité future du service.')}</strong></p>
     <p>{tr('By proceeding, you acknowledge these service limitations and risks. This policy does not affect any rights or remedies that cannot legally be excluded.','En poursuivant, vous reconnaissez ces limitations et risques. Cette politique ne modifie pas les droits et recours auxquels il est légalement impossible de renoncer.')}</p>
     <label className="mykioo-risk-acceptance">
      <input type="checkbox" required checked={acceptedServiceRisks} onChange={e=>{setAcceptedServiceRisks(e.target.checked);setError('')}}/>
      <span>{tr('I have read and understand the service risks, the free-trial limitations, and the no-voluntary-refund policy after activation.','J’ai lu et compris les risques liés au service, les limites de l’essai gratuit et la politique de non-remboursement volontaire après l’activation.')}</span>
     </label>
    </section>}
    <button type="submit" disabled={saving||(isBankPayment&&(!bankReady||checkoutLoading))||(requestType==='trial'&&trialRequested)||(requestType==='renewal'&&(!selectedRenewal||pendingRenewals.has(renewalId)))||(owner&&!ownerEmail.trim())}>
     {saving?tr('Sending…','Envoi…'):requestType==='trial'?tr('Request free trial — no payment','Demander l’essai gratuit — sans paiement'):isBankPayment?tr('Submit request — continue to payment','Soumettre — continuer vers le paiement'):requestType==='renewal'?tr('Request renewal — crypto invoice follows','Demander le renouvellement — facture crypto à suivre'):tr('Request subscription — crypto invoice follows','Demander l’abonnement — facture crypto à suivre')}
    </button>
   </form>
   {!owner&&<details className="mykioo-checkout-policy">
    <summary>{tr('Cancellation and refund policy','Politique d’annulation et de remboursement')}</summary>
    <p className="mykioo-request-policy-note">{tr('Cancellation requests need owner approval and must be approved before we complete or activate the service. After activation, voluntary cancellations and refunds are not offered, except where required by applicable law. Contact support to discuss any statutory rights.','Les demandes d’annulation doivent être approuvées par le propriétaire avant la finalisation ou l’activation du service. Après l’activation, les annulations volontaires et remboursements ne sont pas offerts, sauf lorsque la loi l’exige. Communiquez avec l’assistance pour toute question relative à vos droits légaux.')}</p>
   </details>}
   {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
   {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  </div>
  {view!=='form'&&<SubscriptionHistory requests={rows} cancellations={cancellationRows} subscriptions={selectedSubs} language={language} owner={owner} onRequestCancellation={owner?undefined:requestCancellation} cancellingId={cancellingId}/>}
 </section>;
}
