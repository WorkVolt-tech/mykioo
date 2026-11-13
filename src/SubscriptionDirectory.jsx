import React,{useMemo,useState} from 'react';
import {CalendarDays,ChevronDown,ChevronUp,Search,Layers3} from 'lucide-react';
import PasswordReveal from './PasswordReveal';
import './SubscriptionDirectory.css';

const statusLabels={
 active:['Active','Actif'],
 pending:['Pending','En attente'],
 expired:['Expired','Expiré'],
 suspended:['Suspended','Suspendu'],
 cancelled:['Cancelled','Annulé']
};
const priority={active:0,pending:1,suspended:2,expired:3,cancelled:4};
const normalized=value=>String(value??'').trim().toLocaleLowerCase();
const displayDate=(value,fr)=>{
 if(!value)return '—';
 const date=new Date(value);
 return Number.isNaN(date.getTime())?'—':date.toLocaleDateString(fr?'fr-CA':'en-CA');
};

export default function SubscriptionDirectory({
 subscriptions=[],members=[],language='en',owner=false,onEdit
}){
 const fr=language==='fr';
 const tr=(en,french)=>fr?french:en;
 const [open,setOpen]=useState(Boolean(owner)),[search,setSearch]=useState(''),[expandedId,setExpandedId]=useState(null);
 const membersById=useMemo(()=>new Map(members.map(m=>[m.user_id,m])),[members]);
 const visible=useMemo(()=>{
  const q=normalized(search);
  return subscriptions.filter(sub=>{
   if(!q)return true;
   const member=membersById.get(sub.member_id);
   return [
    sub.service_name,sub.service_username,sub.supplier_reference,
    member?.display_name,member?.email,member?.user_id
   ].some(value=>normalized(value).includes(q));
  }).sort((a,b)=>{
   const status=(priority[a.status]??9)-(priority[b.status]??9);
   if(status!==0)return status;
   const expiryA=a.expires_at?Date.parse(a.expires_at):Infinity;
   const expiryB=b.expires_at?Date.parse(b.expires_at):Infinity;
   return expiryA-expiryB;
  });
 },[subscriptions,search,membersById]);
 const expanded=open||search.trim().length>0;
 function toggleDirectory(){
  if(expanded){setOpen(false);setSearch('');setExpandedId(null);}
  else setOpen(true);
 }
 const countActive=subscriptions.filter(s=>s.status==='active').length;
 return <section className="mykioo-directory" aria-label={owner?tr('Member subscriptions','Abonnements des membres'):tr('My subscriptions','Mes abonnements')}>
  <div className="mykioo-directory-head">
   <div className="mykioo-directory-heading">
    <Layers3 size={22} aria-hidden="true"/>
    <div>
     <h2>{owner?tr('Member subscriptions','Abonnements des membres'):tr('My subscriptions','Mes abonnements')}</h2>
     <p>{subscriptions.length} {tr('total','au total')} · {countActive} {tr('active','actifs')}</p>
    </div>
   </div>
   <button type="button" className="mykioo-directory-toggle" onClick={toggleDirectory} aria-expanded={expanded}>
    {expanded?tr('Hide subscriptions','Masquer les abonnements'):tr('View subscriptions','Voir les abonnements')}
    {expanded?<ChevronUp size={17}/>:<ChevronDown size={17}/>}
   </button>
  </div>
  <label className="mykioo-directory-search">
   <Search size={18} aria-hidden="true"/>
   <span className="mykioo-directory-sr-only">{tr('Search subscriptions','Rechercher des abonnements')}</span>
   <input type="search" value={search} onChange={event=>setSearch(event.target.value)}
    placeholder={owner?
     tr('Search provider reference, service login, customer name…','Référence du fournisseur, identifiant, nom du client…'):
     tr('Search service, login or reference…','Rechercher par service, identifiant ou référence…')}
    aria-label={tr('Search subscriptions','Rechercher des abonnements')}/>
  </label>
  {expanded&&<div className="mykioo-directory-results">
   <p className="mykioo-directory-results-count" aria-live="polite">
    {visible.length} {tr('subscription(s) found','abonnement(s) trouvé(s)')}
   </p>
   {visible.length===0?<p className="mykioo-directory-empty">{search?
     tr('No matching subscriptions. Try another name, username or reference.','Aucun résultat. Essayez un autre nom, identifiant ou référence.'):
     tr('No subscriptions yet.','Aucun abonnement pour le moment.')}</p>:
    visible.map(sub=>{
     const customer=membersById.get(sub.member_id);
     const name=customer?.display_name||customer?.email||tr('Member','Membre');
     const isExpanded=expandedId===sub.id;
     const status=statusLabels[sub.status]?.[fr?1:0]||sub.status;
     return <article className="mykioo-directory-item" key={sub.id}>
      <button type="button" className="mykioo-directory-item-toggle"
       aria-expanded={isExpanded} aria-controls={'mykioo-sub-detail-'+sub.id}
       onClick={()=>setExpandedId(isExpanded?null:sub.id)}>
       <span className="mykioo-directory-item-main">
        <strong>{sub.service_name||tr('Unnamed service','Service sans nom')}</strong><small>{sub.device_count||1} {tr('device(s)','appareil(s)')}</small>
        {owner&&<small>{name}</small>}
       </span>
       <span className="mykioo-directory-item-meta">
        <span className={'mykioo-directory-status status-'+sub.status}>{status}</span>
        <span className="mykioo-directory-expiry"><CalendarDays size={14}/>{tr('Expires','Expire')} {displayDate(sub.expires_at,fr)}</span>
       </span>
       {isExpanded?<ChevronUp className="mykioo-directory-chevron" size={19}/>:<ChevronDown className="mykioo-directory-chevron" size={19}/>}
      </button>
      {isExpanded&&<div className="mykioo-directory-details" id={'mykioo-sub-detail-'+sub.id}>
       {owner&&<div className="mykioo-directory-detail"><span>{tr('Customer name','Nom du client')}</span><strong>{name}</strong></div>}
       {owner&&customer?.email&&<div className="mykioo-directory-detail"><span>{tr('Customer email','Courriel du client')}</span><strong>{customer.email}</strong></div>}
       <div className="mykioo-directory-detail"><span>{tr('Devices','Appareils')}</span><strong>{sub.device_count||1}</strong></div>
       <div className="mykioo-directory-detail"><span>{tr('Service login username','Identifiant du service')}</span><strong>{sub.service_username||'—'}</strong></div>
       {owner&&<div className="mykioo-directory-detail"><span>{tr('Provider reference','Référence du fournisseur')}</span><strong>{sub.supplier_reference||'—'}</strong></div>}
       <div className="mykioo-directory-detail"><span>{tr('Start date','Date de début')}</span><strong>{displayDate(sub.starts_at,fr)}</strong></div>
       <div className="mykioo-directory-detail"><span>{tr('Expiry date','Date d’expiration')}</span><strong>{displayDate(sub.expires_at,fr)}</strong></div>
       {sub.contract_days&&<div className="mykioo-directory-detail"><span>{tr('Contract duration','Durée du contrat')}</span><strong>{sub.contract_days} {tr('days','jours')}</strong></div>}
       {owner?<>
        <div className="mykioo-directory-detail"><span>{tr('Saved password','Mot de passe enregistré')}</span><strong>{sub.has_password?tr('Yes','Oui'):tr('No','Non')}</strong></div>
        {onEdit&&<button className="mykioo-directory-edit" type="button" onClick={()=>onEdit(sub)}>{tr('Edit subscription','Modifier l’abonnement')}</button>}
       </>:<PasswordReveal subscription={sub} language={language}/>}
      </div>}
     </article>;
    })}
  </div>}
 </section>;
}
