import React,{useEffect,useState} from 'react';
import {Users,MailPlus,ClipboardList,Receipt,Headphones,Clock3,CalendarDays,ArrowRight,RefreshCw,CheckCircle2,AlertCircle} from 'lucide-react';
import {supabase} from './supabase';
import './OwnerActionCenter.css';

export default function OwnerActionCenter({rows={},followups=[],language='en',loading=false,onNavigate,onOpenTicket,onRefresh}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [invoices,setInvoices]=useState([]),[billingError,setBillingError]=useState(false),[checking,setChecking]=useState(true);
 const [lastUpdated,setLastUpdated]=useState(null);
 useEffect(()=>{
  let live=true;
  async function load(){
   try{
    const {data,error}=await supabase.from('mykioo_billing_invoices').select('id,state,issued_at').order('issued_at',{ascending:false}).limit(200);
    if(error)throw error;
    if(live){setInvoices(data||[]);setBillingError(false);setLastUpdated(new Date());}
   }catch(e){if(live)setBillingError(true)}
   finally{if(live)setChecking(false)}
  }
  load();
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')load()},60000);
  const resume=()=>{if(document.visibilityState==='visible')load()};
  window.addEventListener('focus',resume);window.addEventListener('online',resume);
  return()=>{live=false;clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume)};
 },[]);
 const members=rows.members||[], requests=rows.subscription_requests||[], cancellations=rows.cancellation_requests||[], tickets=rows.support||[], subscriptions=rows.subscriptions||[];
 const memberPending=members.filter(x=>x.status==='pending').length;
 const invitePending=(rows.invitation_requests||[]).filter(x=>x.status==='pending').length;
 const servicePending=requests.filter(x=>['pending','in_review'].includes(x.status)).length;
 const cancelPending=cancellations.filter(x=>x.status==='pending').length;
 const ticketPending=tickets.filter(x=>['open','in_progress'].includes(x.status));
 const pendingFollowups=followups.filter(x=>x.status==='pending');
 const now=Date.now();
 const overdueFollowups=pendingFollowups.filter(x=>Number.isFinite(Date.parse(x.due_at))&&Date.parse(x.due_at)<=now);
 const dueSoon= subscriptions.filter(x=>x.status==='active'&&x.expires_at&&Date.parse(x.expires_at)>now&&Date.parse(x.expires_at)<=now+30*86400000).length;
 const paymentReview=invoices.filter(x=>x.state==='payment_submitted').length;
 const cryptoRequests=requests.filter(x=>['pending','in_review'].includes(x.status)&&['btc','shib'].includes(x.preferred_payment_method)).length;
 const tasks=[
  {key:'members',title:tr('Membership approvals','Approbations des membres'),count:memberPending,detail:tr('Accounts awaiting your decision','Comptes en attente de votre décision'),Icon:Users,section:'members'},
  {key:'invites',title:tr('Invitation requests','Demandes d’invitation'),count:invitePending,detail:tr('Invitations to review','Invitations à examiner'),Icon:MailPlus,section:'invitations'},
  {key:'requests',title:tr('Service requests','Demandes de service'),count:servicePending,detail:tr('Trials, new services and renewals','Essais, nouveaux services et renouvellements'),Icon:ClipboardList,section:'subscriptions',sub:'queue'},
  {key:'cancels',title:tr('Cancellation approvals','Approbations d’annulation'),count:cancelPending,detail:tr('Decisions requiring owner approval','Décisions nécessitant une approbation'),Icon:AlertCircle,section:'subscriptions',sub:'cancellations'},
  {key:'payments',title:tr('Payments to verify','Paiements à vérifier'),count:paymentReview,detail:tr('Payment reported; verify funds independently','Paiement signalé ; vérifiez les fonds'),Icon:Receipt,section:'billing',unknown:billingError||checking},
  {key:'crypto',title:tr('Crypto invoice requests','Demandes de facture crypto'),count:cryptoRequests,detail:tr('BTC / SHIB requests to review','Demandes BTC / SHIB à examiner'),Icon:Receipt,section:'billing'},
  {key:'tickets',title:tr('Open support tickets','Demandes d’assistance ouvertes'),count:ticketPending.length,detail:tr('Open or being handled','Ouvertes ou en cours de traitement'),Icon:Headphones,section:'support',sub:'tickets'},
  {key:'followups',title:tr('Overdue follow-ups','Suivis en retard'),count:overdueFollowups.length,detail:tr(pendingFollowups.length+' pending follow-up(s) total',pendingFollowups.length+' suivi(s) en attente au total'),Icon:Clock3,section:'support',sub:'followups'},
  {key:'renewals',title:tr('Expiring within 30 days','Expirant dans les 30 jours'),count:dueSoon,detail:tr('Active subscriptions to review','Abonnements actifs à vérifier'),Icon:CalendarDays,section:'subscriptions',sub:'directory'}
 ];
 const priority=['followups','payments','members','requests','cancels','tickets','invites','crypto','renewals'];
 const ordered=tasks.slice().sort((a,b)=>priority.indexOf(a.key)-priority.indexOf(b.key));
 const actionable=tasks.filter(x=>!x.unknown&&x.count>0).length;
 const memberName=id=>{const m=members.find(x=>x.user_id===id);return m?.display_name||m?.email||tr('Member','Membre')};
 const newest=[...tickets].filter(t=>['open','in_progress'].includes(t.status)).sort((a,b)=>Date.parse(b.created_at||0)-Date.parse(a.created_at||0)).slice(0,3);
 return <section className="mykioo-action-center" aria-label={tr('Owner action center','Centre des actions du propriétaire')}>
  <div className="mykioo-action-head">
   <div><span className="mykioo-action-eyebrow"><ClipboardList size={16}/>{tr('OWNER ACTION CENTER','CENTRE DES ACTIONS')}</span>
    <h2>{tr('What needs your attention','Ce qui demande votre attention')}</h2>
    <p>{tr('One view of approvals, requests, payments and support. Use each card to open the existing controls.','Une seule vue des approbations, demandes, paiements et de l’assistance. Ouvrez les outils existants depuis chaque carte.')}</p>
   </div>
   <button className="mykioo-action-refresh" type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={16}/>{tr('Refresh','Actualiser')}</button>
  </div>
  <div className="mykioo-action-summary">
   <div><strong>{loading?'…':actionable}</strong><span>{tr('Areas requiring action','Catégories à traiter')}</span></div>
   <div><strong>{loading?'…':memberPending+invitePending+servicePending+cancelPending}</strong><span>{tr('Pending approvals & requests','Approbations et demandes en attente')}</span></div>
   <div><strong>{loading?'…':overdueFollowups.length}</strong><span>{tr('Overdue follow-ups','Suivis en retard')}</span></div>
  </div>
  {!loading&&actionable===0&&!checking&&!billingError&&<div className="mykioo-action-allclear"><CheckCircle2 size={19}/>{tr('No outstanding items in the categories shown.','Aucun élément en attente dans les catégories affichées.')}</div>}
  <div className="mykioo-action-grid">
   {ordered.map(item=><button type="button" key={item.key} className={'mykioo-action-item '+(item.count>0?'has-work':'')+(item.key==='followups'&&item.count>0?' is-urgent':'')} onClick={()=>onNavigate(item.section,item.sub)} aria-label={item.title}>
     <span className="mykioo-action-icon"><item.Icon size={19}/></span>
     <span className="mykioo-action-main"><strong>{item.title}</strong><small>{item.detail}</small></span>
     <span className="mykioo-action-number">{loading||item.unknown?'—':item.count}</span><ArrowRight size={16} className="mykioo-action-arrow"/>
    </button>)}
  </div>
  {(billingError||checking)&&<small className="mykioo-action-note">{checking?tr('Checking invoice verification queue…','Vérification de la liste des paiements…'):tr('Payment verification count unavailable. Open Billing to review payments.','Nombre de paiements à vérifier indisponible. Consultez la facturation.')}</small>}
  {newest.length>0&&<div className="mykioo-action-ticket-preview"><h3>{tr('Recent support requests','Demandes d’assistance récentes')}</h3>
   {newest.map(t=><button type="button" key={t.id} onClick={()=>onOpenTicket(t)}><span><strong>{t.subject||tr('Support ticket','Demande d’assistance')}</strong><small>{memberName(t.member_id)}</small></span><ArrowRight size={16}/></button>)}
  </div>}
  <small className="mykioo-action-note">{tr('Counts reflect the latest loaded records (up to 100 per category; 200 invoices). Payment reports are not proof of receipt. No action here automatically approves or charges anyone.','Les compteurs reflètent les dossiers chargés (jusqu’à 100 par catégorie ; 200 factures). Un paiement déclaré ne prouve pas sa réception. Aucune action ici n’approuve ou ne facture automatiquement un membre.')}</small>
 </section>;
}
