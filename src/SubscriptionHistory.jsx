import React,{useEffect,useMemo,useState} from 'react';
import {History,CalendarClock,CheckCircle2,Clock3,RotateCcw,Search,Layers3} from 'lucide-react';

const requestStatuses={
 pending:['Pending review','En attente de traitement'],
 in_review:['Being reviewed','En cours de traitement'],
 fulfilled:['Completed','Terminée'],
 declined:['Declined','Refusée']
};
const serviceStatuses={
 pending:['Pending','En attente'],
 active:['Active','Actif'],
 expired:['Expired','Expiré'],
 suspended:['Suspended','Suspendu'],
 cancelled:['Cancelled','Annulé']
};
const dayLabels={
 30:['1 month','1 mois'],
 90:['3 months','3 mois'],
 183:['6 months','6 mois'],
 365:['1 year','1 an'],
 730:['2 years','2 ans']
};
const asTime=(value)=>{const parsed=Date.parse(value||'');return Number.isFinite(parsed)?parsed:0};
export default function SubscriptionHistory({requests=[],subscriptions=[],language='en',owner=false}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [filter,setFilter]=useState('all'),[term,setTerm]=useState(''),[limit,setLimit]=useState(12);
 const dateText=(value)=>value&&asTime(value)?new Date(value).toLocaleDateString(fr?'fr-CA':'en-CA',{year:'numeric',month:'short',day:'numeric'}):'—';
 const duration=(days)=>dayLabels[days]?.[fr?1:0]||((days||'—')+' '+tr('days','jours'));
 const relatedSubscriptions=useMemo(()=>new Map(subscriptions.map(s=>[s.id,s])),[subscriptions]);
 const history=useMemo(()=>{
  const requestRecords=requests.map(r=>{
   const renewal=r.request_type==='renewal';
   const linked=relatedSubscriptions.get(r.subscription_id||r.renewal_subscription_id);
   const lastChanged=r.status!=='pending'&&(r.updated_at||r.created_at);
   return {key:'r:'+r.id,kind:'request',group:renewal?'renewals':'new',date:lastChanged||r.created_at,record:r,linked,
    name:r.service_name||linked?.service_name||'Subscription',
    status:r.status,renewal};
  });
  const serviceRecords=subscriptions.map(s=>({
   key:'s:'+s.id,kind:'service',group:'services',date:s.created_at||s.starts_at||s.updated_at,
   record:s,name:s.service_name||'Subscription',status:s.status,renewal:false
  }));
  return [...requestRecords,...serviceRecords].sort((a,b)=>asTime(b.date)-asTime(a.date));
 },[requests,subscriptions,relatedSubscriptions]);
 const pending=requests.filter(r=>['pending','in_review'].includes(r.status)).length;
 const completed=requests.filter(r=>r.status==='fulfilled').length;
 const completedRenewals=requests.filter(r=>r.request_type==='renewal'&&r.status==='fulfilled').length;
 const active=subscriptions.filter(s=>s.status==='active').length;
 const list=history.filter(item=>{
  if(filter==='requests'&&item.kind!=='request')return false;
  if(filter==='renewals'&&item.group!=='renewals')return false;
  if(filter==='services'&&item.kind!=='service')return false;
  const query=term.trim().toLocaleLowerCase();
  return !query||[item.name,item.status,item.record?.notes,
    item.linked?.service_name,item.record?.service_name].some(v=>String(v||'').toLocaleLowerCase().includes(query));
 });
 useEffect(()=>setLimit(12),[filter,term]);
 return <section className="mykioo-subscription-history">
  <div className="mykioo-history-heading">
   <History size={23}/>
   <div><h2>{owner?tr('Selected account history','Historique du compte sélectionné'):tr('Subscription history','Historique des abonnements')}</h2>
    <p>{tr('Track new requests, renewals, and current or past service records in one place.','Suivez les nouvelles demandes, les renouvellements et les services actuels ou passés au même endroit.')}</p>
   </div>
  </div>
  <div className="mykioo-history-stats">
   <div><Clock3 size={17}/><strong>{pending}</strong><span>{tr('Requests waiting','Demandes en attente')}</span></div>
   <div><CheckCircle2 size={17}/><strong>{completed}</strong><span>{tr('Completed requests','Demandes terminées')}</span></div>
   <div><RotateCcw size={17}/><strong>{completedRenewals}</strong><span>{tr('Renewals completed','Renouvellements terminés')}</span></div>
   <div><Layers3 size={17}/><strong>{active}</strong><span>{tr('Active services','Services actifs')}</span></div>
  </div>
  <div className="mykioo-history-toolbar">
   <label className="mykioo-history-search"><Search size={16}/>
    <input type="search" value={term} onChange={e=>setTerm(e.target.value)}
     placeholder={tr('Search history…','Rechercher dans l’historique…')}
     aria-label={tr('Search subscription history','Rechercher dans l’historique des abonnements')}/>
   </label>
   <label className="mykioo-history-filter">
    <span>{tr('Show','Afficher')}</span>
    <select value={filter} onChange={e=>setFilter(e.target.value)}
     aria-label={tr('Filter subscription history','Filtrer l’historique des abonnements')}>
     <option value="all">{tr('All activity','Toute l’activité')}</option>
     <option value="requests">{tr('New & renewal requests','Demandes nouvelles et renouvellements')}</option>
     <option value="renewals">{tr('Renewals only','Renouvellements seulement')}</option>
     <option value="services">{tr('Service records','Dossiers de service')}</option>
    </select>
   </label>
  </div>
  {list.length===0?<div className="mykioo-history-empty">
   <CalendarClock size={22}/>
   <strong>{history.length===0?tr('No subscription activity yet','Aucune activité d’abonnement pour le moment'):
    tr('No records match these filters','Aucune donnée ne correspond aux filtres')}</strong>
   <p>{history.length===0?tr('Subscription requests and service information will appear here as they are created.','Les demandes et les renseignements de service apparaîtront ici dès leur création.'):
    tr('Try another filter or search term.','Essayez un autre filtre ou terme de recherche.')}</p>
  </div>:
  <div className="mykioo-history-list">
   {list.slice(0,limit).map(item=>{
    const r=item.record;
    const status=item.kind==='service'?serviceStatuses[item.status]:requestStatuses[item.status];
    const renew=item.group==='renewals';
    return <article key={item.key} className="mykioo-history-item">
     <div className={'mykioo-history-symbol '+(renew?'renewal':item.kind==='service'?'service':'new')}>
      {renew?<RotateCcw size={18}/>:item.kind==='service'?<Layers3 size={18}/>:<CalendarClock size={18}/>}
     </div>
     <div className="mykioo-history-info">
      <div className="mykioo-history-title-line">
       <strong>{item.kind==='service'?tr('Service record','Dossier de service'):
          renew?tr('Renewal request','Demande de renouvellement'):
          tr('New subscription request','Demande de nouvel abonnement')}</strong>
       <span className={'mykioo-history-status '+(item.status||'')}>{status?.[fr?1:0]||item.status||'—'}</span>
      </div>
      <span className="mykioo-history-service-name">{item.name}</span>
      <small>{dateText(item.date)} · {item.kind==='service'?tr('Service record created','Dossier de service créé'):
       ['fulfilled','declined','in_review'].includes(item.status)?tr('Last status update','Dernière mise à jour du statut'):
       tr('Request submitted','Demande envoyée')}</small>
      <div className="mykioo-history-details">
       {item.kind==='request'?<>
        <span><b>{tr('Duration requested','Durée demandée')}:</b> {duration(r.contract_days)}</span>
        {r.status==='fulfilled'&&(r.completed_at||r.updated_at)&&<span><b>{tr('Completed','Terminée')}:</b> {dateText(r.completed_at||r.updated_at)}</span>}
        {r.notes&&<span className="mykioo-history-notes"><b>{tr('Request notes','Notes de la demande')}:</b> {r.notes}</span>}
        {item.linked&&<span><b>{tr('Linked service','Service associé')}:</b> {item.linked.service_name||tr('Subscription','Abonnement')}</span>}
        {renew&&r.status==='fulfilled'&&r.renewed_expires_at&&<div className="mykioo-history-expiry-snapshot">
         <span><b>{tr('Previous expiration','Expiration précédente')}:</b> {r.previous_expires_at?dateText(r.previous_expires_at):tr('Not previously recorded','Non enregistrée auparavant')}</span>
         <span><b>{tr('Expiration after renewal','Expiration après le renouvellement')}:</b> {dateText(r.renewed_expires_at)}</span>
         {r.previous_expires_at&&<span><b>{tr('Expiration moved by','Date d’expiration repoussée de')}:</b> +{Math.round((asTime(r.renewed_expires_at)-asTime(r.previous_expires_at))/86400000)} {tr('days','jours')}</span>}
        </div>}
        {renew&&r.status==='fulfilled'&&!r.renewed_expires_at&&<span className="mykioo-history-legacy-note">{tr('Historical before/after dates were not recorded for this older renewal.','Les dates avant/après n’avaient pas été enregistrées pour cet ancien renouvellement.')}</span>}
        {renew&&item.linked?.expires_at&&<span><b>{tr('Current expiration','Expiration actuelle')}:</b> {dateText(item.linked.expires_at)}</span>}
       </>:<>
        {r.contract_days&&<span><b>{tr('Plan duration','Durée du forfait')}:</b> {duration(r.contract_days)}</span>}
        <span><b>{tr('Start','Début')}:</b> {dateText(r.starts_at)}</span>
        <span><b>{tr('Current expiry date','Date d’expiration actuelle')}:</b> {dateText(r.expires_at)}</span>
       </>}
      </div>
     </div>
    </article>;
   })}
   {list.length>limit&&<button type="button" className="mykioo-history-more" onClick={()=>setLimit(x=>x+12)}>
    {tr('Show 12 more records','Afficher 12 données supplémentaires')} ({list.length-limit} {tr('remaining','restantes')})
   </button>}
  </div>}
  <p className="mykioo-history-footnote">{tr('From now on, completed renewals preserve the before/after expiration dates. Older renewals without saved dates are marked as historical records.','Désormais, les renouvellements terminés conservent les dates d’expiration avant et après. Les anciens renouvellements sans dates enregistrées sont indiqués comme données historiques.')}</p>
 </section>;
}
