import React,{useState} from 'react';
import {supabase,configured} from './supabase';

export default function InvitationRenewal({language='en'}){
 const fr=language==='fr',tr=(en,frText)=>fr?frText:en;
 const [email,setEmail]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 async function submit(event){
  event.preventDefault();if(busy||!configured)return;
  setBusy(true);setMessage('');
  try{
   const {error}=await supabase.rpc('mykioo_request_invitation_renewal',{request_email:email.trim().toLowerCase()});
   if(error)throw error;
   setMessage(tr('If this address has an unfinished invitation, the owner has been notified to send a fresh link. If you already completed your account, use Forgot password.','Si cette adresse possède une invitation non terminée, le propriétaire a été avisé de vous envoyer un nouveau lien. Si votre compte est déjà créé, utilisez Mot de passe oublié.'));
  }catch{
   setMessage(tr('Unable to submit your request. Please try again.','Impossible d’envoyer votre demande. Veuillez réessayer.'));
  }finally{setBusy(false)}
 }
 return <details className="mykioo-invitation-renewal" style={{marginTop:20,textAlign:'left',width:'100%',maxWidth:460}}>
  <summary style={{cursor:'pointer'}}>{tr('Invitation expired or missing? Request a new link','Invitation expirée ou introuvable? Demander un nouveau lien')}</summary>
  <form onSubmit={submit} style={{display:'grid',gap:12,paddingTop:14}}>
   <p>{tr('Enter the email address that was invited. The owner will review your request.','Entrez l’adresse courriel invitée. Le propriétaire examinera votre demande.')}</p>
   <label>{tr('Invited email address','Adresse courriel invitée')}<input type="email" required maxLength={254} autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} style={{display:'block',width:'100%',marginTop:8,padding:12}}/></label>
   <button type="submit" className="mykioo-invite-accept-button" disabled={busy||!configured}>{busy?tr('Sending…','Envoi…'):tr('Request a new invitation','Demander une nouvelle invitation')}</button>
   {message&&<p role="status">{message}</p>}
  </form>
 </details>;
}
