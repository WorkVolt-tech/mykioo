import React,{useState} from 'react';
import {ArrowRight,CheckCircle2,KeyRound,LockKeyhole,Mail,ShieldCheck} from 'lucide-react';
import {supabase,configured} from './supabase';
import './InvitationAcceptance.css';

export default function InvitationAcceptance({tokenHash,tokenType='invite',language='en',onAccepted,onCancel}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const validToken=typeof tokenHash==='string'&&/^[0-9a-f]{64}$/i.test(tokenHash);
 const kind=tokenType==='recovery'?'recovery':'invite';
 async function accept(){
  if(busy||!validToken||!configured)return;
  setBusy(true);setError('');
  try{
   const {data,error:verifyError}=await supabase.auth.verifyOtp({token_hash:tokenHash,type:kind});
   if(verifyError)throw verifyError;
   if(!data?.user||!data?.session)throw Error('Unable to establish your invited session.');
   await onAccepted?.(data.user);
  }catch(err){
   const original=String(err?.message||'');
   setError(/expired|invalid|already.used|token|otp/i.test(original)?
    tr('This invitation link is invalid, expired, or has already been used. Contact the owner for a new invitation email.','Ce lien est invalide, expiré ou déjà utilisé. Communiquez avec le propriétaire pour obtenir une nouvelle invitation.'):
    tr('Unable to accept this invitation right now. Please try again or contact the owner.','Impossible d’accepter cette invitation actuellement. Réessayez ou communiquez avec le propriétaire.'));
  }finally{setBusy(false)}
 }
 return <div className="mykioo-invite-accept-screen">
  <div className="mykioo-invite-accept-box">
   <div className="mykioo-invite-accept-icon"><Mail size={28}/></div>
   <span className="mykioo-invite-accept-eyebrow"><LockKeyhole size={13}/>{tr('PRIVATE MYKIOO INVITATION','INVITATION PRIVÉE MYKIOO')}</span>
   <h1>{tr("You're invited!",'Vous êtes invité(e) !')}</h1>
   <p className="mykioo-invite-accept-lead">{tr('Welcome to MYKIOO. Accept your invitation to complete your membership request.','Bienvenue dans MYKIOO. Acceptez votre invitation pour compléter votre demande d’adhésion.')}</p>
   <div className="mykioo-invite-accept-steps">
    <div><span><CheckCircle2 size={18}/></span><p><strong>{tr('Accept your invitation','Acceptez votre invitation')}</strong><small>{tr('Verify the personal link sent to your email.','Vérifiez le lien personnel envoyé par courriel.')}</small></p></div>
    <div><span><KeyRound size={18}/></span><p><strong>{tr('Create your account','Créez votre compte')}</strong><small>{tr('Choose a display name and create your password.','Choisissez votre nom et créez votre mot de passe.')}</small></p></div>
    <div><span><ShieldCheck size={18}/></span><p><strong>{tr('Wait for owner approval','Attendez l’approbation')}</strong><small>{tr('Your private member dashboard stays locked until the owner approves.','Votre espace privé reste verrouillé jusqu’à l’approbation du propriétaire.')}</small></p></div>
   </div>
   {!validToken&&<p className="mykioo-invite-accept-error" role="alert">{tr('This invitation URL is not valid. Please ask the owner for a fresh link.','Ce lien d’invitation n’est pas valide. Demandez un nouveau lien au propriétaire.')}</p>}
   {error&&<p className="mykioo-invite-accept-error" role="alert">{error}</p>}
   <button type="button" className="mykioo-invite-accept-button" disabled={!validToken||busy||!configured} onClick={accept}>
    {busy?tr('Verifying invitation…','Vérification…'):tr('Accept invitation and continue','Accepter et continuer')}
    {!busy&&<ArrowRight size={17}/>}
   </button>
   <button type="button" className="mykioo-invite-accept-back" onClick={()=>onCancel?.()} disabled={busy}>{tr('Back to sign in','Retour à la connexion')}</button>
   <p className="mykioo-invite-accept-foot">{tr('Only invitees with a valid private link can create an account. Do not share this link.','Seules les personnes disposant d’un lien privé valide peuvent créer un compte. Ne partagez pas ce lien.')}</p>
  </div>
 </div>;
}
