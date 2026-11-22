import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {RefreshCw,ShieldCheck,Clock3,Receipt,Wallet,Users,ArrowRight,AlertTriangle} from 'lucide-react';
import {prepaidAction} from './AgentPackages.jsx';
import {mykiooConfirm} from './MykiooDialog.jsx';
import './OwnerPaymentInbox.css';

const methods={interac:'Interac e-Transfer',zelle:'Zelle',btc:'Bitcoin (BTC)',shib:'SHIB (Ethereum)'};
const time=(date,fr)=>date?new Date(date).toLocaleString(fr?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short'}):'—';
const currency=(value,curr='CAD')=>{
 if(value==null||!Number.isFinite(Number(value)))return '—';
 if(curr==='BTC'||curr==='SHIB')return new Intl.NumberFormat('en-CA',{maximumFractionDigits:curr==='BTC'?8:2}).format(Number(value))+' '+curr;
 return new Intl.NumberFormat('en-CA',{style:'currency',currency:curr||'CAD',maximumFractionDigits:2}).format(Number(value));
};

export default function OwnerPaymentInbox({language='en',invoices=[],members=[],renderInvoice,onRefresh,onOpenAgents}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [agentPackages,setAgentPackages]=useState([]),[agentOrders,setAgentOrders]=useState([]),[agentMembers,setAgentMembers]=useState([]);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [busyId,setBusyId]=useState(''),[checked,setChecked]=useState({}),[view,setView]=useState('review'),[search,setSearch]=useState('');
 const loadAgentPayments=useCallback(async()=>{
  const [packages,agents]=await Promise.all([prepaidAction('owner_package_list'),prepaidAction('owner_list')]);
  setAgentPackages(packages.purchases||[]);
  setAgentOrders(agents.orders||[]);
  setAgentMembers(agents.members||[]);
 },[]);
 useEffect(()=>{
  let active=true;
  (async()=>{try{await loadAgentPayments();if(active)setError('')}catch(e){if(active)setError(e.message||'Unable to load agent payments')}finally{if(active)setLoading(false)}})();
  const reload=()=>{if(document.visibilityState==='visible')loadAgentPayments().catch(e=>{if(active)setError(e.message||'Unable to refresh agent payments')})};
  const interval=window.setInterval(reload,45000);
  return()=>{active=false;clearInterval(interval)};
 },[loadAgentPayments]);
 const nameMap=useMemo(()=>new Map([...members,...agentMembers].map(m=>[m.user_id,m.display_name||m.email||m.user_id?.slice(0,8)])),[members,agentMembers]);
 const label=id=>nameMap.get(id)||String(id||'').slice(0,8)||tr('Unknown account','Compte inconnu');
 const reportedInvoices=invoices.filter(i=>i.state==='payment_submitted');
 const reportedPackages=agentPackages.filter(p=>p.status==='payment_submitted');
 const openOrders=agentOrders.filter(o=>o.status==='pending_payment'&&Number(o.wholesale_price_cad)>0);
 const pendingInstructions=agentPackages.filter(p=>p.status==='awaiting_payment');
 const reportedCount=reportedInvoices.length+reportedPackages.length;
 const reviewCount=reportedCount+openOrders.length;
 const unpaidInvoices=invoices.filter(i=>['awaiting_method','awaiting_instructions','awaiting_payment'].includes(i.state));
 const paidInvoices=invoices.filter(i=>i.state==='paid');
 const paidPackages=agentPackages.filter(p=>['active','exhausted'].includes(p.status));
 const settledOrders=agentOrders.filter(o=>['owner_review','completed','fulfilled','cancelled'].includes(o.status)&&Number(o.wholesale_price_cad)>0);
 const matches=(...parts)=>[...parts].map(v=>String(v??'')).join(' ').toLocaleLowerCase().includes(search.trim().toLocaleLowerCase());
 const reviewInvoices=reportedInvoices.filter(i=>matches(i.id,i.sender_name,i.payment_reference,label(i.member_id),i.method));
 const reviewPackages=reportedPackages.filter(p=>matches(p.id,p.payment_reference,label(p.agent_user_id),p.payment_method,p.fee_cad));
 const reviewOrders=openOrders.filter(o=>matches(o.id,o.payment_reference,label(o.agent_user_id),label(o.customer_user_id),o.payment_method,o.wholesale_price_cad));
 const openInvoices=unpaidInvoices.filter(i=>matches(i.id,label(i.member_id),i.method));
 const openPackages=pendingInstructions.filter(p=>matches(p.id,label(p.agent_user_id),p.payment_method));
 const historyInvoices=paidInvoices.filter(i=>matches(i.id,label(i.member_id),i.sender_name,i.method));
 const historyPackages=paidPackages.filter(p=>matches(p.id,label(p.agent_user_id),p.payment_method));
 const historyOrders=settledOrders.filter(o=>matches(o.id,label(o.agent_user_id),label(o.customer_user_id)));
 async function verifyAgent(payment,kind){
  const id=payment.id;
  if(!checked[id])return;
  const isPackage=kind==='package';
  const amount=isPackage?(payment.payment_amount??payment.fee_cad):(payment.wholesale_price_cad);
  const curr=isPackage?(payment.payment_currency||'CAD'):'CAD';
  const confirmText=isPackage?
   tr('I personally checked my bank or wallet and verified receipt of '+currency(amount,curr)+' for this agent package. Confirming also activates the purchased credits. Continue?',
      'J’ai personnellement vérifié la réception de '+currency(amount,curr)+' pour ce forfait agent. La confirmation active également les crédits achetés. Continuer ?'):
   tr('I personally checked receipt of '+currency(amount,curr)+' for this agent order. Mark its wholesale payment as verified? This does NOT activate the customer subscription.',
      'J’ai personnellement vérifié la réception de '+currency(amount,curr)+' pour cette commande agent. Confirmer le paiement de gros ? Cela n’active PAS l’abonnement du client.');
  if(!await mykiooConfirm(confirmText,{title:tr('Verify actual funds received','Vérifier les fonds réellement reçus'),confirmText:isPackage?tr('Confirm payment & activate package','Confirmer et activer le forfait'):tr('Confirm payment only','Confirmer seulement le paiement')}))return;
  setBusyId(id);setError('');setNotice('');
  try{
   if(isPackage)await prepaidAction('owner_activate_agent_package',{purchase_id:id,verified:true});
   else await prepaidAction('owner_verify_agent_order',{order_id:id});
   setChecked(v=>({...v,[id]:false}));
   await loadAgentPayments();
   await onRefresh?.();
   setNotice(isPackage?tr('Package payment verified; prepaid agent credits activated.','Paiement du forfait vérifié ; crédits agent activés.'):tr('Agent order payment verified. Complete the customer subscription separately.','Paiement de la commande vérifié. Activez l’abonnement du client séparément.'));
  }catch(e){setError(e.message||tr('Verification failed','Échec de la vérification'))}
  finally{setBusyId('')}
 }
 const agentPaymentCard=(p,kind)=>{
  const isPackage=kind==='package',id=p.id;
  const amount=isPackage?(p.payment_amount??p.fee_cad):p.wholesale_price_cad;
  const curr=isPackage?(p.payment_currency||'CAD'):'CAD';
  const method=methods[p.payment_method]||p.payment_method||'—';
  const destination=isPackage?p.payment_destination:null;
  const reference=p.payment_reference||'';
  const claim=isPackage;
  return <article key={id} className="mykioo-payment-inbox-card">
   <div className="mykioo-payment-inbox-card-head">
    <div><span className="mykioo-payment-inbox-kind">{isPackage?tr('Agent package purchase','Achat de forfait agent'):tr('Agent customer order','Commande client d’agent')}</span>
     <h3>{label(p.agent_user_id)}</h3>
     {!isPackage&&<small>{tr('Customer','Client')}: {label(p.customer_user_id)}</small>}</div>
    <strong className="mykioo-payment-inbox-amount">{currency(amount,curr)}</strong>
   </div>
   <div className="mykioo-payment-inbox-facts">
    <div><span>{tr('Payment method','Mode de paiement')}</span><strong>{method}</strong></div>
    <div><span>{tr('Payment destination','Destinataire')}</span><strong className="mykioo-payment-inbox-wrap">{destination||tr('Not recorded for this order — verify in your bank/wallet','Non enregistré — vérifiez dans votre banque/portefeuille')}</strong></div>
    <div><span>{tr('Reference / sender','Référence / expéditeur')}</span><strong className="mykioo-payment-inbox-wrap">{reference||tr('No reference provided','Aucune référence fournie')}</strong></div>
    <div><span>{tr('Requested','Demandé')}</span><strong>{time(p.created_at,fr)}</strong></div>
    {isPackage&&<div><span>{tr('Package fee','Prix du forfait')}</span><strong>{currency(p.fee_cad)}</strong></div>}
    {!isPackage&&<div><span>{tr('Device(s) / duration','Appareil(s) / durée')}</span><strong>{p.device_count||'—'} / {p.contract_days===730?tr('2 years','2 ans'):tr('1 year','1 an')}</strong></div>}
   </div>
   <p className="mykioo-payment-inbox-alert"><AlertTriangle size={17}/>{claim?
    tr('Agent reported a payment. This is NOT proof that your account received it.','L’agent a signalé un paiement. Cela ne prouve PAS sa réception sur votre compte.'):
    tr('Agent order awaits payment verification. No receipt has been independently confirmed; check your bank or wallet first.','La commande attend votre vérification. Aucun paiement n’a été confirmé indépendamment ; consultez d’abord votre banque ou portefeuille.')}</p>
   <label className="mykioo-payment-inbox-confirm"><input type="checkbox" checked={!!checked[id]} disabled={Boolean(busyId)} onChange={e=>setChecked(v=>({...v,[id]:e.target.checked}))}/>
    {tr('I checked my actual bank or wallet balance and matched this amount to this transaction.','J’ai vérifié mon véritable compte bancaire ou portefeuille et rapproché ce montant de cette transaction.')}</label>
   <button type="button" disabled={!checked[id]||Boolean(busyId)} className="mykioo-payment-inbox-verify" onClick={()=>verifyAgent(p,kind)}>
    <ShieldCheck size={17}/>{busyId===id?tr('Verifying…','Vérification…'):isPackage?tr('Confirm received & activate package','Confirmer et activer le forfait'):tr('Confirm received payment','Confirmer le paiement reçu')}</button>
  </article>;
 };
 const historySummary=(kind,p)=>{const isInvoice=kind==='invoice',isPackage=kind==='package';return <div className="mykioo-payment-inbox-history" key={kind+p.id}>
  <strong>{isInvoice?label(p.member_id):label(p.agent_user_id)}</strong>
  <span>{isInvoice?tr('Subscription invoice','Facture d’abonnement'):isPackage?tr('Agent package','Forfait agent'):tr('Agent order','Commande agent')}</span>
  <strong>{currency(isInvoice?(p.amount_due??p.amount_cad):isPackage?(p.payment_amount??p.fee_cad):p.wholesale_price_cad,isInvoice?(p.currency||'CAD'):isPackage?(p.payment_currency||'CAD'):'CAD')}</strong>
  <span>{time(p.paid_at||p.payment_verified_at||p.updated_at,fr)} · {p.state||p.status}</span></div>};
 return <section className="mykioo-payment-inbox" aria-label={tr('Owner payment inbox','Boîte de réception des paiements')}>
  <header className="mykioo-payment-inbox-heading"><div><span className="mykioo-payment-inbox-eyebrow"><Wallet size={17}/>{tr('ONE PLACE FOR PAYMENTS','TOUS LES PAIEMENTS AU MÊME ENDROIT')}</span>
    <h2>{tr('Payment Inbox','Boîte de réception des paiements')}</h2>
    <p>{tr('Find who paid, the amount, payment destination, reference and exactly what needs your confirmation. Never approve from a customer claim alone.','Retrouvez le payeur, le montant, le destinataire, la référence et ce qui nécessite votre confirmation. Ne validez jamais sur la seule déclaration du client.')}</p></div>
   <button type="button" className="mykioo-payment-inbox-refresh" onClick={async()=>{setLoading(true);setError('');try{await Promise.all([loadAgentPayments(),onRefresh?.()]);}catch(e){setError(e.message)}finally{setLoading(false)}}} disabled={loading||Boolean(busyId)}>
     <RefreshCw size={17}/>{tr('Refresh payments','Actualiser les paiements')}</button></header>
  <div className="mykioo-payment-inbox-totals">
   <button type="button" className={view==='review'?'active':''} onClick={()=>setView('review')}><strong>{loading?'…':reviewCount}</strong><span>{tr('Need your review','À vérifier')}</span></button>
   <button type="button" className={view==='waiting'?'active':''} onClick={()=>setView('waiting')}><strong>{loading?'…':unpaidInvoices.length+pendingInstructions.length}</strong><span>{tr('Waiting / instructions','Attente / instructions')}</span></button>
   <button type="button" className={view==='history'?'active':''} onClick={()=>setView('history')}><strong>{loading?'…':paidInvoices.length+paidPackages.length+settledOrders.length}</strong><span>{tr('Payment history','Historique des paiements')}</span></button>
  </div>
  {error&&<p role="alert" className="mykioo-payment-inbox-error">{tr('Agent payment information could not be loaded. Do not assume everything is cleared.','Les paiements agents n’ont pas pu être chargés. Ne supposez pas que tout est réglé.')} {error}</p>}
  {notice&&<p role="status" className="mykioo-payment-inbox-success">{notice}</p>}
  <label className="mykioo-payment-inbox-search">{tr('Find a payment by name, email, reference or ID','Rechercher par nom, courriel, référence ou numéro')}<input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={tr('Search payments…','Rechercher un paiement…')}/></label>
  {loading&&<p className="mykioo-payment-inbox-wait">{tr('Loading payment records…','Chargement des paiements…')}</p>}
  {!loading&&view==='review'&&<>
   {reviewInvoices.length===0&&reviewPackages.length===0&&reviewOrders.length===0&&!error&&<div className="mykioo-payment-inbox-empty"><ShieldCheck size={22}/><strong>{tr('No payments needing review in the records loaded.','Aucun paiement à vérifier dans les dossiers chargés.')}</strong><small>{tr('New payment reports will appear here.','Les nouveaux paiements signalés apparaîtront ici.')}</small></div>}
   {reviewInvoices.map(invoice=><div className="mykioo-payment-inbox-invoice" key={invoice.id}><span className="mykioo-payment-inbox-kind"><Receipt size={15}/>{tr('Subscription payment — customer reported sent','Paiement d’abonnement — client déclare l’envoi')}</span>{renderInvoice(invoice)}</div>)}
   {reviewPackages.map(p=>agentPaymentCard(p,'package'))}
   {reviewOrders.map(p=>agentPaymentCard(p,'order'))}
   {reviewCount>0&&<p className="mykioo-payment-inbox-note">{tr('Verification is separate from service activation, except that an approved agent package activates its credits.','La vérification est distincte de l’activation du service, sauf qu’un forfait agent approuvé active ses crédits.')}</p>}
  </>}
  {!loading&&view==='waiting'&&<div className="mykioo-payment-inbox-secondary">
   {openInvoices.map(i=><article key={i.id}><strong>{label(i.member_id)} · {currency(i.amount_due??i.amount_cad,i.currency||'CAD')}</strong><p>{tr('Subscription invoice','Facture d’abonnement')} · {methods[i.method]||i.method||'—'} · {i.state}</p>{renderInvoice(i)}</article>)}
   {openPackages.map(p=><article key={p.id}><strong>{label(p.agent_user_id)} · {currency(p.fee_cad)}</strong><p>{tr('Agent package awaiting payment or instructions','Forfait agent en attente de paiement ou d’instructions')} · {methods[p.payment_method]||p.payment_method||'—'}</p>
     {p.payment_destination&&<p>{tr('Destination','Destinataire')}: <code>{p.payment_destination}</code></p>}
     <button type="button" onClick={onOpenAgents}>{tr('Open agent package instructions','Ouvrir les instructions du forfait agent')}<ArrowRight size={16}/></button></article>)}
   {openInvoices.length===0&&openPackages.length===0&&<p className="mykioo-payment-inbox-empty">{tr('No outstanding payment instructions.','Aucune instruction de paiement en attente.')}</p>}
  </div>}
  {!loading&&view==='history'&&<div className="mykioo-payment-inbox-history-list">{[...historyInvoices.map(p=>historySummary('invoice',p)),...historyPackages.map(p=>historySummary('package',p)),...historyOrders.map(p=>historySummary('order',p))]}{historyInvoices.length+historyPackages.length+historyOrders.length===0&&<p>{tr('No verified payment records to show.','Aucun paiement vérifié à afficher.')}</p>}</div>}
  <p className="mykioo-payment-inbox-footnote">{tr('Financial verification: consult your bank, Zelle or blockchain wallet. A reference number, screenshot or customer statement is not proof of received funds. Agent payments use owner-only secure verification.','Vérification financière : consultez votre banque, Zelle ou portefeuille crypto. Une référence, une capture ou une déclaration client ne prouve pas la réception des fonds. Les paiements agents sont vérifiés par les contrôles sécurisés réservés au propriétaire.')}</p>
 </section>;
}
