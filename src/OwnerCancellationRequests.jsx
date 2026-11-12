import React,{useState} from 'react';
import {AlertTriangle,CheckCircle2,ShieldCheck,XCircle} from 'lucide-react';
import {supabase} from './supabase';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-subscription-requests';
export default function OwnerCancellationRequests({requests=[],cancellations=[],members=[],language='en',onSaved}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [workingId,setWorkingId]=useState(''),[notice,setNotice]=useState(''),[error,setError]=useState(''),[notes,setNotes]=useState({});
 const byId=new Map(requests.map(r=>[r.id,r]));
 const waiting=cancellations.filter(c=>c.status==='pending').sort((a,b)=>new Date(a.created_at)-new Date(b.created_at));
 const previous=cancellations.filter(c=>c.status!=='pending').sort((a,b)=>new Date(b.reviewed_at||b.updated_at)-new Date(a.reviewed_at||a.updated_at)).slice(0,8);
 async function review(c,decision){
  if(workingId)return;
  const request=byId.get(c.request_id);
  const finished=request?.status==='fulfilled'||Boolean(request?.completed_at||request?.subscription_id||request?.service_activated_at);
  if(decision==='approve'&&finished){
   setError(tr('This order has already been completed. Cancellation cannot be approved or refunded. Refresh your records.','Cette commande est déjà terminée. Son annulation ou remboursement ne peut pas être approuvé. Actualisez les données.'));return;
  }
  const ask=decision==='approve'
   ?tr('Approve cancellation only if this order has NOT been completed or activated. An approval will cancel the unfulfilled request. Continue?','Approuvez l’annulation uniquement si la commande n’a PAS été terminée ni activée. Cela annulera la demande non finalisée. Continuer ?')
   :tr('Deny this cancellation request? The subscription order will remain in effect. No refund after activation.','Refuser cette demande d’annulation ? La commande restera valide. Aucun remboursement après activation.');
  if(!window.confirm(ask))return;
  setWorkingId(c.request_id);setError('');setNotice('');
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error(tr('Please sign in again.','Veuillez vous reconnecter.'));
   const response=await fetch(endpoint,{method:'POST',headers:{
    'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
    'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
   },body:JSON.stringify({action:'review_cancellation',request_id:c.request_id,
    decision,note:(notes[c.request_id]||'').trim()})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Unable to record the decision.','Impossible d’enregistrer la décision.'));
   setNotice(result.result?.status==='approved'
    ?tr('Cancellation approved. The unfulfilled order was cancelled and the member was notified.','Annulation approuvée. La commande non finalisée a été annulée et le membre a été avisé.')
    :tr('Cancellation denied. The member was notified.','Annulation refusée. Le membre a été avisé.'));
   await onSaved?.();
  }catch(err){setError(err.message||tr('Unable to save cancellation decision.','Impossible d’enregistrer la décision.'))}
  finally{setWorkingId('')}
 }
 const memberLabel=(id)=>{
  const m=members.find(x=>x.user_id===id);
  return m?.display_name||m?.email||tr('Member','Membre');
 };
 return <section className="mykioo-cancellation-owner">
  <div className="mykioo-cancellation-owner-title"><ShieldCheck size={21}/><div>
   <h2>{tr('Cancellation approval requests','Demandes d’annulation à approuver')}</h2>
   <p>{tr('Cancellation is never automatic. If you complete or activate the service before approving, the cancellation must be denied. No refunds after service activation.','L’annulation n’est jamais automatique. Si vous terminez ou activez le service avant d’approuver, l’annulation doit être refusée. Aucun remboursement après activation.')}</p>
  </div></div>
  {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
  {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  <h3>{tr('Awaiting your approval','En attente de votre approbation')} ({waiting.length})</h3>
  {waiting.length===0?<p className="mykioo-cancellation-empty">{tr('No cancellation approvals waiting.','Aucune demande d’annulation en attente.')}</p>:
   <div className="mykioo-cancellation-owner-list">{waiting.map(c=>{
    const request=byId.get(c.request_id);
    const finished=request?.status==='fulfilled'||Boolean(request?.completed_at||request?.subscription_id||request?.service_activated_at);
    return <article key={c.request_id} id={"mykioo-cancel-approval-"+c.request_id} tabIndex={-1} className="mykioo-cancellation-owner-item">
     <strong>{request?.service_name||tr('Subscription request','Demande d’abonnement')}</strong>
     <small>{memberLabel(c.member_id)} · {new Date(c.created_at).toLocaleString(fr?'fr-CA':'en-CA')}</small>
     <div className="mykioo-cancellation-alert"><AlertTriangle size={16}/>
      <span>{finished?tr('Order already completed or marked activated — cancellation must be denied.','Commande déjà terminée ou marquée comme activée — l’annulation doit être refusée.'):
       tr('Order is still awaiting completion. Verify that service access has NOT been activated before approving cancellation.','La commande n’est pas encore finalisée. Vérifiez que l’accès au service n’a PAS été activé avant d’approuver l’annulation.')}</span>
     </div>
     {c.reason&&<p>{tr('Member reason','Raison du membre')}: {c.reason}</p>}
     <label>{tr('Decision note (optional)','Note de décision (facultative)')}
      <textarea value={notes[c.request_id]||''} rows={2} maxLength={500}
       onChange={e=>setNotes(old=>({...old,[c.request_id]:e.target.value}))}
       placeholder={tr('Reason for approving or denying','Raison de l’approbation ou du refus')}/>
     </label>
     <div className="mykioo-cancellation-owner-actions">
      <button type="button" disabled={Boolean(workingId)||finished} onClick={()=>review(c,'approve')}>
       <CheckCircle2 size={16}/>{tr('Approve cancellation','Approuver l’annulation')}</button>
      <button type="button" disabled={Boolean(workingId)} onClick={()=>review(c,'deny')}>
       <XCircle size={16}/>{tr('Deny cancellation','Refuser l’annulation')}</button>
     </div>
    </article>
   })}</div>}
  {previous.length>0&&<div className="mykioo-cancellation-previous">
   <h3>{tr('Recent decisions','Décisions récentes')}</h3>
   {previous.map(c=><div className="mykioo-cancellation-previous-row" key={c.request_id}>
    <strong>{byId.get(c.request_id)?.service_name||tr('Subscription request','Demande d’abonnement')}</strong>
    <span>{c.status==='approved'?tr('Approved','Approuvée'):tr('Denied','Refusée')}</span>
    <small>{c.reviewed_at?new Date(c.reviewed_at).toLocaleDateString(fr?'fr-CA':'en-CA'):''}</small>
   </div>)}
  </div>}
 </section>;
}
