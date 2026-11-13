import React,{useCallback,useEffect,useState} from 'react';
import {MailPlus,CheckCircle2,Clock3,XCircle,RefreshCw} from 'lucide-react';
import {supabase} from './supabase';
import './Invitations.css';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-admin';
const emailPattern=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function MemberInvitations({userId,language='en'}){
 const fr=language==='fr',tr=(en,frText)=>fr?frText:en;
 const [email,setEmail]=useState(''),[requests,setRequests]=useState([]);
 const [working,setWorking]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const refresh=useCallback(async()=>{
  if(!supabase||!userId)return;
  const {data,error:readError}=await supabase.from('mykioo_invitation_requests')
   .select('id,email,status,created_at,reviewed_at').eq('requested_by',userId)
   .order('created_at',{ascending:false}).limit(50);
  if(readError){setError(tr('Could not load your invitations.','Impossible de charger vos invitations.'))}
  else setRequests(data||[]);
  setLoading(false);
 },[userId,language]);
 useEffect(()=>{
  refresh();
  if(!userId||!supabase)return;
  const channel=supabase.channel('mykioo-member-invites-'+userId)
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_invitation_requests',filter:'requested_by=eq.'+userId},refresh)
   .subscribe();
  const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},60000);
  return()=>{clearInterval(timer);supabase.removeChannel(channel)};
 },[refresh,userId]);
 async function submit(e){
  e.preventDefault();if(working)return;
  const address=email.trim().toLowerCase();
  if(address.length>254||!emailPattern.test(address)){
   setError(tr('Enter a valid email address.','Saisissez une adresse courriel valide.'));return;
  }
  setWorking(true);setError('');setNotice('');
  try{
   const {data:{session},error:sessionError}=await supabase.auth.getSession();
   if(sessionError||!session)throw Error(tr('Sign in again to continue.','Reconnectez-vous pour continuer.'));
   const response=await fetch(endpoint,{method:'POST',headers:{
    'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
    'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
   },body:JSON.stringify({action:'request_invite',email:address,language})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Invitation could not be submitted.','Impossible de soumettre l’invitation.'));
   setEmail('');
   setNotice(tr('Sent to the owner for approval. No email goes to your friend until the owner approves.','Demande envoyée au propriétaire pour approbation. Aucun courriel ne sera envoyé à votre ami avant son approbation.'));
   await refresh();
  }catch(err){setError(err.message||tr('Unable to send request.','Impossible d’envoyer la demande.'))}
  finally{setWorking(false)}
 }
 const statusText={pending:tr('Awaiting owner approval','En attente de l’approbation du propriétaire'),
  approved:tr('Approved — site invitation issued','Approuvée — invitation envoyée'),
  rejected:tr('Declined','Refusée')};
 const statusIcon={pending:Clock3,approved:CheckCircle2,rejected:XCircle};
 return <section className="mykioo-member-invitations">
  <div className="mykioo-invitation-intro">
   <MailPlus size={24}/>
   <div><h2>{tr('Invite someone to MYKIOO','Inviter quelqu’un à MYKIOO')}</h2>
    <p>{tr('Know someone who would enjoy MYKIOO? Recommend them by email. The owner decides whether to approve the invitation.','Vous connaissez quelqu’un qui aimerait MYKIOO ? Recommandez cette personne par courriel. Le propriétaire décide d’approuver ou non l’invitation.')}</p></div>
  </div>
  <form onSubmit={submit} className="mykioo-invitation-form">
   <label htmlFor="mykioo-referral-email">{tr('Their email address','Son adresse courriel')}</label>
   <div className="mykioo-invitation-input-row"><input id="mykioo-referral-email" type="email" autoComplete="off" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}
    placeholder="friend@example.com"/>
    <button type="submit" disabled={working}>{working?tr('Submitting…','Envoi…'):tr('Request invitation','Demander une invitation')}</button>
   </div>
   <small>{tr('The invitation email is sent only after the owner approves. Up to 10 requests per 24 hours.','Le courriel d’invitation est envoyé uniquement après approbation du propriétaire. Maximum 10 demandes en 24 heures.')}</small>
  </form>
  {error&&<p className="mykioo-invitation-error" role="alert">{error}</p>}
  {notice&&<p className="mykioo-invitation-notice" role="status">{notice}</p>}
  <div className="mykioo-invitations-list-title"><h3>{tr('My invitation requests','Mes demandes d’invitation')}</h3>
   <button type="button" onClick={refresh} aria-label={tr('Refresh','Actualiser')}><RefreshCw size={16}/></button>
  </div>
  {loading?<p>{tr('Loading…','Chargement…')}</p>:!requests.length?<p className="mykioo-invitations-empty">{tr('No invitations requested yet.','Aucune demande d’invitation pour le moment.')}</p>:
   <div className="mykioo-invitations-list">{requests.map(item=>{
    const Icon=statusIcon[item.status]||Clock3;
    return <div className="mykioo-invitation-item" key={item.id}>
     <div><strong>{item.email}</strong><small>{new Date(item.created_at).toLocaleDateString(fr?'fr-CA':'en-CA')}</small></div>
     <span className={'mykioo-invitation-status '+item.status}><Icon size={15}/>{statusText[item.status]||item.status}</span>
    </div>
   })}</div>}
 </section>
}
