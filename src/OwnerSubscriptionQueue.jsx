import React,{useMemo,useState} from 'react';
import {AlertTriangle,ArrowDownRight,CheckCheck,Clock3,ClipboardList,RotateCcw,Search,ShieldCheck} from 'lucide-react';

const categories=[
 {id:'cancellations',en:'Cancellation approvals',fr:'Annulations à approuver',Icon:AlertTriangle},
 {id:'activated',en:'Activated — paperwork pending',fr:'Activés — dossier à terminer',Icon:ShieldCheck},
 {id:'renewals',en:'Renewals to process',fr:'Renouvellements à traiter',Icon:RotateCcw},
 {id:'new',en:'New requests to process',fr:'Nouvelles demandes à traiter',Icon:ClipboardList}
];
const dateMs=value=>{const n=Date.parse(value||'');return Number.isFinite(n)?n:0};

export default function OwnerSubscriptionQueue({requests=[],cancellations=[],members=[],language='en'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [filter,setFilter]=useState('all'),[search,setSearch]=useState(''),[limit,setLimit]=useState(12);
 const memberNames=useMemo(()=>new Map(members.map(m=>[
  m.user_id,m.display_name||m.email||tr('Account','Compte')
 ])),[members,language]);
 const items=useMemo(()=>{
  const requestsById=new Map(requests.map(r=>[r.id,r]));
  const pendingCancellations=cancellations.filter(c=>c.status==='pending');
  const cancellationIds=new Set(pendingCancellations.map(c=>c.request_id));
  const queue=pendingCancellations.map(c=>{
   const r=requestsById.get(c.request_id);
   return {id:'cancel:'+c.request_id,requestId:c.request_id,category:'cancellations',
    memberId:c.member_id,service:r?.service_name||tr('Subscription request','Demande d’abonnement'),
    requestStatus:r?.status||'unknown',date:c.created_at,
    targetId:'mykioo-cancel-approval-'+c.request_id};
  });
  for(const r of requests){
   if(!['pending','in_review'].includes(r.status)||cancellationIds.has(r.id))continue;
   const category=r.service_activated_at?'activated':r.request_type==='renewal'?'renewals':'new';
   queue.push({id:'request:'+r.id,requestId:r.id,category,
    memberId:r.member_id,service:r.service_name||tr('Subscription request','Demande d’abonnement'),
    requestStatus:r.status,date:r.service_activated_at||r.created_at,
    targetId:'mykioo-process-request-'+r.id});
  }
  const order=new Map(categories.map((cat,i)=>[cat.id,i]));
  return queue.sort((a,b)=>(order.get(a.category)-order.get(b.category))
    ||(dateMs(a.date)-dateMs(b.date))||a.id.localeCompare(b.id));
 },[requests,cancellations,language]);
 const counts=Object.fromEntries(categories.map(cat=>[cat.id,items.filter(x=>x.category===cat.id).length]));
 const results=items.filter(item=>{
  if(filter!=='all'&&item.category!==filter)return false;
  const term=search.trim().toLocaleLowerCase();
  return !term||[item.service,memberNames.get(item.memberId),item.requestId].some(value=>
   String(value||'').toLocaleLowerCase().includes(term));
 });
 function chooseFilter(category){setFilter(category);setLimit(12)}
 function jumpTo(item){
  const target=document.getElementById(item.targetId);
  if(!target)return;
  target.scrollIntoView({behavior:'smooth',block:'center'});
  target.focus({preventScroll:true});
 }
 const categoryText=id=>{
  const cat=categories.find(x=>x.id===id);
  return cat?tr(cat.en,cat.fr):id;
 };
 const actionText=id=>({
  cancellations:tr('Review cancellation','Examiner l’annulation'),
  activated:tr('Finish subscription','Terminer l’abonnement'),
  renewals:tr('Process renewal','Traiter le renouvellement'),
  new:tr('Process request','Traiter la demande')
 })[id];
 return <section className="mykioo-owner-sub-queue" aria-labelledby="mykioo-owner-sub-queue-heading">
  <div className="mykioo-owner-sub-queue-header">
   <div className="mykioo-owner-sub-queue-icon"><CheckCheck size={21}/></div>
   <div>
    <h2 id="mykioo-owner-sub-queue-heading">{tr('Subscription processing queue','File de traitement des abonnements')}</h2>
    <p>{tr('Prioritized work awaiting your action. Cancellation approvals come first, followed by activated services needing paperwork, renewals and new requests.','Travail priorisé en attente de votre intervention. Les annulations à approuver passent d’abord, puis les services activés dont le dossier reste à terminer, les renouvellements et les nouvelles demandes.')}</p>
   </div>
  </div>
  <div className="mykioo-owner-sub-queue-counts" role="group" aria-label={tr('Filter by priority','Filtrer selon la priorité')}>
   {categories.map(cat=><button key={cat.id} type="button"
    className={'mykioo-owner-sub-queue-count '+(filter===cat.id?'selected':'')}
    aria-pressed={filter===cat.id} onClick={()=>chooseFilter(filter===cat.id?'all':cat.id)}>
    <cat.Icon size={17}/><strong>{counts[cat.id]||0}</strong><span>{tr(cat.en,cat.fr)}</span>
   </button>)}
  </div>
  <div className="mykioo-owner-sub-queue-controls">
   <label className="mykioo-owner-sub-queue-search">
    <Search size={15}/>
    <input type="search" value={search} onChange={e=>{setSearch(e.target.value);setLimit(12)}}
     placeholder={tr('Search service or member…','Rechercher un service ou un membre…')}
     aria-label={tr('Search processing queue','Rechercher dans la file de traitement')}/>
   </label>
   <button type="button" className="mykioo-owner-sub-queue-reset" disabled={filter==='all'&&!search}
    onClick={()=>{setFilter('all');setSearch('');setLimit(12)}}>
    {tr('Show all','Tout afficher')} ({items.length})
   </button>
  </div>
  {results.length===0?<div className="mykioo-owner-sub-queue-empty">
   <CheckCheck size={21}/>
   <strong>{items.length===0?tr('Nothing awaiting processing','Aucune demande à traiter'):
    tr('No work matches these filters','Aucun dossier ne correspond aux filtres')}</strong>
   <span>{items.length===0?tr('New requests and cancellation approvals will appear here automatically.','Les nouvelles demandes et les annulations à approuver apparaîtront ici automatiquement.'):
    tr('Try another search or select Show all.','Essayez une autre recherche ou Tout afficher.')}</span>
  </div>:<div className="mykioo-owner-sub-queue-list">
   {results.slice(0,limit).map((item,i)=>{
    const cat=categories.find(x=>x.id===item.category);
    return <article key={item.id} className={'mykioo-owner-sub-queue-item priority-'+item.category}>
     <div className="mykioo-owner-sub-queue-rank">{String(i+1).padStart(2,'0')}</div>
     <div className="mykioo-owner-sub-queue-item-body">
      <span className="mykioo-owner-sub-queue-kind"><cat.Icon size={14}/>{categoryText(item.category)}</span>
      <strong>{item.service}</strong>
      <small>{memberNames.get(item.memberId)||tr('Account','Compte')} · {item.date?new Date(item.date).toLocaleDateString(fr?'fr-CA':'en-CA'):'—'}</small>
      {item.category==='cancellations'&&<p>{tr('Owner approval required; do not approve if service is already activated.','Approbation du propriétaire requise; ne pas approuver si le service est déjà activé.')}</p>}
      {item.category==='activated'&&<p>{tr('Service activation recorded; finish entering the subscription details.','Activation du service enregistrée; terminez les détails de l’abonnement.')}</p>}
     </div>
     <button type="button" className="mykioo-owner-sub-queue-open"
      onClick={()=>jumpTo(item)}
      aria-label={actionText(item.category)+': '+item.service}>
      {actionText(item.category)} <ArrowDownRight size={16}/>
     </button>
    </article>;
   })}
   {results.length>limit&&<button type="button" className="mykioo-owner-sub-queue-more"
    onClick={()=>setLimit(value=>value+12)}>
    {tr('Show more requests','Afficher plus de demandes')} ({results.length-limit})
   </button>}
  </div>}
  <p className="mykioo-owner-sub-queue-note">
   <Clock3 size={14}/>{tr('This queue uses existing records and opens the original owner controls; it never automatically completes or cancels an order.','Cette file utilise les dossiers existants et ouvre les contrôles du propriétaire; elle ne termine et n’annule jamais automatiquement une commande.')}
  </p>
 </section>;
}
