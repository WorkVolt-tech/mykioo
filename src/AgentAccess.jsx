import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';

// Agent/customer views intentionally exclude retail/wholesale pricing.
// Every order and invitation must use the authenticated server workflow.
const tr=(lang,en,fr)=>lang==='fr'?fr:en;
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
  const [rows,setRows]=useState([]),[renewals,setRenewals]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
  async function refresh(){
    setLoading(true);
    const [customers,requests]=await Promise.all([
      supabase.from('mykioo_agent_customers').select('customer_user_id,assigned_at').eq('agent_user_id',user.id).order('assigned_at',{ascending:false}),
      supabase.from('mykioo_agent_renewal_requests').select('id,customer_user_id,status,created_at,message').eq('agent_user_id',user.id).order('created_at',{ascending:false})
    ]);
    setRows(customers.data||[]);setRenewals(requests.data||[]);
    setError(customers.error?.message||requests.error?.message||'');setLoading(false);
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
    const {data,error}=await supabase.from('mykioo_agent_renewal_requests').insert({customer_user_id:user.id,agent_user_id:agentId,subscription_id:id,status:'pending'}).select('id,subscription_id,status,created_at').single();
    if(error)setMessage(t('Unable to record your request. Please contact your agent.','Impossible d’enregistrer la demande. Contactez votre agent.'));
    else{setRenewals(current=>[data,...current]);setMessage(t('Renewal requested. Your agent can see it in their dashboard.','Demande enregistrée. Votre agent peut la voir dans son espace.'));}
    setBusy(false);
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
