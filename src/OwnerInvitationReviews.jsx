import React,{useMemo,useState} from 'react';
import {MailPlus,CheckCircle2,XCircle,Clock3,RefreshCw} from 'lucide-react';
import './Invitations.css';

const dateText=(date,fr)=>date?new Date(date).toLocaleDateString(fr?'fr-CA':'en-CA',{year:'numeric',month:'short',day:'numeric'}):'—';

export default function OwnerInvitationReviews({requests=[],invitations=[],members=[],language='en',saving=false,onAction,onRefresh}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [filter,setFilter]=useState('pending');
 const byId=useMemo(()=>new Map(members.map(m=>[m.user_id,m])),[members]);
 const labelFor=id=>{if(!id)return tr('System / unknown','Système / inconnu');const m=byId.get(id);return m?(m.display_name?m.display_name+' · ':'')+(m.email||m.user_id):tr('Former member','Ancien membre')};
 const pending=requests.filter(item=>item.status==='pending');
 const shown=filter==='all'?requests:requests.filter(item=>item.status===filter);
 const ownerInvites=invitations.filter(inv=>!requests.some(request=>request.invitation_id===inv.id));
 return <section className="mykioo-owner-invitation-center">
  <div className="mykioo-invitation-intro">
   <MailPlus size={24}/>
   <div><h2>{tr('Member invitation approvals','Approbation des invitations')}</h2>
    <p>{tr('Members can recommend someone, but only you can approve the invitation email. Every request records who invited the person.','Les membres peuvent recommander une personne, mais vous seul approuvez l’envoi de l’invitation. Chaque demande indique qui a invité la personne.')}</p></div>
  </div>
  <div className="mykioo-invitations-list-title">
   <div><h3>{tr('Invitation requests','Demandes d’invitation')} {pending.length>0&&<span className="mykioo-owner-count">{pending.length}</span>}</h3></div>
   <div className="mykioo-invite-tools">
    <label>{tr('Show','Afficher')}
     <select value={filter} onChange={e=>setFilter(e.target.value)}>
      <option value="pending">{tr('Awaiting decision','À décider')}</option>
      <option value="approved">{tr('Approved','Approuvées')}</option>
      <option value="rejected">{tr('Rejected','Refusées')}</option>
      <option value="all">{tr('All requests','Toutes les demandes')}</option>
     </select>
    </label>
    <button type="button" onClick={()=>onRefresh?.()} aria-label={tr('Refresh invitations','Actualiser les invitations')}><RefreshCw size={17}/></button>
   </div>
  </div>
  {shown.length===0?<p className="mykioo-invitations-empty">{filter==='pending'?tr('No invitations awaiting approval.','Aucune invitation en attente d’approbation.'):tr('No invitation requests match this filter.','Aucune invitation pour ce filtre.')}</p>:
   <div className="mykioo-owner-invitation-list">{shown.map(item=>{
    const Icon=item.status==='approved'?CheckCircle2:item.status==='rejected'?XCircle:Clock3;
    return <article className="mykioo-owner-invitation-item" key={item.id}>
     <div className="mykioo-owner-invitation-info">
      <strong>{item.email}</strong>
      <div><span>{tr('Invited by','Invité par')}: <b>{labelFor(item.requested_by)}</b></span>
       <span>{tr('Requested','Demande')}: {dateText(item.created_at,fr)}</span>
       {item.reviewed_at&&<span>{tr('Reviewed','Révisée')}: {dateText(item.reviewed_at,fr)}</span>}
      </div>
     </div>
     <span className={'mykioo-invitation-status '+item.status}><Icon size={14}/>
      {item.status==='pending'?tr('Pending','En attente'):item.status==='approved'?tr('Approved / invited','Approuvée / invitation envoyée'):tr('Rejected','Refusée')}
     </span>
     {item.status==='pending'&&<div className="mykioo-owner-invitation-actions">
      <button type="button" className="approve" disabled={saving} onClick={()=>onAction?.({action:'review_invite',request_id:item.id,decision:'approve'})}><CheckCircle2 size={16}/>{tr('Approve & email invite','Approuver et envoyer l’invitation')}</button>
      <button type="button" className="reject" disabled={saving} onClick={()=>onAction?.({action:'review_invite',request_id:item.id,decision:'reject'})}><XCircle size={16}/>{tr('Reject','Refuser')}</button>
     </div>}
    </article>
   })}</div>}
  <details className="mykioo-owner-past-invitations">
   <summary>{tr('Previous direct invitations','Invitations directes précédentes')} ({ownerInvites.length})</summary>
   <div className="mykioo-invitations-list">{ownerInvites.slice(0,100).map(inv=><div className="mykioo-invitation-item" key={inv.id}>
    <div><strong>{inv.email}</strong><small>{tr('Invited by','Invité par')}: {labelFor(inv.invited_by)}</small><small>{dateText(inv.created_at,fr)}</small></div>
    <span className={'mykioo-invitation-status '+inv.status}>{inv.status}</span>
   </div>)}</div>
  </details>
 </section>;
}
