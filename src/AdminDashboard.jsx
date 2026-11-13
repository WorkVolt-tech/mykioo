import {OwnerFAQEditor} from './SupportFAQ';
import {OwnerSetupGuideEditor} from './SetupGuides';
import {OwnerPrivateTicketPanel,OwnerFollowUpBoard,useSupportFollowups} from './SupportPrivate';
import SupportDashboard from './SupportDashboard';
import {ReplyTemplateEditor} from './ReplyTemplates';
import {OwnerIssuePanel} from './SupportIssues';
import {useNotifications,NotificationCenter} from './NotificationCenter';
import {useServiceAlerts,ServiceAlertBanner,ServiceAlertEditor,ServiceAlertHistory} from './ServiceAlerts';
import {ExpiryAlerts} from './ExpiryAlerts';
import ReminderSettings from './ReminderSettings';
import ActivityHistory from './ActivityHistory';
import {OwnerBilling} from './Billing';
import OwnerSubscriptionQueue from './OwnerSubscriptionQueue';
import OwnerCancellationRequests from './OwnerCancellationRequests';
import SubscriptionRequests from './SubscriptionRequests';
import SubscriptionManager from './SubscriptionManager';
import {useSupportUnread} from './useSupportUnread';
import SupportThread from './SupportThread';
import React,{useEffect,useState} from 'react';
import './AdminExperience.css';
import {usePageSection} from './usePageSection';
import {Users,MailPlus,ShieldCheck,CalendarDays,Receipt,Headphones,LogOut,RefreshCw,Clock3,LockKeyhole,AlertCircle,CheckCircle2,Bell,BookOpen,History,Menu,X,ClipboardList,BarChart3,SlidersHorizontal,Megaphone,Settings2,Inbox} from 'lucide-react';
import {supabase} from './supabase';
const tabs=[{id:'overview',name:'Overview',icon:ShieldCheck},{id:'members',name:'Members',icon:Users},{id:'invitations',name:'Invitations',icon:MailPlus},{id:'subscriptions',name:'Subscriptions',icon:CalendarDays},{id:'create-request',name:'Create request',icon:MailPlus},{id:'orders',name:'Orders',icon:Receipt},{id:'billing',name:'Billing',icon:Receipt},{id:'guides',name:'Guides',icon:BookOpen},{id:'support',name:'Support',icon:Headphones},{id:'activity',name:'Activity',icon:History},{id:'notifications',name:'Notifications',icon:Bell}];
const ownerNavGroups=[
 {name:['WORKSPACE','ESPACE DE TRAVAIL'],ids:['overview','notifications']},
 {name:['CUSTOMERS','CLIENTS'],ids:['members','invitations']},
 {name:['SUBSCRIPTIONS & PAYMENTS','ABONNEMENTS ET PAIEMENTS'],ids:['subscriptions','create-request','orders','billing']},
 {name:['SUPPORT & CONTENT','ASSISTANCE ET CONTENU'],ids:['support','guides']},
 {name:['RECORDS','HISTORIQUE'],ids:['activity']}
];
const ownerLabels={
 overview:['Overview','Vue d’ensemble'],members:['Members','Membres'],invitations:['Invitations','Invitations'],
 subscriptions:['Subscriptions','Abonnements'],'create-request':['Create request','Créer une demande'],orders:['Orders','Commandes'],billing:['Billing','Facturation'],
 guides:['Help content','Contenu d’aide'],support:['Support','Assistance'],activity:['Activity history','Historique des activités'],
 notifications:['Notifications','Notifications']
};
const ownerDescriptions={
 overview:['Your priorities, recent activity and key numbers in one place.','Vos priorités, activités récentes et chiffres clés en un seul endroit.'],
 members:['Review and manage access for your members.','Consultez et gérez les accès de vos membres.'],
 invitations:['Invite new members and track invitations.','Invitez de nouveaux membres et suivez les invitations.'],
 subscriptions:['Review requests, manage services and handle renewals.','Consultez les demandes, gérez les services et les renouvellements.'],
 'create-request':['Submit a new or renewal subscription request for an approved member.','Soumettez une nouvelle demande d’abonnement ou de renouvellement pour un membre approuvé.'],
 orders:['Review order records and their status.','Consultez les commandes et leurs statuts.'],
 billing:['Set up receiving details, verify transfers and manage crypto invoices.','Configurez les paiements, vérifiez les virements et gérez les factures crypto.'],
 guides:['Maintain help articles and device setup instructions.','Gérez les articles d’aide et les instructions d’installation.'],
 support:['A focused inbox for tickets, follow-ups and support operations.','Une boîte de réception claire pour les demandes, les suivis et les opérations.'],
 activity:['Review the administration activity log.','Consultez le journal des activités administratives.'],
 notifications:['Review messages and important updates.','Consultez les messages et mises à jour importantes.']
};
const supportViews=[
 {id:'tickets',en:'Ticket inbox',fr:'Demandes',Icon:Inbox},
 {id:'followups',en:'Follow-ups',fr:'Suivis',Icon:Clock3},
 {id:'insights',en:'Statistics',fr:'Statistiques',Icon:BarChart3},
 {id:'tools',en:'Templates & issues',fr:'Modèles et problèmes',Icon:SlidersHorizontal},
 {id:'announcements',en:'Announcements',fr:'Annonces',Icon:Megaphone}
];
const subscriptionViews=[
 {id:'queue',en:'Overview queue',fr:'File d’attente',Icon:ClipboardList},
 {id:'requests',en:'Requests',fr:'Demandes',Icon:Inbox},
 {id:'directory',en:'Subscriptions',fr:'Abonnements',Icon:CalendarDays},
 {id:'editor',en:'Edit / add service',fr:'Modifier / ajouter',Icon:Settings2},
 {id:'cancellations',en:'Cancellations',fr:'Annulations',Icon:AlertCircle},
 {id:'reminders',en:'Reminders',fr:'Rappels',Icon:Clock3}
];
const guideViews=[
 {id:'faq',en:'Help articles',fr:'Articles d’aide',Icon:BookOpen},
 {id:'devices',en:'Setup guides',fr:'Guides d’installation',Icon:Settings2}
];
export default function AdminDashboard({user,logout,logo,fallbackLogo,language='en',onLanguageChange}) {
 const {notifications,unread:notificationUnread,markRead:markNotificationRead}=useNotifications(user.id);
 const [serviceAlerts,setServiceAlerts]=useServiceAlerts();
 const {followups,refresh:refreshFollowups}=useSupportFollowups();
 const fr=language==='fr';
 const tr=(english,french)=>fr?french:english;
 const [tab,setTab]=usePageSection(tabs.map(item=>item.id),'overview'),[rows,setRows]=useState({}),[loading,setLoading]=useState(true),[error,setError]=useState('');const [selectedTicketIds,setSelectedTicketIds]=useState([]);
 const [mobileNav,setMobileNav]=useState(false),[supportView,setSupportView]=useState('tickets'),
  [subscriptionView,setSubscriptionView]=useState('queue'),[guideView,setGuideView]=useState('faq'),
  [expandedTickets,setExpandedTickets]=useState([]);const [focusedTicket,setFocusedTicket]=useState(null);const [supportSearch,setSupportSearch]=useState(''),[supportStatusFilter,setSupportStatusFilter]=useState('all'),[supportIssueFilter,setSupportIssueFilter]=useState('all'),[supportPriorityFilter,setSupportPriorityFilter]=useState('all'),[supportCategoryFilter,setSupportCategoryFilter]=useState('all'),[supportSort,setSupportSort]=useState('priority');const [email,setEmail]=useState(''),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[pendingChange,setPendingChange]=useState(null);
 async function refresh({silent=false}={}){
  if(!silent){setLoading(true);setError('')}
  try{
   const collections={members:'mykioo_members',invitations:'mykioo_invitations',subscriptions:'mykioo_subscriptions',orders:'mykioo_orders',support:'mykioo_support_tickets',subscription_requests:'mykioo_subscription_requests',cancellation_requests:'mykioo_subscription_cancellation_requests'};
   const all=await Promise.all(Object.entries(collections).map(async ([key,table])=>{
    const {data,error}=await supabase.from(table).select('*').order('created_at',{ascending:false}).limit(100);
    if(error)throw Error(table+': '+error.message);
    return [key,data||[]];
   }));
   setRows(previous=>{
    const fresh=Object.fromEntries(all);
    return JSON.stringify(previous)===JSON.stringify(fresh)?previous:fresh;
   });
  }catch(err){
   if(!silent)setError('Could not load administration data: '+err.message);
   else console.warn('MYKIOO background sync error',err);
  }finally{if(!silent)setLoading(false)}
 }
 async function runAction(payload) {
   setSaving(true);setError('');setNotice('');
   try {
     const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
     if(sessionError || !sessionData.session) throw new Error('Sign in again to continue.');
     const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-admin',{
       method:'POST',
       headers:{
         'Content-Type':'application/json',
         'Authorization':'Bearer '+sessionData.session.access_token,
         'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
       },
       body:JSON.stringify(payload)
     });
     const result=await response.json().catch(()=>({}));
     if(!response.ok || !result.ok) throw new Error(result.error||'Action failed.');
     if(payload.action==='set_status'){
       if(result.notification==='accepted')setNotice(tr('Member updated. Brevo accepted the notification email.','Membre mis à jour. Brevo a accepté le courriel de notification.'));
       else if(result.notification==='not_configured')setNotice(tr('Member updated. Email not sent: Brevo API key still needs to be configured in Supabase.','Membre mis à jour. Courriel non envoyé : la clé API Brevo doit être configurée dans Supabase.'));
       else if(result.notification==='failed')setNotice(tr('Member updated, but the notification email failed. Check Brevo settings.','Membre mis à jour, mais l’envoi du courriel a échoué. Vérifiez les paramètres Brevo.'));
       else setNotice(tr('Member updated.','Membre mis à jour.'));
     }else setNotice(result.message||tr('Updated successfully.','Mise à jour effectuée.'));
     if(payload.action==='invite')setEmail('');
     await refresh();
   }catch(e){setError(e.message||'Request failed.')}finally{setSaving(false)}
 }
 async function updateCategory(ticket,category){
  if(saving||ticket.category===category)return;
  setSaving(true);setError('');setNotice('');
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error(tr('Please sign in again.','Veuillez vous reconnecter.'));
   const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-support',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify({action:'set_category',ticket_id:ticket.id,category})
   });
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Unable to change category.','Impossible de modifier la catégorie.'));
   setNotice(tr('Ticket category updated.','Catégorie de la demande mise à jour.'));await refresh({silent:true});
  }catch(err){setError(err.message||tr('Unable to change category.','Impossible de modifier la catégorie.'))}
  finally{setSaving(false)}
 }
 async function updatePriority(ticket,priority){
   if(saving||ticket.priority===priority)return;
   setSaving(true);setError('');setNotice('');
   try{
    const {data:{session},error:authError}=await supabase.auth.getSession();
    if(authError||!session)throw new Error(tr('Please sign in again.','Veuillez vous reconnecter.'));
    const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-support',{
     method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
     'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
     body:JSON.stringify({action:'set_priority',ticket_id:ticket.id,priority})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw Error(result.error||tr('Unable to set priority.','Impossible de modifier la priorité.'));
    setNotice(tr('Priority updated.','Priorité mise à jour.'));await refresh({silent:true});
   }catch(err){setError(err.message||tr('Unable to set priority.','Impossible de modifier la priorité.'))}
   finally{setSaving(false)}
 }
 async function updateTicket(ticket,status){
   if(saving||ticket.status===status)return;
   setSaving(true);setError('');setNotice('');
   try{
     const {data:{session},error:authError}=await supabase.auth.getSession();
     if(authError||!session)throw new Error(tr('Please sign in again.','Veuillez vous reconnecter.'));
     const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-support',{
       method:'POST',
       headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
       body:JSON.stringify({action:'update_ticket',ticket_id:ticket.id,status})
     });
     const result=await response.json().catch(()=>({}));
     if(!response.ok||!result.ok)throw new Error(result.error||tr('Unable to update ticket.','Impossible de mettre à jour la demande.'));
     setNotice(tr('Support ticket updated.','Demande d’assistance mise à jour.'));
     await refresh();
   }catch(err){setError(err.message||tr('Unable to update ticket.','Impossible de mettre à jour la demande.'))}
   finally{setSaving(false)}
 }
 async function invite(e) { e.preventDefault(); if(!email.trim())return; await runAction({action:'invite',email:email.trim(),language});}
 function changeStatus(member,status) {
   if(member.role!=='member'||saving)return;
   setPendingChange({member,status});
 }
 async function confirmChange() {
   if(!pendingChange||saving)return;
   const {member,status}=pendingChange;
   setPendingChange(null);
   await runAction({action:'set_status',member_id:member.user_id,status});
 }
 useEffect(()=>{
   if(!pendingChange)return;
   function onKeyDown(e){if(e.key==='Escape'&&!saving)setPendingChange(null);}
   document.addEventListener('keydown',onKeyDown);
   return()=>document.removeEventListener('keydown',onKeyDown);
 },[pendingChange,saving]);
 useEffect(()=>{
  if(!supabase)return;
  let live=true;
  let running=false;
  let again=false;
  async function sync(){
   if(!live)return;
   if(running){again=true;return}
   running=true;
   try{
    do{
      again=false;
      if(live)await refresh({silent:true});
    }while(live&&again);
   }finally{running=false}
  }
  refresh();
  const tables=['mykioo_members','mykioo_invitations','mykioo_membership_history','mykioo_plans','mykioo_subscriptions','mykioo_orders','mykioo_support_tickets','mykioo_subscription_requests','mykioo_subscription_cancellation_requests','mykioo_audit_logs'];
  let channel=supabase.channel('mykioo-admin-live-'+user.id);
  tables.forEach(table=>{channel=channel.on('postgres_changes',{event:'*',schema:'public',table},sync)});
  channel.subscribe(status=>{if(status==='SUBSCRIBED')sync()});
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')sync()},60000);
  const onResume=()=>{if(document.visibilityState==='visible')sync()};
  window.addEventListener('focus',onResume);
  window.addEventListener('online',onResume);
  document.addEventListener('visibilitychange',onResume);
  return()=>{
   live=false;
   clearInterval(timer);
   window.removeEventListener('focus',onResume);
   window.removeEventListener('online',onResume);
   document.removeEventListener('visibilitychange',onResume);
   supabase.removeChannel(channel);
  };
 },[user.id]);
 const {counts:unreadCounts,total:unreadTotal,sync:syncUnread}=useSupportUnread(user.id,rows.support||[]);
 const allVisibleTickets=[...(rows.support||[]),...(focusedTicket&&!(rows.support||[]).some(x=>x.id===focusedTicket.id)?[focusedTicket]:[])];
 const filteredTickets=allVisibleTickets.filter(ticket=>{
  const member=(rows.members||[]).find(m=>m.user_id===ticket.member_id);
  const term=supportSearch.trim().toLocaleLowerCase();
  if(term&&![ticket.id,ticket.subject,ticket.message,ticket.device_type,ticket.app_name,ticket.error_details,member?.display_name,member?.email].some(value=>(value||'').toLocaleLowerCase().includes(term)))return false;
  if(supportStatusFilter!=='all'&&ticket.status!==supportStatusFilter)return false;
  if(supportPriorityFilter!=='all'&&ticket.priority!==supportPriorityFilter)return false;
  if(supportCategoryFilter!=='all'&&(ticket.category||'other')!==supportCategoryFilter)return false;
  if(supportIssueFilter==='linked'&&!ticket.main_issue_id)return false;
  if(supportIssueFilter==='unlinked'&&ticket.main_issue_id)return false;
  return true;
 }).sort((a,b)=>{
  if(supportSort==='newest')return new Date(b.created_at)-new Date(a.created_at);
  if(supportSort==='oldest')return new Date(a.created_at)-new Date(b.created_at);
  const ranks={urgent:4,high:3,normal:2,low:1};
  return (ranks[b.priority]||2)-(ranks[a.priority]||2)||new Date(a.created_at)-new Date(b.created_at);
 });

 async function viewSupportTicket(ticket){
  setTab('support');setSupportView('tickets');
  setExpandedTickets(old=>old.includes(ticket.id)?old:[...old,ticket.id]);
  setSupportSearch(ticket.id);
  setSupportStatusFilter('all');
  setSupportIssueFilter('all');
  setSupportPriorityFilter('all');
  setSupportCategoryFilter('all');
  if(!(rows.support||[]).some(t=>t.id===ticket.id)){
    const {data,error}=await supabase.from('mykioo_support_tickets').select('*').eq('id',ticket.id).maybeSingle();
    if(!error&&data)setFocusedTicket(data);
  }
  window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>document.getElementById('mykioo-support-ticket-results')?.scrollIntoView({behavior:'smooth',block:'start'})));
 }
 const cards=[[tr('Total members','Total des membres'),rows.members?.length||0,Users],[tr('Pending approval','En attente d’approbation'),rows.members?.filter(m=>m.status==='pending').length||0,Clock3],[tr('Active subscriptions','Abonnements actifs'),rows.subscriptions?.filter(s=>s.status==='active').length||0,CalendarDays],[tr('Open support tickets','Demandes d’assistance ouvertes'),rows.support?.filter(t=>t.status==='open').length||0,Headphones]];
 const columns={members:['display_name','email','status','role','created_at'],invitations:['email','status','expires_at','created_at'],subscriptions:['member_id','status','starts_at','expires_at'],orders:['member_id','status','total_amount','created_at'],support:['subject','status','member_id','created_at']};
 const list=rows[tab]||[];
 const columnLabels={
  display_name:['Member','Membre'],email:['Email','Courriel'],status:['Status','Statut'],role:['Role','Rôle'],
  member_id:['Member','Membre'],total_amount:['Amount','Montant'],starts_at:['Start date','Date de début'],
  expires_at:['Expires','Expiration'],created_at:['Created','Création']
 };
 const statusLabels={
  pending:['Pending','En attente'],approved:['Approved','Approuvé'],rejected:['Rejected','Refusé'],
  suspended:['Suspended','Suspendu'],deactivated:['Deactivated','Désactivé'],
  active:['Active','Actif'],expired:['Expired','Expiré'],cancelled:['Cancelled','Annulé'],
  open:['Open','Ouvert'],in_progress:['In progress','En cours'],resolved:['Resolved','Résolu'],closed:['Closed','Fermé']
 };
 function displayTableValue(row,key){
  const value=row[key];if(value===null||value===undefined||value==='')return '—';
  if(key==='member_id'){
   const member=(rows.members||[]).find(m=>m.user_id===value);
   return member?.display_name||member?.email||String(value).slice(0,8);
  }
  if(key==='status')return <span className={'admin-data-chip status-'+String(value)}>{statusLabels[value]?tr(...statusLabels[value]):String(value).replaceAll('_',' ')}</span>;
  if(key==='role')return String(value)==='owner'?tr('Owner','Propriétaire'):String(value)==='member'?tr('Member','Membre'):String(value);
  if(['created_at','starts_at','expires_at'].includes(key)){
   const d=new Date(value);return Number.isNaN(d.getTime())?'—':d.toLocaleDateString(fr?'fr-CA':'en-CA');
  }
  return String(value);
 }
 const pendingSubscriptionCount=(rows.subscription_requests||[]).filter(r=>['pending','in_review'].includes(r.status)).length;
 const pendingCancellationCount=(rows.cancellation_requests||[]).filter(r=>r.status==='pending').length;
 const openSupportCount=(rows.support||[]).filter(ticket=>['open','in_progress'].includes(ticket.status)).length;
 function navigate(next){setTab(next);setMobileNav(false);if(next==='support')setSupportView('tickets')}
 function jumpToSubscription(item){
  setSubscriptionView(item.category==='cancellations'?'cancellations':'requests');
  window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{
   const target=document.getElementById(item.targetId);
   target?.scrollIntoView({behavior:'smooth',block:'center'});target?.focus({preventScroll:true});
  }));
 }
 useEffect(()=>{
  if(!mobileNav)return;
  const escape=e=>{if(e.key==='Escape')setMobileNav(false)};
  document.addEventListener('keydown',escape);
  return()=>document.removeEventListener('keydown',escape);
 },[mobileNav]);
 return <div className="admin-layout">
 {mobileNav&&<button className="admin-mobile-overlay" type="button" onClick={()=>setMobileNav(false)} aria-label={tr('Close owner menu','Fermer le menu propriétaire')}/>}
 <aside id="mykioo-owner-sidebar" className={'admin-side '+(mobileNav?'admin-side-open':'')}>
  <button type="button" className="admin-mobile-close" onClick={()=>setMobileNav(false)} aria-label={tr('Close menu','Fermer le menu')}><X size={21}/></button>
  <img className="admin-logo" src={logo} onError={e=>{if(fallbackLogo&&e.currentTarget.src!==fallbackLogo)e.currentTarget.src=fallbackLogo}} alt="MYKIOO"/>
  <div className="admin-side-label">{tr('OWNER CONTROL CENTER','CENTRE DE GESTION')}</div>
  <nav aria-label={tr('Owner navigation','Navigation propriétaire')}>
   {ownerNavGroups.map(group=><div key={group.name[0]} className="admin-nav-group">
    <span className="admin-nav-group-title">{tr(...group.name)}</span>
    {group.ids.map(id=>{
     const item=tabs.find(t=>t.id===id);if(!item)return null;
     const Icon=item.icon;
     return <button key={id} type="button" className={'admin-nav '+(tab===id?'active':'')}
      aria-current={tab===id?'page':undefined} onClick={()=>navigate(id)}>
      <Icon size={18}/><span>{tr(...ownerLabels[id])}</span>
      {id==='support'&&unreadTotal>0&&<span className="mykioo-unread-dot">{unreadTotal>99?'99+':unreadTotal}</span>}
      {id==='notifications'&&notificationUnread>0&&<span className="mykioo-unread-dot">{notificationUnread>99?'99+':notificationUnread}</span>}
     </button>
    })}
   </div>)}
  </nav>
  <div className="admin-bottom">
   <div className="admin-owner"><ShieldCheck size={16}/>{tr('Owner account','Compte propriétaire')}</div>
   <button type="button" className="admin-nav" onClick={logout}><LogOut size={18}/>{tr('Sign out','Déconnexion')}</button>
  </div>
 </aside>
 <main className="admin-main">
  <header className="admin-bar">
   <button className="admin-mobile-toggle" type="button" onClick={()=>setMobileNav(v=>!v)}
    aria-controls="mykioo-owner-sidebar" aria-expanded={mobileNav} aria-label={tr('Open owner menu','Ouvrir le menu propriétaire')}><Menu size={22}/></button>
   <div className="admin-page-heading">
    <span className="admin-tag">{tr('PRIVATE ADMINISTRATION','ADMINISTRATION PRIVÉE')}</span>
    <h1>{tr(...ownerLabels[tab])}</h1>
    <p className="admin-page-caption">{tr(...ownerDescriptions[tab])}</p>
   </div>
   <div className="admin-account">
    <button type="button" className="mykioo-bell-button" onClick={()=>navigate('notifications')}
     aria-label={tr('Open notifications','Ouvrir les notifications')}><Bell size={18}/>{notificationUnread>0&&<span className="mykioo-unread-dot">{notificationUnread>99?'99+':notificationUnread}</span>}</button>
    <span className="admin-account-email" title={user.email}>{user.email}</span>
    <div className="mykioo-language-switch" role="group" aria-label="Website language">
     <button type="button" className={fr?'':'selected'} aria-pressed={!fr} onClick={()=>onLanguageChange('en')}>EN</button>
     <button type="button" className={fr?'selected':''} aria-pressed={fr} onClick={()=>onLanguageChange('fr')}>FR</button>
    </div>
    <button type="button" onClick={()=>refresh()} title={tr('Refresh data','Actualiser les données')} aria-label={tr('Refresh data','Actualiser les données')}><RefreshCw size={18}/></button>
   </div>
  </header>
 {error&&<div className="admin-error" role="alert"><AlertCircle size={18}/>{error}</div>}{notice&&<div className="admin-success" role="status"><CheckCircle2 size={18}/>{notice}</div>}
  {tab==='overview'&&<div className="admin-overview-stack">
   <section className="admin-overview-block">
    <div className="admin-section-heading"><div><h2>{tr('At a glance','En un coup d’œil')}</h2><p>{tr('Current membership, subscriptions and support volume.','Membres, abonnements et assistance en cours.')}</p></div></div>
    <div className="admin-stats">{cards.map(([label,n,Icon])=><div className="admin-stat" key={label}><Icon size={21}/><small>{label}</small><strong>{loading?'…':n}</strong></div>)}</div>
   </section>
   <section className="admin-overview-block">
    <div className="admin-section-heading"><div><h2>{tr('Needs attention','À traiter')}</h2><p>{tr('Follow-ups and subscriptions needing action.','Suivis et abonnements qui demandent une intervention.')}</p></div></div>
    <OwnerFollowUpBoard compact language={language} followups={followups} tickets={rows.support||[]} onOpenTicket={viewSupportTicket}/>
    <ExpiryAlerts subscriptions={rows.subscriptions||[]} members={rows.members||[]} language={language} owner onOpen={()=>{navigate('subscriptions');setSubscriptionView('directory')}}/>
   </section>
   <section className="admin-overview-block">
    <div className="admin-section-heading"><div><h2>{tr('Support snapshot','Aperçu de l’assistance')}</h2><p>{tr('See ticket activity without opening the full support workspace.','Consultez l’activité des demandes sans ouvrir l’espace d’assistance.')}</p></div></div>
    <SupportDashboard compact language={language} onOpenSupport={()=>{navigate('support');setSupportView('tickets')}}/>
   </section>
   <section className="admin-overview-block">
    <div className="admin-section-heading"><div><h2>{tr('Latest updates','Dernières mises à jour')}</h2></div></div>
    <NotificationCenter compact owner items={notifications} language={language} markRead={markNotificationRead} onSelect={section=>navigate(section)}/>
    <ServiceAlertBanner alerts={serviceAlerts} language={language} onOpen={()=>{navigate('support');setSupportView('announcements')}}/>
   </section>
  </div>}
  {tab==='subscriptions'&&<section className="admin-workspace-section">
   <div className="admin-subnav" role="tablist" aria-label={tr('Subscription management sections','Sections de gestion des abonnements')}>
    {subscriptionViews.map(view=><button key={view.id} type="button" role="tab" aria-selected={subscriptionView===view.id}
     onClick={()=>setSubscriptionView(view.id)}><view.Icon size={16}/>{tr(view.en,view.fr)}
     {view.id==='requests'&&pendingSubscriptionCount>0&&<span className="admin-subnav-count">{pendingSubscriptionCount}</span>}
     {view.id==='cancellations'&&pendingCancellationCount>0&&<span className="admin-subnav-count">{pendingCancellationCount}</span>}
    </button>)}
   </div>
   {subscriptionView==='queue'&&<div className="admin-panel-content">
    <div className="admin-panel-header"><h2>{tr('Processing queue','File de traitement')}</h2><p>{tr('Review what needs to be completed next. Open an item to continue in the right section.','Consultez les tâches en attente. Ouvrez une demande pour accéder directement à la bonne section.')}</p></div>
    <OwnerSubscriptionQueue requests={rows.subscription_requests||[]} cancellations={rows.cancellation_requests||[]} members={rows.members||[]} language={language} onOpenTarget={jumpToSubscription}/>
   </div>}
   {['requests','directory','editor'].includes(subscriptionView)&&<div className="admin-panel-content">
    {subscriptionView==='directory'&&<ExpiryAlerts subscriptions={rows.subscriptions||[]} members={rows.members||[]} language={language} owner/>}
    <SubscriptionManager view={subscriptionView} onViewChange={setSubscriptionView}
     members={rows.members||[]} subscriptions={rows.subscriptions||[]}
     requests={rows.subscription_requests||[]} cancellations={rows.cancellation_requests||[]}
     language={language} onSaved={()=>refresh({silent:true})}/>
   </div>}
   {subscriptionView==='cancellations'&&<div className="admin-panel-content">
    <div className="admin-panel-header"><h2>{tr('Cancellation approvals','Approbation des annulations')}</h2><p>{tr('Review cancellation requests before approving or declining them.','Examinez les annulations avant de les approuver ou de les refuser.')}</p></div>
    <OwnerCancellationRequests requests={rows.subscription_requests||[]} cancellations={rows.cancellation_requests||[]} members={rows.members||[]} language={language} onSaved={()=>refresh({silent:true})}/>
   </div>}
   {subscriptionView==='reminders'&&<div className="admin-panel-content">
    <div className="admin-panel-header"><h2>{tr('Expiry reminder settings','Paramètres des rappels d’expiration')}</h2><p>{tr('Control the subscription reminder rules in one place.','Gérez les règles de rappel d’abonnement au même endroit.')}</p></div>
    <ReminderSettings userId={user.id} subscriptions={rows.subscriptions||[]} members={rows.members||[]} language={language}/>
   </div>}
  </section>}
  {tab==='create-request'&&<section className="admin-workspace-section admin-owner-create-request">
    <div className="admin-panel-content">
     <SubscriptionRequests owner view="form" userId={user.id} members={rows.members||[]} subscriptions={rows.subscriptions||[]} requests={rows.subscription_requests||[]} cancellations={rows.cancellation_requests||[]} language={language} onSaved={()=>refresh({silent:true})}/>
    </div>
   </section>}
  {tab==='billing'&&<OwnerBilling language={language} requests={rows.subscription_requests||[]} members={rows.members||[]}/>}{tab==='activity'&&<ActivityHistory members={rows.members||[]} language={language}/>}{tab==='notifications'&&<NotificationCenter owner items={notifications} language={language} markRead={markNotificationRead} onSelect={section=>setTab(section)}/>}{tab==='guides'&&<section className="admin-workspace-section">
  <div className="admin-subnav" role="tablist" aria-label={tr('Help content sections','Sections du contenu d’aide')}>
   {guideViews.map(view=><button type="button" role="tab" key={view.id} aria-selected={guideView===view.id} onClick={()=>setGuideView(view.id)}>
    <view.Icon size={16}/>{tr(view.en,view.fr)}
   </button>)}
  </div>
  <div className="admin-panel-content">
   {guideView==='faq'&&<OwnerFAQEditor language={language}/>}
   {guideView==='devices'&&<OwnerSetupGuideEditor language={language}/>}
  </div>
 </section>}
 {tab==='support'&&<section className="admin-support-section admin-workspace-section">
   <div className="admin-subnav" role="tablist" aria-label={tr('Support workspace sections','Sections de l’espace d’assistance')}>
    {supportViews.map(view=><button type="button" role="tab" key={view.id} aria-selected={supportView===view.id}
     onClick={()=>setSupportView(view.id)}>
     <view.Icon size={16}/>{tr(view.en,view.fr)}
     {view.id==='tickets'&&openSupportCount>0&&<span className="admin-subnav-count">{openSupportCount}</span>}
    </button>)}
   </div>
   {supportView==='tickets'&&<div className="admin-panel-content">
    <div className="admin-panel-header">
     <h2>{tr('Ticket inbox','Boîte de réception des demandes')}</h2>
     <p>{tr('Search, open a ticket, then reply or update its status. Only expanded tickets show detailed controls.','Recherchez et ouvrez une demande pour répondre ou mettre à jour son statut. Les détails restent masqués jusqu’à l’ouverture.')}</p>
    </div>
    <div id="mykioo-support-ticket-results" className="admin-support-inbox">
  <div className="admin-filter-primary">
     <label>{tr('Search tickets or members','Rechercher des demandes ou des membres')}
   <input type="search" value={supportSearch} onChange={e=>setSupportSearch(e.target.value)} placeholder={tr('Subject, message, name, or email','Sujet, message, nom ou courriel')}/>
  </label>
  <label>{tr('Ticket status','Statut de la demande')}
   <select value={supportStatusFilter} onChange={e=>setSupportStatusFilter(e.target.value)}>
    <option value="all">{tr('All statuses','Tous les statuts')}</option>
    <option value="open">{tr('Open','Ouvert')}</option>
    <option value="in_progress">{tr('In progress','En cours')}</option>
    <option value="resolved">{tr('Resolved','Résolu')}</option>
    <option value="closed">{tr('Closed','Fermé')}</option>
   </select>
  </label>

     <button type="button" onClick={()=>{setSupportSearch('');setSupportStatusFilter('all');setSupportIssueFilter('all');setSupportPriorityFilter('all');setSupportCategoryFilter('all');setSupportSort('priority');setFocusedTicket(null)}}>{tr('Clear filters','Effacer les filtres')}</button>
  </div>
  <div className="admin-filter-meta">
   <details><summary>{tr('Advanced filters and sorting','Filtres avancés et tri')}</summary>
    <div className="admin-filter-advanced">  <label>{tr('Main issue association','Association à un problème principal')}
   <select value={supportIssueFilter} onChange={e=>setSupportIssueFilter(e.target.value)}>
    <option value="all">{tr('All tickets','Toutes les demandes')}</option>
    <option value="linked">{tr('Linked to a main issue','Associées à un problème principal')}</option>
    <option value="unlinked">{tr('Not linked','Non associées')}</option>
   </select>
  </label>
  <label>{tr('Priority','Priorité')}
   <select value={supportPriorityFilter} onChange={e=>setSupportPriorityFilter(e.target.value)}>
    <option value="all">{tr('All priorities','Toutes les priorités')}</option>
    <option value="urgent">{tr('Urgent','Urgente')}</option>
    <option value="high">{tr('High','Élevée')}</option>
    <option value="normal">{tr('Normal','Normale')}</option>
    <option value="low">{tr('Low','Faible')}</option>
   </select>
  </label>
  <label>{tr('Category','Catégorie')}
   <select value={supportCategoryFilter} onChange={e=>setSupportCategoryFilter(e.target.value)}>
    <option value="all">{tr('All categories','Toutes les catégories')}</option>
    <option value="login">{tr('Login / Account','Connexion / Compte')}</option>
    <option value="streaming">{tr('Buffering / Playback','Mise en mémoire tampon / Lecture')}</option>
    <option value="channels">{tr('Channels','Chaînes')}</option>
    <option value="billing">{tr('Subscription / Billing','Abonnement / Facturation')}</option>
    <option value="setup">{tr('Setup','Installation')}</option>
    <option value="other">{tr('Other','Autre')}</option>
   </select>
  </label>
  <label>{tr('Sort tickets','Trier les demandes')}
   <select value={supportSort} onChange={e=>setSupportSort(e.target.value)}>
    <option value="priority">{tr('Highest priority first','Priorité la plus élevée')}</option>
    <option value="newest">{tr('Newest first','Plus récentes en premier')}</option>
    <option value="oldest">{tr('Oldest first','Plus anciennes en premier')}</option>
   </select>
  </label>
</div>
   </details>
     <span className="mykioo-filter-count">{filteredTickets.length} / {allVisibleTickets.length} {tr('tickets shown','demandes affichées')}</span>

   {selectedTicketIds.length>0&&<button type="button" className="admin-ticket-expand" onClick={()=>setSupportView('tools')}>
    {selectedTicketIds.length} {tr('selected — bulk actions','sélectionnées — actions groupées')}
   </button>}
  </div>
 </div>
 {loading?<div className="admin-empty">{tr('Loading requests…','Chargement des demandes…')}</div>:
 (rows.support||[]).length===0?<div className="admin-empty"><Headphones size={28}/><strong>{tr('No support requests yet','Aucune demande d’assistance')}</strong></div>:
 filteredTickets.length===0?<div className="admin-empty">{tr('No tickets match these filters.','Aucune demande ne correspond à ces filtres.')}</div>:
 <div className="admin-support-list">{filteredTickets.map(ticket=>{
   const requester=(rows.members||[]).find(m=>m.user_id===ticket.member_id);
   const expanded=expandedTickets.includes(ticket.id);
   return <article key={ticket.id} className={"admin-support-ticket "+(expanded?"expanded":"")}>
    <div className="admin-support-ticket-top"><label className="mykioo-ticket-select"><input type="checkbox" checked={selectedTicketIds.includes(ticket.id)} onChange={e=>setSelectedTicketIds(old=>e.target.checked?[...old,ticket.id]:old.filter(id=>id!==ticket.id))} aria-label={tr('Select ticket','Sélectionner la demande')+' '+ticket.subject}/></label><div><strong>{ticket.subject}</strong><small>{requester?.display_name||requester?.email||tr('Member','Membre')} · {new Date(ticket.created_at).toLocaleDateString(fr?'fr-CA':'en-CA')}</small></div>{unreadCounts[ticket.id]>0&&<span className="mykioo-unread-dot">{unreadCounts[ticket.id]}</span>}<span className="mykioo-category-badge">{tr(({login:'Login',streaming:'Playback',channels:'Channels',billing:'Billing',setup:'Setup',other:'Other'})[ticket.category]||'Other',({login:'Connexion',streaming:'Lecture',channels:'Chaînes',billing:'Facturation',setup:'Installation',other:'Autre'})[ticket.category]||'Autre')}</span><span className={'mykioo-priority-badge priority-'+(ticket.priority||'normal')}>{tr(({low:'Low',normal:'Normal',high:'High',urgent:'Urgent'})[ticket.priority]||'Normal',({low:'Faible',normal:'Normale',high:'Élevée',urgent:'Urgente'})[ticket.priority]||'Normale')}</span><span className="mykioo-ticket-status">{tr(({open:'Open',in_progress:'In progress',resolved:'Resolved',closed:'Closed'})[ticket.status]||ticket.status,({open:'Ouvert',in_progress:'En cours',resolved:'Résolu',closed:'Fermé'})[ticket.status]||ticket.status)}</span>
     <button type="button" className="admin-ticket-expand" aria-expanded={expanded} aria-controls={'mykioo-ticket-details-'+ticket.id}
      onClick={()=>setExpandedTickets(old=>expanded?old.filter(id=>id!==ticket.id):[...old,ticket.id])}>
      {expanded?tr('Hide details','Masquer les détails'):tr('Open ticket','Ouvrir la demande')}
     </button></div>
    <p className={'admin-ticket-preview '+(!expanded?'is-collapsed':'')}>{ticket.message}</p>
    {expanded&&<div id={'mykioo-ticket-details-'+ticket.id} className="admin-ticket-details">
    {(ticket.device_type||ticket.app_name||ticket.error_details)&&<div className="mykioo-ticket-diagnostic-summary">
     {ticket.device_type&&<span><strong>{tr('Device','Appareil')}:</strong> {tr(({fire_tv:'Fire TV / Fire Stick',android_tv:'Android TV / Google TV',apple_tv:'Apple TV',smart_tv:'Smart TV',ios:'iPhone / iPad',android:'Android phone / tablet',web:'Web browser',other:'Other'})[ticket.device_type]||ticket.device_type,({fire_tv:'Fire TV / Fire Stick',android_tv:'Android TV / Google TV',apple_tv:'Apple TV',smart_tv:'Téléviseur intelligent',ios:'iPhone / iPad',android:'Téléphone / tablette Android',web:'Navigateur Web',other:'Autre'})[ticket.device_type]||ticket.device_type)}</span>}
     {ticket.app_name&&<span><strong>{tr('App','Application')}:</strong> {ticket.app_name}</span>}
     {ticket.error_details&&<span><strong>{tr('Error message / code','Message / code d’erreur')}:</strong> {ticket.error_details}</span>}
    </div>}

    <div className="admin-support-ticket-actions"><label htmlFor={'ticket-status-'+ticket.id}>{tr('Status','Statut')}</label><select id={'ticket-status-'+ticket.id} value={ticket.status} disabled={saving} onChange={e=>updateTicket(ticket,e.target.value)}>
      <option value="open">{tr('Open','Ouvert')}</option>
      <option value="in_progress">{tr('In progress','En cours')}</option>
      <option value="resolved">{tr('Resolved','Résolu')}</option>
      <option value="closed">{tr('Closed','Fermé')}</option>
    </select><label htmlFor={'ticket-category-'+ticket.id}>{tr('Category','Catégorie')}</label>
    <select id={'ticket-category-'+ticket.id} value={ticket.category||'other'} disabled={saving} onChange={e=>updateCategory(ticket,e.target.value)}>
     <option value="login">{tr('Login / Account','Connexion / Compte')}</option>
     <option value="streaming">{tr('Buffering / Playback','Mise en mémoire tampon / Lecture')}</option>
     <option value="channels">{tr('Channels','Chaînes')}</option>
     <option value="billing">{tr('Subscription / Billing','Abonnement / Facturation')}</option>
     <option value="setup">{tr('Setup','Installation')}</option>
     <option value="other">{tr('Other','Autre')}</option>
    </select>
    <label htmlFor={'ticket-priority-'+ticket.id}>{tr('Priority','Priorité')}</label><select id={'ticket-priority-'+ticket.id} value={ticket.priority||'normal'} disabled={saving} onChange={e=>updatePriority(ticket,e.target.value)}>
      <option value="low">{tr('Low','Faible')}</option>
      <option value="normal">{tr('Normal','Normale')}</option>
      <option value="high">{tr('High','Élevée')}</option>
      <option value="urgent">{tr('Urgent','Urgente')}</option>
    </select></div>{ticket.main_issue_id&&<p className="mykioo-owner-linked-indicator">{tr('Linked to main issue','Associé au problème principal')} · {ticket.main_issue_id.slice(0,8)}</p>}<SupportThread ticket={ticket} userId={user.id} language={language} recipientLanguage={requester?.preferred_language||"en"} owner unread={unreadCounts[ticket.id]||0} onRead={syncUnread}/><OwnerPrivateTicketPanel key={ticket.id} ticket={ticket} language={language} followup={followups.find(item=>item.ticket_id===ticket.id)} onChanged={refreshFollowups}/>
    </div>}
   </article>
 })}</div>}
 
   </div>}
   {supportView==='followups'&&<div className="admin-panel-content">
    <div className="admin-panel-header"><h2>{tr('Follow-up tasks','Tâches de suivi')}</h2><p>{tr('Keep private reminders separate from incoming support tickets.','Gardez les rappels privés séparés des nouvelles demandes.')}</p></div>
    <OwnerFollowUpBoard language={language} followups={followups} tickets={rows.support||[]} onOpenTicket={viewSupportTicket}/>
   </div>}
   {supportView==='insights'&&<div className="admin-panel-content">
    <div className="admin-panel-header"><h2>{tr('Support statistics','Statistiques de l’assistance')}</h2><p>{tr('Monitor outstanding tickets and response times.','Suivez les demandes en cours et les délais de réponse.')}</p></div>
    <SupportDashboard language={language} onViewTicket={viewSupportTicket}/>
   </div>}
   {supportView==='tools'&&<div className="admin-panel-content">
    <div className="admin-panel-header"><h2>{tr('Saved replies and known issues','Réponses enregistrées et problèmes connus')}</h2><p>{tr('Manage reusable replies, group related tickets and share issue updates. Select tickets in the inbox to use bulk actions here.','Gérez les réponses réutilisables et regroupez les demandes similaires. Sélectionnez des demandes dans la boîte de réception pour les actions groupées.')}</p></div>
    <ReplyTemplateEditor language={language}/>
    <OwnerIssuePanel tickets={rows.support||[]} language={language} selected={selectedTicketIds} setSelected={setSelectedTicketIds} onRefresh={()=>refresh({silent:true})}/>
   </div>}
   {supportView==='announcements'&&<div className="admin-panel-content">
    <div className="admin-panel-header"><h2>{tr('Service announcements','Annonces de service')}</h2><p>{tr('Publish service notices and review previous announcements.','Publiez des avis de service et consultez les annonces précédentes.')}</p></div>
    <ServiceAlertEditor alerts={serviceAlerts} subscriptions={rows.subscriptions||[]} language={language} onRefresh={async()=>{const {data,error}=await supabase.from('mykioo_service_alerts').select('*').order('created_at',{ascending:false}).limit(100);if(!error)setServiceAlerts(data||[])}}/>
    <ServiceAlertHistory alerts={serviceAlerts} language={language}/>
   </div>}
  </section>}
  {tab==='invitations'&&<form className="admin-invite" onSubmit={invite}><div><strong>{tr("Invite a new member","Inviter un nouveau membre")}</strong><p>{tr("An invitation email will be sent in the website language. The member remains pending until you approve them.","Une invitation sera envoyée dans la langue du site. Le membre restera en attente jusqu’à votre approbation.")}</p></div><div className="admin-invite-row"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="customer@example.com" required maxLength={254} aria-label={tr("Invitee email","Courriel du destinataire")}/><button className="admin-action primary" type="submit" disabled={saving}>{saving?tr('Sending…','Envoi…'):tr('Send invitation','Envoyer l’invitation')}</button></div><small>{tr("Email language follows the EN/FR selection above. Supabase controls invitation expiry.","La langue du courriel suit le choix EN/FR ci-dessus. Supabase gère l’expiration de l’invitation.")}</small></form>}
 {tab!=='overview'&&tab!=='support'&&tab!=='subscriptions'&&tab!=='create-request'&&tab!=='notifications'&&tab!=='billing'&&tab!=='guides'&&tab!=='activity'&&<><p className="admin-description">{tab==='invitations'?tr('View invitations sent through MYKIOO.','Consultez les invitations envoyées depuis MYKIOO.'):tab==='members'?tr('Approve, reject or suspend customer memberships. Owner accounts are protected.','Approuvez, refusez ou suspendez les membres. Les comptes propriétaires sont protégés.'):tr('View your current MYKIOO records.','Consultez les données MYKIOO.')}</p>{loading?<div className="admin-empty">{tr("Loading records…","Chargement…")}</div>:list.length===0?<div className="admin-empty"><LockKeyhole size={28}/><strong>{tr("No records yet","Aucune donnée")}</strong><span>{tr("Information will appear here when available.","Les informations apparaîtront ici dès qu’elles seront disponibles.")}</span></div>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns[tab].map(c=><th scope="col" key={c}>{columnLabels[c]?tr(...columnLabels[c]):c.replaceAll('_',' ')}</th>)}{tab==='members'&&<th>{tr("Actions","Actions")}</th>}</tr></thead><tbody>{list.map(row=><tr key={row.id||row.user_id}>{columns[tab].map(c=><td key={c}>{displayTableValue(row,c)}</td>)}{tab==='members'&&<td><div className="admin-controls">{row.role==='member'?<>{row.status!=='approved'&&<button disabled={saving} className="admin-mini positive" onClick={()=>changeStatus(row,'approved')}>{tr("Approve","Approuver")}</button>}{row.status!=='rejected'&&<button disabled={saving} className="admin-mini" onClick={()=>changeStatus(row,'rejected')}>{tr("Reject","Refuser")}</button>}{row.status==='approved'&&<button disabled={saving} className="admin-mini" onClick={()=>changeStatus(row,'suspended')}>{tr("Suspend","Suspendre")}</button>}</>:<span>{tr("Owner","Propriétaire")}</span>}</div></td>}</tr>)}</tbody></table></div>}</>}
 </main> {pendingChange&&<div className="mykioo-modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setPendingChange(null)}}><div className="mykioo-modal" role="alertdialog" aria-modal="true" aria-labelledby="mykioo-confirm-title" aria-describedby="mykioo-confirm-description"><div className="mykioo-modal-icon"><ShieldCheck size={27}/></div><div className="admin-tag">MYKIOO</div><h2 id="mykioo-confirm-title">{tr(({approved:'Approve membership',rejected:'Reject membership',suspended:'Suspend membership',deactivated:'Deactivate membership'})[pendingChange.status]||'Change membership',({approved:'Approuver l’adhésion',rejected:'Refuser l’adhésion',suspended:'Suspendre l’adhésion',deactivated:'Désactiver l’adhésion'})[pendingChange.status]||'Modifier l’adhésion')}</h2><p id="mykioo-confirm-description">{tr('Are you sure you want to change the status of this member?','Voulez-vous vraiment modifier le statut de ce membre?')}</p><div className="mykioo-modal-member"><span>{pendingChange.member.email}</span><div><span className="mykioo-status-chip">{tr(pendingChange.member.status,({pending:'en attente',approved:'approuvé',rejected:'refusé',suspended:'suspendu',deactivated:'désactivé'})[pendingChange.member.status]||pendingChange.member.status)}</span><span className="mykioo-modal-arrow">→</span><span className="mykioo-status-chip target">{tr(pendingChange.status,({pending:'en attente',approved:'approuvé',rejected:'refusé',suspended:'suspendu',deactivated:'désactivé'})[pendingChange.status]||pendingChange.status)}</span></div></div><div className="mykioo-modal-buttons"><button type="button" className="mykioo-modal-cancel" onClick={()=>setPendingChange(null)}>{tr('Cancel','Annuler')}</button><button type="button" className="mykioo-modal-confirm" autoFocus onClick={confirmChange}>{tr('Confirm change','Confirmer')}</button></div></div></div>}
</div>
}
