import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './supabase';
import SubscriptionHistory from './SubscriptionHistory';
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
 const [requestType,setRequestType]=useState('new');
 const [service,setService]=useState('MYKIOO TV'),[contractDays,setContractDays]=useState(365),[notes,setNotes]=useState(''),[renewalId,setRenewalId]=useState('');
 const [deviceCount,setDeviceCount]=useState(1),[paymentMethod,setPaymentMethod]=useState('interac');
 const [checkout,setCheckout]=useState(null),[checkoutLoading,setCheckoutLoading]=useState(false);
 const [senderName,setSenderName]=useState(''),[paymentReference,setPaymentReference]=useState(''),[transferConfirmed,setTransferConfirmed]=useState(false);
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
  if(!supabase)return;
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
 },[contractDays,deviceCount,paymentMethod]);
 const isBankPayment=paymentMethod==='interac'||paymentMethod==='zelle';
 const bankReady=isBankPayment&&checkout?.available===true&&!!checkout?.destination&&Number(checkout?.amount_due)>0;
 const users=useMemo(()=>members.filter(m=>m.status==='approved'&&(m.role==='member'||(m.role==='owner'&&m.user_id===userId))),[members,userId]);
 const rows=owner?requests.filter(r=>r.member_id===targetId):ownRows;
 const cancellationRows=owner?cancellations.filter(c=>c.member_id===targetId):ownCancellations;
 const selectedSubs=subscriptions.filter(s=>s.member_id===(owner?targetId:userId));
 const eligible=selectedSubs.filter(s=>['active','expired'].includes(s.status));
 const pendingRenewals=new Set(rows.filter(r=>r.request_type==='renewal'&&['pending','in_review'].includes(r.status)).map(r=>r.renewal_subscription_id));
 function chooseType(value){setRequestType(value);setRenewalId('');if(value==='new')setDeviceCount(1);setError('');setNotice('')}
 function chooseAccount(value){setTargetId(value);setRenewalId('');setRequestType('new');setError('');setNotice('')}
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
  if(isBankPayment&&(senderName.trim().length<2||paymentReference.trim().length<3||!transferConfirmed)){
   setError(tr('Send your bank transfer first, then enter the sender name, transfer confirmation number and check the confirmation box.','Effectuez le virement, puis indiquez le nom de l’expéditeur, le numéro de confirmation et cochez la case.'));return;
  }
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
       contract_days:contractDays,device_count:deviceCount,preferred_payment_method:paymentMethod,notes:notes.trim()}:
     renewal?
      {action:'renew',subscription_id:renewalId,contract_days:contractDays,device_count:deviceCount,preferred_payment_method:paymentMethod,notes:notes.trim()}:
      {action:'create',service_name:service.trim(),contract_days:contractDays,device_count:deviceCount,preferred_payment_method:paymentMethod,notes:notes.trim()};
   if(isBankPayment)Object.assign(payload,{sender_name:senderName.trim(),payment_reference:paymentReference.trim(),ack_sent:transferConfirmed});
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
   setService('MYKIOO TV');setRenewalId('');setNotes('');setContractDays(365);setDeviceCount(1);setPaymentMethod('interac');setSenderName('');setPaymentReference('');setTransferConfirmed(false);setRequestType('new');
   setNotice(isBankPayment?
      tr('Your subscription request and bank payment confirmation were submitted together. MYKIOO will verify receipt before activating service.','Votre demande d’abonnement et votre confirmation bancaire ont été envoyées ensemble. MYKIOO vérifiera le paiement avant l’activation.'):
      owner?tr('Crypto request created. Issue the crypto invoice from Billing.','Demande crypto créée. Émettez la facture crypto dans Facturation.'):
     renewal?tr('Renewal requested. Your existing login will be kept.','Renouvellement demandé. Vos identifiants actuels seront conservés.'):
     tr('Your request was sent for review. You can track its status below.','Votre demande a été envoyée pour examen. Vous pouvez suivre son statut ci-dessous.'));
   if(owner)await onSaved?.();
  }catch(err){setError(err.message||tr('Request could not be submitted.','Impossible d’envoyer la demande.'))}
  finally{setSaving(false)}
 }
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
    {requestType==='new'?<>{owner&&<>
     <label htmlFor="mykioo-request-service">{tr('Service or package requested','Service ou forfait demandé')}</label>
     <input id="mykioo-request-service" required minLength={3} maxLength={80} value={service}
      onChange={e=>setService(e.target.value)} placeholder={tr('Which service would you like?','Quel service souhaitez-vous ?')}/>
    </>}</>:<>
     <label htmlFor="mykioo-request-renewal-sub">{tr('Existing subscription','Abonnement existant')}</label>
     <select id="mykioo-request-renewal-sub" required value={renewalId} onChange={e=>{const id=e.target.value;setRenewalId(id);const previous=eligible.find(sub=>sub.id===id);if(previous?.device_count)setDeviceCount(previous.device_count)}}>
      <option value="">{tr('Choose a subscription','Choisir un abonnement')}</option>
      {eligible.map(sub=><option key={sub.id} value={sub.id} disabled={pendingRenewals.has(sub.id)}>
       {sub.service_name||tr('Service','Service')} · {sub.service_username||tr('Account','Compte')} {pendingRenewals.has(sub.id)?tr('(renewal pending)','(renouvellement en attente)'):''}
      </option>)}
     </select>
     <p className="mykioo-request-hint">{tr('Renewal extends this subscription. Your existing login details will be retained.','Le renouvellement prolonge cet abonnement. Vos identifiants existants seront conservés.')}</p>
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
     {isBankPayment&&<div className="mykioo-inline-bank-payment">
      <h3>{tr('Send payment before submitting','Effectuez le paiement avant d’envoyer la demande')}</h3>
      {checkoutLoading?<p className="mykioo-request-payment-note">{tr('Checking payment instructions…','Vérification des instructions de paiement…')}</p>:
       !bankReady?<p className="mykioo-request-payment-note" role="status">
        {tr('This bank payment option is not yet configured for this package. Do not send funds until payment details appear.','Ce mode de paiement n’est pas encore configuré pour ce forfait. N’envoyez aucun paiement tant que les détails ne sont pas affichés.')}
        {paymentMethod==='zelle'&&<span> {tr('The USD amount also needs to be set by MYKIOO.','Le montant en USD doit également être défini par MYKIOO.')}</span>}
       </p>:<>
        <p className="mykioo-bank-pay-amount">{tr('Transfer exactly','Transférez exactement')} <strong>{checkout.currency==='CAD'?'CA$':'US$'}{Number(checkout.amount_due).toFixed(2)}</strong></p>
        <p className="mykioo-bank-pay-address"><span>{tr('Send to','Envoyez à')}: <strong>{checkout.destination}</strong></span>
          <button type="button" onClick={()=>navigator.clipboard?.writeText(String(checkout.destination)).catch(()=>{})}>{tr('Copy','Copier')}</button></p>
        <p className="mykioo-request-payment-note">{tr('Pay in your banking app, enter the confirmation below, then submit. MYKIOO verifies the funds before activation.','Payez dans votre application bancaire, entrez la confirmation ci-dessous, puis envoyez. MYKIOO vérifiera les fonds avant l’activation.')}</p>
        <label htmlFor="mykioo-bank-sender">{tr('Name on the sending account','Nom du titulaire du compte expéditeur')} *</label>
        <input id="mykioo-bank-sender" required minLength={2} maxLength={120} autoComplete="name" value={senderName} onChange={e=>setSenderName(e.target.value)}
         placeholder={tr('Full sender name','Nom complet de l’expéditeur')}/>
        <label htmlFor="mykioo-bank-reference">{tr('Bank transfer confirmation / transaction number','Numéro de confirmation / transaction bancaire')} *</label>
        <input id="mykioo-bank-reference" required minLength={3} maxLength={160} value={paymentReference} onChange={e=>setPaymentReference(e.target.value)}
         placeholder={tr('Confirmation number from your bank','Numéro de confirmation de votre banque')}/>
        <label className="mykioo-bank-pay-ack">
          <input type="checkbox" checked={transferConfirmed} onChange={e=>setTransferConfirmed(e.target.checked)} required/>
          <span>{tr('I confirm I have actually sent this payment to the listed account.','Je confirme avoir réellement envoyé ce paiement au compte indiqué.')}</span>
        </label>
       </>}
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
    <button type="submit" disabled={saving||(isBankPayment&&(!bankReady||!transferConfirmed||senderName.trim().length<2||paymentReference.trim().length<3))||(requestType==='renewal'&&(!renewalId||pendingRenewals.has(renewalId)))||(owner&&!targetId)}>
     {saving?tr('Sending…','Envoi…'):isBankPayment?tr('Submit request with payment confirmation','Envoyer la demande avec confirmation du paiement'):requestType==='renewal'?tr('Request renewal — crypto invoice follows','Demander le renouvellement — facture crypto à suivre'):tr('Request subscription — crypto invoice follows','Demander l’abonnement — facture crypto à suivre')}
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
