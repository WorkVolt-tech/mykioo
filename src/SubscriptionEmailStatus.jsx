import React,{useCallback,useEffect,useRef,useState} from 'react';
import {supabase} from './supabase';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-subscriptions';

export default function SubscriptionEmailStatus({subscriptionId,updatedAt='',language='en'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [email,setEmail]=useState(null);
 const requestNumber=useRef(0);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const check=useCallback(async()=>{
  const currentRequest=++requestNumber.current;
  setBusy(true);setError('');
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error();
   const response=await fetch(endpoint,{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
     'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify({action:'get_email_status',subscription_id:subscriptionId})
   });
   const result=await response.json();
   if(!response.ok||!result.ok)throw Error();
   if(currentRequest===requestNumber.current)setEmail(result.email);
  }catch{if(currentRequest===requestNumber.current)setError(fr?'Impossible de vérifier le statut du courriel. Réessayez.':'Unable to check email status. Try again.');}
  finally{if(currentRequest===requestNumber.current)setBusy(false);}
 },[subscriptionId,fr]);
 useEffect(()=>{setEmail(null);check();return()=>{requestNumber.current++;};},[check,updatedAt]);
 const labels={
  sent:tr('Email sent — accepted by the mail server','Courriel envoyé — accepté par le serveur de messagerie'),
  pending:tr('Email queued — awaiting send','Courriel en attente d’envoi'),
  sending:tr('Email sending — confirmation pending','Envoi en cours — confirmation en attente'),
  failed:tr('Email failed — no send confirmation','Échec du courriel — aucun envoi confirmé'),
  unknown:tr('No confirmed email status recorded','Aucun statut d’envoi confirmé enregistré')
 };
 let message=email?labels[email.state]||labels.unknown:'';
 if(email?.outdated)message=tr('An earlier email was sent. The latest saved changes have no send confirmation.','Un ancien courriel a été envoyé. L’envoi des dernières modifications enregistrées n’est pas confirmé.');
 return <div className="mykioo-sub-note">
  <button type="button" className="admin-action" disabled={busy} onClick={check}>
   {busy?tr('Checking email…','Vérification du courriel…'):tr('Check email status','Vérifier le statut du courriel')}
  </button>
  {email&&<p role="status">{message}{email.sent_at&&' · '+new Date(email.sent_at).toLocaleString(fr?'fr-CA':'en-CA')}</p>}
  {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
 </div>;
}
