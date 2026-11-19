import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './supabase';
import './OwnerAgents.css';
import {OwnerAgentPackages} from './AgentPackages.jsx';
import {mykiooConfirm} from './MykiooDialog.jsx';
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
 const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[backendReady,setBackendReady]=useState(false),[memberLoadError,setMemberLoadError]=useState('');
 const [agentId,setAgentId]=useState(''),[status,setStatus]=useState('active'),[type,setType]=useState('free'),[fee,setFee]=useState('0'),[period,setPeriod]=useState('none'),[discount,setDiscount]=useState('5');
 const [customerId,setCustomerId]=useState(''),[customerAgentId,setCustomerAgentId]=useState('');
 const [completionRequests,setCompletionRequests]=useState({});
 const [completedOptions,setCompletedOptions]=useState({});
 const [lookingUp,setLookingUp]=useState(null);
 async function findCompletedAgentServices(orderId){
   setLookingUp(orderId);setError('');
   try{
     const result=await call('owner_find_completed_agent_subscriptions',{order_id:orderId});
     const matches=result.requests||[];
     setCompletedOptions(previous=>({...previous,[orderId]:matches}));
     setCompletionRequests(previous=>({...previous,[orderId]:matches.length===1?matches[0].id:''}));
   }catch(e){setError(e.message)}
   finally{setLookingUp(null)}
 }
 async function refresh(){
   setBusy(true);setError('');setMemberLoadError('');
   // Approved members are already readable by the existing owner dashboard.
   // Load them directly, independent of the new Agent Edge Function.
   const membersResult=await supabase.from('mykioo_members')
     .select('user_id,email,display_name,role,status')
     .eq('status','approved').order('email',{ascending:true}).limit(1000);
   if(membersResult.error)setMemberLoadError(tr(
     'Unable to load approved members: '+membersResult.error.message,
     'Impossible de charger les membres approuvés : '+membersResult.error.message));
   else setData(previous=>({...previous,members:membersResult.data||[]}));
   try{
     const r=await call('owner_list');
     // Never allow a backend response to erase a successfully loaded member list.
     setData(previous=>({...previous,...r,members:membersResult.error?(r.members||[]):(membersResult.data||[])}));
     setBackendReady(true);
   }catch(e){
     setBackendReady(false);
     const offline=/failed to fetch|networkerror|load failed|404|not found/i.test(e.message||'');
     setError(offline?tr(
       'Agent backend is not available in this preview. Approved members can be selected, but saving or assigning Agents requires deploying the new MYKIOO Agent function and database migration.',
       'Le service Agent n’est pas disponible dans cet aperçu. Vous pouvez sélectionner les membres approuvés, mais l’enregistrement ou l’attribution nécessite le déploiement de la fonction Agent et de la migration de base de données MYKIOO.'
     ):e.message);
   }finally{setBusy(false);}
 }
 useEffect(()=>{refresh();},[]);
 const memberName=id=>{
   const m=data.members?.find(x=>x.user_id===id);
   return m?.email||m?.display_name||id?.slice(0,8)||'—';
 };
 const eligible=(data.members||[]).filter(m=>m.status==='approved'&&m.role==='member');
 const currentAgent=agentId?(data.agents||[]).find(a=>a.agent_user_id===agentId):null;
 const active=(data.agents||[]).filter(a=>a.status==='active');
 const agentsById=useMemo(()=>new Map((data.agents||[]).map(a=>[a.agent_user_id,a])),[data.agents]);
 async function saveAgent(e){
   e.preventDefault();setError('');setNotice('');setBusy(true);
   try{await call('owner_set_agent',{agent_user_id:agentId,status,access_type:type,access_fee_cad:type==='free'?0:Number(fee),access_fee_period:type==='free'?'none':period,discount_cad:Number(discount)});
     setNotice(tr('Agent saved.','Agent enregistré.'));await refresh();}
   catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function removeAgent(id){
   const count=(data.customers||[]).filter(c=>c.agent_user_id===id).length;
   if(count>0){setError(tr('Transfer this agent’s '+count+' customer(s) to another active agent before removal.','Transférez les '+count+' client(s) de cet agent à un autre agent actif avant de le retirer.'));return;}
   if(!await mykiooConfirm(tr('Remove Agent access from '+memberName(id)+'? Their member account, previous orders and payment history will be preserved.','Retirer les droits d’agent à '+memberName(id)+' ? Son compte membre, ses commandes et son historique seront conservés.')))return;
   setBusy(true);setError('');setNotice('');
   try{await call('owner_remove_agent',{agent_user_id:id});
     if(agentId===id){setAgentId('');setType('free');setFee('0');setPeriod('none');setDiscount('5');}
     await refresh();setNotice(tr('Agent access removed. Member account preserved.','Accès agent retiré. Compte membre conservé.'));}
   catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function approveAgentInterest(id){
   const name=memberName(id);
   const confirmed=await mykiooConfirm(tr(
    'Approve '+name+' as a MYKIOO Agent? This unlocks the Agent workspace and package purchasing. Package discounts still require separately verified payment.',
    'Approuver '+name+' comme agent MYKIOO ? Cela déverrouille l’espace agent et l’achat de forfaits. Les remises nécessitent toujours une vérification distincte du paiement.'
   ),{title:tr('Approve Agent application','Approuver la demande d’agent'),
      confirmText:tr('Approve Agent','Approuver l’agent')});
   if(!confirmed)return;
   setBusy(true);setError('');setNotice('');
   try{
    await call('owner_set_agent',{agent_user_id:id,status:'active',access_type:'free',
      access_fee_cad:0,access_fee_period:'none',discount_cad:0});
    setNotice(tr('Agent approved. They can now see and purchase paid packages.','Agent approuvé. Il peut maintenant voir et acheter des forfaits payants.'));
    await refresh();
   }catch(e){setError(e.message)}finally{setBusy(false)}
  }
 function selectAgent(id){
   setAgentId(id);
   const a=agentsById.get(id);
   if(a&&a.status!=='removed'){
     setStatus(a.status);setType(a.access_type);setFee(String(a.access_fee_cad));
     setPeriod(a.access_fee_period);setDiscount(String(a.discount_cad??(a.access_type==='paid'?10:5)));
   }else{setStatus('active');setType('free');setFee('0');setPeriod('none');setDiscount('5');}
 }
 async function downgradeAgent(id){
   const a=agentsById.get(id);
   if(!a||a.access_type!=='paid')return;
   if(!await mykiooConfirm(tr('Downgrade '+memberName(id)+' to Free Agent? Their customer assignments and existing orders will be preserved. New order discounts will use $5 CAD.','Rétrograder '+memberName(id)+' en agent gratuit ? Ses clients et commandes seront conservés. Les nouvelles commandes bénéficieront de 5 $ CA de remise.')))return;
   setBusy(true);setError('');setNotice('');
   try{await call('owner_set_agent',{agent_user_id:id,status:a.status,access_type:'free',access_fee_cad:0,access_fee_period:'none',discount_cad:5});
      if(agentId===id){setType('free');setFee('0');setPeriod('none');setDiscount('5');}
      await refresh();setNotice(tr('Agent downgraded to Free.','Agent rétrogradé en Gratuit.'));}
   catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function assign(e){
   e.preventDefault();setError('');setNotice('');setBusy(true);
   try{await call('owner_assign_customer',{agent_user_id:customerAgentId,customer_user_id:customerId});
     setNotice(tr('Customer assigned.','Client attribué.'));await refresh();}
   catch(e){setError(e.message);}finally{setBusy(false);}
 }
 async function verify(orderId){
   if(!await mykiooConfirm(tr('Confirm that you personally verified receipt of payment for this order? This does not activate the service.','Confirmez-vous avoir personnellement vérifié le paiement ? Cela n’active pas le service.')))return;
   setBusy(true);setNotice('');setError('');
   try{await call('owner_verify_agent_order',{order_id:orderId});
     setNotice(tr('Payment marked verified. Complete the service separately using the existing owner subscription workflow.','Paiement vérifié. Complétez le service séparément à partir du processus propriétaire existant.'));await refresh();}
   catch(e){setError(e.message);}finally{setBusy(false);}
 }
 return <section className="admin-workspace-section mykioo-owner-agents">
   <div className="admin-panel-content">
    <h2>{tr('Agents','Agents')}</h2><p>{tr('Manage reseller accounts, assigned customers, invitation requests and incoming payments. A verified payment never automatically activates a subscription.','Gérez les comptes agents, les clients, les invitations et les paiements. La vérification d’un paiement n’active jamais automatiquement un abonnement.')}</p>
    {notice&&<p role="status" className="admin-success">{notice}</p>}
    {error&&<p role="alert" className="admin-error">{error}</p>}
    {memberLoadError&&<p role="alert" className="admin-error">{memberLoadError}</p>}
    {!backendReady&&<p className="mykioo-agent-offline" role="status">{tr('Preview mode — member directory is available, but Agent changes are disabled until the backend is deployed.','Mode aperçu — la liste des membres est disponible, mais les modifications des agents sont désactivées jusqu’au déploiement du serveur.')}</p>}
    <button type="button" disabled={busy} className="outline-button" onClick={refresh}>{tr('Refresh','Actualiser')}</button>
    <div className="admin-panel" style={{padding:16,marginTop:16}}>
      <h3>{tr('Create / update agent','Créer ou modifier un agent')}</h3><p>{eligible.length} {tr('approved members available','membres approuvés disponibles')}</p>
      <form onSubmit={saveAgent} className="mykioo-agent-form">
       <label>{tr('Approved member','Membre approuvé')}</label>
       <select value={agentId} onChange={e=>selectAgent(e.target.value)} required>
         <option value="">{tr('Choose a member','Choisir un membre')}</option>
         {eligible.map(m=><option key={m.user_id} value={m.user_id}>{m.display_name?m.display_name+' — ':''}{m.email||m.user_id.slice(0,8)}</option>)}
       </select>
       <label>{tr('Status','Statut')}</label><select value={status} onChange={e=>setStatus(e.target.value)}><option value="pending">Pending</option><option value="active">Active</option><option value="suspended">Suspended</option></select>
       <label>{tr('Agent access','Accès agent')}</label><select value={type} onChange={e=>{const newType=e.target.value;setType(newType);if(newType==='free'){setFee('0');setPeriod('none');setDiscount('5')}else{setPeriod('monthly');setDiscount('10')}}}><option value="free">{tr('Free','Gratuit')}</option><option value="paid" disabled>{tr('Paid — use package purchase','Payant — via achat de forfait')}</option></select>
       {type==='paid'&&<><label>{tr('Access fee (CAD)','Frais d’accès (CAD)')}</label><input type="number" min="0.01" step="0.01" value={fee} onChange={e=>setFee(e.target.value)} required/><label>{tr('Billing period','Période de facturation')}</label><select value={period} onChange={e=>setPeriod(e.target.value)}><option value="one_time">{tr('One time','Une fois')}</option><option value="monthly">{tr('Monthly','Mensuel')}</option><option value="yearly">{tr('Yearly','Annuel')}</option></select></>}
       <label>{tr('Discount per eligible order (CAD)','Remise par commande admissible (CAD)')}</label>
       <input type="number" min="0" max="1000" step="0.01" value={discount} onChange={e=>setDiscount(e.target.value)} required/>
       <p>{tr('Free-agent settings are managed here. Paid-agent packages and their discounts are managed below, after payment verification.','Les paramètres des agents gratuits sont gérés ici. Les forfaits payants et les remises sont gérés ci-dessous, après vérification du paiement.')}</p>
       <button type="submit" disabled={busy||!backendReady||!agentId}>{tr('Save agent','Enregistrer l’agent')}</button>
      </form>
    </div>
    <div className="admin-panel" style={{padding:16,marginTop:16}}>
     <h3>{tr('Assign customer to agent','Attribuer un client à un agent')}</h3>
     <form onSubmit={assign} className="mykioo-agent-form">
      <label>{tr('Agent','Agent')}</label><select required value={customerAgentId} onChange={e=>setCustomerAgentId(e.target.value)}><option value="">{tr('Choose an agent','Choisir un agent')}</option>{active.map(a=><option key={a.agent_user_id} value={a.agent_user_id}>{memberName(a.agent_user_id)}</option>)}</select>
      <label>{tr('Customer','Client')}</label><select required value={customerId} onChange={e=>setCustomerId(e.target.value)}><option value="">{tr('Choose a customer','Choisir un client')}</option>{eligible.filter(m=>!agentsById.has(m.user_id)).map(m=><option key={m.user_id} value={m.user_id}>{m.display_name?m.display_name+' — ':''}{m.email||m.user_id.slice(0,8)}</option>)}</select>
      <button type="submit" disabled={busy||!backendReady||!customerId||!customerAgentId}>{tr('Assign customer','Attribuer le client')}</button>
     </form>
    </div>
    <OwnerAgentPackages language={language}/>
    <h3>{tr('Agent directory','Liste des agents')} ({(data.agents||[]).filter(a=>a.status!=='removed').length})</h3>
    <ul>{(data.agents||[]).filter(a=>a.status!=='removed').map(a=><li key={a.agent_user_id} className="mykioo-agent-directory-item">
      <div><strong>{memberName(a.agent_user_id)}</strong> · {a.status} · {a.access_type} · ${a.discount_cad} CAD {tr('discount','de remise')} · {tr('Access fee','Frais d’accès')}: ${a.access_fee_cad} CAD · {tr('Customers','Clients')}: {(data.customers||[]).filter(c=>c.agent_user_id===a.agent_user_id).length}</div>
      <div className="mykioo-agent-actions">
        {a.status==='pending'&&<button type="button" className="outline-button" disabled={busy||!backendReady} onClick={()=>approveAgentInterest(a.agent_user_id)}>{tr('Approve Agent request','Approuver la demande d’agent')}</button>}
        <button type="button" className="outline-button" disabled={busy} onClick={()=>selectAgent(a.agent_user_id)}>{tr('Edit','Modifier')}</button>
        {a.access_type==='paid'&&<button type="button" className="outline-button" disabled={busy} onClick={()=>downgradeAgent(a.agent_user_id)}>{tr('Downgrade to Free','Rétrograder en Gratuit')}</button>}
        <button type="button" className="outline-button" disabled={busy} onClick={()=>removeAgent(a.agent_user_id)}>{tr('Remove Agent','Retirer l’agent')}</button>
      </div>
     </li>)}</ul>
    <h3>{tr('Invitation requests','Demandes d’invitation')}</h3>
    <p>{tr('Pending invitations require the existing owner invitation workflow. These requests are not emails sent.','Les invitations en attente doivent passer par la procédure propriétaire existante. Ces demandes ne sont pas des courriels envoyés.')}</p>
    <ul>{(data.invites||[]).map(i=><li key={i.id}>{i.invitee_email} · {memberName(i.agent_user_id)} · <strong>{i.status}</strong></li>)}</ul>
    <h3>{tr('Agent orders and payments','Commandes et paiements des agents')}</h3>
    <ul>{(data.orders||[]).map(o=><li key={o.id} style={{marginBottom:12}}>
      <strong>{memberName(o.agent_user_id)}</strong> · {memberName(o.customer_user_id)} · {o.kind} · {o.status}
      <div>{tr('MYKIOO due','Dû à MYKIOO')}: <strong>${o.wholesale_price_cad} CAD</strong> / {tr('Agent retail','Prix client')}: ${o.customer_price_cad} CAD</div>
      {o.status==='pending_payment'&&<button type="button" className="outline-button" onClick={()=>verify(o.id)} disabled={busy||!backendReady}>{tr('Confirm received payment','Confirmer le paiement reçu')}</button>}
      {o.status==='owner_review'&&<div style={{padding:12,border:'1px solid #777',marginTop:8,borderRadius:10}}>
       <p>{tr('Select a completed subscription for this customer. Only matching customer, duration, device count and order type are eligible.','Sélectionnez un abonnement terminé pour ce client. Seuls le client, la durée, le nombre d’appareils et le type de commande correspondants sont admissibles.')}</p>
       <button type="button" className="outline-button" disabled={busy||lookingUp===o.id}
        onClick={()=>findCompletedAgentServices(o.id)}>
        {lookingUp===o.id?tr('Searching…','Recherche…'):tr('Find matching completed subscriptions','Trouver les abonnements terminés correspondants')}
       </button>
       {Array.isArray(completedOptions[o.id])&&<>
        <label>{tr('Completed subscription','Abonnement terminé')}
         <select value={completionRequests[o.id]||''}
          onChange={e=>setCompletionRequests(previous=>({...previous,[o.id]:e.target.value}))}>
          <option value="">{tr('Choose a completed subscription','Choisir un abonnement terminé')}</option>
          {completedOptions[o.id].map(req=><option key={req.id} value={req.id}>
           {req.service_name||'MYKIOO TV'} · {req.contract_days===730?'24':'12'} {tr('months','mois')} · {req.device_count} {tr('devices','appareils')} · {new Date(req.completed_at).toLocaleDateString(language==='fr'?'fr-CA':'en-CA')} · {req.id.slice(0,8)}
          </option>)}
         </select>
        </label>
        {completedOptions[o.id].length===0&&<p role="status">{tr('No eligible completed subscriptions found. Activate the customer service through the usual owner workflow, then search again.','Aucun abonnement terminé admissible. Activez le service à partir du processus habituel, puis relancez la recherche.')}</p>}
       </>}
       <button type="button" className="outline-button" disabled={busy||!completionRequests[o.id]}
        onClick={async()=>{
         const requestId=completionRequests[o.id];
         if(!requestId||!await mykiooConfirm(tr('Confirm this subscription is activated and consume its reserved prepaid credits?','Confirmer que cet abonnement est activé et consommer les crédits prépayés réservés ?')))return;
         setBusy(true);setError('');setNotice('');
         try{await call('owner_settle_agent_order',{order_id:o.id,subscription_request_id:requestId});
          setNotice(tr('Prepaid agent credits consumed for the completed subscription.','Crédits agent prépayés consommés pour l’abonnement terminé.'));
          setCompletedOptions(previous=>({...previous,[o.id]:undefined}));
          await refresh();
         }catch(e){setError(e.message)}finally{setBusy(false)}
        }}>
        {tr('Confirm activated service & consume credits','Confirmer le service activé et utiliser les crédits')}
       </button>
      </div>}
      {['pending_payment','owner_review'].includes(o.status)&&<button type="button" className="outline-button" disabled={busy} onClick={async()=>{
        if(!await mykiooConfirm(tr('Cancel this agent order and release its reserved prepaid credits? Check that no service was activated.','Annuler la commande et libérer les crédits réservés ? Vérifiez qu’aucun service n’a été activé.')))return;
        call('owner_cancel_prepaid_agent_order',{order_id:o.id}).then(()=>refresh()).catch(e=>setError(e.message));
      }}>{tr('Cancel prepaid order / release credits','Annuler la commande prépayée / libérer les crédits')}</button>}

    </li>)}</ul>
   </div>
 </section>;
}
