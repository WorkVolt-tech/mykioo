import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';
import './AgentWelcome.css';
import {priceCAD} from './PackagePricing';
import {MemberSetupGuides} from './SetupGuides';
import {MemberSupportFAQ} from './SupportFAQ';
import SupportThread from './SupportThread';

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
  const [selectedTier,setSelectedTier]=useState('');
  // Active packages at the same price stack their credits, but discounts never mix across tiers.
  const tierBalances=prepaid.filter(p=>p.status==='active').reduce((byFee,p)=>{
    const key=String(Number(p.fee_cad));
    const credits=p.device_allowance-p.used_devices-p.reserved_devices;
    if(!byFee[key])byFee[key]={fee:Number(p.fee_cad),discount:Number(p.discount_per_device_cad),credits:0,packages:0};
    byFee[key].credits+=credits;byFee[key].packages++;
    return byFee;
  },{});
  const eligibleTiers=Object.values(tierBalances).filter(tier=>tier.credits>0).sort((a,b)=>a.fee-b.fee);
  const selectedPool=tierBalances[selectedTier]||null;
  const discountCad=agent?.access_type==='paid'?Number(selectedPool?.discount||0):Number(agent?.discount_cad??5);
  const creditsLeft=selectedPool?.credits||0;
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
  const [inviteEmail,setInviteEmail]=useState(''),[inviteType,setInviteType]=useState('member'),[selectedCustomer,setSelectedCustomer]=useState(''),[kind,setKind]=useState('new'),[days,setDays]=useState(365),[devices,setDevices]=useState(1),[retail,setRetail]=useState(''),[method,setMethod]=useState('interac'),[notice,setNotice]=useState(''),[saving,setSaving]=useState(false);
  async function refresh(){
    setLoading(true);
    try{
      const result=await agentAction('agent_list');
      setRows(result.customers||[]);setRenewals(result.renewals||[]);
      setOrders(result.orders||[]);setInvites(result.invites||[]);setServices(result.services||[]);
      if(agent?.access_type==='paid'){
        const packages=await agentAction('agent_package_list');
        setPrepaid(packages.purchases||[]);
      }else setPrepaid([]);
      setError('');
    }catch(e){setError(e.message||'Unable to load your customers');}
    finally{setLoading(false);}
  }
  async function invite(e){
    e.preventDefault();setSaving(true);setNotice('');setError('');
    try{const result=await agentAction('agent_invite_request',{email:inviteEmail,invitation_type:inviteType});
      setNotice(inviteType==='customer'?t('Customer invitation requested; owner approval required.','Invitation client demandée; approbation du propriétaire nécessaire.'):t('Regular member invitation requested; owner approval required.','Invitation de membre demandée; approbation du propriétaire nécessaire.'));
      setInviteEmail('');await refresh();
    }catch(e){setError(e.message);}finally{setSaving(false);}
  }
  async function submitOrder(e){
    e.preventDefault();setSaving(true);setNotice('');setError('');
    try{
      const result=await agentAction('agent_submit_order',{
        customer_user_id:selectedCustomer,kind,contract_days:Number(days),
        device_count:Number(devices),customer_price_cad:Number(retail),payment_method:method,
        ...(agent?.access_type==='paid'?{package_fee_cad:Number(selectedTier)}:{})
      });
      const due=Number(result.order.wholesale_price_cad);
       setNotice(due===0
         ?t('Order received. Your verified prepaid reseller credits cover the activation charge. No additional payment is required. MYKIOO must still activate the customer service.','Commande reçue. Vos crédits revendeur prépayés vérifiés couvrent les frais d’activation. Aucun paiement supplémentaire n’est requis. MYKIOO doit toujours activer le service client.')
         :t('Order recorded. You owe MYKIOO $','Commande enregistrée. Vous devez à MYKIOO ')+due.toFixed(2)+t(' CAD. The owner must verify payment and complete the service.',' $ CA. Le propriétaire doit vérifier le paiement et compléter le service.'));
      await refresh();
    }catch(e){setError(e.message);}finally{setSaving(false);}
  }
  useEffect(()=>{refresh();},[user.id,agent?.access_type]);
  const t=(en,fr)=>tr(language,en,fr);
  const packageBase=priceCAD(days,devices);
  const neededCredits=devices*(days===730?2:1);
  const discountTotal=discountCad*(agent?.access_type==='paid'?neededCredits:devices);
  const prepaidBlocked=agent?.access_type==='paid'&&(!selectedPool||creditsLeft<neededCredits);
  const agentDue=packageBase===null?null:(Number(selectedPool?.fee)===400?0:Math.max(0,Math.round((packageBase-discountTotal)*100)/100));
  const appliedDiscount=packageBase===null?null:(Number(selectedPool?.fee)===400?Number(packageBase):Math.min(discountTotal,Number(packageBase)));
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
              <li>{t('Pay MYKIOO the subscription price less your package discount per device-year, provided your prepaid credits cover the order. The $400 reseller has no extra activation charge.','Payer MYKIOO le prix de l’abonnement moins la remise par appareil-année, si vos crédits prépayés couvrent la commande. Le forfait revendeur de 400 $ ne comporte pas de frais d’activation supplémentaires.')}</li>
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
    <p className="mykioo-agent-summary">{t('Choose your customer selling price. MYKIOO verifies applicable payments and activates each service manually. No additional payment is due on prepaid reseller orders.','Choisissez votre prix de vente. MYKIOO vérifie les paiements applicables et active chaque service manuellement. Aucun paiement supplémentaire pour les commandes revendeur prépayées.')}</p>
    {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
    <div className="mykioo-agent-stats">
      <article className="mykioo-agent-stat"><strong>{rows.length}</strong><small>{t('Assigned customers','Clients attribués')}</small></article>
      <article className="mykioo-agent-stat"><strong>{renewals.filter(r=>r.status==='pending').length}</strong><small>{t('Pending renewal requests','Renouvellements en attente')}</small></article>
      <article className="mykioo-agent-stat"><strong>${discountCad} CAD</strong><small>{t('Discount per device-year; 10 credits per paid package','Remise par appareil-année; 10 crédits par forfait payé')}</small></article>
    </div>
    <section className="mykioo-agent-panel"><h2>{t('Customers','Clients')}</h2>
      {loading?<p>{t('Loading…','Chargement…')}</p>:rows.length===0?<p>{t('No customers assigned yet. Request an invitation below. The owner must approve and assign the customer before you can submit an order.','Aucun client attribué. Demandez une invitation ci-dessous. Le propriétaire doit approuver et attribuer le client avant toute commande.')}</p>:
      <ul>{rows.map(c=><li key={c.customer_user_id}><code>{c.customer_user_id.slice(0,8)}…</code> · {statusDate(c.assigned_at,language)}</li>)}</ul>}
    </section>
    <section className="mykioo-agent-panel mykioo-agent-invite-choice"><h2>{t('Invite someone','Inviter une personne')}</h2>
      <p>{t('Choose their access before requesting an invitation. A regular member can buy MYKIOO retail packages; an agent customer has a dedicated portal without public pricing. The owner approves and sends every invitation.','Choisissez le type d’accès avant la demande. Un membre normal peut acheter les forfaits MYKIOO; un client agent dispose d’un espace dédié sans tarifs publics. Le propriétaire approuve et envoie chaque invitation.')}</p>
      <form onSubmit={invite}>
       <label>{t('Invitation type','Type d’invitation')}<select required value={inviteType} onChange={e=>setInviteType(e.target.value)}>
        <option value="member">{t('Regular MYKIOO member','Membre MYKIOO normal')}</option>
        <option value="customer">{t('My agent customer','Mon client agent')}</option>
       </select></label>
       <p className="mykioo-agent-invite-explainer">{inviteType==='member'
        ?t('Member: sees regular MYKIOO prices. Your invitation is recorded, but this person is not assigned as your customer.','Membre : voit les prix MYKIOO habituels. Votre invitation reste enregistrée, mais cette personne n’est pas votre client.')
        :t('Customer: linked to you, uses the agent customer portal, and requests services and renewals through you without seeing MYKIOO retail prices.','Client : lié à votre compte; utilise l’espace client agent et demande ses services et renouvellements auprès de vous sans voir les tarifs MYKIOO.')}
       </p>
       <label>{t('Email address','Adresse courriel')}<input type="email" required value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)}/></label>
       <button disabled={saving} type="submit">{t('Request invitation','Demander une invitation')}</button>
      </form>
      {invites.length>0&&<div className="mykioo-agent-invite-history"><h3>{t('My invitation requests','Mes demandes d’invitation')}</h3><ul>{invites.map(i=><li key={i.id}><strong>{i.invitee_email}</strong> · {i.invitation_type==='customer'?t('Customer','Client'):t('Regular member','Membre')} · {i.status}</li>)}</ul></div>}
    </section>
    <section className="mykioo-agent-panel"><h2>{t('Order for an assigned customer','Commande pour un client attribué')}</h2>
      <p>{Number(selectedPool?.fee)===400?t('Reseller package: no additional wholesale payment for eligible 12- or 24-month customer orders while prepaid credits remain.','Forfait revendeur : aucun paiement de gros supplémentaire pour les commandes de 12 ou 24 mois tant que des crédits prépayés sont disponibles.'):t('Your selling price is your choice. MYKIOO deducts '+discountCad+' CAD per device-year on eligible wholesale orders; coupons do not apply.','Vous choisissez votre prix de vente. MYKIOO déduit '+discountCad+' $ CA par appareil-année sur les commandes admissibles; les codes promo ne s’appliquent pas.')}</p>
      <form className="mykioo-agent-order-form" onSubmit={submitOrder}>
       {agent?.access_type==='paid'&&<label>{t('Apply discount from package tier','Appliquer la remise du forfait')}
         <select required value={selectedTier} onChange={e=>setSelectedTier(e.target.value)}>
          <option value="">{t('Choose the paid discount package','Choisir le forfait de remise payé')}</option>
          {eligibleTiers.map(tier=><option key={tier.fee} value={String(tier.fee)}>
            {tier.fee} CAD · {tier.fee===400?t('Reseller · no extra wholesale payment','Revendeur · aucun paiement de gros supplémentaire'):(tier.discount+' CAD '+t('off per device-year','de remise par appareil-année'))} · {tier.credits} {t('credits available','crédits disponibles')} · {tier.packages} {t('packages','forfaits')}
          </option>)}
         </select>
       </label>}
       {agent?.access_type==='paid'&&eligibleTiers.length===0&&<p role="status">{t('Purchase and activate a paid package to unlock wholesale discounts.','Achetez et activez un forfait payé pour obtenir les remises de gros.')}</p>}
       <label>{t('Assigned customer','Client attribué')}<select required value={selectedCustomer} onChange={e=>setSelectedCustomer(e.target.value)}><option value="">{t('Choose a customer','Choisir un client')}</option>{rows.map(r=><option value={r.customer_user_id} key={r.customer_user_id}>{r.customer_user_id.slice(0,8)}…</option>)}</select></label>
       <label>{t('Order type','Type de commande')}<select value={kind} onChange={e=>setKind(e.target.value)}><option value="new">{t('New subscription','Nouvel abonnement')}</option><option value="renewal">{t('Renewal','Renouvellement')}</option></select></label>
       <label>{t('Duration','Durée')}<select value={days} onChange={e=>setDays(Number(e.target.value))}><option value={365}>{t('12 months','12 mois')}</option><option value={730}>{t('24 months','24 mois')}</option></select></label>
       <label>{t('Devices','Appareils')}<select value={devices} onChange={e=>setDevices(Number(e.target.value))}>{[1,2,3,4,5].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
       <div className="mykioo-agent-quote" aria-live="polite">
        <div><span>{t('Package price','Prix du forfait')}</span><strong>{packageBase===null?'—':'$'+Number(packageBase).toFixed(2)+' CAD'}</strong></div>
         <div><span>{t('Your discount','Votre remise')}</span><strong>{appliedDiscount===null?'—':('- $'+Number(appliedDiscount).toFixed(2)+' CAD')}</strong></div>
         <div className="mykioo-agent-quote-total"><span>{t('You owe MYKIOO','Vous devez à MYKIOO')}</span><strong>{agentDue===null?'—':('$'+agentDue.toFixed(2)+' CAD')}</strong></div>
        {agentDue===0&&Number(selectedPool?.fee)===400&&<p role="status">{t('Covered by your verified prepaid reseller package. No additional wholesale payment is due; the owner must still activate the service.','Couvert par votre forfait revendeur prépayé vérifié. Aucun paiement de gros supplémentaire; le propriétaire doit toujours activer le service.')}</p>}
       </div>
       {agent?.access_type==='paid'&&<p role="status">{t('Credits required','Crédits requis')}: {neededCredits} · {t('Selected tier credits available','Crédits disponibles du forfait choisi')}: {creditsLeft}{prepaidBlocked?' · '+t('This order is not eligible under your active package.','Cette commande n’est pas admissible avec votre forfait actif.'):''}</p>}
       <label>{t('Your selling price (CAD) — collected by you','Votre prix client (CAD) — encaissé par vous')}<input type="number" required min="0" step="0.01" value={retail} onChange={e=>setRetail(e.target.value)}/></label>
       <label>{t('How MYKIOO will be paid','Paiement à MYKIOO')}<select value={method} onChange={e=>setMethod(e.target.value)}><option value="interac">Interac e-Transfer</option><option value="manual">{t('Manual transfer','Virement manuel')}</option><option value="cash">{t('Cash','Espèces')}</option><option value="zelle">Zelle</option><option value="btc">Bitcoin</option><option value="shib">SHIB</option></select></label>
       <button type="submit" disabled={saving||!rows.length||agentDue===null||(agentDue===0&&Number(selectedPool?.fee)!==400)||prepaidBlocked}>{t('Submit order for owner review','Envoyer la commande pour vérification')}</button>
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
  const [section,setSection]=useState('service'),[tickets,setTickets]=useState([]),[ticketsBusy,setTicketsBusy]=useState(true),[ticketLoadError,setTicketLoadError]=useState(''),[ticketCategory,setTicketCategory]=useState('other');
  async function refreshTickets(){
    setTicketsBusy(true);
    const {data,error}=await supabase.from('mykioo_support_tickets')
      .select('id,member_id,subject,message,status,category,created_at,updated_at').eq('member_id',user.id)
      .order('created_at',{ascending:false}).limit(60);
    if(error)setTicketLoadError(error.message);
    else{setTickets(data||[]);setTicketLoadError('');}
    setTicketsBusy(false);
  }
  useEffect(()=>{refreshTickets();},[user.id]);
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
        body:JSON.stringify({action:'create_ticket',category:ticketCategory,subject:ticketSubject.trim(),message:ticketBody.trim()})
      });
      const result=await response.json();
      if(!response.ok||!result.ok)throw Error(result.error||'Unable to submit');
      setTicketSubject('');setTicketBody('');
      setTicketNotice(t('Support request submitted. You can read replies in the conversations below.','Demande envoyée. Vous pourrez lire les réponses dans les conversations ci-dessous.'));
      await refreshTickets();
    }catch{setTicketNotice(t('Support request failed. Please try again.','Échec de la demande. Réessayez.'));}
    finally{setTicketBusy(false);}
  }
  return <div className="dashboard"><main className="dash-content" style={{maxWidth:760,margin:'0 auto'}}>
    <header className="dash-header"><strong>MYKIOO</strong><button className="outline-button" onClick={logout}>{t('Sign out','Déconnexion')}</button></header>
    <h1>{section==='guides'?t('Setup & help','Installation et aide'):section==='support'?t('Support center','Centre d’assistance'):t('My service','Mon service')}</h1>
    <p className="page-sub">{t('Access your service, setup guides and support here, without MYKIOO retail or wholesale prices.','Consultez votre service, vos guides et votre assistance sans afficher les tarifs publics ou de gros MYKIOO.')}</p>
    <nav className="mykioo-agent-customer-tabs" aria-label={t('Customer navigation','Navigation client')}>
      {[{id:'service',en:'My service',fr:'Mon service'},{id:'guides',en:'Setup & help guides',fr:'Guides et aide'},{id:'support',en:'Support tickets',fr:'Demandes d’assistance'}].map(item=><button key={item.id} type="button" className={section===item.id?'selected':''} aria-current={section===item.id?'page':undefined} onClick={()=>setSection(item.id)}>{t(item.en,item.fr)}{item.id==='support'&&tickets.length>0?' ('+tickets.length+')':''}</button>)}
    </nav>
    {section==='service'&&<>
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
    </>}
    {section==='guides'&&<><p className="mykioo-agent-customer-app-link"><a href="/apps/">{t('Browse compatible third-party app downloads','Voir les téléchargements d’applications tierces compatibles')}</a></p><MemberSetupGuides language={language} userId={user.id} agentCustomer onOpenSupport={()=>setSection('support')}/></>}
    {section==='support'&&<>
    <section className="mykioo-support-card"><h2>{t('Open a support ticket','Ouvrir une demande d’assistance')}</h2>
      <p>{t('For setup and playback issues, MYKIOO can help. For subscription prices or payment, contact your agent.','MYKIOO peut vous aider pour l’installation et la lecture. Pour les tarifs ou paiements, contactez votre agent.')}</p>
      <MemberSupportFAQ language={language} category={ticketCategory} subject={ticketSubject} agentCustomer onOpenGuides={()=>setSection('guides')}/>
      <form onSubmit={submitTicket}>
        <label>{t('Issue category','Catégorie de problème')}<select value={ticketCategory} onChange={e=>setTicketCategory(e.target.value)}><option value="setup">{t('Setup / installation','Installation')}</option><option value="streaming">{t('Playback / buffering','Lecture / chargement')}</option><option value="channels">{t('Channels','Chaînes')}</option><option value="login">{t('Login / account','Connexion / compte')}</option><option value="other">{t('Other technical issue','Autre problème technique')}</option></select></label>
        <label>{t('Subject','Sujet')}<input value={ticketSubject} onChange={e=>setTicketSubject(e.target.value)} minLength={3} maxLength={120} required/></label>
        <label>{t('Describe the issue','Décrivez le problème')}<textarea value={ticketBody} onChange={e=>setTicketBody(e.target.value)} minLength={5} maxLength={3000} required/></label>
        <button type="submit" className="outline-button" disabled={ticketBusy}>{ticketBusy?t('Submitting…','Envoi…'):t('Send support ticket','Envoyer la demande')}</button>
      </form>
      {ticketNotice&&<p role="status">{ticketNotice}</p>}
    </section>
    <section className="mykioo-support-card"><h2>{t('My support conversations','Mes conversations avec l’assistance')}</h2>
      <p>{t('Open a conversation to read and reply to MYKIOO support.','Ouvrez une conversation pour lire les réponses et répondre à MYKIOO.')}</p>
      {ticketLoadError&&<p role="alert">{t('Could not load your tickets.','Impossible de charger vos demandes.')} {ticketLoadError}</p>}
      {ticketsBusy?<p>{t('Loading tickets…','Chargement des demandes…')}</p>:tickets.length===0?<p>{t('No tickets yet.','Aucune demande pour le moment.')}</p>:
        <div className="mykioo-agent-customer-tickets">{tickets.map(ticket=><article key={ticket.id} className="mykioo-agent-customer-ticket">
         <strong>{ticket.subject}</strong><p><span>{ticket.status==='open'?t('Open','Ouverte'):ticket.status==='in_progress'?t('In progress','En cours'):ticket.status==='resolved'?t('Resolved','Résolue'):ticket.status==='closed'?t('Closed','Fermée'):ticket.status}</span> · {statusDate(ticket.created_at,language)}</p>
         <p>{ticket.message}</p>
         <SupportThread ticket={ticket} userId={user.id} language={language} onStatusChanged={refreshTickets}/>
        </article>)}</div>}
      <button type="button" className="outline-button" onClick={refreshTickets} disabled={ticketsBusy}>{t('Refresh conversations','Actualiser les conversations')}</button>
    </section>
    </>}
  </main></div>;
}
