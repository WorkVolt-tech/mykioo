import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './supabase';
const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-agents';
async function call(action,details={}){
 const {data:{session}}=await supabase.auth.getSession();
 if(!session)throw Error('Session expired');
 const response=await fetch(endpoint,{method:'POST',headers:{
   'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
   'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
 },body:JSON.stringify({action,...details})});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error(result.error||'Unable to complete request');
 return result;
}
export default function OwnerAgents({language='en'}){
 const tr=(en,fr)=>language==='fr'?fr:en;
 const [data,setData]=useState({agents:[],customers:[],invites:[],orders:[],members:[]});
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState('');
 const [agentId,setAgentId]=useState(''),[status,setStatus]=useState('active'),[type,setType]=useState('free'),[fee,setFee]=useState('0'),[period,setPeriod]=useState('none');
 const [customerId,setCustomerId]=useState(''),[customerAgentId,setCustomerAgentId]=useState('');
 async function refresh(){
   setBusy(true);setError('');
   try{const r=await call('owner_list');setData(r);}
   catch(e){setError(e.message);}
   finally{setBusy(false);}
 }
 useEffect(()=>{refresh();},[]);
 const memberName=id=>{
   const m=data.members?.find(x=>x.user_id===id);
   return m?.email||m?.display_name||id?.slice(0,8)||'—';
 };
 const eligible=(data.members||[]).filter(m=>m.status==='approved'&&m.role==='member');
 const active=(data.agents||[]).filter(a=>a.status==='active');
 const agentsById=useMemo(()=>new Map((data.agents||[]).map(a=>[a.agent_user_id,a])),[data.agents]);
 async function saveAgent(e){
   e.preventDefault();setError('');setNotice('');setBusy(true);
   try{await call('owner_set_agent',{agent_user_id:agentId,status,access_type:type,access_fee_cad:type==='free'?0:Number(fee),access_fee_period:type==='free'?'none':period});
     setNotice(tr('Agent saved.','Agent enregistré.'));await refresh();}
   catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function assign(e){
   e.preventDefault();setError('');setNotice('');setBusy(true);
   try{await call('owner_assign_customer',{agent_user_id:customerAgentId,customer_user_id:customerId});
     setNotice(tr('Customer assigned.','Client attribué.'));await refresh();}
   catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function verify(orderId){
   if(!window.confirm(tr('Confirm that you personally verified receipt of payment for this order? This does not activate the service.','Confirmez-vous avoir personnellement vérifié le paiement ? Cela n’active pas le service.')))return;
   setBusy(true);setNotice('');setError('');
   try{await call('owner_verify_agent_order',{order_id:orderId});
     setNotice(tr('Payment marked verified. Complete the service separately using the existing owner subscription workflow.','Paiement vérifié. Complétez le service séparément à partir du processus propriétaire existant.'));await refresh();}
   catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className="admin-workspace-section">
   <div className="admin-panel-content">
    <h2>{tr('Agents','Agents')}</h2><p>{tr('Manage reseller accounts, assigned customers, invitation requests and incoming payments. A verified payment never automatically activates a subscription.','Gérez les comptes agents, les clients, les invitations et les paiements. La vérification d’un paiement n’active jamais automatiquement un abonnement.')}</p>
    {notice&&<p role="status" className="admin-success">{notice}</p>}
    {error&&<p role="alert" className="admin-error">{error}</p>}
    <button type="button" disabled={busy} className="outline-button" onClick={refresh}>{tr('Refresh','Actualiser')}</button>
    <div className="admin-panel" style={{padding:16,marginTop:16}}>
      <h3>{tr('Create / update agent','Créer ou modifier un agent')}</h3>
      <form onSubmit={saveAgent}>
       <label>{tr('Approved member','Membre approuvé')}</label>
       <select value={agentId} onChange={e=>{const id=e.target.value;setAgentId(id);const row=agentsById.get(id);if(row){setStatus(row.status);setType(row.access_type);setFee(String(row.access_fee_cad));setPeriod(row.access_fee_period);}}} required>
         <option value="">{tr('Choose a member','Choisir un membre')}</option>
         {eligible.map(m=><option key={m.user_id} value={m.user_id}>{m.email||m.display_name}</option>)}
       </select>
       <label>{tr('Status','Statut')}</label><select value={status} onChange={e=>setStatus(e.target.value)}><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
       <label>{tr('Agent access','Accès agent')}</label><select value={type} onChange={e=>{setType(e.target.value);if(e.target.value==='free'){setFee('0');setPeriod('none')}else setPeriod('monthly')}}><option value="free">{tr('Free','Gratuit')}</option><option value="paid">{tr('Paid','Payant')}</option></select>
       {type==='paid'&&<><label>{tr('Access fee (CAD)','Frais d’accès (CAD)')}</label><input type="number" min="0.01" step="0.01" value={fee} onChange={e=>setFee(e.target.value)} required/><label>{tr('Billing period','Période de facturation')}</label><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="one_time">{tr('One time','Une fois')}</option><option value="monthly">{tr('Monthly','Mensuel')}</option><option value="yearly">{tr('Yearly','Annuel')}</option></select></>}
       <p>{tr('Every qualifying agent order receives an automatic permanent $5 CAD discount. Promo codes cannot stack.','Chaque commande admissible reçoit une remise permanente de 5 $ CA. Les codes promotionnels ne sont pas cumulables.')}</p>
       <button type="submit" disabled={busy||!agentId}>{tr('Save agent','Enregistrer l’agent')}</button>
      </form>
    </div>
    <div className="admin-panel" style={{padding:16,marginTop:16}}>
     <h3>{tr('Assign customer to agent','Attribuer un client à un agent')}</h3>
     <form onSubmit={assign}>
      <label>{tr('Agent','Agent')}</label><select required value={customerAgentId} onChange={e=>setCustomerAgentId(e.target.value)}><option value="">{tr('Choose an agent','Choisir un agent')}</option>{active.map(a=><option key={a.agent_user_id} value={a.agent_user_id}>{memberName(a.agent_user_id)}</option>)}</select>
      <label>{tr('Customer','Client')}</label><select required value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">{tr('Choose a customer','Choisir un client')}</option>{eligible.filter(m=>!agentsById.has(m.user_id)).map(m=><option key={m.user_id} value={m.user_id}>{m.email||m.display_name}</option>)}</select>
      <button type="submit" disabled={busy||!customerId||!customerAgentId}>{tr('Assign customer','Attribuer le client')}</button>
     </form>
    </div>
    <h3>{tr('Agent directory','Liste des agents')} ({(data.agents||[]).length})</h3>
    <ul>{(data.agents||[]).map(a=><li key={a.agent_user_id}><strong>{memberName(a.agent_user_id)}</strong> · {a.status} · {a.access_type} · {tr('Customers','Clients')}: {(data.customers||[]).filter(c=>c.agent_user_id===a.agent_user_id).length}</li>)}</ul>
    <h3>{tr('Invitation requests','Demandes d’invitation')}</h3>
    <p>{tr('Pending invitations require the existing owner invitation workflow. These requests are not emails sent.','Les invitations en attente doivent passer par la procédure propriétaire existante. Ces demandes ne sont pas des courriels envoyés.')}</p>
    <ul>{(data.invites||[]).map(i=><li key={i.id}>{i.invitee_email} · {memberName(i.agent_user_id)} · <strong>{i.status}</strong></li>)}</ul>
    <h3>{tr('Agent orders and payments','Commandes et paiements des agents')}</h3>
    <ul>{(data.orders||[]).map(o=><li key={o.id} style={{marginBottom:12}}>
      <strong>{memberName(o.agent_user_id)}</strong> · {memberName(o.customer_user_id)} · {o.kind} · {o.status}
      <div>{tr('MYKIOO due','Dû à MYKIOO')}: <strong>${o.wholesale_price_cad} CAD</strong> / {tr('Agent retail','Prix client')}: ${o.customer_price_cad} CAD</div>
      {o.status==='pending_payment'&&<button type="button" className="outline-button" onClick={()=>verify(o.id)} disabled={busy}>{tr('Confirm received payment','Confirmer le paiement reçu')}</button>}
    </li>)}</ul>
   </div>
 </section>;
}
