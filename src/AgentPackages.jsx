import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';

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
 const active=purchases.filter(p=>['active','exhausted'].includes(p.status));
 const pending=purchases.filter(p=>['awaiting_payment','payment_submitted'].includes(p.status));
 return <section className="mykioo-agent-panel" style={{marginBottom:24}}>
  <h2>{tr('Agent packages · 10 device-year credits','Forfaits agent · 10 crédits appareil-année')}</h2>
  <p>{tr('One credit = one device for one year. Two years cost two credits per device. Discounts are per device, not per year. You choose your resale price.','Un crédit = un appareil pendant un an. Deux ans coûtent deux crédits par appareil. La remise est par appareil, non par année. Vous fixez votre prix de revente.')}</p>
  <p>{tr('The $400 reseller package currently supports only two-year services. Orders and payments require owner verification.','Le forfait revendeur de 400 $ prend actuellement en charge seulement les abonnements de deux ans. Les paiements et commandes doivent être vérifiés par le propriétaire.')}</p>
  {error&&<p role="alert" className="admin-error">{error}</p>}
  {notice&&<p role="status" className="admin-success">{notice}</p>}
  {loading?<p>{tr('Loading packages…','Chargement des forfaits…')}</p>:<>
   {!account&&<div style={{padding:14,marginBottom:12,border:'1px solid #777',borderRadius:12}}>
     <p>{tr('Already a member? Apply for an Agent account here. Your existing membership stays intact.','Déjà membre ? Demandez un compte agent ici. Votre adhésion reste intacte.')}</p>
     <button type="button" disabled={busy} onClick={()=>send('agent_apply',{})}>{tr('Apply to become an Agent','Devenir agent')}</button>
   </div>}
   {account?.status==='pending'&&<p role="status">{tr('Agent application awaiting approval or a verified paid package.','Demande agent en attente d’approbation ou d’un forfait payé et vérifié.')}</p>}
   <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(190px,1fr))',gap:10}}>
    {tiers.map(t=><article key={t.fee_cad} style={{padding:14,border:'1px solid #8c805b',borderRadius:12}}>
     <strong>{fmt(t.fee_cad)}</strong>{t.is_reseller&&<span> · Reseller</span>}
     <p>{fmt(t.discount_per_device_cad)} {tr('off per device','de remise par appareil')}</p>
     <small>{tr('10 device-year credits','10 crédits appareil-année')}</small>
     <button style={{display:'block',marginTop:12}} type="button"
      disabled={busy||!account||!t.purchase_enabled||pending.length>0}
      onClick={()=>send('agent_purchase_package',{fee_cad:Number(t.fee_cad),payment_method:method})}>
      {t.purchase_enabled?tr('Request this package','Demander ce forfait'):tr('Coming soon','Bientôt disponible')}
     </button>
    </article>)}
   </div>
   <label style={{display:'block',marginTop:14}}>{tr('Payment method for a package','Mode de paiement du forfait')} <select value={method} onChange={e=>setMethod(e.target.value)}><option value="interac">Interac</option><option value="zelle">Zelle</option><option value="btc">BTC</option><option value="shib">SHIB</option></select></label>
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
  <p>{tr('Verify the actual payment before activation. Package purchases are unavailable to members until the launch switch is enabled.','Vérifiez le paiement réel avant l’activation. Les achats sont indisponibles tant que la vente n’est pas activée.')}</p>
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
    {['awaiting_payment','payment_submitted'].includes(p.status)&&<button type="button" disabled={busy} onClick={()=>{
      if(window.confirm(tr('Cancel this unapproved package request? This does not send a refund. Confirm that any reported payment has been investigated.','Annuler cette demande de forfait non approuvée ? Aucun remboursement automatique. Vérifiez tout paiement signalé.')))
        run('owner_cancel_agent_package',{purchase_id:p.id})
    }}>{tr('Cancel pending package','Annuler le forfait en attente')}</button>}
    {p.status==='payment_submitted'&&<button type="button" disabled={busy} onClick={()=>{
      if(window.confirm(tr('I verified receipt of this package payment in my bank/wallet. Activate this package?','J’ai vérifié la réception de ce paiement. Activer ce forfait ?')))
       run('owner_activate_agent_package',{purchase_id:p.id,verified:true})
    }}>{tr('Verify payment & activate','Vérifier le paiement et activer')}</button>}
   </article>)}
 </section>
}
