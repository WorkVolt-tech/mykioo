import React,{useCallback,useEffect,useState} from 'react';
import {QRCodeSVG} from 'qrcode.react';
import {supabase} from './supabase';
import {Wallet,RefreshCw,Copy,CheckCircle2,ShieldAlert,AlertTriangle,FileText,Receipt,Clock3,Send,Settings,Bitcoin} from 'lucide-react';
import './Billing.css';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-billing';
const methodNames={interac:'Interac e-Transfer',zelle:'Zelle',btc:'Bitcoin (BTC)',shib:'Shiba Inu (SHIB)'};
const currencyTag={interac:'CAD',zelle:'USD',btc:'BTC',shib:'SHIB'};
const isCrypto=m=>m==='btc'||m==='shib';
const money=(amount,currency)=>amount===null||amount===undefined?'—':['BTC','SHIB'].includes(currency)?Number(amount).toLocaleString('en-CA',{maximumFractionDigits:currency==='BTC'?8:0})+' '+currency: new Intl.NumberFormat('en-CA',{style:'currency',currency:currency||'CAD'}).format(amount);
const when=(value,fr)=>value?new Date(value).toLocaleString(fr?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short'}):'—';
const statusNames={
 awaiting_method:['Choose payment method','Choisir le mode de paiement'],
 awaiting_instructions:['Waiting for payment instructions','En attente des instructions de paiement'],
 awaiting_payment:['Awaiting payment','Paiement attendu'],
 payment_submitted:['Payment reported — verification pending','Paiement signalé — vérification en attente'],
 paid:['Payment verified','Paiement vérifié'],
 cancelled:['Invoice cancelled','Facture annulée']
};
const paidStatus=inv=>inv.state==='paid';
const trFor=(language,en,fr)=>language==='fr'?fr:en;

async function billingAction(payload){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session)throw Error('Your session has expired. Sign in again.');
 const response=await fetch(endpoint,{method:'POST',headers:{Authorization:'Bearer '+session.access_token,apikey:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error(result.error||'Billing request failed');
 return result;
}
function networkWarning(method,language){
 if(method==='btc')return <div className="mykioo-billing-warning" role="alert"><ShieldAlert size={22}/><div>
  <strong>{trFor(language,'BITCOIN (BTC) — BITCOIN MAINNET ONLY','BITCOIN (BTC) — RÉSEAU PRINCIPAL BITCOIN UNIQUEMENT')}</strong>
  <p>{trFor(language,'DO NOT SEND BITCOIN CASH (BCH), wrapped BTC, or any other cryptocurrency to this address. Bitcoin Cash (BCH) is not Bitcoin (BTC). Never select a different network. Funds may be permanently lost.','NE PAS ENVOYER DE BITCOIN CASH (BCH), de BTC enveloppé ni aucune autre cryptomonnaie à cette adresse. Bitcoin Cash (BCH) est différent de Bitcoin (BTC). Un mauvais réseau peut entraîner une perte définitive.')}</p>
 </div></div>;
 if(method==='shib')return <div className="mykioo-billing-warning" role="alert"><ShieldAlert size={22}/><div>
  <strong>{trFor(language,'SHIBA INU (SHIB) — ETHEREUM MAINNET (ERC-20) ONLY','SHIBA INU (SHIB) — RÉSEAU PRINCIPAL ETHEREUM (ERC-20) UNIQUEMENT')}</strong>
  <p>{trFor(language,'DO NOT USE Shibarium, Base, Polygon, BNB Smart Chain (BEP-20) or any other network. Do not send ETH or a different token. A 0x address alone does NOT prove the selected network is Ethereum. Wrong-network transfers can be permanently lost.','N’UTILISEZ PAS Shibarium, Base, Polygon, BNB Smart Chain (BEP-20) ni un autre réseau. N’envoyez pas d’ETH ni un autre jeton. Une adresse 0x ne prouve PAS que le réseau choisi est Ethereum. Les transferts sur un mauvais réseau peuvent être définitivement perdus.')}</p>
 </div></div>;
 return null;
}
function MethodPicker({invoice,language,onAction,busy}){
 const [method,setMethod]=useState('interac');
 const tr=(en,fr)=>trFor(language,en,fr);
 return <div className="mykioo-billing-method">
   <label>{tr('Choose how you want to pay','Choisissez votre mode de paiement')}
    <select value={method} onChange={e=>setMethod(e.target.value)}>
     {Object.entries(methodNames).map(([value,name])=><option value={value} key={value}>{name}</option>)}
    </select>
   </label>
   <p className="mykioo-billing-muted">{method==='interac'?tr('Amount: ','Montant : ')+money(invoice.amount_cad,'CAD'):
    method==='zelle'?tr('Amount: ','Montant : ')+money(invoice.amount_usd,'USD'):
    tr('Your crypto amount will be calculated when the owner prepares the payment address.','Le montant en cryptomonnaie sera calculé lorsque le propriétaire préparera l’adresse de paiement.')}</p>
   {isCrypto(method)&&networkWarning(method,language)}
   <button type="button" className="mykioo-billing-primary" disabled={busy} onClick={()=>onAction({action:'select_method',invoice_id:invoice.id,method})}>{tr('Choose this method','Choisir cette méthode')}</button>
  </div>;
}
function InvoiceCard({invoice,language,onAction,busy,owner=false,memberName}){
 const fr=language==='fr',tr=(en,frText)=>fr?frText:en;
 const [accepted,setAccepted]=useState(false),[revealed,setRevealed]=useState(false),[reference,setReference]=useState(''),[note,setNote]=useState('');
 const [overrideAddress,setOverrideAddress]=useState(''),[manual,setManual]=useState(''),[verifyNote,setVerifyNote]=useState(''),[verifyReference,setVerifyReference]=useState('');
 const [verified,setVerified]=useState(false);
 const [localNotice,setLocalNotice]=useState('');
 useEffect(()=>{setAccepted(false);setRevealed(false);setReference('');setNote('');setLocalNotice('')},[invoice.id,invoice.method,invoice.destination]);
 const isReady=!!invoice.destination&&!!invoice.amount_due;
 const quoteExpired=isCrypto(invoice.method)&&invoice.quote_expires_at&&Date.now()>new Date(invoice.quote_expires_at).getTime();
 const status=statusNames[invoice.state]?.[fr?1:0]||invoice.state;
 const req=invoice.mykioo_subscription_requests;
 async function copyValue(value){
  try{await navigator.clipboard.writeText(String(value));setLocalNotice(tr('Copied to clipboard','Copié dans le presse-papiers'))}
  catch{setLocalNotice(tr('Select the address to copy it manually','Sélectionnez l’adresse pour la copier manuellement'))}
 }
 const displayMethods=invoice.method?methodNames[invoice.method]:'—';
 return <article className="mykioo-billing-invoice">
  <div className="mykioo-billing-invoice-heading"><div>
   <strong>{req?.service_name||tr('Subscription','Abonnement')}</strong>
   <small>#{invoice.id.slice(0,8).toUpperCase()} · {when(invoice.issued_at,fr)}{memberName?' · '+memberName:''}</small>
   <small>{tr('Request','Demande')}: #{invoice.request_id.slice(0,8)} · {req?.contract_days||'—'} {tr('days','jours')}</small>
  </div><span className={'mykioo-billing-chip '+(paidStatus(invoice)?'paid':invoice.state==='payment_submitted'?'submitted':'')}>{status}</span></div>
  <div className="mykioo-billing-price-row"><span>{tr('Invoice prices','Prix facturés')}</span>
    <strong>{money(invoice.amount_cad,'CAD')} · {money(invoice.amount_usd,'USD')}</strong></div>
  {invoice.method&&<div className="mykioo-billing-price-row"><span>{tr('Selected method','Mode choisi')}</span><strong>{displayMethods}</strong></div>}
  {invoice.method&&invoice.amount_due!==null&&<div className="mykioo-billing-price-row"><span>{tr('Exact amount to send','Montant exact à envoyer')}</span><strong>{money(invoice.amount_due,invoice.currency)}</strong></div>}
  {invoice.quote_expires_at&&<p className="mykioo-billing-muted">{tr('Crypto quote valid until','Devis crypto valide jusqu’au')} {when(invoice.quote_expires_at,fr)} {quoteExpired&&<strong className="mykioo-billing-danger">{tr('— expired: do not send','— expiré : ne pas envoyer')}</strong>}</p>}
  {!owner&&invoice.state==='awaiting_method'&&<MethodPicker invoice={invoice} language={language} onAction={onAction} busy={busy}/>}
  {!owner&&invoice.state==='awaiting_instructions'&&<p className="mykioo-billing-muted"><Clock3 size={16}/>{tr('Your payment method was saved. The owner must provide your payment address or contact. Do not send money yet.','Votre mode de paiement est enregistré. Le propriétaire doit fournir l’adresse ou les coordonnées. N’envoyez rien pour le moment.')}</p>}
  {!owner&&invoice.state==='awaiting_payment'&&!isCrypto(invoice.method)&&isReady&&<div className="mykioo-billing-payment-details">
   <p><strong>{tr('Send to','Envoyer à')}:</strong> <span className="mykioo-billing-address">{invoice.destination}</span> <button type="button" onClick={()=>copyValue(invoice.destination)}><Copy size={14}/>{tr('Copy','Copier')}</button></p>
   <p>{tr('Include the invoice reference in your transfer message:','Indiquez cette référence de facture dans le message de virement :')} <strong>{invoice.id.slice(0,8).toUpperCase()}</strong></p>
  </div>}
  {!owner&&isCrypto(invoice.method)&&['awaiting_payment','payment_submitted','paid'].includes(invoice.state)&&networkWarning(invoice.method,language)}
  {!owner&&invoice.state==='awaiting_payment'&&isCrypto(invoice.method)&&isReady&&!quoteExpired&&<div className="mykioo-billing-payment-details">
    {!revealed?<><label className="mykioo-billing-ack"><input type="checkbox" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>
     <span>{invoice.method==='btc'?tr('I confirm I will send BTC only on Bitcoin Mainnet — NOT Bitcoin Cash (BCH).','Je confirme l’envoi de BTC uniquement sur Bitcoin Mainnet — PAS de Bitcoin Cash (BCH).'):
      tr('I confirm I will send SHIB on Ethereum Mainnet (ERC-20) only — NOT Shibarium, Base, Polygon or BNB Chain.','Je confirme l’envoi de SHIB uniquement sur Ethereum Mainnet (ERC-20) — PAS Shibarium, Base, Polygon ou BNB Chain.')}</span></label>
     <button type="button" disabled={!accepted} className="mykioo-billing-primary" onClick={()=>setRevealed(true)}>{tr('Show confirmed payment address','Afficher l’adresse après confirmation')}</button></>:
     <div className="mykioo-billing-crypto-address">
      <div className="mykioo-billing-qr"><QRCodeSVG value={invoice.destination} size={156} includeMargin/></div>
      <div><strong>{tr('Receiving address','Adresse de réception')} — {invoice.network}</strong>
      <code className="mykioo-billing-address">{invoice.destination}</code>
      <button type="button" onClick={()=>copyValue(invoice.destination)}><Copy size={14}/>{tr('Copy address','Copier l’adresse')}</button>
      <small>{tr('QR code contains the address only. In your wallet you must independently select the exact token, network and amount.','Le code QR contient seulement l’adresse. Dans votre portefeuille, sélectionnez le jeton, le réseau et le montant exacts.')}</small></div>
     </div>}
  </div>}
  {!owner&&invoice.state==='awaiting_payment'&&isReady&&!quoteExpired&&<form className="mykioo-billing-payment-form" onSubmit={e=>{e.preventDefault();onAction({action:'submit_payment',invoice_id:invoice.id,payment_reference:reference.trim(),submitted_note:note.trim(),ack_network:isCrypto(invoice.method)?accepted&&revealed:true})}}>
   <strong>{tr('I sent the payment','J’ai envoyé le paiement')}</strong>
   <label>{isCrypto(invoice.method)?tr('Blockchain transaction hash (required)','Hachage de la transaction (obligatoire)'):tr('Transfer confirmation/reference (optional)','Référence du virement (facultative)')}
    <input value={reference} onChange={e=>setReference(e.target.value)} maxLength={160} required={isCrypto(invoice.method)} placeholder={isCrypto(invoice.method)?invoice.method==='btc'?'64 hexadecimal characters':'0x followed by 64 hexadecimal characters':tr('Payment confirmation number','Numéro de confirmation du paiement')}/></label>
   <label>{tr('Note (optional)','Note (facultative)')}<textarea value={note} onChange={e=>setNote(e.target.value)} maxLength={500} rows={2}/></label>
   <button type="submit" className="mykioo-billing-primary" disabled={busy||(isCrypto(invoice.method)&&(!accepted||!revealed))}>{tr('Submit for owner verification','Soumettre pour vérification')}</button>
   <small>{tr('This does not confirm payment. Only the owner can verify received funds.','Cette action ne confirme pas le paiement. Seul le propriétaire peut vérifier la réception des fonds.')}</small>
  </form>}
  {!owner&&invoice.state==='payment_submitted'&&<div className="mykioo-billing-info"><Clock3 size={18}/>{tr('Your payment has been reported. The owner will confirm the actual deposit before fulfillment.','Votre paiement a été signalé. Le propriétaire vérifiera la réception réelle avant de fournir le service.')}</div>}
  {paidStatus(invoice)&&<div className="mykioo-billing-info paid"><CheckCircle2 size={18}/>{tr('Payment receipt — verified','Reçu de paiement — vérifié')} · {when(invoice.paid_at,fr)}. {tr('Service activation remains a separate owner action.','L’activation du service demeure une action distincte du propriétaire.')}</div>}
  {invoice.state==='cancelled'&&<p className="mykioo-billing-muted">{tr('This invoice is closed. Contact support for questions.','Cette facture est fermée. Contactez le soutien pour toute question.')}</p>}
  {owner&&invoice.state==='awaiting_method'&&<p className="mykioo-billing-muted">{tr('Waiting for customer to choose Interac, Zelle, Bitcoin or SHIB.','En attente du choix du client : Interac, Zelle, Bitcoin ou SHIB.')}</p>}
  {owner&&['awaiting_instructions','awaiting_payment'].includes(invoice.state)&&invoice.method&&<form className="mykioo-billing-owner-form" onSubmit={e=>{e.preventDefault();onAction({action:'set_destination',invoice_id:invoice.id,destination:overrideAddress.trim(),...(isCrypto(invoice.method)&&manual.trim()?{manual_amount:manual.trim()}:{})})}}>
   <strong>{tr('Set payment instructions','Définir les instructions de paiement')}</strong>
   <label>{isCrypto(invoice.method)?tr('Paste Coinbase receiving address for this invoice','Collez l’adresse Coinbase pour cette facture'):tr('Recipient email or payment contact','Courriel ou coordonnées du destinataire')}
     <input value={overrideAddress} onChange={e=>setOverrideAddress(e.target.value)} maxLength={254} placeholder={invoice.method==='btc'?'bc1…':invoice.method==='shib'?'0x…':tr('Recipient contact','Coordonnées du destinataire')} required/></label>
   {isCrypto(invoice.method)&&<>
    <p className="mykioo-billing-muted">{tr('A current CAD crypto quote will be fetched when you save. It is valid for 24 hours.','Une cotation crypto en CAD sera récupérée lors de l’enregistrement. Elle sera valide 24 heures.')}</p>
    <label>{tr('Optional: manually verified crypto amount if quote service is unavailable','Facultatif : montant crypto vérifié manuellement si la cotation est indisponible')}
     <input value={manual} type="number" step={invoice.method==='btc'?'0.00000001':'1'} min="0.00000001" placeholder={tr('Leave blank for live quote','Laisser vide pour une cotation en direct')} onChange={e=>setManual(e.target.value)}/></label>
    {networkWarning(invoice.method,language)}
   </>}
   <button type="submit" disabled={busy} className="mykioo-billing-primary">{tr('Issue / refresh payment instructions','Émettre / actualiser les instructions')}</button>
  </form>}
  {owner&&invoice.destination&&<div className="mykioo-billing-owner-address"><strong>{tr('Destination on invoice','Destination sur la facture')}</strong><code>{invoice.destination}</code></div>}
  {owner&&invoice.state==='payment_submitted'&&<p className="mykioo-billing-info"><Clock3 size={18}/>{tr('Customer reports payment sent. Check your bank or Coinbase yourself.','Le client indique avoir payé. Vérifiez vous-même votre banque ou Coinbase.')}</p>}
  {owner&&invoice.payment_reference&&<p className="mykioo-billing-muted">{tr('Submitted reference','Référence soumise')}: <code>{invoice.payment_reference}</code></p>}
  {owner&&['payment_submitted','awaiting_payment'].includes(invoice.state)&&<form className="mykioo-billing-owner-form" onSubmit={e=>{e.preventDefault();onAction({action:'confirm_paid',invoice_id:invoice.id,verified,verification_note:verifyNote.trim(),payment_reference:verifyReference.trim()})}}>
    <strong>{tr('Confirm received payment','Confirmer le paiement reçu')}</strong>
    {isCrypto(invoice.method)&&!invoice.payment_reference&&<label>{tr('Verified transaction hash','Hachage de la transaction vérifiée')}
     <input value={verifyReference} maxLength={160} onChange={e=>setVerifyReference(e.target.value)} required/></label>}
    <label>{tr('Private verification note (optional)','Note privée de vérification (facultative)')}
      <input value={verifyNote} maxLength={500} onChange={e=>setVerifyNote(e.target.value)}/></label>
    <label className="mykioo-billing-ack"><input type="checkbox" checked={verified} onChange={e=>setVerified(e.target.checked)}/>
     {tr('I personally verified the correct amount and recipient in my bank or Coinbase account.','J’ai personnellement vérifié le montant et le destinataire dans ma banque ou mon compte Coinbase.')}</label>
    <button type="submit" className="mykioo-billing-primary" disabled={!verified||busy}>{tr('Mark verified & paid','Marquer comme vérifié et payé')}</button>
   </form>}
  {owner&&invoice.state==='payment_submitted'&&<button type="button" className="mykioo-billing-outline" disabled={busy} onClick={()=>{if(window.confirm(tr('Return this claim for correction? No refund or charge occurs.','Retourner cette déclaration pour correction ? Aucun remboursement ni prélèvement.')))onAction({action:'reject_submission',invoice_id:invoice.id})}}>{tr('Return claim for correction','Retourner la déclaration pour correction')}</button>}
  {owner&&!paidStatus(invoice)&&invoice.state!=='cancelled'&&<button type="button" className="mykioo-billing-outline" disabled={busy} onClick={()=>{if(window.confirm(tr('Cancel this unpaid invoice? This does not cancel the subscription request.','Annuler cette facture impayée ? Cela n’annule pas la demande d’abonnement.')))onAction({action:'cancel_invoice',invoice_id:invoice.id})}}>{tr('Cancel unpaid invoice','Annuler la facture impayée')}</button>}
  {localNotice&&<p role="status" className="mykioo-billing-muted">{localNotice}</p>}
 </article>;
}
export function MemberBilling({userId,language='en'}){
 const tr=(en,fr)=>trFor(language,en,fr);
 const [invoices,setInvoices]=useState([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=useCallback(async()=>{
  if(!supabase||!userId)return;
  const {data,error:fetchError}=await supabase.from('mykioo_billing_invoices')
   .select('*,mykioo_subscription_requests(service_name,status,contract_days,request_type)')
   .eq('member_id',userId).order('issued_at',{ascending:false}).limit(100);
  if(fetchError)throw fetchError;
  setInvoices(data||[]);
 },[userId]);
 useEffect(()=>{let active=true;setLoading(true);
  reload().catch(()=>{if(active)setError(tr('Could not load invoices','Impossible de charger les factures'))}).finally(()=>{if(active)setLoading(false)});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')reload().catch(()=>{})},30000);
  return()=>{active=false;clearInterval(timer)}
 },[reload]);
 async function action(payload){setBusy(true);setError('');setNotice('');
  try{await billingAction(payload);await reload();setNotice(tr('Invoice updated','Facture mise à jour'))}
  catch(err){setError(err.message||tr('Unable to update invoice','Impossible de modifier la facture'))}
  finally{setBusy(false)}
 }
 return <section className="mykioo-billing">
  <div className="mykioo-billing-head"><div><h2><Receipt size={22}/>{tr('Payments & invoices','Paiements et factures')}</h2>
   <p>{tr('View invoices issued by MYKIOO and report your payments. Payment confirmation is always manual.','Consultez les factures émises par MYKIOO et signalez vos paiements. La confirmation est toujours manuelle.')}</p></div>
   <button type="button" onClick={()=>{setLoading(true);reload().catch(()=>setError(tr('Could not refresh','Actualisation impossible'))).finally(()=>setLoading(false))}}><RefreshCw size={17}/>{tr('Refresh','Actualiser')}</button>
  </div>
  {error&&<p className="mykioo-billing-error" role="alert">{error}</p>}{notice&&<p className="mykioo-billing-notice" role="status">{notice}</p>}
  {loading&&<p className="mykioo-billing-muted">{tr('Loading invoices…','Chargement des factures…')}</p>}
  {!loading&&invoices.length===0&&<p className="mykioo-billing-empty">{tr('No invoice has been issued yet. After you request a subscription or renewal, MYKIOO will review it and issue payment instructions.','Aucune facture n’a été émise. Après une demande d’abonnement ou de renouvellement, MYKIOO l’examinera et préparera les instructions de paiement.')}</p>}
  <div className="mykioo-billing-list">{invoices.map(inv=><InvoiceCard key={inv.id} invoice={inv} language={language} busy={busy} onAction={action}/>)}</div>
 </section>;
}
export function OwnerBilling({language='en',requests=[],members=[]}){
 const tr=(en,fr)=>trFor(language,en,fr);
 const [settings,setSettings]=useState(null),[invoices,setInvoices]=useState([]),[loading,setLoading]=useState(true);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false),[requestId,setRequestId]=useState('');
 const [cad,setCad]=useState('80'),[usd,setUsd]=useState('60');
 const [form,setForm]=useState({default_cad:'80',default_usd:'60',interac_destination:'',zelle_destination:''});
 const reload=useCallback(async()=>{
  const [s,i]=await Promise.all([
   supabase.from('mykioo_billing_settings').select('*').eq('id',1).single(),
   supabase.from('mykioo_billing_invoices').select('*,mykioo_subscription_requests(service_name,status,contract_days,request_type)').order('issued_at',{ascending:false}).limit(200)
  ]);
  if(s.error||i.error)throw(s.error||i.error);
  setSettings(s.data);
  setInvoices(i.data||[]);
 },[]);
 useEffect(()=>{let active=true;reload().then(()=>{if(active)setLoading(false)}).catch(()=>{if(active){setError(tr('Billing data could not be loaded.','Impossible de charger les données de facturation.'));setLoading(false)}});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')reload().catch(()=>{})},30000);return()=>{active=false;clearInterval(timer)}
 },[reload]);
 useEffect(()=>{if(settings)setForm({default_cad:String(settings.default_cad),default_usd:String(settings.default_usd),interac_destination:settings.interac_destination||'',zelle_destination:settings.zelle_destination||''})},[settings?.updated_at]);
 const payable=requests.filter(r=>['pending','in_review'].includes(r.status)&&!invoices.some(inv=>inv.request_id===r.id));
 const accounts=new Map(members.map(m=>[m.user_id,m.display_name||m.email||m.user_id]));
 async function action(payload){
  setBusy(true);setError('');setNotice('');
  try{await billingAction(payload);await reload();setNotice(tr('Billing change saved','Modification enregistrée'))}
  catch(err){setError(err.message||tr('Billing operation failed','Échec de l’opération de facturation'))}
  finally{setBusy(false)}
 }
 async function saveSettings(e){e.preventDefault();await action({action:'save_settings',...form});}
 async function issue(e){e.preventDefault();if(!requestId)return;await action({action:'issue_invoice',request_id:requestId,amount_cad:Number(cad),amount_usd:Number(usd)});setRequestId('');}
 return <section className="mykioo-billing">
  <div className="mykioo-billing-head"><div><h2><Wallet size={23}/>{tr('Billing & manual payments','Facturation et paiements manuels')}</h2>
   <p>{tr('Interac (CAD), Zelle (USD), Bitcoin Mainnet, and SHIB on Ethereum Mainnet only. No gateway, automatic charges, or automatic activation.','Interac (CAD), Zelle (USD), Bitcoin Mainnet et SHIB sur Ethereum Mainnet uniquement. Aucun intermédiaire, prélèvement automatique ni activation automatique.')}</p></div>
   <button type="button" onClick={()=>reload().catch(()=>setError(tr('Could not refresh','Actualisation impossible')))}><RefreshCw size={17}/>{tr('Refresh','Actualiser')}</button></div>
  {error&&<p className="mykioo-billing-error" role="alert">{error}</p>}{notice&&<p className="mykioo-billing-notice" role="status">{notice}</p>}
  {loading?<p className="mykioo-billing-muted">{tr('Loading billing…','Chargement de la facturation…')}</p>:<>
   <form className="mykioo-billing-box" onSubmit={saveSettings}>
    <h3><Settings size={18}/>{tr('Billing defaults & receiving contacts','Tarifs par défaut et coordonnées de réception')}</h3>
    <p className="mykioo-billing-muted">{tr('The selected CAD/USD prices are used for new invoices only. Confirm the correct price for each duration before issuing.','Les prix CAD/USD sélectionnés s’appliquent uniquement aux nouvelles factures. Vérifiez le prix selon la durée avant l’émission.')}</p>
    <div className="mykioo-billing-form-grid">
      <label>{tr('Default Interac price (CAD)','Prix Interac par défaut (CAD)')}<input type="number" min="0.01" step="0.01" value={form.default_cad} onChange={e=>setForm(v=>({...v,default_cad:e.target.value}))} required/></label>
      <label>{tr('Default Zelle price (USD)','Prix Zelle par défaut (USD)')}<input type="number" min="0.01" step="0.01" value={form.default_usd} onChange={e=>setForm(v=>({...v,default_usd:e.target.value}))} required/></label>
      <label>{tr('Interac e-Transfer receiving email','Courriel de réception Interac')}<input type="text" maxLength={254} value={form.interac_destination} onChange={e=>setForm(v=>({...v,interac_destination:e.target.value}))} placeholder={tr('Add your Interac receiving email','Ajoutez votre courriel de réception')}/></label>
      <label>{tr('Zelle receiving email / US phone','Courriel ou numéro américain Zelle')}<input type="text" maxLength={254} value={form.zelle_destination} onChange={e=>setForm(v=>({...v,zelle_destination:e.target.value}))} placeholder={tr('Add your Zelle receiving contact','Ajoutez vos coordonnées Zelle')}/></label>
    </div>
    <button type="submit" className="mykioo-billing-primary" disabled={busy}>{tr('Save billing settings','Enregistrer les paramètres')}</button>
    <p className="mykioo-billing-muted">{tr('BTC and SHIB receiving addresses are entered on each invoice once the customer selects crypto. Never enter your Coinbase password or seed phrase.','Les adresses BTC et SHIB sont saisies sur chaque facture après le choix du client. N’entrez jamais votre mot de passe Coinbase ni votre phrase de récupération.')}</p>
   </form>
   <form className="mykioo-billing-box" onSubmit={issue}>
    <h3><FileText size={18}/>{tr('Issue invoice for a pending request','Émettre une facture pour une demande en attente')}</h3>
    <label>{tr('Subscription request','Demande d’abonnement')}
     <select required value={requestId} onChange={e=>setRequestId(e.target.value)}>
      <option value="">{tr('Choose request','Choisir une demande')}</option>
      {payable.map(r=><option value={r.id} key={r.id}>{accounts.get(r.member_id)||r.member_id.slice(0,8)} · {r.service_name} · {r.contract_days} {tr('days','jours')} · #{r.id.slice(0,8)}</option>)}
     </select></label>
    {payable.length===0&&<p className="mykioo-billing-muted">{tr('No uninvoiced pending requests.','Aucune demande en attente sans facture.')}</p>}
    <div className="mykioo-billing-form-grid">
     <label>{tr('Interac (CAD)','Interac (CAD)')}<input type="number" min="0.01" step="0.01" value={cad} onChange={e=>setCad(e.target.value)} required/></label>
     <label>{tr('Zelle (USD)','Zelle (USD)')}<input type="number" min="0.01" step="0.01" value={usd} onChange={e=>setUsd(e.target.value)} required/></label>
    </div>
    <p className="mykioo-billing-muted">{tr('Check the requested service and duration. These two numbers are alternatives, not charges to collect together.','Vérifiez le service et la durée demandés. Ces deux montants sont des options alternatives, pas des montants à cumuler.')}</p>
    <button type="submit" disabled={busy||!requestId} className="mykioo-billing-primary">{tr('Issue invoice','Émettre la facture')}</button>
   </form>
   <div className="mykioo-billing-box">
    <h3><Receipt size={18}/>{tr('Invoices & payment verification','Factures et vérification des paiements')}</h3>
    <p className="mykioo-billing-muted">{tr('Only mark a payment verified after checking the actual bank deposit or confirmed Coinbase transaction. Customer submissions alone are not proof.','Confirmez le paiement seulement après vérification du dépôt bancaire ou de la transaction Coinbase confirmée. Une déclaration du client ne constitue pas une preuve.')}</p>
    {invoices.length===0?<p className="mykioo-billing-empty">{tr('No invoices yet.','Aucune facture pour le moment.')}</p>:
     <div className="mykioo-billing-list">{invoices.map(inv=><InvoiceCard key={inv.id} invoice={inv} memberName={accounts.get(inv.member_id)} language={language} owner busy={busy} onAction={action}/>)}</div>}
   </div>
  </>}
 </section>;
}
