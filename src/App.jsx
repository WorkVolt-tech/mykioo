import {RelatedIssue} from './SupportIssues';
import {useNotifications,NotificationCenter} from './NotificationCenter';
import {useServiceAlerts,ServiceAlertBanner,ServiceAlertHistory} from './ServiceAlerts';
import {ExpiryAlerts} from './ExpiryAlerts';
import SubscriptionRequests from './SubscriptionRequests';
import PasswordReveal from './PasswordReveal';
import {useSupportUnread} from './useSupportUnread';
import SupportThread from './SupportThread';
import React,{useEffect,useState} from 'react';
import {LockKeyhole,Mail,Eye,EyeOff,ArrowRight,ShieldCheck,LogOut,UserRound,CalendarDays,LifeBuoy,BookOpen,RefreshCw,Bell,Clock3,CheckCircle2,AlertCircle,Menu,X,Sparkles,Ticket,MonitorPlay} from 'lucide-react';
import {supabase,configured} from './supabase';
import mykiooLogo from './logo-base64.txt?raw';
const LOGO_WEBP = '/MYKIOO-Logo.webp';
const LOGO_FALLBACK = 'data:image/png;base64,' + mykiooLogo.trim();
function logoFallback(event) {
  const image = event.currentTarget;
  if (image.src !== LOGO_FALLBACK) image.src = LOGO_FALLBACK;
}
import AdminDashboard from './AdminDashboard.jsx';

function Brand({compact=false}) {return <div className={'brand brand-image '+(compact?'brand-small':'')}><img className="logo-image" src={LOGO_WEBP} onError={logoFallback} alt="MYKIOO" /></div>}
function Button({children,...props}){return <button className="button" {...props}>{children}</button>}
function Login({onLogin,language='en',onLanguageChange}){const tr=(en,fr)=>language==='fr'?fr:en;
 const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[visible,setVisible]=useState(false),[loading,setLoading]=useState(false),[mode,setMode]=useState('login'),[message,setMessage]=useState('');
 async function submit(e){e.preventDefault();setMessage('');if(!configured){setMessage('Site setup is in progress. Member sign-in is not available yet.');return;}setLoading(true);try{if(mode==='reset'){const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:window.location.origin});if(error)throw error;setMessage('If an account exists, password recovery instructions will be sent.');}else{const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;onLogin();}}catch(err){setMessage(mode==='login'?'Unable to sign in. Check your details or contact support.':err.message)}finally{setLoading(false)}}
 return <div className="entrance"><div className="aura aura-one"/><div className="aura aura-two"/><header className="topbar"><Brand compact/><div className="topbar-right"><div className="mykioo-language-switch" role="group" aria-label="Website language"><button type="button" className={language==='en'?'selected':''} onClick={()=>onLanguageChange('en')}>EN</button><button type="button" className={language==='fr'?'selected':''} onClick={()=>onLanguageChange('fr')}>FR</button></div><span className="top-private"><LockKeyhole size={13}/> PRIVATE MEMBERSHIP</span></div></header><main className="entrance-main"><div className="eyebrow"><Sparkles size={14}/> {tr('BY INVITATION ONLY','SUR INVITATION UNIQUEMENT')}</div><h1>{tr('Your world.','Votre univers.')}<br/><em>{tr('Your entertainment.','Votre divertissement.')}</em></h1><p className="intro">{tr('A private experience, reserved for our members.','Une expérience privée, réservée à nos membres.')}</p><form className="auth-card" onSubmit={submit}><div className="auth-heading"><div className="auth-icon"><LockKeyhole size={23}/></div><h2>{mode==='login'?tr('Welcome back','Bon retour'):tr('Reset your password','Réinitialiser votre mot de passe')}</h2><p>{mode==='login'?tr('Sign in to your private member space.','Connectez-vous à votre espace membre privé.'):tr('Enter your account email to request a reset.','Entrez votre courriel pour réinitialiser votre mot de passe.')}</p></div><label htmlFor="email">{tr('Email address','Adresse courriel')}</label><div className="field"><Mail size={18}/><input id="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required/></div>{mode==='login'&&<><div className="label-row"><label htmlFor="password">{tr('Password','Mot de passe')}</label><button type="button" className="text-button" onClick={()=>{setMode('reset');setMessage('')}}>{tr('Forgot password?','Mot de passe oublié?')}</button></div><div className="field"><LockKeyhole size={18}/><input id="password" type={visible?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={tr('Enter your password','Entrez votre mot de passe')} autoComplete="current-password" required/><button type="button" className="eye-button" onClick={()=>setVisible(!visible)} aria-label={visible?'Hide password':'Show password'}>{visible?<EyeOff size={18}/>:<Eye size={18}/>}</button></div></>}{message&&<div className="message" role="status"><AlertCircle size={16}/>{message}</div>}<Button type="submit" disabled={loading}>{loading?tr('Please wait…','Veuillez patienter…'):mode==='login'?tr('Enter MYKIOO','Entrer dans MYKIOO'):tr('Send recovery email','Envoyer le courriel de récupération')}<ArrowRight size={18}/></Button>{mode==='reset'&&<button type="button" className="back-button" onClick={()=>{setMode('login');setMessage('')}}>{tr('Return to sign in','Retour à la connexion')}</button>}<div className="auth-foot"><ShieldCheck size={15}/> {tr('Access is individually authorized','Accès autorisé individuellement')}</div></form><p className="invite-note">{tr('Don\'t have an invitation?','Pas d’invitation?')} <span>{tr('Membership is by invitation only.','Adhésion sur invitation uniquement.')}</span></p></main><footer className="footer"><span>© {new Date().getFullYear()} MYKIOO</span><span><LockKeyhole size={12}/> {tr('Private & secure access','Accès privé et sécurisé')}</span></footer></div>
}
const shortcuts=[{icon:CalendarDays,title:'My subscription',desc:'View status and expiration'},{icon:RefreshCw,title:'Renewal',desc:'Manage your membership'},{icon:MonitorPlay,title:'Device setup',desc:'Installation guides'},{icon:LifeBuoy,title:'Support',desc:'Get help when you need it'}];
function Shell({user,member,subscriptions,logout,language='en',onLanguageChange,onNameSaved}){const {notifications,unread:notificationUnread,markRead:markNotificationRead}=useNotifications(user.id);const [serviceAlerts]=useServiceAlerts();const tr=(en,fr)=>language==='fr'?fr:en;const [active,setActive]=useState('Overview'),[mobile,setMobile]=useState(false),[editName,setEditName]=useState(member.display_name||''),[profileError,setProfileError]=useState(''),[profileNotice,setProfileNotice]=useState(''),[profileSaving,setProfileSaving]=useState(false),[tickets,setTickets]=useState([]),[ticketSubject,setTicketSubject]=useState(''),[ticketCategory,setTicketCategory]=useState('other'),[ticketMessage,setTicketMessage]=useState(''),[ticketLoading,setTicketLoading]=useState(false),[ticketSaving,setTicketSaving]=useState(false),[ticketError,setTicketError]=useState(''),[ticketNotice,setTicketNotice]=useState('');const {counts:unreadCounts,total:unreadTotal,sync:syncUnread}=useSupportUnread(user.id,tickets);const nav=['Overview','Subscription','Setup guides','Support','Notifications','My profile'];const activeSub=subscriptions.find(s=>s.status==='active');async function loadTickets({silent=false}={}){
 if(!silent){setTicketLoading(true);setTicketError('');}
 try{
  const {data,error}=await supabase.from('mykioo_support_tickets')
   .select('id,subject,message,status,category,main_issue_id,created_at,updated_at')
   .eq('member_id',user.id).order('created_at',{ascending:false}).limit(50);
  if(error)throw error;
  setTickets(data||[]);
 }catch(e){setTicketError(tr('Unable to load support requests.','Impossible de charger vos demandes d’assistance.'))}
 finally{if(!silent)setTicketLoading(false)}
}
useEffect(()=>{
 if(!supabase)return;
 let mounted=true;
 let fetching=false;
 async function reload(){
   if(!mounted||fetching)return;
   fetching=true;
   try{
     const {data,error}=await supabase.from('mykioo_support_tickets')
      .select('id,subject,message,status,category,main_issue_id,created_at,updated_at')
      .eq('member_id',user.id).order('created_at',{ascending:false}).limit(50);
     if(!error&&mounted)setTickets(data||[]);
   }finally{fetching=false}
 }
 loadTickets();
 const channel=supabase.channel('mykioo-my-tickets-'+user.id)
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_support_tickets',filter:'member_id=eq.'+user.id},reload)
   .subscribe(status=>{if(status==='SUBSCRIBED')reload()});
 const timer=window.setInterval(()=>{if(document.visibilityState==='visible')reload()},12000);
 const onResume=()=>{if(document.visibilityState==='visible')reload()};
 window.addEventListener('focus',onResume);
 window.addEventListener('online',onResume);
 document.addEventListener('visibilitychange',onResume);
 return()=>{
  mounted=false;
  clearInterval(timer);
  window.removeEventListener('focus',onResume);
  window.removeEventListener('online',onResume);
  document.removeEventListener('visibilitychange',onResume);
  supabase.removeChannel(channel);
 };
},[user.id]);
async function submitTicket(e){
 e.preventDefault();if(ticketSaving)return;
 setTicketSaving(true);setTicketError('');setTicketNotice('');
 try{
  const {data:{session},error:authError}=await supabase.auth.getSession();
  if(authError||!session)throw new Error(tr('Please sign in again.','Veuillez vous reconnecter.'));
  const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-support',{
   method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
   body:JSON.stringify({action:'create_ticket',subject:ticketSubject.trim(),message:ticketMessage.trim(),category:ticketCategory})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw new Error(result.error||tr('Request could not be submitted.','Impossible d’envoyer la demande.'));
  setTicketSubject('');setTicketCategory('other');setTicketMessage('');
  setTicketNotice(tr('Your request was submitted. Please allow up to 24 hours for an initial reply. You can follow its status below.','Votre demande a été envoyée. Veuillez prévoir un délai allant jusqu’à 24 heures pour une première réponse. Vous pouvez suivre son statut ci-dessous.'));
  await loadTickets();
 }catch(err){setTicketError(err.message||tr('Request could not be submitted.','Impossible d’envoyer la demande.'))}
 finally{setTicketSaving(false)}
}
async function saveProfileName(e){
 e.preventDefault();setProfileError('');setProfileNotice('');
 const name=editName.trim().replace(/\s+/g,' ');
 if(name.length<2||name.length>40){setProfileError(tr('Use 2 to 40 characters.','Utilisez de 2 à 40 caractères.'));return}
 setProfileSaving(true);
 try{
  const {data:{session},error:authError}=await supabase.auth.getSession();
  if(authError||!session)throw new Error(tr('Please sign in again.','Veuillez vous reconnecter.'));
  const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-profile',{
   method:'POST',
   headers:{'Content-Type':'application/json','apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Authorization':'Bearer '+session.access_token},
   body:JSON.stringify({display_name:name})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw new Error(result.error||tr('Could not save your name.','Impossible d’enregistrer le nom.'));
  setEditName(result.display_name);onNameSaved(result.display_name);
  setProfileNotice(tr('Your name has been updated.','Votre nom a été modifié.'));
 }catch(err){setProfileError(err.message||tr('Could not save your name.','Impossible d’enregistrer le nom.'))}
 finally{setProfileSaving(false)}
}
return <div className="dashboard"><aside className={'sidebar '+(mobile?'sidebar-open':'')}><Brand compact/><div className="side-section">{tr("MEMBER SPACE","ESPACE MEMBRE")}</div><nav>{nav.map(n=><button key={n} onClick={()=>{setActive(n);setMobile(false)}} className={'nav-button '+(active===n?'selected':'')}>{n==='Overview'?<Sparkles size={18}/>:n==='Subscription'?<CalendarDays size={18}/>:n==='Setup guides'?<BookOpen size={18}/>:n==='My profile'?<UserRound size={18}/>:n==='Notifications'?<Bell size={18}/>:<LifeBuoy size={18}/>} {n==='Support'&&unreadTotal>0&&<span className="mykioo-unread-dot">{unreadTotal>99?'99+':unreadTotal}</span>}{n==='Notifications'&&notificationUnread>0&&<span className="mykioo-unread-dot">{notificationUnread>99?'99+':notificationUnread}</span>} {tr(n,({Overview:'Vue d’ensemble',Subscription:'Abonnement','Setup guides':'Guides d’installation',Support:'Assistance',Notifications:'Notifications','My profile':'Mon profil'})[n])}</button>)}</nav><div className="sidebar-bottom"><div className="membership-pill"><ShieldCheck size={16}/> {tr("Approved member","Membre approuvé")}</div><button className="nav-button" onClick={logout}><LogOut size={17}/> {tr("Sign out","Déconnexion")}</button></div></aside><div className="workspace"><header className="dash-header"><button className="menu-button" onClick={()=>setMobile(!mobile)} aria-label="Menu">{mobile?<X/>:<Menu/>}</button><span className="bread">MYKIOO <span>/ {tr(active,({Overview:'Vue d’ensemble',Subscription:'Abonnement','Setup guides':'Guides d’installation',Support:'Assistance',Notifications:'Notifications','My profile':'Mon profil'})[active])}</span></span><div className="header-user"><div className="mykioo-language-switch" role="group" aria-label="Website language"><button type="button" className={language==='en'?'selected':''} onClick={()=>onLanguageChange('en')}>EN</button><button type="button" className={language==='fr'?'selected':''} onClick={()=>onLanguageChange('fr')}>FR</button></div><button type="button" className="mykioo-bell-button" onClick={()=>setActive('Notifications')} aria-label={tr('Open notifications','Ouvrir les notifications')}><span className="mykioo-bell-wrap"><Bell size={18}/>{notificationUnread>0&&<span className="mykioo-unread-dot">{notificationUnread>99?'99+':notificationUnread}</span>}</span></button><span>{member.display_name||user.email?.split('@')[0]}</span><div className="avatar"><UserRound size={19}/></div></div></header><main className="dash-content"><div className="page-eyebrow"><Sparkles size={15}/> {tr("EXCLUSIVE MEMBER SPACE","ESPACE MEMBRE EXCLUSIF")}</div><h1>{active==='Overview'?tr('Welcome to MYKIOO, ','Bienvenue sur MYKIOO, ')+(member.display_name||user.email?.split('@')[0]):tr(active,({Subscription:'Abonnement','Setup guides':'Guides d’installation',Support:'Assistance','My profile':'Mon profil'})[active])}</h1><p className="page-sub">{active==='Overview'?tr('Everything about your membership, all in one place.','Toutes les informations sur votre adhésion, au même endroit.'):active==='Subscription'?tr('Your plans and subscription history.','Vos forfaits et votre historique d’abonnement.'):active==='Setup guides'?tr('Device assistance will appear here once the service provider is connected.','Les guides d’installation seront disponibles lorsque le fournisseur sera connecté.'):active==='My profile'?tr('Choose how MYKIOO addresses you. Your real name is not required.','Choisissez comment MYKIOO doit vous appeler. Votre vrai nom n’est pas obligatoire.'):active==='Notifications'?tr('New messages and important account updates.','Nouveaux messages et mises à jour importantes de votre compte.'):tr('Send a request and follow its status here.','Envoyez une demande et suivez son statut ici.')}</p>{active==='Overview'&&<><NotificationCenter compact items={notifications} language={language} markRead={markNotificationRead} onSelect={section=>setActive(section)}/><ServiceAlertBanner alerts={serviceAlerts} language={language} onOpen={()=>setActive('Support')}/><ExpiryAlerts subscriptions={subscriptions} language={language} onOpen={()=>setActive('Subscription')}/><div className="hero-panel"><div><div className="hero-label">{tr("YOUR PRIVATE SPACE","VOTRE ESPACE PRIVÉ")}</div><h2>{tr("Entertainment,","Le divertissement,")}<br/>{tr("on your terms.","à votre façon.")}</h2><p>{tr("Exclusive access. A simpler experience.","Un accès exclusif. Une expérience simplifiée.")}</p></div><div className="hero-orb"><img src={LOGO_WEBP} onError={logoFallback} alt="" /></div></div><div className="stat-grid"><div className="stat"><ShieldCheck size={24}/><span>{tr("Membership","Adhésion")}</span><strong>{tr("Approved","Approuvé")}</strong></div><div className="stat"><CalendarDays size={24}/><span>{tr("Subscription","Abonnement")}</span><strong>{activeSub?tr("Active","Actif"):tr("Not activated","Non activé")}</strong></div><div className="stat"><Clock3 size={24}/><span>{tr("Expiry date","Date d’expiration")}</span><strong>{activeSub?.expires_at?new Date(activeSub.expires_at).toLocaleDateString():'—'}</strong></div></div><h3>{tr("Quick access","Accès rapide")}</h3><div className="shortcut-grid">{shortcuts.map(({icon:Icon,title,desc},i)=><button className="shortcut" key={title} onClick={()=>setActive(['Subscription','Subscription','Setup guides','Support'][i])}><Icon size={24}/><strong>{tr(title,({'My subscription':'Mon abonnement',Renewal:'Renouvellement','Device setup':'Installation des appareils',Support:'Assistance'})[title])}</strong><small>{tr(desc,({'View status and expiration':'Consulter le statut et l’expiration','Manage your membership':'Gérer votre adhésion','Installation guides':'Guides d’installation','Get help when you need it':'Obtenir de l’aide'})[desc])}</small><ArrowRight size={17} className="shortcut-arrow"/></button>)}</div></>}{active==='Subscription'&&<ExpiryAlerts subscriptions={subscriptions} language={language}/>}{active!=='Overview'&&active!=='My profile'&&active!=='Support'&&active!=='Notifications'&&<section className="empty-panel"><Ticket size={34}/><h2>{active==='Subscription'?(subscriptions.length?tr('Your subscriptions','Vos abonnements'):tr('No active subscription yet','Aucun abonnement actif')):tr('Coming soon','À venir')}</h2><p>{active==='Subscription'?tr('You can request a new subscription below, then track your request and activated services here.','Vous pouvez demander un nouvel abonnement ci-dessous, puis suivre votre demande et vos services activés ici.'):tr('This part of your member area will be activated during the next development stage.','Cette section sera activée lors de la prochaine étape du développement.')}</p>{active==='Subscription'&&subscriptions.map(sub=><article className="mykioo-member-sub" key={sub.id}>
 <strong>{sub.service_name||tr('Your service','Votre service')}</strong>
 <span className="mykioo-ticket-status">{tr(({pending:'Pending',active:'Active',expired:'Expired',suspended:'Suspended',cancelled:'Cancelled'})[sub.status]||sub.status,({pending:'En attente',active:'Actif',expired:'Expiré',suspended:'Suspendu',cancelled:'Annulé'})[sub.status]||sub.status)}</span>

 {sub.service_username&&<p>{tr('Service login','Identifiant du service')}: <strong>{sub.service_username}</strong></p>}
 <p>{tr('Start','Début')}: {sub.starts_at?new Date(sub.starts_at).toLocaleDateString(language==='fr'?'fr-CA':'en-CA'):'—'} · {tr('Expires','Expire')}: {sub.expires_at?new Date(sub.expires_at).toLocaleDateString(language==='fr'?'fr-CA':'en-CA'):'—'}</p><PasswordReveal subscription={sub} language={language}/>
 </article>)}<SubscriptionRequests userId={user.id} subscriptions={subscriptions} language={language}/></section>}{active==='Notifications'&&<NotificationCenter items={notifications} language={language} markRead={markNotificationRead} onSelect={section=>setActive(section)}/>}{active==='Support'&&<section className="mykioo-support">
 <ServiceAlertBanner alerts={serviceAlerts} language={language}/>
 <ServiceAlertHistory alerts={serviceAlerts} language={language}/>
 <div className="mykioo-support-card">
  <h2>{tr('Contact MYKIOO support','Contacter l’assistance MYKIOO')}</h2>
  <p>{tr('Tell us what you need help with. Your request is private and visible to the MYKIOO team.','Expliquez-nous votre problème. Votre demande est privée et visible par l’équipe MYKIOO.')}</p>
  <p className="mykioo-support-response-policy">{tr('MYKIOO is operated by one person. Please allow up to 24 hours for a first response after submitting your request, including nights and weekends. Resolving the issue may take longer.','MYKIOO est géré par une seule personne. Veuillez prévoir un délai allant jusqu’à 24 heures pour une première réponse après l’envoi de votre demande, y compris les nuits et les fins de semaine. La résolution du problème peut prendre plus de temps.')}</p>
  <form onSubmit={submitTicket}>
   <label htmlFor="mykioo-ticket-category">{tr('What do you need help with?','Avec quoi avez-vous besoin d’aide ?')}</label>
   <select id="mykioo-ticket-category" value={ticketCategory} onChange={e=>setTicketCategory(e.target.value)} required>
    <option value="login">{tr('Login or account access','Connexion ou accès au compte')}</option>
    <option value="streaming">{tr('Buffering or playback','Mise en mémoire tampon ou lecture')}</option>
    <option value="channels">{tr('Missing or unavailable channels','Chaînes manquantes ou indisponibles')}</option>
    <option value="billing">{tr('Subscription or billing','Abonnement ou facturation')}</option>
    <option value="setup">{tr('Installation or setup','Installation ou configuration')}</option>
    <option value="other">{tr('Other question','Autre question')}</option>
   </select>
   <label htmlFor="mykioo-ticket-subject">{tr('Subject','Sujet')}</label>
   <input id="mykioo-ticket-subject" value={ticketSubject} onChange={e=>setTicketSubject(e.target.value)} maxLength={120} minLength={5} required placeholder={tr('Briefly describe the issue','Décrivez brièvement le problème')}/>
   <label htmlFor="mykioo-ticket-message">{tr('Your message','Votre message')}</label>
   <textarea id="mykioo-ticket-message" value={ticketMessage} onChange={e=>setTicketMessage(e.target.value)} minLength={10} maxLength={4000} rows={6} required placeholder={tr('How can we help?','Comment pouvons-nous vous aider ?')}/>
   <button type="submit" disabled={ticketSaving}>{ticketSaving?tr('Sending…','Envoi…'):tr('Submit support request','Envoyer la demande')}</button>
  </form>
 </div>
 {ticketError&&<p role="alert" className="mykioo-profile-error">{ticketError}</p>}
 {ticketNotice&&<p role="status" className="mykioo-profile-success">{ticketNotice}</p>}
 <div className="mykioo-support-card">
  <div className="mykioo-support-header"><h2>{tr('Your requests','Vos demandes')}</h2><button onClick={loadTickets} disabled={ticketLoading}>{tr('Refresh','Actualiser')}</button></div>
  {ticketLoading?<p>{tr('Loading…','Chargement…')}</p>:tickets.length===0?<p>{tr('No support requests yet.','Aucune demande d’assistance pour le moment.')}</p>:<div className="mykioo-ticket-list">{tickets.map(t=><article className="mykioo-ticket" key={t.id}><div className="mykioo-ticket-heading"><strong>{t.subject}</strong><span className="mykioo-category-badge">{tr(({login:'Login',streaming:'Playback',channels:'Channels',billing:'Billing',setup:'Setup',other:'Other'})[t.category]||'Other',({login:'Connexion',streaming:'Lecture',channels:'Chaînes',billing:'Facturation',setup:'Installation',other:'Autre'})[t.category]||'Autre')}</span>{unreadCounts[t.id]>0&&<span className="mykioo-unread-dot">{unreadCounts[t.id]}</span>}<span className="mykioo-ticket-status">{tr(({open:'Open',in_progress:'In progress',resolved:'Resolved',closed:'Closed'})[t.status]||t.status,({open:'Ouvert',in_progress:'En cours',resolved:'Résolu',closed:'Fermé'})[t.status]||t.status)}</span></div><p>{t.message}</p><small>{new Date(t.created_at).toLocaleDateString(language==='fr'?'fr-CA':'en-CA')}</small><RelatedIssue issueId={t.main_issue_id} language={language}/><SupportThread ticket={t} userId={user.id} language={language} unread={unreadCounts[t.id]||0} onRead={syncUnread}/></article>)}</div>}
 </div>
 </section>}{active==='My profile'&&<section className="mykioo-profile-card">
 <div className="mykioo-profile-head"><UserRound size={24}/><div><h2>{tr('Your preferred name','Votre nom préféré')}</h2><p>{tr('It can be a nickname, stage name, or any name you want us to call you. It does not need to be your real name.','Il peut s’agir d’un surnom, d’un nom d’artiste ou de tout autre nom. Vous n’avez pas besoin d’utiliser votre vrai nom.')}</p></div></div>
 <form onSubmit={saveProfileName}>
 <label htmlFor="mykioo-profile-name">{tr('What should we call you?','Comment pouvons-nous vous appeler ?')}</label>
 <input id="mykioo-profile-name" type="text" required minLength={2} maxLength={40} value={editName} onChange={e=>{setEditName(e.target.value);setProfileError('');setProfileNotice('')}} placeholder={tr('Preferred name or nickname','Nom ou surnom préféré')}/>
 <label>{tr('Email address','Adresse courriel')}</label><div className="mykioo-profile-readonly">{user.email}</div>
 {profileError&&<p role="alert" className="mykioo-profile-error">{profileError}</p>}
 {profileNotice&&<p role="status" className="mykioo-profile-success">{profileNotice}</p>}
 <button type="submit" disabled={profileSaving||editName.trim()===member.display_name} className="mykioo-profile-save">{profileSaving?tr('Saving…','Enregistrement…'):tr('Save changes','Enregistrer les modifications')}</button>
 </form></section>}</main></div></div>}
function Holding({user,member,logout,language='en',onProfileSaved}) {
 const tr=(en,fr)=>language==='fr'?fr:en;
 const pending=(member?.status||'pending')==='pending';
 const setupDone=Boolean(member?.display_name?.trim());
 const [password,setPassword]=useState('');
 const [displayName,setDisplayName]=useState(member?.display_name||'');
 const [message,setMessage]=useState('');
 const [sessionExpired,setSessionExpired]=useState(false);
 const [working,setWorking]=useState(false);
 const [complete,setComplete]=useState(false);
 useEffect(()=>{if(member?.display_name)setDisplayName(member.display_name)},[member?.display_name]);
 async function saveSetup(e){
  e.preventDefault();
  if(working)return;
  setMessage('');setSessionExpired(false);
  const name=displayName.trim().replace(/\s+/g,' ');
  if(name.length<2||name.length>40){setMessage(tr('Choose a name between 2 and 40 characters.','Choisissez un nom de 2 à 40 caractères.'));return}
  if(password && password.length<12){setMessage(tr('Your password must contain at least 12 characters.','Votre mot de passe doit contenir au moins 12 caractères.'));return}
  if(!password&&!member?.display_name){setMessage(tr('Please enter a password to finish account setup.','Veuillez créer un mot de passe pour terminer votre inscription.'));return}
  setWorking(true);
  try{
    // A cached session is not proof that the Auth user still exists.
    // Re-check against the auth server before attempting either write.
    const {data:identity,error:identityError}=await supabase.auth.getUser();
    if(identityError||!identity.user||identity.user.id!==user.id){
      setSessionExpired(true);
      throw new Error(tr('Your invitation session is no longer valid. Sign out and sign in again to continue.','Votre session d’invitation n’est plus valide. Déconnectez-vous, puis reconnectez-vous pour continuer.'));
    }
    const {data:sessionData,error:sessionError}=await supabase.auth.getSession();
    if(sessionError||!sessionData.session){
      setSessionExpired(true);
      throw new Error(tr('Your session has expired. Sign out and sign in again.','Votre session a expiré. Déconnectez-vous, puis reconnectez-vous.'));
    }
    if(password){
      const {error:passwordError}=await supabase.auth.updateUser({password});
      if(passwordError){
        if(/jwt|token|expired|session|sub claim|user.*not exist/i.test(passwordError.message||''))setSessionExpired(true);
        throw passwordError;
      }
      setPassword('');
    }
    const {data:latestSession,error:latestSessionError}=await supabase.auth.getSession();
    if(latestSessionError||!latestSession?.session){
      setSessionExpired(true);
      throw new Error(tr('Session expired. Sign out and sign in again.','Session expirée. Déconnectez-vous, puis reconnectez-vous.'));
    }
    const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-profile',{
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,'Authorization':'Bearer '+latestSession.session.access_token},
      body:JSON.stringify({display_name:name})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok){
      if(response.status===401)setSessionExpired(true);
      throw new Error(result.error||tr('Could not save your preferred name.','Impossible d’enregistrer votre nom préféré.'));
    }
    onProfileSaved?.(result.display_name);
    setComplete(true);
    setMessage(tr('Your details are saved. You will enter MYKIOO automatically once approved.','Vos informations sont enregistrées. Vous accéderez automatiquement à MYKIOO après approbation.'));
  }catch(err){
    setMessage(err.message||tr('Unable to save your account details.','Impossible d’enregistrer les informations du compte.'));
  }finally{setWorking(false)}
 }
 return <div className="holding"><Brand/><div className="hold-card">
  <div className="hold-icon">{pending?<Clock3 size={34}/>:<LockKeyhole size={34}/>}</div>
  <div className="eyebrow">{tr('MYKIOO MEMBERSHIP','ADHÉSION MYKIOO')}</div>
  <h1>{pending?tr('Awaiting approval','En attente d’approbation'):tr('Access restricted','Accès restreint')}</h1>
  <p>{pending?tr('Your account is registered. An administrator must approve your membership before your private dashboard is available.','Votre compte est enregistré. Un administrateur doit approuver votre adhésion avant que votre espace privé soit accessible.'):tr('Your account currently does not have permission to enter the member space. Please contact the administrator.','Votre compte n’a pas actuellement accès à l’espace membre. Veuillez communiquer avec l’administrateur.')}</p>
  {pending&&!setupDone&&<div className="hold-user"><Mail size={17}/>{user.email}</div>}
  {pending&&!setupDone&&<form className="pending-password mykioo-setup-form" onSubmit={saveSetup}>
   <label htmlFor="member-display-name">{tr('What should we call you?','Comment pouvons-nous vous appeler ?')}</label>
   <p className="member-name-hint">{tr('It does not have to be your real name. Choose a nickname or any name you would like us to use.','Il n’est pas nécessaire d’utiliser votre vrai nom. Choisissez un surnom ou le nom par lequel vous souhaitez être appelé(e).')}</p>
   <input id="member-display-name" type="text" value={displayName} onChange={e=>{setDisplayName(e.target.value);setComplete(false)}} placeholder={tr('Your preferred name or nickname','Votre nom ou surnom préféré')} maxLength={40} minLength={2} autoComplete="nickname" disabled={working} required/>
   <label htmlFor="pending-password">{tr(member?.display_name?'Change your password (optional)':'Create your member password',member?.display_name?'Modifier votre mot de passe (facultatif)':'Créer votre mot de passe')}</label>
   <input id="pending-password" type="password" value={password} onChange={e=>{setPassword(e.target.value);setComplete(false)}} autoComplete="new-password" placeholder={tr(member?.display_name?'Leave blank to keep your current password':'At least 12 characters',member?.display_name?'Laissez vide pour conserver votre mot de passe':'Au moins 12 caractères')} minLength={12} disabled={working} required={!member?.display_name}/>
   {message&&<p role={sessionExpired?'alert':'status'} className={sessionExpired?'mykioo-setup-error':'member-field-message'}>{message}</p>}
   {sessionExpired?<button type="button" className="outline-button" onClick={logout}>{tr('Sign out and sign in again','Se déconnecter et se reconnecter')}</button>:<button type="submit" className="outline-button" disabled={working||complete}>{working?tr('Saving…','Enregistrement…'):complete?tr('Details saved','Informations enregistrées'):tr('Save my account details','Enregistrer mes informations')}</button>}
  </form>}
  <button className="outline-button" onClick={logout}><LogOut size={17}/>{tr('Sign out','Déconnexion')}</button>
 </div></div>;
}
export default function App(){const [language,setLanguage]=useState(()=>{try{return localStorage.getItem('mykioo-language')||((navigator.language||'en').toLowerCase().startsWith('fr')?'fr':'en')}catch{return 'en'}});function changeLanguage(value){setLanguage(value);try{localStorage.setItem('mykioo-language',value)}catch{}}const [user,setUser]=useState(null),[member,setMember]=useState(null),[subscriptions,setSubscriptions]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');async function load(sessionUser){if(!sessionUser){setUser(null);setMember(null);setSubscriptions([]);setLoading(false);return}setLoading(true);setUser(sessionUser);const {data,error:err}=await supabase.from('mykioo_members').select('user_id,email,display_name,status,role').eq('user_id',sessionUser.id).maybeSingle();if(err){setError('Unable to confirm membership access. Please try again later.');setMember(null)}else{setError('');setMember(data||{status:'pending'});if(data?.status==='approved'){const r=await supabase.from('mykioo_subscriptions').select('id,member_id,service_name,contract_days,service_username,supplier_reference,has_password,status,starts_at,expires_at').eq('member_id',sessionUser.id);setSubscriptions(r.data||[])}}setLoading(false)}useEffect(()=>{
 if(!supabase||!user?.id)return;
 let live=true;
 let checking=false;
 async function syncMember(){
  if(!live||checking)return;
  checking=true;
  try{
   const {data,error:memberError}=await supabase.from('mykioo_members')
     .select('user_id,email,display_name,status,role').eq('user_id',user.id).maybeSingle();
   if(!live)return;
   if(memberError)return;
   if(!data){
     // Do not grant dashboard access if the member row was removed.
     setMember({status:'pending'});
     setSubscriptions([]);
     return;
   }
   setMember(previous=>
     previous?.status===data.status&&previous?.role===data.role&&
     previous?.display_name===data.display_name&&previous?.email===data.email?previous:data
   );
   if(data.status!=='approved'){setSubscriptions([]);return;}
   const r=await supabase.from('mykioo_subscriptions')
     .select('id,member_id,service_name,contract_days,service_username,supplier_reference,has_password,status,starts_at,expires_at').eq('member_id',user.id);
   if(live&&!r.error)setSubscriptions(previous=>{
      const current=JSON.stringify(previous),incoming=JSON.stringify(r.data||[]);
      return current===incoming?previous:r.data||[];
   });
  }catch(error){console.warn('MYKIOO member sync failed',error)}
  finally{checking=false}
 }
 const channel=supabase.channel('mykioo-member-live-'+user.id)
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_members',filter:'user_id=eq.'+user.id},syncMember)
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_subscriptions',filter:'member_id=eq.'+user.id},syncMember)
   .subscribe(status=>{if(status==='SUBSCRIBED')syncMember()});
 const timer=window.setInterval(()=>{if(document.visibilityState==='visible')syncMember()},12000);
 const onResume=()=>{if(document.visibilityState==='visible')syncMember()};
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
},[user?.id]);
useEffect(()=>{if(!supabase){setLoading(false);return}let live=true;supabase.auth.getUser().then(({data})=>{if(live)load(data.user)});const {data:{subscription}}=supabase.auth.onAuthStateChange((evt,session)=>{if(live&&['SIGNED_IN','SIGNED_OUT','USER_UPDATED'].includes(evt)){setTimeout(()=>{if(live)load(session?.user||null)},0)}});return()=>{live=false;subscription.unsubscribe()}},[]);async function logout(){await supabase.auth.signOut();setUser(null);setMember(null);setSubscriptions([])}if(loading)return <div className="loading"><Brand/><span>Checking your access…</span></div>;if(!user)return <Login onLogin={()=>{}} language={language} onLanguageChange={changeLanguage}/>;if(error)return <div className="holding"><Brand/><div className="hold-card"><AlertCircle size={32}/><h2>Temporarily unavailable</h2><p>{error}</p><button className="outline-button" onClick={logout}>Sign out</button></div></div>;if(member?.status==='approved' && member.role==='owner')return <AdminDashboard user={user} logout={logout} language={language} onLanguageChange={changeLanguage} logo={LOGO_WEBP} fallbackLogo={LOGO_FALLBACK}/>;if(member?.status==='approved')return <Shell user={user} member={member} subscriptions={subscriptions} logout={logout} language={language} onLanguageChange={changeLanguage} onNameSaved={name=>setMember(current=>({...current,display_name:name}))}/>;return <Holding user={user} member={member} logout={logout} language={language} onLanguageChange={changeLanguage} onProfileSaved={name=>setMember(current=>current?{...current,display_name:name}:current)}/>}
