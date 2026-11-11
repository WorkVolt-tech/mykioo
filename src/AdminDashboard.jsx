import {OwnerIssuePanel} from './SupportIssues';
import {useNotifications,NotificationCenter} from './NotificationCenter';
import {useServiceAlerts,ServiceAlertBanner,ServiceAlertEditor,ServiceAlertHistory} from './ServiceAlerts';
import {ExpiryAlerts} from './ExpiryAlerts';
import SubscriptionManager from './SubscriptionManager';
import {useSupportUnread} from './useSupportUnread';
import SupportThread from './SupportThread';
import React,{useEffect,useState} from 'react';
import {Users,MailPlus,ShieldCheck,CalendarDays,Receipt,Headphones,LogOut,RefreshCw,Clock3,LockKeyhole,AlertCircle,CheckCircle2,Bell} from 'lucide-react';
import {supabase} from './supabase';
const tabs=[{id:'overview',name:'Overview',icon:ShieldCheck},{id:'members',name:'Members',icon:Users},{id:'invitations',name:'Invitations',icon:MailPlus},{id:'subscriptions',name:'Subscriptions',icon:CalendarDays},{id:'orders',name:'Orders',icon:Receipt},{id:'support',name:'Support',icon:Headphones},{id:'notifications',name:'Notifications',icon:Bell}];
export default function AdminDashboard({user,logout,logo,fallbackLogo,language='en',onLanguageChange}) {
 const {notifications,unread:notificationUnread,markRead:markNotificationRead}=useNotifications(user.id);
 const [serviceAlerts,setServiceAlerts]=useServiceAlerts();
 const fr=language==='fr';
 const tr=(english,french)=>fr?french:english;
 const [tab,setTab]=useState('overview'),[rows,setRows]=useState({}),[loading,setLoading]=useState(true),[error,setError]=useState('');const [selectedTicketIds,setSelectedTicketIds]=useState([]);const [supportSearch,setSupportSearch]=useState(''),[supportStatusFilter,setSupportStatusFilter]=useState('all'),[supportIssueFilter,setSupportIssueFilter]=useState('all');const [email,setEmail]=useState(''),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[pendingChange,setPendingChange]=useState(null);
 async function refresh({silent=false}={}){
  if(!silent){setLoading(true);setError('')}
  try{
   const collections={members:'mykioo_members',invitations:'mykioo_invitations',subscriptions:'mykioo_subscriptions',orders:'mykioo_orders',support:'mykioo_support_tickets',subscription_requests:'mykioo_subscription_requests'};
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
  const tables=['mykioo_members','mykioo_invitations','mykioo_membership_history','mykioo_plans','mykioo_subscriptions','mykioo_orders','mykioo_support_tickets','mykioo_subscription_requests','mykioo_audit_logs'];
  let channel=supabase.channel('mykioo-admin-live-'+user.id);
  tables.forEach(table=>{channel=channel.on('postgres_changes',{event:'*',schema:'public',table},sync)});
  channel.subscribe(status=>{if(status==='SUBSCRIBED')sync()});
  const timer=window.setInterval(()=>{if(document.visibilityState==='visible')sync()},12000);
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
 const filteredTickets=(rows.support||[]).filter(ticket=>{
  const member=(rows.members||[]).find(m=>m.user_id===ticket.member_id);
  const term=supportSearch.trim().toLocaleLowerCase();
  if(term&&![ticket.subject,ticket.message,member?.display_name,member?.email].some(value=>(value||'').toLocaleLowerCase().includes(term)))return false;
  if(supportStatusFilter!=='all'&&ticket.status!==supportStatusFilter)return false;
  if(supportIssueFilter==='linked'&&!ticket.main_issue_id)return false;
  if(supportIssueFilter==='unlinked'&&ticket.main_issue_id)return false;
  return true;
 });

 const cards=[[tr('Total members','Total des membres'),rows.members?.length||0,Users],[tr('Pending approval','En attente d’approbation'),rows.members?.filter(m=>m.status==='pending').length||0,Clock3],[tr('Active subscriptions','Abonnements actifs'),rows.subscriptions?.filter(s=>s.status==='active').length||0,CalendarDays],[tr('Open support tickets','Demandes d’assistance ouvertes'),rows.support?.filter(t=>t.status==='open').length||0,Headphones]];
 const columns={members:['display_name','email','status','role','created_at'],invitations:['email','status','expires_at','created_at'],subscriptions:['member_id','status','starts_at','expires_at'],orders:['member_id','status','total_amount','created_at'],support:['subject','status','member_id','created_at']};
 const list=rows[tab]||[];
 return <div className="admin-layout">
 <aside className="admin-side"><img className="admin-logo" src={logo} onError={e=>{if(fallbackLogo&&e.currentTarget.src!==fallbackLogo)e.currentTarget.src=fallbackLogo}} alt="MYKIOO"/><div className="admin-side-label">{tr("OWNER CONTROL CENTER","CENTRE DE GESTION")}</div><nav>{tabs.map(({id,name,icon:Icon})=><button key={id} className={'admin-nav '+(tab===id?'active':'')} onClick={()=>setTab(id)}><Icon size={18}/>{name==='Support'&&unreadTotal>0&&<span className="mykioo-unread-dot">{unreadTotal>99?'99+':unreadTotal}</span>}{name==='Notifications'&&notificationUnread>0&&<span className="mykioo-unread-dot">{notificationUnread>99?'99+':notificationUnread}</span>}{tr(name,({Overview:"Vue d’ensemble",Members:"Membres",Invitations:"Invitations",Subscriptions:"Abonnements",Orders:"Commandes",Support:"Assistance",Notifications:"Notifications"})[name])}</button>)}</nav><div className="admin-bottom"><div className="admin-owner"><ShieldCheck size={16}/> {tr("Owner account","Compte propriétaire")}</div><button className="admin-nav" onClick={logout}><LogOut size={18}/> {tr("Sign out","Déconnexion")}</button></div></aside>
 <main className="admin-main"><header className="admin-bar"><div><span className="admin-tag">{tr("PRIVATE ADMINISTRATION","ADMINISTRATION PRIVÉE")}</span><h1>{tr(tabs.find(t=>t.id===tab)?.name,({overview:'Vue d’ensemble',members:'Membres',invitations:'Invitations',subscriptions:'Abonnements',orders:'Commandes',support:'Assistance',notifications:'Notifications'})[tab])}</h1></div><div className="admin-account"><button type="button" className="mykioo-bell-button" onClick={()=>setTab('notifications')} aria-label={tr('Open notifications','Ouvrir les notifications')}><Bell size={18}/>{notificationUnread>0&&<span className="mykioo-unread-dot">{notificationUnread>99?'99+':notificationUnread}</span>}</button><span>{user.email}</span><div className="mykioo-language-switch" role="group" aria-label="Website language"><button type="button" className={fr?'':'selected'} aria-pressed={!fr} onClick={()=>onLanguageChange('en')}>EN</button><button type="button" className={fr?'selected':''} aria-pressed={fr} onClick={()=>onLanguageChange('fr')}>FR</button></div><button onClick={refresh} title="Refresh data" aria-label="Refresh data"><RefreshCw size={19}/></button></div></header>
 {error&&<div className="admin-error" role="alert"><AlertCircle size={18}/>{error}</div>}{notice&&<div className="admin-success" role="status"><CheckCircle2 size={18}/>{notice}</div>}
 {tab==='overview'&&<><NotificationCenter compact owner items={notifications} language={language} markRead={markNotificationRead} onSelect={section=>setTab(section)}/><ServiceAlertBanner alerts={serviceAlerts} language={language} onOpen={()=>setTab('support')}/><ExpiryAlerts subscriptions={rows.subscriptions||[]} members={rows.members||[]} language={language} owner onOpen={()=>setTab('subscriptions')}/><p className="admin-description">{tr("Welcome to your MYKIOO management space. All information comes from your private Supabase project.","Bienvenue dans votre espace de gestion MYKIOO. Toutes les informations proviennent de votre projet Supabase privé.")}</p><div className="admin-stats">{cards.map(([label,n,Icon])=><div className="admin-stat" key={label}><Icon size={22}/><small>{label}</small><strong>{loading?'…':n}</strong></div>)}</div><div className="admin-info"><CheckCircle2 size={22}/><div><strong>{tr("Owner access is active","Accès propriétaire activé")}</strong><p>{tr("Your account is approved. You can now invite members and manage approval requests from the Members and Invitations sections.","Votre compte est approuvé. Vous pouvez inviter des membres et gérer les demandes d’approbation dans les sections Membres et Invitations.")}</p></div></div></>}
  {tab==='subscriptions'&&<ExpiryAlerts subscriptions={rows.subscriptions||[]} members={rows.members||[]} language={language} owner/>}{tab==='subscriptions'&&<SubscriptionManager members={rows.members||[]} subscriptions={rows.subscriptions||[]} requests={rows.subscription_requests||[]} language={language} onSaved={()=>refresh({silent:true})}/>}
 {tab==='notifications'&&<NotificationCenter owner items={notifications} language={language} markRead={markNotificationRead} onSelect={section=>setTab(section)}/>}{tab==='support'&&<section className="admin-support-section">
 <OwnerIssuePanel tickets={rows.support||[]} language={language} selected={selectedTicketIds} setSelected={setSelectedTicketIds} onRefresh={()=>refresh({silent:true})}/>
 <ServiceAlertEditor alerts={serviceAlerts} subscriptions={rows.subscriptions||[]} language={language} onRefresh={async()=>{const {data,error}=await supabase.from('mykioo_service_alerts').select('*').order('created_at',{ascending:false}).limit(100);if(!error)setServiceAlerts(data||[])}}/>
 <ServiceAlertHistory alerts={serviceAlerts} language={language}/>
 <p className="admin-description">{tr('Review support requests and update their status.','Consultez les demandes d’assistance et modifiez leur statut.')}</p>
 <div className="mykioo-ticket-filters">
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
  <label>{tr('Main issue association','Association à un problème principal')}
   <select value={supportIssueFilter} onChange={e=>setSupportIssueFilter(e.target.value)}>
    <option value="all">{tr('All tickets','Toutes les demandes')}</option>
    <option value="linked">{tr('Linked to a main issue','Associées à un problème principal')}</option>
    <option value="unlinked">{tr('Not linked','Non associées')}</option>
   </select>
  </label>
  <span className="mykioo-filter-count">{filteredTickets.length} / {(rows.support||[]).length} {tr('tickets shown','demandes affichées')}</span>
  <button type="button" onClick={()=>{setSupportSearch('');setSupportStatusFilter('all');setSupportIssueFilter('all')}}>{tr('Clear filters','Effacer les filtres')}</button>
 </div>
 {loading?<div className="admin-empty">{tr('Loading requests…','Chargement des demandes…')}</div>:
 (rows.support||[]).length===0?<div className="admin-empty"><Headphones size={28}/><strong>{tr('No support requests yet','Aucune demande d’assistance')}</strong></div>:
 filteredTickets.length===0?<div className="admin-empty">{tr('No tickets match these filters.','Aucune demande ne correspond à ces filtres.')}</div>:
 <div className="admin-support-list">{filteredTickets.map(ticket=>{
   const requester=(rows.members||[]).find(m=>m.user_id===ticket.member_id);
   return <article key={ticket.id} className="admin-support-ticket">
    <div className="admin-support-ticket-top"><label className="mykioo-ticket-select"><input type="checkbox" checked={selectedTicketIds.includes(ticket.id)} onChange={e=>setSelectedTicketIds(old=>e.target.checked?[...old,ticket.id]:old.filter(id=>id!==ticket.id))} aria-label={tr('Select ticket','Sélectionner la demande')+' '+ticket.subject}/></label><div><strong>{ticket.subject}</strong><small>{requester?.display_name||requester?.email||tr('Member','Membre')} · {new Date(ticket.created_at).toLocaleDateString(fr?'fr-CA':'en-CA')}</small></div>{unreadCounts[ticket.id]>0&&<span className="mykioo-unread-dot">{unreadCounts[ticket.id]}</span>}<span className="mykioo-ticket-status">{tr(({open:'Open',in_progress:'In progress',resolved:'Resolved',closed:'Closed'})[ticket.status]||ticket.status,({open:'Ouvert',in_progress:'En cours',resolved:'Résolu',closed:'Fermé'})[ticket.status]||ticket.status)}</span></div>
    <p>{ticket.message}</p>
    <div className="admin-support-ticket-actions"><label htmlFor={'ticket-status-'+ticket.id}>{tr('Status','Statut')}</label><select id={'ticket-status-'+ticket.id} value={ticket.status} disabled={saving} onChange={e=>updateTicket(ticket,e.target.value)}>
      <option value="open">{tr('Open','Ouvert')}</option>
      <option value="in_progress">{tr('In progress','En cours')}</option>
      <option value="resolved">{tr('Resolved','Résolu')}</option>
      <option value="closed">{tr('Closed','Fermé')}</option>
    </select></div>{ticket.main_issue_id&&<p className="mykioo-owner-linked-indicator">{tr('Linked to main issue','Associé au problème principal')} · {ticket.main_issue_id.slice(0,8)}</p>}<SupportThread ticket={ticket} userId={user.id} language={language} owner unread={unreadCounts[ticket.id]||0} onRead={syncUnread}/>
   </article>
 })}</div>}
 </section>}
 {tab==='invitations'&&<form className="admin-invite" onSubmit={invite}><div><strong>{tr("Invite a new member","Inviter un nouveau membre")}</strong><p>{tr("An invitation email will be sent in the website language. The member remains pending until you approve them.","Une invitation sera envoyée dans la langue du site. Le membre restera en attente jusqu’à votre approbation.")}</p></div><div className="admin-invite-row"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="customer@example.com" required maxLength={254} aria-label={tr("Invitee email","Courriel du destinataire")}/><button className="admin-action primary" type="submit" disabled={saving}>{saving?tr('Sending…','Envoi…'):tr('Send invitation','Envoyer l’invitation')}</button></div><small>{tr("Email language follows the EN/FR selection above. Supabase controls invitation expiry.","La langue du courriel suit le choix EN/FR ci-dessus. Supabase gère l’expiration de l’invitation.")}</small></form>}
 {tab!=='overview'&&tab!=='support'&&tab!=='subscriptions'&&tab!=='notifications'&&<><p className="admin-description">{tab==='invitations'?tr('View invitations sent through MYKIOO.','Consultez les invitations envoyées depuis MYKIOO.'):tab==='members'?tr('Approve, reject or suspend customer memberships. Owner accounts are protected.','Approuvez, refusez ou suspendez les membres. Les comptes propriétaires sont protégés.'):tr('View your current MYKIOO records.','Consultez les données MYKIOO.')}</p>{loading?<div className="admin-empty">{tr("Loading records…","Chargement…")}</div>:list.length===0?<div className="admin-empty"><LockKeyhole size={28}/><strong>{tr("No records yet","Aucune donnée")}</strong><span>{tr("Information will appear here when available.","Les informations apparaîtront ici dès qu’elles seront disponibles.")}</span></div>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns[tab].map(c=><th key={c}>{c.replaceAll('_',' ')}</th>)}{tab==='members'&&<th>{tr("Actions","Actions")}</th>}</tr></thead><tbody>{list.map(row=><tr key={row.id||row.user_id}>{columns[tab].map(c=><td key={c}>{row[c]===null||row[c]===undefined?'—':c.includes('_at')&&row[c]?new Date(row[c]).toLocaleDateString():String(row[c])}</td>)}{tab==='members'&&<td><div className="admin-controls">{row.role==='member'?<>{row.status!=='approved'&&<button disabled={saving} className="admin-mini positive" onClick={()=>changeStatus(row,'approved')}>{tr("Approve","Approuver")}</button>}{row.status!=='rejected'&&<button disabled={saving} className="admin-mini" onClick={()=>changeStatus(row,'rejected')}>{tr("Reject","Refuser")}</button>}{row.status==='approved'&&<button disabled={saving} className="admin-mini" onClick={()=>changeStatus(row,'suspended')}>{tr("Suspend","Suspendre")}</button>}</>:<span>{tr("Owner","Propriétaire")}</span>}</div></td>}</tr>)}</tbody></table></div>}</>}
 </main> {pendingChange&&<div className="mykioo-modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget&&!saving)setPendingChange(null)}}><div className="mykioo-modal" role="alertdialog" aria-modal="true" aria-labelledby="mykioo-confirm-title" aria-describedby="mykioo-confirm-description"><div className="mykioo-modal-icon"><ShieldCheck size={27}/></div><div className="admin-tag">MYKIOO</div><h2 id="mykioo-confirm-title">{tr(({approved:'Approve membership',rejected:'Reject membership',suspended:'Suspend membership',deactivated:'Deactivate membership'})[pendingChange.status]||'Change membership',({approved:'Approuver l’adhésion',rejected:'Refuser l’adhésion',suspended:'Suspendre l’adhésion',deactivated:'Désactiver l’adhésion'})[pendingChange.status]||'Modifier l’adhésion')}</h2><p id="mykioo-confirm-description">{tr('Are you sure you want to change the status of this member?','Voulez-vous vraiment modifier le statut de ce membre?')}</p><div className="mykioo-modal-member"><span>{pendingChange.member.email}</span><div><span className="mykioo-status-chip">{tr(pendingChange.member.status,({pending:'en attente',approved:'approuvé',rejected:'refusé',suspended:'suspendu',deactivated:'désactivé'})[pendingChange.member.status]||pendingChange.member.status)}</span><span className="mykioo-modal-arrow">→</span><span className="mykioo-status-chip target">{tr(pendingChange.status,({pending:'en attente',approved:'approuvé',rejected:'refusé',suspended:'suspendu',deactivated:'désactivé'})[pendingChange.status]||pendingChange.status)}</span></div></div><div className="mykioo-modal-buttons"><button type="button" className="mykioo-modal-cancel" onClick={()=>setPendingChange(null)}>{tr('Cancel','Annuler')}</button><button type="button" className="mykioo-modal-confirm" autoFocus onClick={confirmChange}>{tr('Confirm change','Confirmer')}</button></div></div></div>}
</div>
}
