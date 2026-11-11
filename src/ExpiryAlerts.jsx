import React from 'react';
import {AlertTriangle,Clock3} from 'lucide-react';

export function ExpiryAlerts({subscriptions=[],members=[],language='en',owner=false,onOpen}){
 const fr=language==='fr',tr=(en,frText)=>fr?frText:en;
 const midnight=Date.UTC(new Date().getUTCFullYear(),new Date().getUTCMonth(),new Date().getUTCDate());
 const due=subscriptions.filter(s=>s.expires_at&&['active','expired'].includes(s.status)).map(s=>{
   const d=new Date(s.expires_at),date=Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),d.getUTCDate());
   return {...s,daysLeft:Math.round((date-midnight)/86400000)};
 }).filter(s=>s.daysLeft<=30).sort((a,b)=>a.daysLeft-b.daysLeft);
 if(!due.length)return null;
 const total=due.filter(s=>s.daysLeft<0).length;
 return <section className="mykioo-expiry-alerts" aria-label={tr('Subscription expiration alerts','Alertes d’expiration des abonnements')}>
   <div className="mykioo-expiry-alerts-heading"><AlertTriangle size={20}/><div>
    <h2>{owner?tr('Subscriptions requiring attention','Abonnements nécessitant votre attention'):tr('Subscription renewal reminder','Rappel de renouvellement')}</h2>
    <p>{owner?tr('Subscriptions expired or expiring within 30 days.','Abonnements expirés ou expirant dans les 30 prochains jours.'):
      tr('Your service is approaching its expiration date. Request a renewal to continue.','Votre service approche de sa date d’expiration. Demandez un renouvellement pour continuer.')}</p>
    </div></div>
   {due.slice(0,owner?12:10).map(s=>{
    const member=members.find(m=>m.user_id===s.member_id);
    const label=s.daysLeft<0?tr('Expired','Expiré'):s.daysLeft===0?tr('Expires today',"Expire aujourd’hui"):s.daysLeft===1?tr('1 day remaining','1 jour restant'):tr(s.daysLeft+' days remaining',s.daysLeft+' jours restants');
    return <div key={s.id} className={'mykioo-expiry-alert '+(s.daysLeft<=1?'urgent':'')}>
      <Clock3 size={17}/><span><strong>{s.service_name||tr('Service','Service')}</strong>{owner&&<small>{member?.display_name||member?.email||tr('Member','Membre')}</small>}</span>
      <span className="mykioo-expiry-count">{label}</span>
    </div>;
   })}
   {due.length>(owner?12:10)&&<small>{tr('Additional subscriptions also require attention.','D’autres abonnements nécessitent également votre attention.')}</small>}
   {onOpen&&<button type="button" onClick={onOpen}>{owner?tr('Manage subscriptions','Gérer les abonnements'):tr('View subscriptions / Renew','Voir les abonnements / Renouveler')}</button>}
 </section>;
}
