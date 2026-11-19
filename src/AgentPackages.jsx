import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';
import {mykiooConfirm} from './MykiooDialog.jsx';
import {priceCAD} from './PackagePricing';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-agents';
export async function prepaidAction(action,details={}){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw new Error('Sign in again.');
  const response=await fetch(endpoint,{method:'POST',headers:{
    'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
    'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  },body:JSON.stringify({action,...details})});
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw new Error(result.error||'Unable to complete action');
  return result;
}
const fmt=n=>'$'+Number(n||0).toFixed(2)+' CAD';
export function AgentPackages({language='en',onChange}){
 const tr=(en,fr)=>language==='fr'?fr:en;
 const [tiers,setTiers]=useState([]),[purchases,setPurchases]=useState([]),[account,setAccount]=useState(null);
 const [previewFee,setPreviewFee]=useState('100');
 const [method,setMethod]=useState('interac'),[reference,setReference]=useState({}),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function reload(){
  try{const result=await prepaidAction('agent_package_list');
   setTiers(result.tiers||[]);setPurchases(result.purchases||[]);setAccount(result.account||null);setError('');
  }catch(e){setError(e.message)}finally{setLoading(false)}
 }
 useEffect(()=>{reload()},[]);
 async function send(action,details){
  setBusy(true);setError('');setNotice('');
  try{await prepaidAction(action,details);setNotice(tr('Request received.','Demande reçue.'));await reload();onChange?.()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 const approved=account?.status==='active';
 const previewTier=tiers.find(t=>Number(t.fee_cad)===Number(previewFee))||tiers[0];
 const active=purchases.filter(p=>['active','exhausted'].includes(p.status));
 const pending=purchases.filter(p=>['awaiting_payment','payment_submitted'].includes(p.status));
 const totals=active.reduce((all,p)=>{
  const fee=String(Number(p.fee_cad));
  if(!all[fee])all[fee]={fee:Number(p.fee_cad),discount:Number(p.discount_per_device_cad),packages:0,used:0,reserved:0,remaining:0};
  all[fee].packages++;
  all[fee].used+=Number(p.used_devices);
  all[fee].reserved+=Number(p.reserved_devices);
  all[fee].remaining+=Number(p.device_allowance)-Number(p.used_devices)-Number(p.reserved_devices);
  return all;
 },{});
 return <section className="mykioo-agent-panel mykioo-agent-packages">
  <h2>{approved?tr('Agent packages · 10 device-year credits','Forfaits agent · 10 crédits appareil-année'):tr('Become a MYKIOO Agent','Devenir agent MYKIOO')}</h2>
  {approved&&<><p>{tr('One credit = one device for one year. Two years cost two credits per device. Discounts apply per device-year: a two-year order receives twice the per-device discount and uses twice the credits. You choose your resale price.','Un crédit = un appareil pendant un an. Deux ans coûtent deux crédits par appareil. La remise s’applique par appareil-année : un abonnement de deux ans reçoit deux fois la remise par appareil et utilise deux fois les crédits. Vous fixez votre prix de revente.')}</p>
  <p>{tr('The $400 Reseller package is prepaid. Customer orders for 12 or 24 months cost no additional wholesale payment while credits remain. Owner activation is still required.','Le forfait Revendeur de 400 $ est prépayé. Les commandes clients de 12 ou 24 mois ne nécessitent aucun paiement de gros supplémentaire tant que des crédits sont disponibles. L’activation par le propriétaire reste nécessaire.')}</p></>}
  {error&&<p role="alert" className="admin-error">{error}</p>}
  {notice&&<p role="status" className="admin-success">{notice}</p>}
  {loading?<p>{tr('Loading packages…','Chargement des forfaits…')}</p>:<>
   {!account&&<div style={{padding:14,marginBottom:12,border:'1px solid #777',borderRadius:12}}>
     <p>{tr('Your existing membership will remain active. Agent access requires owner approval.','Votre adhésion reste active. L’accès agent nécessite l’approbation du propriétaire.')}</p>
     <button type="button" disabled={busy} onClick={()=>send('agent_apply',{})}>{tr('Submit Agent interest request','Envoyer une demande pour devenir agent')}</button>
   </div>}
   {account?.status==='pending'&&<p role="status">{tr('Your Agent request is pending owner approval. Packages and prices will appear after approval.','Votre demande d’agent attend l’approbation du propriétaire. Les forfaits et prix apparaîtront après approbation.')}</p>}
   {account&&account.status!=='active'&&account.status!=='pending'&&<p role="status">{tr('Agent access is currently unavailable. Contact MYKIOO support.','L’accès agent est actuellement indisponible. Contactez l’assistance MYKIOO.')}</p>}
   {approved&&<>
   <div className="mykioo-agent-purchase-controls"><div><strong>{tr('Choose payment method','Choisir le mode de paiement')}</strong><p>{tr('Choose your payment method before requesting a package.','Choisissez votre mode de paiement avant de demander un forfait.')}</p></div><label className="mykioo-agent-payment-method">{tr('Payment method for a package','Mode de paiement du forfait')} <select value={method} onChange={e=>setMethod(e.target.value)}><option value="interac">Interac</option><option value="zelle">Zelle</option><option value="btc">BTC</option><option value="shib">SHIB</option></select></label></div>
   <div className="mykioo-agent-tier-grid">
    {tiers.map(t=><article key={t.fee_cad} className={'mykioo-agent-tier'+(t.is_reseller?' mykioo-agent-tier-reseller':'')}>
     <div className="mykioo-agent-tier-heading"><strong>{fmt(t.fee_cad)}</strong>{t.is_reseller&&<span className="mykioo-agent-tier-chip">{tr('Reseller','Revendeur')}</span>}</div>
     <p className="mykioo-agent-tier-discount">{t.is_reseller?tr('No extra wholesale fees','Aucun frais de gros supplémentaire'):<><strong>{fmt(t.discount_per_device_cad)}</strong> {tr('off per device-year','de remise par appareil-année')}</>}</p>
     <small className="mykioo-agent-tier-credits">{tr('10 device-year credits','10 crédits appareil-année')}</small>
     <button className="mykioo-agent-tier-action" type="button"
      disabled={busy||!approved||!t.purchase_enabled}
      onClick={()=>send('agent_purchase_package',{fee_cad:Number(t.fee_cad),payment_method:method})}>
      {t.purchase_enabled?tr('Request package','Demander ce forfait'):tr('Coming soon','Bientôt disponible')}
     </button>
    </article>)}
   </div>
   <div className="mykioo-agent-price-preview">
    <h3>{tr('Wholesale price preview','Aperçu des tarifs de gros')}</h3>
    <p>{tr('These are the extra amounts paid to MYKIOO per customer order after purchasing a package. Your customer resale prices are your choice.','Voici les montants supplémentaires versés à MYKIOO par commande client après l’achat du forfait. Vous fixez librement vos prix de revente.')}</p>
    <label className="mykioo-agent-preview-selector">{tr('Compare agent package','Comparer un forfait agent')} <select value={String(Number(previewTier?.fee_cad??100))} onChange={e=>setPreviewFee(e.target.value)}>{tiers.map(t=><option key={t.fee_cad} value={String(Number(t.fee_cad))}>{fmt(t.fee_cad)}{t.is_reseller?' · '+tr('Reseller','Revendeur'):''}</option>)}</select></label>
    {previewTier&&<div className="mykioo-agent-table-scroll"><table className="mykioo-agent-price-table"><thead><tr><th>{tr('Devices','Appareils')}</th><th>{tr('1 year','1 an')}</th><th>{tr('2 years','2 ans')}</th><th>{tr('Credits: 1 / 2 years','Crédits : 1 / 2 ans')}</th></tr></thead><tbody>{[1,2,3,4,5].map(n=><tr key={n}><th>{n}</th>{[365,730].map(days=><td key={days}>{fmt(previewTier.is_reseller?0:Math.max(0,priceCAD(days,n)-Number(previewTier.discount_per_device_cad)*n*(days/365)))}</td>)}<td>{n} / {n*2}</td></tr>)}</tbody></table></div>}
    <p>{tr('Each package contains 10 device-year credits. A 5-device, 2-year order uses all 10. The owner verifies applicable payments and activates services.','Chaque forfait contient 10 crédits appareil-année. Une commande de 5 appareils sur 2 ans utilise les 10 crédits. Le propriétaire vérifie les paiements applicables et active les services.')}</p>
   </div>
   <p role="status">{tr('You may purchase multiple packages at any time. Packages at the same price share credits; choose the discount tier when submitting each agent order.','Vous pouvez acheter plusieurs forfaits à tout moment. Les forfaits au même prix partagent leurs crédits ; choisissez la remise au moment de chaque commande agent.')}</p>
   {Object.values(totals).length>0&&<div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(215px,1fr))',gap:10,marginTop:12}}>
     {Object.values(totals).sort((a,b)=>a.fee-b.fee).map(tier=><div key={tier.fee} style={{padding:12,border:'1px solid #8c805b',borderRadius:12}}>
       <strong>{fmt(tier.fee)} · {tier.fee===400?tr('Reseller · no extra wholesale charge','Revendeur · aucun frais de gros supplémentaire'):<>{'-'+fmt(tier.discount)} {tr('per device-year','par appareil-année')}</>}</strong>
       <p>{tier.packages} {tr('purchased packages','forfaits achetés')} · {tier.packages*10} {tr('total credits','crédits au total')}</p>
       <p>{tr('Available','Disponibles')}: <strong>{tier.remaining}</strong> · {tr('Reserved','Réservés')}: {tier.reserved} · {tr('Used','Utilisés')}: {tier.used}</p>
     </div>)}
   </div>}
   {pending.map(p=><div key={p.id} style={{border:'1px solid #777',borderRadius:12,padding:12,marginTop:12}}>
    <strong>{fmt(p.fee_cad)} · {p.status}</strong>
    {p.status==='awaiting_payment'&&p.instructions_issued_at&&p.payment_destination&&p.payment_amount&&<>
     <p>{tr('Owner-issued instructions','Instructions émises par le propriétaire')}: <strong>{p.payment_amount} {p.payment_currency}</strong></p>
     <p>{tr('Send to','Envoyer à')}: <code style={{overflowWrap:'anywhere'}}>{p.payment_destination}</code></p>
     {p.payment_network&&<p>{tr('Network','Réseau')}: <strong>{p.payment_network}</strong></p>}
     {p.quote_expires_at&&<p>{tr('Crypto quote expires','Expiration de la cotation crypto')}: {new Date(p.quote_expires_at).toLocaleString(language==='fr'?'fr-CA':'en-CA')}</p>}
     <p>{tr('Only report payment after sending the exact amount to the confirmed destination. This does not verify receipt.','Signalez le paiement seulement après avoir envoyé le montant exact au destinataire confirmé. Cela ne vérifie pas la réception.')}</p>
     <input aria-label={tr('Payment reference or sender name','Référence ou nom de l’expéditeur')} value={reference[p.id]||''} onChange={e=>setReference(x=>({...x,[p.id]:e.target.value}))} placeholder={tr('Payment reference or sender name','Référence ou nom de l’expéditeur')}/>
     <button type="button" disabled={busy||!(reference[p.id]||'').trim()||(p.quote_expires_at&&new Date(p.quote_expires_at).getTime()<=Date.now())} onClick={()=>send('agent_submit_package_payment',{purchase_id:p.id,payment_reference:(reference[p.id]||'').trim()})}>{tr('Report payment sent','Signaler le paiement')}</button>
    </>}
    {p.status==='awaiting_payment'&&!p.instructions_issued_at&&<p>{tr('Waiting for MYKIOO to prepare payment instructions. Do not send money yet.','En attente des instructions de paiement de MYKIOO. N’envoyez pas d’argent pour le moment.')}</p>}
   </div>)}
   {active.map(p=><div key={p.id} style={{border:'1px solid #8c805b',borderRadius:12,padding:14,marginTop:12}}>
     <strong>{fmt(p.fee_cad)} · {p.status}</strong>
     <p>{tr('Used','Utilisés')}: {p.used_devices}/10 · {tr('Reserved','Réservés')}: {p.reserved_devices}/10 · {tr('Available','Disponibles')}: {p.device_allowance-p.used_devices-p.reserved_devices}/10</p>
    </div>)}
   </>}
  </>}
 </section>
}
export function OwnerAgentPackages({language='en'}){
 const tr=(en,fr)=>language==='fr'?fr:en;
 const [purchases,setPurchases]=useState([]),[requests,setRequests]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function reload(){try{const r=await prepaidAction('owner_package_list');setPurchases(r.purchases||[])}catch(e){setError(e.message)}}
 useEffect(()=>{reload()},[]);
 async function run(action,details){setBusy(true);setError('');setNotice('');
  try{await prepaidAction(action,details);setNotice(tr('Updated successfully.','Mise à jour réussie.'));await reload()}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 return <section style={{marginTop:24}}>
  <h3>{tr('Paid package purchases','Achats de forfaits payants')}</h3>
  <p>{tr('Verify actual payment before activating any agent package. Only owner-approved agents can request packages; ordinary members cannot view agent pricing.','Vérifiez le paiement réel avant toute activation. Seuls les agents approuvés peuvent demander des forfaits ; les membres ordinaires ne voient pas les tarifs agents.')}</p>
  {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
  <button type="button" disabled={busy} className="outline-button" onClick={reload}>{tr('Refresh','Actualiser')}</button>
  {purchases.length===0?<p>{tr('No package purchases yet.','Aucun achat de forfait pour le moment.')}</p>:
   purchases.map(p=><article key={p.id} style={{border:'1px solid #777',borderRadius:12,padding:12,marginTop:12}}>
    <strong>{fmt(p.fee_cad)} · {p.status}</strong>
    <p>{p.agent_user_id} · {p.payment_method||'—'} · {p.payment_reference||'—'}</p>
    <p>{tr('Used','Utilisés')}: {p.used_devices} · {tr('Reserved','Réservés')}: {p.reserved_devices} · {tr('Remaining','Restants')}: {10-p.used_devices-p.reserved_devices}</p>
    {p.status==='awaiting_payment'&&<div style={{display:'grid',gap:8,marginTop:12}}>
      <p>{tr('Issue payment instructions using MYKIOO’s existing billing settings. For Zelle or crypto, enter a manually verified amount.','Émettez les instructions de paiement à partir des paramètres MYKIOO. Pour Zelle ou crypto, saisissez le montant vérifié manuellement.')}</p>
      {['zelle','btc','shib'].includes(p.payment_method)&&<label>{tr('Payment amount','Montant à payer')} ({p.payment_method==='zelle'?'USD':p.payment_method==='btc'?'BTC':'SHIB'})
       <input type="number" min="0.00000001" step="any" value={requests[p.id]?.amount_due||''} onChange={e=>setRequests(v=>({...v,[p.id]:{...v[p.id],amount_due:e.target.value}}))}/>
      </label>}
      {['btc','shib'].includes(p.payment_method)&&<label>{tr('Verified receiving address','Adresse de réception vérifiée')}
       <input value={requests[p.id]?.destination||''} onChange={e=>setRequests(v=>({...v,[p.id]:{...v[p.id],destination:e.target.value}}))}/>
      </label>}
      <button type="button" disabled={busy||(['zelle','btc','shib'].includes(p.payment_method)&&!(Number(requests[p.id]?.amount_due)>0))||(['btc','shib'].includes(p.payment_method)&&!requests[p.id]?.destination?.trim())}
       onClick={()=>run('owner_issue_package_instructions',{purchase_id:p.id,amount_due:Number(requests[p.id]?.amount_due||0),destination:requests[p.id]?.destination||''})}>
        {tr('Issue / refresh payment instructions','Émettre / actualiser les instructions')}
      </button>
      {p.instructions_issued_at&&<small>{tr('Instructions issued','Instructions émises')}: {p.payment_amount} {p.payment_currency}</small>}
     </div>}
    {['awaiting_payment','payment_submitted'].includes(p.status)&&<button type="button" disabled={busy} onClick={async()=>{
      if(await mykiooConfirm(tr('Cancel this unapproved package request? This does not send a refund. Confirm that any reported payment has been investigated.','Annuler cette demande de forfait non approuvée ? Aucun remboursement automatique. Vérifiez tout paiement signalé.')))
        run('owner_cancel_agent_package',{purchase_id:p.id})
    }}>{tr('Cancel pending package','Annuler le forfait en attente')}</button>}
    {p.status==='payment_submitted'&&<button type="button" disabled={busy} onClick={async()=>{
      if(await mykiooConfirm(tr('I verified receipt of this package payment in my bank/wallet. Activate this package?','J’ai vérifié la réception de ce paiement. Activer ce forfait ?')))
       run('owner_activate_agent_package',{purchase_id:p.id,verified:true})
    }}>{tr('Verify payment & activate','Vérifier le paiement et activer')}</button>}
   </article>)}
 </section>
}
