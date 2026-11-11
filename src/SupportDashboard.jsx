import React,{useCallback,useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,Clock3,Headphones,RefreshCw,Timer,TrendingUp,ArrowUpRight} from 'lucide-react';
import {supabase} from './supabase';

const thresholds=[12,24,48,72];
const initial={total:0,open:0,new_open:0,in_progress:0,urgent:0,high:0,overdue:0,
 awaiting_first_reply:0,resolved:0,closed:0,completed:0,new_last_7d:0,
 replied_count:0,avg_first_reply_hours:null,oldest_unanswered:[],generated_at:null};

function elapsed(hours,fr){
 if(hours===null||hours===undefined||!Number.isFinite(Number(hours)))return '—';
 const n=Number(hours);
 if(n<1)return Math.round(n*60)+' min';
 if(n<24)return n.toLocaleString(fr?'fr-CA':'en-CA',{maximumFractionDigits:1})+' h';
 return (n/24).toLocaleString(fr?'fr-CA':'en-CA',{maximumFractionDigits:1})+(fr?' j':' d');
}

export default function SupportDashboard({language='en',compact=false,onOpenSupport,onViewTicket}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [threshold,setThreshold]=useState(24),[data,setData]=useState(null),[loading,setLoading]=useState(true),[error,setError]=useState(false);
 const load=useCallback(async()=>{
  if(!supabase)return;
  try{
   const {data:result,error:fetchError}=await supabase.rpc('mykioo_support_dashboard',{p_overdue_hours:threshold});
   if(fetchError)throw fetchError;
   if(result&&typeof result==='object'){setData(result);setError(false)}
  }catch(err){
   console.warn('MYKIOO support metrics unavailable',err?.message||err);
   setError(true);
  }finally{setLoading(false)}
 },[threshold]);
 useEffect(()=>{
  setLoading(true);
  load();
  const channel=supabase.channel('mykioo-support-metrics-'+Math.random().toString(36).slice(2))
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_support_tickets'},load)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'mykioo_support_messages'},load)
   .subscribe(status=>{if(status==='SUBSCRIBED')load()});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')load()},20000);
  const resume=()=>{if(document.visibilityState==='visible')load()};
  window.addEventListener('focus',resume);
  window.addEventListener('online',resume);
  document.addEventListener('visibilitychange',resume);
  return()=>{
   clearInterval(timer);
   window.removeEventListener('focus',resume);
   window.removeEventListener('online',resume);
   document.removeEventListener('visibilitychange',resume);
   supabase.removeChannel(channel);
  };
 },[load]);

 const m=data||initial;
 const measures=[
  {id:'open',label:tr('Active tickets','Demandes actives'),value:m.open,sub:tr('Open + in progress','Ouvertes + en cours'),icon:Headphones},
  {id:'urgent',label:tr('Urgent','Urgentes'),value:m.urgent,sub:tr('Unresolved urgent tickets','Demandes urgentes non résolues'),icon:AlertTriangle},
  {id:'overdue',label:tr('Overdue first replies','Premières réponses en retard'),value:m.overdue,sub:tr('No owner reply after '+threshold+'h','Aucune réponse du propriétaire après '+threshold+' h'),icon:Clock3},
  {id:'resolved',label:tr('Resolved tickets','Demandes résolues'),value:m.resolved,sub:tr(m.closed+' additionally closed',m.closed+' fermées en plus'),icon:CheckCircle2},
  {id:'reply',label:tr('Avg. first response','Première réponse moyenne'),value:elapsed(m.avg_first_reply_hours,fr),sub:tr('From '+m.replied_count+' replied tickets','À partir de '+m.replied_count+' demandes répondues'),icon:Timer}
 ];

 const segments=[
  {id:'open',label:tr('Open','Ouvertes'),value:m.new_open},
  {id:'working',label:tr('In progress','En cours'),value:m.in_progress},
  {id:'resolved',label:tr('Resolved','Résolues'),value:m.resolved},
  {id:'closed',label:tr('Closed','Fermées'),value:m.closed}
 ];
 return <section className={'mykioo-support-dashboard '+(compact?'compact':'')} aria-label={tr('Support dashboard','Tableau de bord de l’assistance')}>
  <div className="mykioo-support-dashboard-heading">
   <div>
    <div className="mykioo-support-dashboard-kicker"><TrendingUp size={16}/>{tr('SUPPORT OVERVIEW','VUE D’ENSEMBLE DE L’ASSISTANCE')}</div>
    <h2>{tr('Support performance','Performance de l’assistance')}</h2>
    <p>{tr('Live ticket status and first-response reporting across all support requests.','État des demandes et suivi du délai de première réponse pour toutes les demandes d’assistance.')}</p>
   </div>
   <button type="button" className="mykioo-support-metrics-refresh" onClick={load} aria-label={tr('Refresh support statistics','Actualiser les statistiques de l’assistance')}>
    <RefreshCw size={17}/>{tr('Refresh','Actualiser')}
   </button>
  </div>
  <div className="mykioo-support-metric-grid">
   {measures.map(({id,label,value,sub,icon:Icon})=><div key={id} className={'mykioo-support-metric metric-'+id}>
    <div className="mykioo-support-metric-label"><Icon size={19}/><span>{label}</span></div>
    <strong>{loading&&!data?'…':value}</strong>
    <small>{sub}</small>
   </div>)}
  </div>
  {error&&<p role="alert" className="mykioo-profile-error">{tr('Support statistics could not be refreshed. Please try again.','Impossible d’actualiser les statistiques de l’assistance. Veuillez réessayer.')}</p>}
  {!compact&&<>
   <div className="mykioo-support-dashboard-detail">
    <div className="mykioo-support-dashboard-breakdown">
     <h3>{tr('Ticket status breakdown','Répartition par statut')}</h3>
     {segments.map(({id,label,value})=><div key={id} className="mykioo-support-breakdown-row">
      <div className="mykioo-support-breakdown-top"><span>{label}</span><strong>{value}</strong></div>
      <div className="mykioo-support-track"><div className={'mykioo-support-track-bar bar-'+id} style={{width:(m.total>0?Math.max(0,Math.min(100,100*value/m.total)):0)+'%'}}/></div>
     </div>)}
     <p>{tr(m.total+' total tickets · '+m.new_last_7d+' created in the last 7 days',m.total+' demandes au total · '+m.new_last_7d+' créées dans les 7 derniers jours')}</p>
    </div>
    <div className="mykioo-support-overdue-panel">
     <div className="mykioo-support-overdue-heading">
      <h3>{tr('Awaiting first reply','En attente d’une première réponse')}</h3>
      <label htmlFor="mykioo-first-reply-threshold">{tr('Overdue threshold','Seuil de retard')}
       <select id="mykioo-first-reply-threshold" value={threshold} onChange={e=>setThreshold(Number(e.target.value))}>
        {thresholds.map(h=><option value={h} key={h}>{h} {tr('hours','heures')}</option>)}
       </select>
      </label>
     </div>
     <p>{tr('Overdue means an active ticket without an owner reply after the selected period. This is an internal review threshold, not a promised service deadline.','Un retard signifie qu’une demande active est sans réponse du propriétaire après le délai choisi. Il s’agit d’un seuil interne, non d’un délai de service garanti.')}</p>
     {m.overdue===0?
      <div className="mykioo-support-overdue-clear"><CheckCircle2 size={18}/>{tr('No overdue first replies.','Aucune première réponse en retard.')}</div>:
      <div className="mykioo-support-overdue-list">{(m.oldest_unanswered||[]).map(ticket=>
       <button type="button" key={ticket.id} onClick={()=>onViewTicket?.(ticket)}>
        <span><strong>{ticket.subject}</strong><small>{tr('Waiting','En attente depuis')} {elapsed(ticket.waiting_hours,fr)} · {ticket.priority==='urgent'?tr('Urgent','Urgente'):ticket.priority==='high'?tr('High','Élevée'):tr('Normal / low','Normale / faible')}</small></span>
        <ArrowUpRight size={17}/>
       </button>
      )}</div>}
     <small>{tr(m.awaiting_first_reply+' active tickets still await an initial reply.',m.awaiting_first_reply+' demandes actives attendent encore une première réponse.')}</small>
    </div>
   </div>
  </>}
  {compact&&onOpenSupport&&<button type="button" className="mykioo-support-overview-link" onClick={onOpenSupport}>
   {tr('Open support dashboard','Ouvrir le tableau de bord de l’assistance')} <ArrowUpRight size={16}/>
  </button>}
  {!compact&&data?.generated_at&&<p className="mykioo-support-asof">{tr('Last calculated','Dernier calcul')}: {new Date(data.generated_at).toLocaleString(fr?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short'})}</p>}
 </section>;
}
