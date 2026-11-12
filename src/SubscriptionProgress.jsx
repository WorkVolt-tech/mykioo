import React from 'react';
import {CheckCircle2,Clock3,ShieldCheck,XCircle,RotateCcw,CalendarCheck2,History} from 'lucide-react';

const timestamp=value=>{const n=Date.parse(value||'');return Number.isFinite(n)?n:0};
export default function SubscriptionProgress({request,cancellation,language='en'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const formatDate=(value)=>new Date(value).toLocaleString(fr?'fr-CA':'en-CA',{
  year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'
 });
 const events=[];
 const put=(key,date,en,french,Icon,kind='normal')=>{
  if(!timestamp(date))return;
  events.push({key,date,label:tr(en,french),Icon,kind});
 };
 put('created',request.created_at,'Request submitted','Demande envoyée',CalendarCheck2);
 put('review',request.first_reviewed_at,'Review started','Traitement commencé',Clock3);
 if(cancellation){
  put('cancel-request',cancellation.created_at,'Cancellation approval requested','Approbation d’annulation demandée',RotateCcw,'warning');
 }
 put('activated',request.service_activated_at,'External service activation recorded','Activation externe du service enregistrée',ShieldCheck,'success');
 if(cancellation?.status==='approved'){
  put('cancel-approved',cancellation.reviewed_at||cancellation.updated_at,'Cancellation approved by owner','Annulation approuvée par le propriétaire',CheckCircle2,'success');
 }else if(cancellation?.status==='denied'){
  put('cancel-denied',cancellation.reviewed_at||cancellation.updated_at,'Cancellation denied','Annulation refusée',XCircle,'warning');
 }
 if(request.status==='cancelled'&&!cancellation?.reviewed_at)
  put('cancelled',request.cancelled_at,'Request cancelled before completion','Demande annulée avant finalisation',XCircle,'warning');
 if(request.status==='declined')
  put('declined',request.last_declined_at,'Request declined','Demande refusée',XCircle,'warning');
 if(request.status==='fulfilled')
  put('completed',request.completed_at||request.updated_at,'Subscription request completed','Demande d’abonnement finalisée',CheckCircle2,'success');
 events.sort((a,b)=>timestamp(a.date)-timestamp(b.date)||a.key.localeCompare(b.key));
 const status=({
  pending:tr('Awaiting review','En attente de traitement'),
  in_review:tr('Under review','En cours de traitement'),
  fulfilled:tr('Completed','Terminée'),
  declined:tr('Declined','Refusée'),
  cancelled:tr('Cancelled','Annulée')
 })[request.status]||request.status;
 const needsCompletion=request.service_activated_at&&['pending','in_review'].includes(request.status);
 return <details className="mykioo-sub-progress">
  <summary><History size={15}/><span>{tr('View request timeline','Voir les étapes de la demande')}</span><small>{status}</small></summary>
  <div className="mykioo-sub-progress-content">
   {events.map(event=><div className={'mykioo-sub-progress-step '+event.kind} key={event.key}>
    <div className="mykioo-sub-progress-step-icon"><event.Icon size={15}/></div>
    <div><strong>{event.label}</strong><time dateTime={event.date}>{formatDate(event.date)}</time></div>
   </div>)}
   {request.status==='in_review'&&!request.first_reviewed_at&&<p className="mykioo-sub-progress-legacy">
    {tr('This request is under review. Its original review date was not recorded.','Cette demande est en cours de traitement. La date du début du traitement n’avait pas été enregistrée.')}
   </p>}
   {needsCompletion&&<p className="mykioo-sub-progress-current">
    {tr('Service activation is recorded. Subscription details still need to be finalized.','L’activation du service est enregistrée. Les détails de l’abonnement restent à finaliser.')}
   </p>}
   {cancellation?.status==='pending'&&<p className="mykioo-sub-progress-current">
    {tr('Cancellation awaits owner approval. The order is not cancelled.','L’annulation attend l’approbation du propriétaire. La commande n’est pas annulée.')}
   </p>}
   {request.status==='pending'&&!cancellation&&<p className="mykioo-sub-progress-current">
    {tr('Waiting for MYKIOO to begin reviewing this request.','En attente de l’examen de cette demande par MYKIOO.')}
   </p>}
   <p className="mykioo-sub-progress-legacy">{tr(
    'Only recorded milestones have dates. Earlier actions without stored timestamps are not reconstructed.',
    'Seules les étapes enregistrées ont une date. Les actions antérieures sans horodatage ne sont pas reconstituées.'
   )}</p>
  </div>
 </details>;
}
