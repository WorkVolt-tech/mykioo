import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-credential-access';
export default function PasswordReveal({subscription,language='en'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [phase,setPhase]=useState('hidden'),[challenge,setChallenge]=useState(''),[code,setCode]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[seconds,setSeconds]=useState(0);
 useEffect(()=>{
   if(phase!=='shown')return;
   const timer=window.setTimeout(()=>{setPassword('');setPhase('hidden')},60000);
   const onHide=()=>{if(document.visibilityState!=='visible'){setPassword('');setPhase('hidden')}};
   document.addEventListener('visibilitychange',onHide);
   return()=>{window.clearTimeout(timer);document.removeEventListener('visibilitychange',onHide)};
 },[phase]);
 useEffect(()=>{
   if(seconds<=0)return;
   const timer=setTimeout(()=>setSeconds(old=>Math.max(0,old-1)),1000);
   return()=>clearTimeout(timer);
 },[seconds]);
 async function request(action,extra={}){
  const {data:{session},error:authError}=await supabase.auth.getSession();
  if(authError||!session)throw Error(tr('Session expired. Sign in again.','Session expirée. Reconnectez-vous.'));
  const response=await fetch(endpoint,{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
      'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
    body:JSON.stringify({action,subscription_id:subscription.id,language,...extra})
  });
  const result=await response.json().catch(()=>({}));
  if(!response.ok||!result.ok)throw Error(result.error||tr('Unable to verify your identity.','Impossible de vérifier votre identité.'));
  return result;
 }
 async function sendCode(){
  if(busy)return;setBusy(true);setError('');setPassword('');
  try{
   const result=await request('request_code');
   setChallenge(result.challenge_id);setCode('');setPhase('code');setSeconds(result.expires_in_seconds||600);
  }catch(err){setError(err.message)}
  finally{setBusy(false)}
 }
 async function confirm(e){
  e.preventDefault();if(busy)return;setBusy(true);setError('');
  try{
   const result=await request('verify_code',{challenge_id:challenge,code:code.trim()});
   setPassword(result.password);setCode('');setChallenge('');setPhase('shown');setSeconds(0);
  }catch(err){setError(err.message)}
  finally{setBusy(false)}
 }
 function conceal(){setPassword('');setCode('');setChallenge('');setPhase('hidden')}
 if(!subscription.has_password)return null;
 return <section className="mykioo-password-reveal">
  {phase==='hidden'&&<button type="button" className="mykioo-reveal-button" disabled={busy} onClick={sendCode}>
    {busy?tr('Sending verification…','Envoi de la vérification…'):tr('Verify email to reveal password','Vérifier mon courriel pour afficher le mot de passe')}</button>}
  {phase==='code'&&<form onSubmit={confirm} className="mykioo-reveal-form">
    <p>{tr('A 6-digit security code was sent to your registered email. It expires in 10 minutes.','Un code de sécurité à 6 chiffres a été envoyé à votre adresse courriel. Il expire dans 10 minutes.')}</p>
    <label htmlFor={'mykioo-otp-'+subscription.id}>{tr('Verification code','Code de vérification')}</label>
    <input id={'mykioo-otp-'+subscription.id} inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/[^0-9]/g,''))} required placeholder="000000"/>
    <small>{tr('Code expires in','Le code expire dans')} {Math.ceil(seconds/60)} {tr('minute(s)','minute(s)')}</small>
    <div className="mykioo-reveal-buttons"><button disabled={busy||code.length!==6} type="submit">{busy?tr('Verifying…','Vérification…'):tr('Verify and reveal','Vérifier et afficher')}</button><button type="button" onClick={conceal}>{tr('Cancel','Annuler')}</button></div>
  </form>}
  {phase==='shown'&&<div className="mykioo-password-open">
   <p>{tr('Service password (hidden again after 60 seconds)','Mot de passe du service (masqué après 60 secondes)')}</p>
   <code>{password}</code>
   <div className="mykioo-reveal-buttons">
    <button type="button" onClick={()=>{if(navigator.clipboard?.writeText)navigator.clipboard.writeText(password).catch(()=>{})}}>{tr('Copy password','Copier le mot de passe')}</button>
    <button type="button" onClick={conceal}>{tr('Hide now','Masquer')}</button>
   </div>
  </div>}
  {error&&<p className="mykioo-profile-error" role="alert">{error}</p>}
 </section>;
}
