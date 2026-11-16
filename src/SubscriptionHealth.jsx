import React from 'react';
import {CalendarDays, Clock3, Monitor, ArrowRight, ShieldCheck, AlertTriangle} from 'lucide-react';
import './SubscriptionHealth.css';

const validDate=value=>{if(!value)return null;const d=new Date(value);return Number.isFinite(d.getTime())?d:null};
const daysUntil=(expiry,now)=>Math.max(0,Math.ceil((expiry.getTime()-now.getTime())/86400000));

export default function SubscriptionHealth({subscriptions=[],language='en',onView,onRenew}){
 const fr=language==='fr';
 const tr=(en,frText)=>fr?frText:en;
 const now=new Date();
 const formatDate=value=>{const d=validDate(value);return d?d.toLocaleDateString(fr?'fr-CA':'en-CA',{year:'numeric',month:'short',day:'numeric'}):'—'};
 const active=subscriptions.filter(s=>s.status==='active');
 const awaiting=subscriptions.filter(s=>s.status==='pending');
 const relevant=active.length?active:awaiting;
 const sorted=[...relevant].sort((a,b)=>{
  const aTime=validDate(a.expires_at)?.getTime()??Infinity;
  const bTime=validDate(b.expires_at)?.getTime()??Infinity;
  return aTime-bTime;
 });
 const upcoming=active.filter(s=>{const d=validDate(s.expires_at);return d&&d.getTime()>now.getTime()&&daysUntil(d,now)<=30}).length;
 const expiredByDate=active.filter(s=>{const d=validDate(s.expires_at);return d&&d.getTime()<=now.getTime()}).length;
 return <section className="mykioo-health" aria-label={tr('Subscription health','État des abonnements')}>
  <div className="mykioo-health-heading">
   <div><span className="mykioo-health-kicker"><ShieldCheck size={15}/>{tr('SUBSCRIPTION HEALTH','SUIVI DES ABONNEMENTS')}</span>
    <h2>{tr('Your services at a glance','Vos services en un coup d’œil')}</h2>
    <p>{tr('Check your subscription status, devices and renewal dates.','Consultez l’état de vos abonnements, vos appareils et vos dates de renouvellement.')}</p>
   </div>
   <button type="button" onClick={onView} className="mykioo-health-outline">{tr('View all','Tout voir')} <ArrowRight size={16}/></button>
  </div>
  <div className="mykioo-health-stats">
   <div><span>{tr('Active subscriptions','Abonnements actifs')}</span><strong>{active.length}</strong></div>
   <div><span>{tr('Renewal within 30 days','Renouvellement sous 30 jours')}</span><strong>{upcoming}</strong></div>
   <div><span>{tr('Devices on active plans','Appareils sur forfaits actifs')}</span><strong>{active.reduce((sum,s)=>sum+(Number(s.device_count)>0?Number(s.device_count):0),0)}</strong></div>
  </div>
  {sorted.length===0?<div className="mykioo-health-empty">
   <CalendarDays size={21}/>
   <div><strong>{tr('No active subscription yet','Aucun abonnement actif pour le moment')}</strong>
    <p>{tr('Once your service is activated, its dates and device allowance will appear here.','Une fois votre service activé, ses dates et son nombre d’appareils apparaîtront ici.')}</p>
   </div>
   <button type="button" onClick={onRenew}>{tr('Request a service','Demander un service')}</button>
  </div>:<div className="mykioo-health-plans">
   {sorted.slice(0,3).map(s=>{
    const expiry=validDate(s.expires_at);
    const isActive=s.status==='active';
    const expired=isActive&&expiry&&expiry.getTime()<=now.getTime();
    const remaining=isActive&&expiry&&!expired?daysUntil(expiry,now):null;
    const nearing=remaining!==null&&remaining<=30;
    const isTrial=s.contract_days===1;
    const urgency=expired?'expired':nearing?'soon':isActive?'good':'pending';
    return <article className={'mykioo-health-plan '+urgency} key={s.id}>
     <div className="mykioo-health-plan-top"><div><strong>{s.service_name||tr('MYKIOO service','Service MYKIOO')}</strong><small>{isTrial?tr('24-hour free trial','Essai gratuit de 24 heures'):s.contract_days?tr(s.contract_days+'-day plan','Forfait de '+s.contract_days+' jours'):tr('Subscription','Abonnement')}</small></div>
      <span className={'mykioo-health-pill '+urgency}>{!isActive?tr('Pending activation','Activation en attente'):expired?tr('Date passed','Date dépassée'):nearing?tr('Renewal approaching','Renouvellement proche'):tr('Active','Actif')}</span>
     </div>
     <div className="mykioo-health-plan-details">
      <div><CalendarDays size={16}/><span>{tr('Expires','Expire le')}</span><strong>{formatDate(s.expires_at)}</strong></div>
      <div><Monitor size={16}/><span>{tr('Devices allowed','Appareils autorisés')}</span><strong>{Number(s.device_count)>0?s.device_count:'—'}</strong></div>
      <div><Clock3 size={16}/><span>{tr('Time remaining','Temps restant')}</span>
       <strong>{!isActive?tr('Awaiting activation','En attente d’activation'):!expiry?tr('Date unavailable','Date indisponible'):expired?tr('Expiration reached','Date d’expiration atteinte'):isTrial?tr('Less than '+remaining+' day(s)','Moins de '+remaining+' jour(s)'):remaining===1?tr('1 day','1 jour'):tr(remaining+' days',remaining+' jours')}</strong>
      </div>
     </div>
     {isActive&&expiry&&<div className="mykioo-health-track" aria-label={tr('Subscription time elapsed','Temps écoulé de l’abonnement')}>
       <span style={{width:(()=>{const start=validDate(s.starts_at);if(!start||start>=expiry)return '0%';return Math.max(0,Math.min(100,((now-start)/(expiry-start))*100))+'%'})()}}/>
      </div>}
     {nearing||expired?<div className="mykioo-health-reminder"><AlertTriangle size={16}/>{expired?tr('The recorded expiry date has passed. Confirm your status or request renewal.','La date d’expiration enregistrée est dépassée. Vérifiez votre statut ou demandez un renouvellement.'):tr('Your renewal window is approaching.','Votre période de renouvellement approche.')}</div>:null}
     <button type="button" className="mykioo-health-plan-action" onClick={nearing||expired?onRenew:onView}>{nearing||expired?tr('Renew subscription','Renouveler l’abonnement'):tr('Subscription details','Détails de l’abonnement')} <ArrowRight size={15}/></button>
    </article>;
   })}
  </div>}
  {sorted.length>3&&<button type="button" className="mykioo-health-more" onClick={onView}>{tr('View '+(sorted.length-3)+' more subscription(s)','Voir '+(sorted.length-3)+' abonnement(s) de plus')} <ArrowRight size={15}/></button>}
  {expiredByDate>0&&<p className="mykioo-health-footnote">{tr('A subscription may still be marked active in your account after its recorded expiry. Contact support if the information looks incorrect.','Un abonnement peut encore être indiqué comme actif après sa date d’expiration enregistrée. Contactez l’assistance si ces informations sont incorrectes.')}</p>}
 </section>;
}
