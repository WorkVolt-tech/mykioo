import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';
import './AgentWelcome.css';
import {priceCAD} from './PackagePricing';

// Agent quotes are shown in this dashboard; assigned customers see no pricing.
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
        supabase.from('mykioo_agent_accounts').select('agent_user_id,status,access_type,display_name,discount_cad,onboarding_acknowledged_at').eq('agent_user_id',userId).maybeSingle(),
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

export function AgentDashboard({user,language='en',logout,agent}){
  const [prepaid,setPrepaid]=useState([]);
  useEffect(()=>{if(agent?.access_type!=='paid')return;agentAction('agent_package_list').then(r=>setPrepaid(r.purchases||[])).catch(()=>{});},[user.id,agent?.access_type]);
  const activePrepaid=prepaid.find(p=>p.status==='active'&&p.device_allowance-p.used_devices-p.reserved_devices>0);
  const discountCad=agent?.access_type==='paid'?Number(activePrepaid?.discount_per_device_cad||0):Number(agent?.discount_cad??5);
  const creditsLeft=activePrepaid?activePrepaid.device_allowance-activePrepaid.used_devices-activePrepaid.reserved_devices:0;
  const [welcomeOpen,setWelcomeOpen]=useState(!agent?.onboarding_acknowledged_at);
  const [welcomeRead,setWelcomeRead]=useState(Boolean(agent?.onboarding_acknowledged_at));
  const [welcomeSaving,setWelcomeSaving]=useState(false);
  const [welcomeError,setWelcomeError]=useState('');
  async function acknowledgeWelcome(){
    if(welcomeRead){setWelcomeOpen(false);return;}
    setWelcomeSaving(true);setWelcomeError('');
    try{
      await agentAction('agent_acknowledge_welcome');
      setWelcomeRead(true);setWelcomeOpen(false);
    }catch(error){
      setWelcomeError(t('Could not save your confirmation. Try again.','Impossible d’enregistrer votre confirmation. Réessayez.'));
    }finally{setWelcomeSaving(false);}
  }
  const [rows,setRows]=useState([]),[renewals,setRenewals]=useState([]),[orders,setOrders]=useState([]),[invites,setInvites]=useState([]),[services,setServices]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const [inviteEmail,setInviteEmail]=useState(''),[selectedCustomer,setSelectedCustomer]=useState(''),[kind,setKind]=useState('new'),[days,setDays]=useState(365),[devices,setDevices]=useState(1),[retail,setRetail]=useState(''),[method,setMethod]=useState('interac'),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
  async function refresh(){
    setLoading(true);
    try{
      const result=await agentAction('agent_list');
      setRows(result.customers||[]);setRenewals(result.renewals||[]);
      setOrders(result.orders||[]);setInvites(result.invites||[]);setServices(result.services||[]);setError('');
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
  const packageBase=priceCAD(days,devices);
  const neededCredits=devices*(days===730?2:1);
  const discountTotal=discountCad*devices;
  const resellerBlocked=agent?.access_type==='paid'&&Number(activePrepaid?.fee_cad)===400&&days===365;
  const prepaidBlocked=agent?.access_type==='paid'&&(!activePrepaid||creditsLeft<neededCredits||resellerBlocked);
  const agentDue=packageBase===null?null:Math.round((packageBase-discountTotal)*100)/100;
  return <div className="mykioo-agent-dashboard">
    <div className="mykioo-agent-header"><div><span className="mykioo-agent-kicker">MYKIOO · {t('AGENT BENEFITS','AVANTAGES AGENT')}</span><h2>{t('An upgrade to your membership','Un avantage pour votre adhésion')}</h2><p>{t('Keep your member dashboard and manage agent orders here. You collect payment from your customers; MYKIOO collects only your wholesale amount.','Conservez votre espace membre et gérez vos commandes agent ici. Vous encaissez vos clients; MYKIOO reçoit uniquement votre tarif agent.')}</p></div><button className="mykioo-agent-guide-button" type="button" onClick={()=>setWelcomeOpen(true)}>{t('Agent guide','Guide de l’agent')}</button></div>
    {welcomeOpen&&<div className="mykioo-welcome-overlay">
      <section className="mykioo-welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="mykioo-agent-welcome-title" aria-describedby="mykioo-agent-welcome-desc">
        <div className="mykioo-welcome-eyebrow">MYKIOO / {t('AGENT ACCESS','ACCÈS AGENT')}</div>
        <h2 id="mykioo-agent-welcome-title">{t('You have been promoted to Agent!','Vous avez été promu agent !')}</h2>
        <p id="mykioo-agent-welcome-desc">{t('Your account now includes an Agent dashboard. Here is what you can manage and what your customers can see.','Votre compte comprend maintenant un espace agent. Voici ce que vous pouvez gérer et ce que vos clients peuvent voir.')}</p>
        <div className="mykioo-welcome-grid">
          <div className="mykioo-welcome-panel">
            <h3>{t('What you can do','Ce que vous pouvez faire')}</h3>
            <ul>
              <li>{t('Request invitations for customers (MYKIOO owner approves and sends them).','Demander des invitations pour vos clients (le propriétaire MYKIOO les approuve et les envoie).')}</li>
              <li>{t('See only the customers assigned to you and their service requests.','Voir uniquement vos clients attribués et leurs demandes de service.')}</li>
              <li>{t('Choose your own customer selling price and submit new subscriptions or renewals.','Fixer librement vos prix clients et soumettre des abonnements ou renouvellements.')}</li>
              <li>{t('Receive customer renewal requests in your dashboard. Email delivery may vary.','Recevoir les demandes de renouvellement dans votre espace. Les courriels peuvent être retardés.')}</li>
              <li>{t('Pay MYKIOO the subscription price less the discount per device, provided your prepaid device-year credits cover the order.','Payer MYKIOO le prix de l’abonnement moins la remise par appareil, si vos crédits prépayés couvrent la commande.')}</li>
            </ul>
          </div>
          <div className="mykioo-welcome-panel">
            <h3>{t('What your customers see','Ce que vos clients voient')}</h3>
            <ul>
              <li>{t('Their service status and expiration date.','Le statut de leur service et sa date d’expiration.')}</li>
              <li>{t('Available service options without any prices.','Les options de service sans aucun prix.')}</li>
              <li>{t('A button to request a renewal from you.','Un bouton pour vous demander un renouvellement.')}</li>
              <li>{t('A form to open a support ticket.','Un formulaire pour ouvrir un billet d’assistance.')}</li>
              <li>{t('No wholesale prices, agent discounts or billing information.','Aucun tarif de gros, remise agent ni renseignement de facturation.')}</li>
            </ul>
          </div>
        </div>
        <p className="mykioo-welcome-note">{t('Your discount:','Votre remise :')} <strong>${discountCad} CAD</strong>. {t('Discount codes do not stack. MYKIOO owner verifies payment and completes each service; orders are never activated automatically.','Les codes promotionnels ne sont pas cumulables. Le propriétaire MYKIOO vérifie le paiement et active chaque service; aucune commande n’est activée automatiquement.')}</p>
        {welcomeError&&<p role="alert" className="mykioo-welcome-error">{welcomeError}</p>}
        <button type="button" className="mykioo-welcome-confirm" disabled={welcomeSaving} onClick={acknowledgeWelcome}>
          {welcomeSaving?t('Saving…','Enregistrement…'):t('Got it — Open my Agent dashboard','Compris — Accéder à mon espace agent')}
        </button>
      </section>
    </div>}
    <p className="mykioo-agent-summary">{t('Your customer selling price is your decision. The owner verifies your payment before completing the service.','Vous fixez librement votre prix de vente. Le propriétaire vérifie votre paiement avant d’activer le service.')}</p>
    {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
    <div className="mykioo-agent-stats">
      <article className="mykioo-agent-stat"><strong>{rows.length}</strong><small>{t('Assigned customers','Clients attribués')}</small></article>
      <article className="mykioo-agent-stat"><strong>{renewals.filter(r=>r.status==='pending').length}</strong><small>{t('Pending renewal requests','Renouvellements en attente')}</small></article>
      <article className="mykioo-agent-stat"><strong>${discountCad} CAD</strong><small>{t('Discount per device; 10 device-year credits per paid package','Remise par appareil; 10 crédits appareil-année par forfait payé')}</small></article>
    </div>
    <section className="mykioo-agent-panel"><h2>{t('Customers','Clients')}</h2>
      {loading?<p>{t('Loading…','Chargement…')}</p>:rows.length===0?<p>{t('No customers assigned yet. Request an invitation below. The owner must approve and assign the customer before you can submit an order.','Aucun client attribué. Demandez une invitation ci-dessous. Le propriétaire doit approuver et attribuer le client avant toute commande.')}</p>:
      <ul>{rows.map(c=><li key={c.customer_user_id}><code>{c.customer_user_id.slice(0,8)}…</code> · {statusDate(c.assigned_at,language)}</li>)}</ul>}
    </section>
    <section className="mykioo-agent-panel"><h2>{t('Invite a customer','Inviter un client')}</h2>
      <p>{t('Your request goes to the MYKIOO owner for invitation approval and delivery.','Votre demande sera envoyée au propriétaire MYKIOO pour approbation et envoi.')}</p>
      <form onSubmit={invite}><label>{t('Customer email','Courriel du client')}<input type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/></label>
      <button disabled={saving} type="submit">{t('Request invitation','Demander une invitation')}</button></form>
    </section>
    <section className="mykioo-agent-panel"><h2>{t('Order for an assigned customer','Commande pour un client attribué')}</h2>
      <p>{t('Your selling price is your choice. MYKIOO deducts '+discountCad+' CAD per device on eligible wholesale orders; coupons do not apply.','Vous choisissez votre prix de vente. MYKIOO déduit '+discountCad+' $ CA par appareil sur les commandes admissibles; les codes promo ne s’appliquent pas.')}</p>
      <form className="mykioo-agent-order-form" onSubmit={submitOrder}>
       <label>{t('Assigned customer','Client attribué')}<select required value={selectedCustomer} onChange={e=>setSelectedCustomer(e.target.value)}><option value="">{t('Choose a customer','Choisir un client')}</option>{rows.map(r=><option value={r.customer_user_id} key={r.customer_user_id}>{r.customer_user_id.slice(0,8)}…</option>)}</select></label>
       <label>{t('Order type','Type de commande')}<select value={kind} onChange={e=>setKind(e.target.value)}><option value="new">{t('New subscription','Nouvel abonnement')}</option><option value="renewal">{t('Renewal','Renouvellement')}</option></select></label>
       <label>{t('Duration','Durée')}<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={365}>{t('12 months','12 mois')}</option><option value={730}>{t('24 months','24 mois')}</option></select></label>
       <label>{t('Devices','Appareils')}<select value={devices} onChange={e=>setDevices(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
       <div className="mykioo-agent-quote" aria-live="polite">
        <div><span>{t('Package price','Prix du forfait')}</span><strong>{packageBase===null?'—':'$'+Number(packageBase).toFixed(2)+' CAD'}</strong></div>
        <div><span>{t('Your discount','Votre remise')}</span><strong>{'- </strong></div>
        <div className="mykioo-agent-quote-total"><span>{t('You owe MYKIOO','Vous devez à MYKIOO')}</span><strong>{agentDue===null||agentDue<=0?'—':'$'+agentDue.toFixed(2)+' CAD'}</strong></div>
        {agentDue!==null&&agentDue<=0&&<p role="alert">{t('Discount must be less than the package price. Contact the owner.','La remise doit être inférieure au prix du forfait. Contactez le propriétaire.')}</p>}
       </div>
       {agent?.access_type==='paid'&&<p role="status">{t('Credits required','Crédits requis')}: {neededCredits} · {t('Credits available','Crédits disponibles')}: {creditsLeft}{prepaidBlocked?' · '+t('This order is not eligible under your active package.','Cette commande n’est pas admissible avec votre forfait actif.'):''}</p>}
       <label>{t('Your selling price (CAD) — collected by you','Votre prix client (CAD) — encaissé par vous')}<input type="number" required min="0" step="0.01" value={retail} onChange={e=>setRetail(e.target.value)}/></label>
       <label>{t('How MYKIOO will be paid','Paiement à MYKIOO')}<select value={method} onChange={e=>setMethod(e.target.value)}><option value="interac">Interac e-Transfer</option><option value="manual">{t('Manual transfer','Virement manuel')}</option><option value="cash">{t('Cash','Espèces')}</option><option value="zelle">Zelle</option><option value="btc">Bitcoin</option><option value="shib">SHIB</option></select></label>
       <button type="submit" disabled={saving||!rows.length||agentDue===null||agentDue<=0||prepaidBlocked}>{t('Submit order for owner review','Envoyer la commande pour vérification')}</button>
      </form>
      {notice&&<p role="status">{notice}</p>}
    </section>
    <section className="mykioo-agent-panel"><h2>{t('Customer service choices','Choix de services des clients')}</h2>
     {services.length===0?<p>{t('No service choices submitted yet.','Aucune sélection de service pour le moment.')}</p>:
      <ul>{services.map(r=><li key={r.id}><strong>{r.status}</strong> · {r.customer_user_id.slice(0,8)}… · {r.contract_days===365?'12':'24'} {t('months','mois')} · {r.device_count} {t('devices','appareils')}{r.notes?' — '+r.notes:''}</li>)}</ul>}
    </section>
    <section className="mykioo-agent-panel"><h2>{t('My orders','Mes commandes')}</h2>
      {orders.length===0?<p>{t('No orders yet','Aucune commande')}</p>:<ul>{orders.map(o=><li key={o.id}><strong>{o.status}</strong> · {o.kind} · {t('Customer price','Prix client')} ${o.customer_price_cad} CAD · {t('Due to MYKIOO','Dû à MYKIOO')} ${o.wholesale_price_cad} CAD</li>)}</ul>}
    </section>
    <section className="mykioo-agent-panel"><h2>{t('Renewal requests','Demandes de renouvellement')}</h2>
      {renewals.length===0?<p>{t('No renewal requests','Aucune demande de renouvellement')}</p>:
      <ul>{renewals.map(r=><li key={r.id}><strong>{statusDate(r.created_at,language)}</strong> · {r.status} · <code>{r.customer_user_id.slice(0,8)}…</code>{r.message?' — '+r.message:''}</li>)}</ul>}
    </section>
    <p className="page-sub">{t('Order submission, customer invitations, payment verification and email alerts require the MYKIOO server endpoint. No order is activated from this screen.','Les commandes, invitations, vérifications des paiements et alertes courriel nécessitent le service sécurisé MYKIOO. Aucun abonnement ne peut être activé depuis cet écran.')}</p>
    <button className="outline-button" onClick={refresh} disabled={loading}>{t('Refresh','Actualiser')}</button>
  </div>;
}

export function AgentCustomerDashboard({user,language='en',logout}){
  const t=(en,fr)=>tr(language,en,fr);
  const [subscriptions,setSubscriptions]=useState([]),[renewals,setRenewals]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[ticketSubject,setTicketSubject]=useState(''),[ticketBody,setTicketBody]=useState(''),[ticketBusy,setTicketBusy]=useState(false),[ticketNotice,setTicketNotice]=useState('');
  const [agentId,setAgentId]=useState(null);
  const [serviceDays,setServiceDays]=useState(365),[serviceDevices,setServiceDevices]=useState(1),[serviceNotes,setServiceNotes]=useState(''),[serviceBusy,setServiceBusy]=useState(false),[serviceNotice,setServiceNotice]=useState('');
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
  async function requestService(e){
    e.preventDefault();setServiceBusy(true);setServiceNotice('');
    try{
      const response=await agentAction('customer_service_request',{
        contract_days:serviceDays,device_count:serviceDevices,notes:serviceNotes.trim()
      });
      setServiceNotes('');
      setServiceNotice(response.agent_email_accepted
        ?t('Your service selection was sent to your agent.','Votre sélection de service a été envoyée à votre agent.')
        :t('Your selection was recorded for your agent. Email delivery was not confirmed.','Votre sélection a été enregistrée pour votre agent. L’envoi du courriel n’est pas confirmé.'));
    }catch{setServiceNotice(t('Could not submit your selection.','Impossible de soumettre votre sélection.'));}
    finally{setServiceBusy(false);}
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
    <section className="mykioo-support-card"><h2>{t('Service options','Options de service')}</h2>
     <p>{t('Choose what you are interested in. Your agent will contact you. No price or payment is shown here.','Choisissez le service qui vous intéresse. Votre agent vous contactera. Aucun prix ni paiement n’est affiché ici.')}</p>
     <form onSubmit={requestService}>
       <label>{t('Service','Service')}<select disabled><option>MYKIOO TV</option></select></label>
       <label>{t('Duration','Durée')}<select value={serviceDays} onChange={e=>setServiceDays(Number(e.target.value))}><option value={365}>{t('12 months','12 mois')}</option><option value={730}>{t('24 months','24 mois')}</option></select></label>
       <label>{t('Devices','Appareils')}<select value={serviceDevices} onChange={e=>setServiceDevices(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
       <label>{t('Preferences (optional)','Préférences (facultatif)')}<textarea maxLength={1000} value={serviceNotes} onChange={e=>setServiceNotes(e.target.value)} placeholder={t('Preferred countries or language packs','Pays ou bouquets linguistiques souhaités')}/></label>
       <button type="submit" disabled={serviceBusy}>{serviceBusy?t('Submitting…','Envoi…'):t('Send choice to agent','Envoyer ma sélection à l’agent')}</button>
     </form>
     {serviceNotice&&<p role="status">{serviceNotice}</p>}
    </section>
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
+Number(discountTotal).toFixed(2)+' CAD'}</strong></div>
        <div className="mykioo-agent-quote-total"><span>{t('You owe MYKIOO','Vous devez à MYKIOO')}</span><strong>{agentDue===null||agentDue<=0?'—':'$'+agentDue.toFixed(2)+' CAD'}</strong></div>
        {agentDue!==null&&agentDue<=0&&<p role="alert">{t('Discount must be less than the package price. Contact the owner.','La remise doit être inférieure au prix du forfait. Contactez le propriétaire.')}</p>}
       </div>
       <label>{t('Your selling price (CAD) — collected by you','Votre prix client (CAD) — encaissé par vous')}<input type="number" required min="0" step="0.01" value={retail} onChange={e=>setRetail(e.target.value)}/></label>
       <label>{t('How MYKIOO will be paid','Paiement à MYKIOO')}<select value={method} onChange={e=>setMethod(e.target.value)}><option value="interac">Interac e-Transfer</option><option value="manual">{t('Manual transfer','Virement manuel')}</option><option value="cash">{t('Cash','Espèces')}</option><option value="zelle">Zelle</option><option value="btc">Bitcoin</option><option value="shib">SHIB</option></select></label>
       <button type="submit" disabled={saving||!rows.length||agentDue===null||agentDue<=0}>{t('Submit order for owner review','Envoyer la commande pour vérification')}</button>
      </form>
      {notice&&<p role="status">{notice}</p>}
    </section>
    <section className="mykioo-agent-panel"><h2>{t('Customer service choices','Choix de services des clients')}</h2>
     {services.length===0?<p>{t('No service choices submitted yet.','Aucune sélection de service pour le moment.')}</p>:
      <ul>{services.map(r=><li key={r.id}><strong>{r.status}</strong> · {r.customer_user_id.slice(0,8)}… · {r.contract_days===365?'12':'24'} {t('months','mois')} · {r.device_count} {t('devices','appareils')}{r.notes?' — '+r.notes:''}</li>)}</ul>}
    </section>
    <section className="mykioo-agent-panel"><h2>{t('My orders','Mes commandes')}</h2>
      {orders.length===0?<p>{t('No orders yet','Aucune commande')}</p>:<ul>{orders.map(o=><li key={o.id}><strong>{o.status}</strong> · {o.kind} · {t('Customer price','Prix client')} ${o.customer_price_cad} CAD · {t('Due to MYKIOO','Dû à MYKIOO')} ${o.wholesale_price_cad} CAD</li>)}</ul>}
    </section>
    <section className="mykioo-agent-panel"><h2>{t('Renewal requests','Demandes de renouvellement')}</h2>
      {renewals.length===0?<p>{t('No renewal requests','Aucune demande de renouvellement')}</p>:
      <ul>{renewals.map(r=><li key={r.id}><strong>{statusDate(r.created_at,language)}</strong> · {r.status} · <code>{r.customer_user_id.slice(0,8)}…</code>{r.message?' — '+r.message:''}</li>)}</ul>}
    </section>
    <p className="page-sub">{t('Order submission, customer invitations, payment verification and email alerts require the MYKIOO server endpoint. No order is activated from this screen.','Les commandes, invitations, vérifications des paiements et alertes courriel nécessitent le service sécurisé MYKIOO. Aucun abonnement ne peut être activé depuis cet écran.')}</p>
    <button className="outline-button" onClick={refresh} disabled={loading}>{t('Refresh','Actualiser')}</button>
  </div>;
}

export function AgentCustomerDashboard({user,language='en',logout}){
  const t=(en,fr)=>tr(language,en,fr);
  const [subscriptions,setSubscriptions]=useState([]),[renewals,setRenewals]=useState([]),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[ticketSubject,setTicketSubject]=useState(''),[ticketBody,setTicketBody]=useState(''),[ticketBusy,setTicketBusy]=useState(false),[ticketNotice,setTicketNotice]=useState('');
  const [agentId,setAgentId]=useState(null);
  const [serviceDays,setServiceDays]=useState(365),[serviceDevices,setServiceDevices]=useState(1),[serviceNotes,setServiceNotes]=useState(''),[serviceBusy,setServiceBusy]=useState(false),[serviceNotice,setServiceNotice]=useState('');
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
  async function requestService(e){
    e.preventDefault();setServiceBusy(true);setServiceNotice('');
    try{
      const response=await agentAction('customer_service_request',{
        contract_days:serviceDays,device_count:serviceDevices,notes:serviceNotes.trim()
      });
      setServiceNotes('');
      setServiceNotice(response.agent_email_accepted
        ?t('Your service selection was sent to your agent.','Votre sélection de service a été envoyée à votre agent.')
        :t('Your selection was recorded for your agent. Email delivery was not confirmed.','Votre sélection a été enregistrée pour votre agent. L’envoi du courriel n’est pas confirmé.'));
    }catch{setServiceNotice(t('Could not submit your selection.','Impossible de soumettre votre sélection.'));}
    finally{setServiceBusy(false);}
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
    <section className="mykioo-support-card"><h2>{t('Service options','Options de service')}</h2>
     <p>{t('Choose what you are interested in. Your agent will contact you. No price or payment is shown here.','Choisissez le service qui vous intéresse. Votre agent vous contactera. Aucun prix ni paiement n’est affiché ici.')}</p>
     <form onSubmit={requestService}>
       <label>{t('Service','Service')}<select disabled><option>MYKIOO TV</option></select></label>
       <label>{t('Duration','Durée')}<select value={serviceDays} onChange={e=>setServiceDays(Number(e.target.value))}><option value={365}>{t('12 months','12 mois')}</option><option value={730}>{t('24 months','24 mois')}</option></select></label>
       <label>{t('Devices','Appareils')}<select value={serviceDevices} onChange={e=>setServiceDevices(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
       <label>{t('Preferences (optional)','Préférences (facultatif)')}<textarea maxLength={1000} value={serviceNotes} onChange={e=>setServiceNotes(e.target.value)} placeholder={t('Preferred countries or language packs','Pays ou bouquets linguistiques souhaités')}/></label>
       <button type="submit" disabled={serviceBusy}>{serviceBusy?t('Submitting…','Envoi…'):t('Send choice to agent','Envoyer ma sélection à l’agent')}</button>
     </form>
     {serviceNotice&&<p role="status">{serviceNotice}</p>}
    </section>
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
