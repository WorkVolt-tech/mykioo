import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';

// Agent/customer views intentionally exclude retail/wholesale pricing.
// Every order and invitation must use the authenticated server workflow.
const tr=(lang,en,fr)=>lang==='fr'?fr:en;
const AGENT_ENDPOINT='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-agents';
async function agentAction(action,details={}){
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw Error('Session expired');
  const res=await fetch(AGENT_ENDPOINT,{method:'POST',headers:{
    'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
    'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  },body:JSON.stringify({action,...details})});
  const result=await res.json().catch(()=>({}));
  if(!res.ok||!result.ok)throw Error(result.error||'Request failed');
  return result;
}
const statusDate=(date,lang)=>date?new Date(date).toLocaleDateString(lang==='fr'?'fr-CA':'en-CA',{year:'numeric',month:'long',day:'numeric'}):'—';

export function useAgentAccess(userId){
  const [state,setState]=useState({loading:true,agent:null,assignment:null,error:''});
  useEffect(()=>{
    if(!userId||!supabase){setState({loading:false,agent:null,assignment:null,error:''});return;}
    let active=true;
    async function load(){
      const [agent,assignment]=await Promise.all([
        supabase.from('mykioo_agent_accounts').select('agent_user_id,status,access_type,display_name,discount_cad').eq('agent_user_id',userId).maybeSingle(),
        supabase.from('mykioo_agent_customers').select('customer_user_id,agent_user_id').eq('customer_user_id',userId).maybeSingle()
      ]);
      if(!active)return;
      setState({
        loading:false,agent:agent.data||null,assignment:assignment.data||null,
        error:agent.error||assignment.error?'Agent access is not yet configured.':''
      });
    }
    load();
    return()=>{active=false;};
  },[userId]);
  return state;
}

export function AgentDashboard({user,language='en',logout}){
  const [rows,setRows]=useState([]),[renewals,setRenewals]=useState([]),[orders,setOrders]=useState([]),[invites,setInvites]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [inviteEmail,setInviteEmail]=useState(''),[selectedCustomer,setSelectedCustomer]=useState(''),[kind,setKind]=useState('new'),[days,setDays]=useState(365),[devices,setDevices]=useState(1),[retail,setRetail]=useState(''),[method,setMethod]=useState('interac'),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
  async function refresh(){
    setLoading(true);
    try{
      const result=await agentAction('agent_list');
      setRows(result.customers||[]);setRenewals(result.renewals||[]);
      setOrders(result.orders||[]);setInvites(result.invites||[]);setError('');
    }catch(e){setError(e.message||'Unable to load your customers');}
    finally{setLoading(false);}
  }
  async function invite(e){
    e.preventDefault();setSaving(true);setNotice('');setError('');
    try{const result=await agentAction('agent_invite_request',{email:inviteEmail});
      setNotice(t('Invitation requested. The owner must approve and send it.','Invitation demandée. Le propriétaire doit l’approuver et l’envoyer.'));
      setInviteEmail('');await refresh();
    }catch(e){setError(e.message);}finally{setSaving(false);}
  }
  async function submitOrder(e){
    e.preventDefault();setSaving(true);setNotice('');setError('');
    try{
      const result=await agentAction('agent_submit_order',{
        customer_user_id:selectedCustomer,kind,contract_days:Number(days),
        device_count:Number(devices),customer_price_cad:Number(retail),payment_method:method
      });
      setNotice(t('Order recorded. You owe MYKIOO $','Commande enregistrée. Vous devez à MYKIOO ')+result.order.wholesale_price_cad+
        t(' CAD. The owner must verify payment and complete the service.',' $ CA. Le propriétaire doit vérifier le paiement et compléter le service.'));
      await refresh();
    }catch(e){setError(e.message);}finally{setSaving(false);}
  }
  useEffect(()=>{refresh();},[user.id]);
  const t=(en,fr)=>tr(language,en,fr);
  return <div className="dashboard"><main className="dash-content" style={{maxWidth:960,margin:'0 auto'}}>
    <header className="dash-header"><strong>MYKIOO / {t('Agent portal','Portail agent')}</strong><button className="outline-button" onClick={logout}>{t('Sign out','Déconnexion')}</button></header>
    <div className="page-eyebrow">{t('AGENT SPACE','ESPACE AGENT')}</div>
    <h1>{t('My customers','Mes clients')}</h1>
    <p className="page-sub">{t('Only customers assigned to your agent account appear here. MYKIOO sets your wholesale rate; customer selling prices are private to your business.','Seuls les clients associés à votre compte agent apparaissent ici. MYKIOO fixe votre tarif agent; vous choisissez librement votre prix de vente.')}</p>
    {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
    <div className="shortcut-grid">
      <article className="shortcut"><strong>{rows.length}</strong><small>{t('Assigned customers','Clients attribués')}</small></article>
      <article className="shortcut"><strong>{renewals.filter(r=>r.status==='pending').length}</strong><small>{t('Pending renewal requests','Renouvellements en attente')}</small></article>
      <article className="shortcut"><strong>$5 CAD</strong><small>{t('Permanent discount per eligible order; no coupon stacking','Remise permanente par commande admissible; codes non cumulables')}</small></article>
    </div>
    <section className="mykioo-support-card"><h2>{t('Customers','Clients')}</h2>
      {loading?<p>{t('Loading…','Chargement…')}</p>:rows.length===0?<p>{t('No customers assigned yet. Agent invitations and order submission will become available after the server integration is activated.','Aucun client attribué pour le moment. Les invitations et commandes seront disponibles après l’activation du serveur.')}</p>:
      <ul>{rows.map(c=><li key={c.customer_user_id}><code>{c.customer_user_id.slice(0,8)}…</code> · {statusDate(c.assigned_at,language)}</li>)}</ul>}
    </section>
    <section className="mykioo-support-card"><h2>{t('Invite a customer','Inviter un client')}</h2>
      <p>{t('Your request goes to the MYKIOO owner for invitation approval and delivery.','Votre demande sera envoyée au propriétaire MYKIOO pour approbation et envoi.')}</p>
      <form onSubmit={invite}><label>{t('Customer email','Courriel du client')}<input type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/></label>
      <button disabled={saving} type="submit">{t('Request invitation','Demander une invitation')}</button></form>
    </section>
    <section className="mykioo-support-card"><h2>{t('Create a customer order','Créer une commande client')}</h2>
      <p>{t('Your selling price is your choice. MYKIOO applies your permanent $5 CAD wholesale discount automatically. Coupons do not apply.','Vous choisissez votre prix de vente. MYKIOO applique automatiquement votre remise permanente de 5 $ CA. Les codes promotionnels ne s’appliquent pas.')}</p>
      <form onSubmit={submitOrder}>
       <label>{t('Assigned customer','Client attribué')}<select required value={selectedCustomer} onChange={e=>setSelectedCustomer(e.target.value)}><option value="">{t('Choose a customer','Choisir un client')}</option>{rows.map(r=><option value={r.customer_user_id} key={r.customer_user_id}>{r.customer_user_id.slice(0,8)}…</option>)}</select></label>
       <label>{t('Order type','Type de commande')}<select value={kind} onChange={e=>setKind(e.target.value)}><option value="new">{t('New subscription','Nouvel abonnement')}</option><option value="renewal">{t('Renewal','Renouvellement')}</option></select></label>
       <label>{t('Duration','Durée')}<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={365}>{t('12 months','12 mois')}</option><option value={730}>{t('24 months','24 mois')}</option></select></label>
       <label>{t('Devices','Appareils')}<select value={devices} onChange={e=>setDevices(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
       <label>{t('Your customer price (CAD)','Votre prix client (CAD)')}<input type="number" required min="0" step="0.01" value={retail} onChange={e=>setRetail(e.target.value)}/></label>
       <label>{t('How MYKIOO will be paid','Paiement à MYKIOO')}<select value={method} onChange={e=>setMethod(e.target.value)}><option value="interac">Interac e-Transfer</option><option value="manual">{t('Manual transfer','Virement manuel')}</option><option value="cash">{t('Cash','Espèces')}</option><option value="zelle">Zelle</option><option value="btc">Bitcoin</option><option value="shib">SHIB</option></select></label>
       <button type="submit" disabled={saving||!rows.length}>{t('Submit order for owner review','Envoyer la commande pour vérification')}</button>
      </form>
      {notice&&<p role="status">{notice}</p>}
    </section>
    <section className="mykioo-support-card"><h2>{t('My orders','Mes commandes')}</h2>
      {orders.length===0?<p>{t('No orders yet','Aucune commande')}</p>:<ul>{orders.map(o=><li key={o.id}><strong>{o.status}</strong> · {o.kind} · {t('Customer price','Prix client')} ${o.customer_price_cad} CAD · {t('Due to MYKIOO','Dû à MYKIOO')} ${o.wholesale_price_cad} CAD</li>)}</ul>}
    </section>
    <section className="mykioo-support-card"><h2>{t('Renewal requests','Demandes de renouvellement')}</h2>
      {renewals.length===0?<p>{t('No renewal requests','Aucune demande de renouvellement')}</p>:
      <ul>{renewals.map(r=><li key={r.id}><strong>{statusDate(r.created_at,language)}</strong> · {r.status} · <code>{r.customer_user_id.slice(0,8)}…</code>{r.message?' — '+r.message:''}</li>)}</ul>}
    </section>
    <p className="page-sub">{t('Order submission, customer invitations, payment verification and email alerts require the MYKIOO server endpoint. No order is activated from this screen.','Les commandes, invitations, vérifications des paiements et alertes courriel nécessitent le service sécurisé MYKIOO. Aucun abonnement ne peut être activé depuis cet écran.')}</p>
    <button className="outline-button" onClick={refresh} disabled={loading}>{t('Refresh','Actualiser')}</button>
  </main></div>;
}

export function AgentCustomerDashboard({user,language='en',logout}){
  const t=(en,fr)=>tr(language,en,fr);
  const [subscriptions,setSubscriptions]=useState([]),[renewals,setRenewals]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[ticketSubject,setTicketSubject]=useState(''),[ticketBody,setTicketBody]=useState(''),[ticketBusy,setTicketBusy]=useState(false),[ticketNotice,setTicketNotice]=useState('');
  const [agentId,setAgentId]=useState(null);
  useEffect(()=>{
    let live=true;
    async function load(){
      const [s,r,a]=await Promise.all([
        supabase.from('mykioo_subscriptions').select('id,service_name,status,expires_at').eq('member_id',user.id).order('expires_at',{ascending:false}),
        supabase.from('mykioo_agent_renewal_requests').select('id,subscription_id,status,created_at').eq('customer_user_id',user.id).order('created_at',{ascending:false}).limit(25),
        supabase.from('mykioo_agent_customers').select('agent_user_id').eq('customer_user_id',user.id).maybeSingle()
      ]);
      if(!live)return;
      setSubscriptions(s.data||[]);setRenewals(r.data||[]);setAgentId(a.data?.agent_user_id||null);
    }
    load();return()=>{live=false;};
  },[user.id]);
  async function requestRenewal(id){
    if(!agentId||busy)return;
    if(renewals.some(r=>r.subscription_id===id&&r.status==='pending')){setMessage(t('A request is already pending.','Une demande est déjà en attente.'));return;}
    setBusy(true);setMessage('');
    try{
      const result=await agentAction('customer_renewal_request',{subscription_id:id});
      setRenewals(current=>[{id:result.request_id,subscription_id:id,status:'pending',created_at:new Date().toISOString()},...current]);
      setMessage(result.agent_email_accepted
        ?t('Renewal requested. Your agent was emailed.','Renouvellement demandé. Votre agent a reçu un courriel.')
        :t('Renewal requested. Your agent can see it in their dashboard; email delivery was not confirmed.','Demande enregistrée. Votre agent la voit dans son espace; l’envoi du courriel n’est pas confirmé.'));
    }catch(error){setMessage(t('Unable to record your request. Please contact your agent.','Impossible d’enregistrer la demande. Contactez votre agent.'));}
    finally{setBusy(false);}
  }
  async function submitTicket(e){
    e.preventDefault();setTicketBusy(true);setTicketNotice('');
    try{
      const {data:{session}}=await supabase.auth.getSession();
      if(!session)throw Error('Session expired');
      const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-support',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
        body:JSON.stringify({action:'create_ticket',category:'other',subject:ticketSubject.trim(),message:ticketBody.trim()})
      });
      const result=await response.json();
      if(!response.ok||!result.ok)throw Error(result.error||'Unable to submit');
      setTicketSubject('');setTicketBody('');
      setTicketNotice(t('Support request submitted.','Demande d’assistance envoyée.'));
    }catch{setTicketNotice(t('Support request failed. Please try again.','Échec de la demande. Réessayez.'));}
    finally{setTicketBusy(false);}
  }
  return <div className="dashboard"><main className="dash-content" style={{maxWidth:760,margin:'0 auto'}}>
    <header className="dash-header"><strong>MYKIOO</strong><button className="outline-button" onClick={logout}>{t('Sign out','Déconnexion')}</button></header>
    <h1>{t('My service','Mon service')}</h1>
    <p className="page-sub">{t('Your access and expiration dates, without pricing or billing information.','Votre accès et vos dates d’expiration, sans prix ni facturation.')}</p>
    {subscriptions.length===0?<section className="mykioo-support-card">{t('No active subscription details available yet.','Aucun abonnement disponible pour le moment.')}</section>:
    subscriptions.map(s=><section key={s.id} className="mykioo-support-card"><h2>{s.service_name||'MYKIOO TV'}</h2>
      <p>{t('Status','Statut')}: <strong>{s.status}</strong></p>
      <p>{t('Expires','Expire le')}: <strong>{statusDate(s.expires_at,language)}</strong></p>
      <button type="button" className="outline-button" onClick={()=>requestRenewal(s.id)} disabled={busy||!agentId}>{busy?t('Submitting…','Envoi…'):t('Request renewal from my agent','Demander un renouvellement à mon agent')}</button>
    </section>)}
    {message&&<p role="status">{message}</p>}
    <section className="mykioo-support-card"><h2>{t('Open a support ticket','Ouvrir une demande d’assistance')}</h2>
      <form onSubmit={submitTicket}>
        <label>{t('Subject','Sujet')}<input value={ticketSubject} onChange={e=>setTicketSubject(e.target.value)} minLength={3} maxLength={120} required/></label>
        <label>{t('Describe the issue','Décrivez le problème')}<textarea value={ticketBody} onChange={e=>setTicketBody(e.target.value)} minLength={5} maxLength={3000} required/></label>
        <button type="submit" className="outline-button" disabled={ticketBusy}>{ticketBusy?t('Submitting…','Envoi…'):t('Send support ticket','Envoyer la demande')}</button>
      </form>
      {ticketNotice&&<p role="status">{ticketNotice}</p>}
    </section>
  </main></div>;
}
