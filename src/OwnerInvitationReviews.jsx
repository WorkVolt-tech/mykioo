import {invitationStatus} from './invitationStatus';
import React,{useMemo,useState} from 'react';
import {MailPlus,CheckCircle2,XCircle,Clock3,RefreshCw} from 'lucide-react';
import './Invitations.css';

const dateText=(date,fr)=>date?new Date(date).toLocaleDateString(fr?'fr-CA':'en-CA',{year:'numeric',month:'short',day:'numeric'}):'—';

export default function OwnerInvitationReviews({requests=[],invitations=[],members=[],language='en',saving=false,onAction,onRefresh}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [filter,setFilter]=useState('pending');
 const [deliveryFilter,setDeliveryFilter]=useState('all');
 const byId=useMemo(()=>new Map(members.map(m=>[m.user_id,m])),[members]);
 const labelFor=id=>{if(!id)return tr('System / unknown','Système / inconnu');const m=byId.get(id);return m?(m.display_name?m.display_name+' · ':'')+(m.email||m.user_id):tr('Former member','Ancien membre')};
 const pending=requests.filter(item=>item.status==='pending');
 const shown=filter==='all'?requests:requests.filter(item=>item.status===filter);
 const tracked=invitations.filter(inv=>deliveryFilter==='all'||invitationStatus(inv)===deliveryFilter);
 const statusLabel=status=>({pending:tr('Awaiting acceptance','En attente d’acceptation'),accepted:tr('Accepted','Acceptée'),expired:tr('Expired','Expirée'),requested:tr('New link requested','Nouveau lien demandé'),revoked:tr('Revoked','Révoquée')})[status];
 return <section className="mykioo-owner-invitation-center">
  <div className="mykioo-invitation-intro">
   <MailPlus size={24}/>
   <div><h2>{tr('Member invitation approvals','Approbation des invitations')}</h2>
    <p>{tr('Members can recommend someone, but only you approve invitations. MYKIOO uses IONOS to send them. If IONOS cannot accept the email, you will receive a private link for manual delivery.','Les membres peuvent recommander une personne, mais vous seul approuvez les invitations. MYKIOO utilise IONOS pour l’envoi. En cas d’échec, un lien privé sera fourni pour un envoi manuel.')}</p></div>
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
      {item.status==='pending'?tr('Pending','En attente'):item.status==='approved'?tr('Approved / invitation prepared','Approuvée / invitation préparée'):tr('Rejected','Refusée')}
     </span>
     {item.status==='pending'&&<div className="mykioo-owner-invitation-actions">
      <button type="button" className="approve" disabled={saving} onClick={()=>onAction?.({action:'review_invite',request_id:item.id,decision:'approve'})}><CheckCircle2 size={16}/>{tr('Approve & send invitation','Approuver et inviter')}</button>
      <button type="button" className="reject" disabled={saving} onClick={()=>onAction?.({action:'review_invite',request_id:item.id,decision:'reject'})}><XCircle size={16}/>{tr('Reject','Refuser')}</button>
     </div>}
     {item.status==='approved'&&item.invited_user_id&&<div className="mykioo-owner-invitation-actions">
      <button type="button" className="approve" disabled={saving}
       onClick={()=>onAction?.({action:'resend_invite_setup',request_id:item.id})}>
       <MailPlus size={16}/>{tr('Resend setup invitation','Renvoyer l’invitation d’inscription')}
      </button>
     </div>}
    </article>
   })}</div>}
  <div className="mykioo-invitations-list-title" style={{marginTop:28}}>
   <h3>{tr('Invitation links — acceptance & expiry','Liens d’invitation — acceptation et expiration')}</h3>
   <label>{tr('Show','Afficher')} <select value={deliveryFilter} onChange={e=>setDeliveryFilter(e.target.value)}>
    <option value="all">{tr('All invitations','Toutes les invitations')}</option>
    {['requested','pending','accepted','expired','revoked'].map(status=><option key={status} value={status}>{statusLabel(status)} ({invitations.filter(inv=>invitationStatus(inv)===status).length})</option>)}
   </select></label>
  </div>
  <p>{tr('Approval and acceptance are separate. Links expire after 48 hours. IONOS sends invitations automatically when available; otherwise you can copy the private link from the manual delivery panel.','L’approbation et l’acceptation sont distinctes. Les liens expirent après 48 heures. IONOS envoie les invitations automatiquement lorsqu’il est disponible; sinon, copiez le lien privé dans le panneau d’envoi manuel.')}</p>
  <div className="mykioo-owner-invitation-list">{tracked.map(inv=>{
   const status=invitationStatus(inv),profile=byId.get(inv.accepted_by);
   const complete=Boolean(inv.accepted_at&&profile?.display_name?.trim());
   return <article className="mykioo-owner-invitation-item" key={inv.id}>
    <div className="mykioo-owner-invitation-info"><strong>{inv.email}</strong><div>
     <span>{tr('Invited by','Invité par')}: {labelFor(inv.invited_by)}</span>
     <span>{tr('Prepared','Préparée')}: {dateText(inv.sent_at||inv.created_at,fr)}</span>
     {inv.accepted_at&&<span>{tr('Accepted','Acceptée')}: {dateText(inv.accepted_at,fr)} · {complete?tr('Account created','Compte créé'):tr('Setup incomplete','Création à terminer')}</span>}
     {!inv.accepted_at&&<span>{tr('Link expires','Expiration du lien')}: {new Date(inv.expires_at).toLocaleString(fr?'fr-CA':'en-CA')}</span>}
     {inv.renewal_requested_at&&<span>{tr('New link requested','Nouveau lien demandé')}: {new Date(inv.renewal_requested_at).toLocaleString(fr?'fr-CA':'en-CA')}</span>}
    </div></div>
    <span className={'mykioo-invitation-status '+(status==='accepted'?'approved':status==='expired'?'rejected':'pending')}>{statusLabel(status)}</span>
    {status!=='revoked'&&!complete&&<div className="mykioo-owner-invitation-actions"><button type="button" className="approve" disabled={saving}
     onClick={()=>onAction?.({action:'resend_invite_setup',invitation_id:inv.id})}><MailPlus size={16}/>{tr('Resend invitation / new link','Renvoyer l’invitation / nouveau lien')}</button></div>}
   </article>;
  })}</div>
  {!tracked.length&&<p>{tr('No invitations match this filter.','Aucune invitation pour ce filtre.')}</p>}
 </section>;
}
