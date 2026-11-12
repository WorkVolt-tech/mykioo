import React,{useEffect,useRef,useState} from 'react';
import {Activity,Search,RefreshCw,CalendarClock,ShieldCheck,UserRound,FileText,Settings2,Clock3,ChevronDown,ChevronUp} from 'lucide-react';
import {supabase} from './supabase';
import './ActivityHistory.css';

const PAGE_SIZE=50;
const ACTION_NAMES={
 member_invited:['Member invited','Membre invité'],
 member_status_changed:['Member status changed','Statut du membre modifié'],
 membership_email_accepted:['Invitation accepted','Invitation acceptée'],
 invite_member_record_failed:['Invitation could not be completed','Invitation non terminée'],
 subscription_requested:['Subscription requested','Abonnement demandé'],
 owner_subscription_requested:['Owner submitted subscription request','Demande d’abonnement du propriétaire'],
 subscription_renewal_requested:['Renewal requested','Renouvellement demandé'],
 owner_subscription_renewal_requested:['Owner submitted renewal request','Demande de renouvellement du propriétaire'],
 subscription_created:['Subscription created','Abonnement créé'],
 subscription_updated:['Subscription updated','Abonnement mis à jour'],
 subscription_renewed:['Subscription renewed','Abonnement renouvelé'],
 subscription_expiry_changed:['Expiration date changed','Date d’expiration modifiée'],
 subscription_request_status:['Subscription request reviewed','Demande d’abonnement examinée'],
 subscription_request_fulfilled:['Subscription request completed','Demande d’abonnement terminée'],
 subscription_service_activated:['External service activation recorded','Activation du service externe enregistrée'],
 subscription_cancellation_requested:['Cancellation requested','Annulation demandée'],
 subscription_cancellation_approved:['Cancellation approved','Annulation approuvée'],
 subscription_cancellation_denied:['Cancellation denied','Annulation refusée'],
 subscription_cancellation_status_changed:['Cancellation status changed','Statut de l’annulation modifié'],
 subscription_password_revealed:['Service password viewed after verification','Mot de passe du service consulté après vérification'],
 reminder_settings_updated:['Reminder settings changed','Paramètres de rappel modifiés'],
 support_ticket_opened:['Support request opened','Demande d’assistance ouverte'],
 support_message_sent:['Support message sent','Message d’assistance envoyé'],
 support_ticket_status_changed:['Support request updated','Demande d’assistance modifiée']
};
const ENTITY_NAMES={
 member:['Member','Membre'],
 subscription:['Subscription','Abonnement'],
 subscription_request:['Subscription request','Demande d’abonnement'],
 support_ticket:['Support','Assistance'],
 settings:['Settings','Paramètres'],
 order:['Order','Commande']
};
const ACTION_OPTIONS=Object.keys(ACTION_NAMES).sort((a,b)=>a.localeCompare(b));
const titleCase=s=>String(s||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
const displayName=(name,fallback)=>name||fallback;
const fmt=(value,language)=>value?new Date(value).toLocaleString(language==='fr'?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short'}):'—';
function iconFor(type,action){
 if(action?.includes('reminder')||type==='settings')return Settings2;
 if(type==='member')return UserRound;
 if(type==='subscription'||type==='subscription_request')return CalendarClock;
 return FileText;
}
function safeDetails(record,language){
 const tr=(en,fr)=>language==='fr'?fr:en;
 const d=record.details||{},rows=[];
 if(d.service_name)rows.push([tr('Service','Service'),d.service_name]);
 if(d.request_type)rows.push([tr('Request type','Type de demande'),d.request_type==='renewal'?tr('Renewal','Renouvellement'):tr('New','Nouveau')]);
 if(d.previous_status)rows.push([tr('Previous status','Statut précédent'),titleCase(d.previous_status)]);
 if(d.status)rows.push([tr('New status','Nouveau statut'),titleCase(d.status)]);
 if(d.old_expires_at)rows.push([tr('Previous expiry','Ancienne expiration'),fmt(d.old_expires_at,language)]);
 if(d.new_expires_at)rows.push([tr('Updated expiry','Nouvelle expiration'),fmt(d.new_expires_at,language)]);
 if(d.activated_at)rows.push([tr('Service activation','Activation du service'),fmt(d.activated_at,language)]);
 if(Number.isInteger(d.contract_days))rows.push([tr('Duration','Durée'),d.contract_days+' '+tr('days','jours')]);
 const toggle=(value)=>value===true?tr('Enabled','Activé'):tr('Disabled','Désactivé');
 if(typeof d.previous_enabled==='boolean'||typeof d.enabled==='boolean')
  rows.push([tr('Email reminders','Rappels par courriel'),(typeof d.previous_enabled==='boolean'?toggle(d.previous_enabled)+' → ':'')+toggle(d.enabled)]);
 if(typeof d.previous_in_app_enabled==='boolean'||typeof d.in_app_enabled==='boolean')
  rows.push([tr('Website notifications','Notifications du site'),(typeof d.previous_in_app_enabled==='boolean'?toggle(d.previous_in_app_enabled)+' → ':'')+toggle(d.in_app_enabled)]);
 if(d.automatic===true)rows.push([tr('Decision source','Origine de la décision'),tr('Automatic workflow','Traitement automatique')]);
 return rows;
}
function upperDate(date){
 if(!date)return null;
 const d=new Date(date+'T00:00:00');
 d.setDate(d.getDate()+1);
 return d.toISOString();
}
export default function ActivityHistory({members=[],language='en'}){
 const fr=language==='fr',tr=(en,frText)=>fr?frText:en;
 const [search,setSearch]=useState(''),[searchTerm,setSearchTerm]=useState('');
 const [category,setCategory]=useState(''),[action,setAction]=useState(''),[actor,setActor]=useState(''),[subject,setSubject]=useState('');
 const [fromDate,setFromDate]=useState(''),[toDate,setToDate]=useState('');
 const [rows,setRows]=useState([]),[total,setTotal]=useState(0),[page,setPage]=useState(0),[refresh,setRefresh]=useState(0);
 const [loading,setLoading]=useState(true),[error,setError]=useState(''),[expanded,setExpanded]=useState([]);
 const currentRequest=useRef(0);
 useEffect(()=>{const timer=setTimeout(()=>setSearchTerm(search.trim().slice(0,100)),300);return()=>clearTimeout(timer)},[search]);
 function startNewPage(setter,value){
  setter(value);setPage(0);setRows([]);setExpanded([]);
 }
 useEffect(()=>{
  const token=++currentRequest.current;
  let live=true;
  async function load(){
   setLoading(true);setError('');
   try{
    const {data,error:queryError}=await supabase.rpc('mykioo_owner_activity_history',{
     p_query:searchTerm||null,p_actor_id:actor||null,p_member_id:subject||null,
     p_entity_type:category||null,p_action:action||null,
     p_from:fromDate?new Date(fromDate+'T00:00:00').toISOString():null,
     p_to:upperDate(toDate),p_page_size:PAGE_SIZE,p_offset:page*PAGE_SIZE
    });
    if(queryError)throw queryError;
    if(!live||token!==currentRequest.current)return;
    const entries=data||[];
    setRows(previous=>page===0?entries:[...previous,...entries.filter(e=>!previous.some(p=>p.id===e.id))]);
    setTotal(entries[0]?.total_count??(page===0?0:total));
   }catch(err){
    if(live&&token===currentRequest.current)setError(tr('Activity history is unavailable. Please refresh or sign in again.','L’historique des activités est indisponible. Actualisez la page ou reconnectez-vous.'));
   }finally{if(live&&token===currentRequest.current)setLoading(false)}
  }
  load();
  return ()=>{live=false};
 },[searchTerm,category,action,actor,subject,fromDate,toDate,page,refresh,language]);
 function clear(){
  setSearch('');setSearchTerm('');setCategory('');setAction('');setActor('');setSubject('');setFromDate('');setToDate('');setPage(0);setExpanded([]);setRows([]);
 }
 function toggleDetails(id){setExpanded(prev=>prev.includes(id)?prev.filter(x=>x!==id):[...prev,id])}
 const memberOptions=[...members].sort((a,b)=>String(a.display_name||a.email||'').localeCompare(String(b.display_name||b.email||'')));
 return <section className="mykioo-activity" aria-label={tr('Owner activity history','Historique des activités du propriétaire')}>
  <div className="mykioo-activity-intro">
   <div><h2><Activity size={22}/>{tr('Activity History','Historique des activités')}</h2>
    <p>{tr('Review recorded changes and decisions across MYKIOO. Events are read-only.','Consultez les changements et les décisions enregistrés dans MYKIOO. Les événements sont en lecture seule.')}</p></div>
   <button className="mykioo-activity-refresh" onClick={()=>{setPage(0);setRows([]);setRefresh(n=>n+1)}} disabled={loading}><RefreshCw size={16}/>{tr('Refresh','Actualiser')}</button>
  </div>
  <div className="mykioo-activity-filters">
   <label className="mykioo-activity-field mykioo-activity-search">
    <span>{tr('Search activity, service or member','Rechercher une activité, un service ou un membre')}</span>
    <div className="mykioo-activity-search-inner"><Search size={17}/><input value={search} maxLength={100} placeholder={tr('Search names, actions, IDs…','Noms, actions, identifiants…')} onChange={e=>startNewPage(setSearch,e.target.value)}/></div>
   </label>
   <label className="mykioo-activity-field"><span>{tr('Category','Catégorie')}</span>
    <select value={category} onChange={e=>startNewPage(setCategory,e.target.value)}>
     <option value="">{tr('All categories','Toutes les catégories')}</option>
     {Object.entries(ENTITY_NAMES).map(([key,names])=><option value={key} key={key}>{names[fr?1:0]}</option>)}
    </select>
   </label>
   <label className="mykioo-activity-field"><span>{tr('Action','Action')}</span>
    <select value={action} onChange={e=>startNewPage(setAction,e.target.value)}>
     <option value="">{tr('All actions','Toutes les actions')}</option>
     {ACTION_OPTIONS.map(key=><option value={key} key={key}>{ACTION_NAMES[key][fr?1:0]}</option>)}
    </select>
   </label>
   <label className="mykioo-activity-field"><span>{tr('Affected member','Membre concerné')}</span>
    <select value={subject} onChange={e=>startNewPage(setSubject,e.target.value)}>
     <option value="">{tr('All members','Tous les membres')}</option>
     {memberOptions.map(m=><option value={m.user_id} key={m.user_id}>{m.display_name||m.email||m.user_id.slice(0,8)}{m.display_name&&m.email?' · '+m.email:''}</option>)}
    </select>
   </label>
   <label className="mykioo-activity-field"><span>{tr('Performed by','Effectué par')}</span>
    <select value={actor} onChange={e=>startNewPage(setActor,e.target.value)}>
     <option value="">{tr('Any actor','Tous les acteurs')}</option>
     {memberOptions.map(m=><option value={m.user_id} key={m.user_id}>{m.display_name||m.email||m.user_id.slice(0,8)}</option>)}
    </select>
   </label>
   <label className="mykioo-activity-field"><span>{tr('From','Du')}</span>
    <input type="date" value={fromDate} max={toDate||undefined} onChange={e=>startNewPage(setFromDate,e.target.value)}/>
   </label>
   <label className="mykioo-activity-field"><span>{tr('Through','Au')}</span>
    <input type="date" value={toDate} min={fromDate||undefined} onChange={e=>startNewPage(setToDate,e.target.value)}/>
   </label>
  </div>
  <div className="mykioo-activity-results-header">
   <div><strong>{total} {tr('matching events','événements correspondants')}</strong>
    <small>{tr('Newest first · Time shown in your local timezone','Les plus récents d’abord · Heure locale')}</small></div>
   <div className="mykioo-activity-results-actions"><ShieldCheck size={16}/><span>{tr('Owner only · Read only','Propriétaire seulement · Lecture seule')}</span><button type="button" onClick={clear}>{tr('Clear filters','Effacer les filtres')}</button></div>
  </div>
  {error&&<div className="mykioo-activity-error" role="alert">{error}</div>}
  {!error&&rows.length===0&&loading&&<p className="mykioo-activity-empty"><Clock3 size={17}/>{tr('Loading activity…','Chargement des activités…')}</p>}
  {!error&&rows.length===0&&!loading&&<p className="mykioo-activity-empty">{tr('No recorded activity matches these filters.','Aucune activité enregistrée ne correspond à ces filtres.')}</p>}
  <div className="mykioo-activity-events">{rows.map(event=>{
   const Icon=iconFor(event.entity_type,event.action),open=expanded.includes(event.id);
   const label=ACTION_NAMES[event.action]?.[fr?1:0]||titleCase(event.action);
   const details=safeDetails(event,language);
   return <article className="mykioo-activity-event" key={event.id}>
    <div className="mykioo-activity-event-icon"><Icon size={20}/></div>
    <div className="mykioo-activity-event-body">
     <div className="mykioo-activity-event-title"><strong>{label}</strong><time dateTime={event.created_at}>{fmt(event.created_at,language)}</time></div>
     <div className="mykioo-activity-event-meta">
      <span><b>{tr('By','Par')}:</b> {displayName(event.actor_name,event.actor_id?tr('Unknown account','Compte inconnu'):tr('System / not recorded','Système / non enregistré'))}</span>
      {event.subject_name&&<span><b>{tr('Member','Membre')}:</b> {event.subject_name}</span>}
      <span><b>{tr('Category','Catégorie')}:</b> {ENTITY_NAMES[event.entity_type]?.[fr?1:0]||titleCase(event.entity_type)}</span>
     </div>
     <button type="button" className="mykioo-activity-detail-toggle" aria-expanded={open} onClick={()=>toggleDetails(event.id)}>
      {open?tr('Hide details','Masquer les détails'):tr('Details','Détails')}{open?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
     </button>
     {open&&<div className="mykioo-activity-detail">
      {details.map(([key,value])=><div key={key}><span>{key}</span><strong>{value}</strong></div>)}
      <div><span>{tr('Record reference','Référence du dossier')}</span><code>{event.entity_id||'—'}</code></div>
      <div><span>{tr('Event number','Numéro de l’événement')}</span><code>{event.id}</code></div>
      {details.length===0&&<p>{tr('No additional non-sensitive details were recorded.','Aucun autre détail non sensible n’a été enregistré.')}</p>}
     </div>}
    </div>
   </article>;
  })}</div>
  {rows.length>0&&<div className="mykioo-activity-bottom">
   <small>{tr('Showing','Affichage de')} {rows.length} / {total}</small>
   {rows.length<total&&<button type="button" onClick={()=>setPage(v=>v+1)} disabled={loading}>{loading?tr('Loading…','Chargement…'):tr('Load older events','Charger les événements plus anciens')}</button>}
  </div>}
 </section>;
}
