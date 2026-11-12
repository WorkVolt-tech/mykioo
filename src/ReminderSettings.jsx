import React,{useCallback,useEffect,useState} from 'react';
import {BellRing,RefreshCw,Mail,ShieldCheck} from 'lucide-react';
import {supabase} from './supabase';
import './ReminderSettings.css';

const fmt=(date,fr)=>date?new Date(date).toLocaleString(fr?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short'}):'—';
export default function ReminderSettings({userId,subscriptions=[],members=[],language='en'}){
 const fr=language==='fr',tr=(en,frText)=>fr?frText:en;
 const [settings,setSettings]=useState(null),[logs,setLogs]=useState([]),[loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false),[refreshing,setRefreshing]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async(silent=false)=>{
  if(!silent)setLoading(true);else setRefreshing(true);
  setError('');
  try{
   const [config,history]=await Promise.all([
    supabase.from('mykioo_reminder_settings').select('id,enabled,in_app_enabled,updated_at').eq('id',1).single(),
    supabase.from('mykioo_expiry_email_log').select('id,subscription_id,expires_at,reminder_days,state,attempt_count,last_attempt_at,sent_at,error_code,notification_sent_at').order('last_attempt_at',{ascending:false}).limit(50)
   ]);
   if(config.error)throw config.error;
   if(history.error)throw history.error;
   setSettings(config.data);setLogs(history.data||[]);
  }catch(e){setError(tr('Unable to load reminder settings or history.','Impossible de charger les paramètres ou l’historique des rappels.'))}
  finally{setLoading(false);setRefreshing(false)}
 },[language]);
 useEffect(()=>{load()},[load]);
 async function save(field,value){
  if(!settings||saving)return;
  setSaving(true);setError('');setNotice('');
  try{
   const {data,error}=await supabase.from('mykioo_reminder_settings')
    .update({[field]:value,updated_at:new Date().toISOString(),updated_by:userId})
    .eq('id',1).select('id,enabled,in_app_enabled,updated_at').single();
   if(error)throw error;
   setSettings(data);
   setNotice(tr('Reminder preferences saved.','Préférences de rappel enregistrées.'));
  }catch(e){setError(tr('Unable to save. Please try again.','Enregistrement impossible. Veuillez réessayer.'))}
  finally{setSaving(false)}
 }
 const services=new Map(subscriptions.map(s=>[s.id,s]));
 const people=new Map(members.map(m=>[m.user_id,m]));
 const sent=logs.filter(x=>x.state==='sent').length,failed=logs.filter(x=>x.state==='failed').length;
 return <section className="mykioo-reminder-settings" aria-label={tr('Automatic renewal reminders','Rappels de renouvellement automatiques')}>
  <div className="mykioo-reminder-head">
   <div><h2><BellRing size={21}/>{tr('Automatic renewal reminders','Rappels de renouvellement automatiques')}</h2>
    <p>{tr('MYKIOO checks subscription dates daily and sends email reminders 30, 7, and 1 day before expiry, and on the expiration date.','MYKIOO vérifie les échéances chaque jour et envoie des rappels par courriel 30, 7 et 1 jour avant l’expiration, ainsi que le jour de l’expiration.')}</p></div>
  </div>
  {loading?<p>{tr('Loading reminder settings…','Chargement des paramètres…')}</p>:settings&&<>
   <div className="mykioo-reminder-options">
    <label className="mykioo-reminder-option">
     <input type="checkbox" checked={settings.enabled} disabled={saving} onChange={e=>save('enabled',e.target.checked)}/>
     <span><strong>{tr('Automatic email reminders','Rappels automatiques par courriel')}</strong>
      <small>{tr('Turn off to pause all scheduled reminders. No subscription is renewed or activated automatically.','Désactivez pour suspendre tous les rappels programmés. Aucun abonnement n’est renouvelé ni activé automatiquement.')}</small></span>
    </label>
    <label className="mykioo-reminder-option">
     <input type="checkbox" checked={settings.in_app_enabled} disabled={saving||!settings.enabled} onChange={e=>save('in_app_enabled',e.target.checked)}/>
     <span><strong>{tr('Also notify members inside MYKIOO','Aussi aviser les membres dans MYKIOO')}</strong>
      <small>{tr('Add a bilingual notification linked to their subscription.','Ajouter une notification bilingue liée à leur abonnement.')}</small></span>
    </label>
   </div>
   <p className="mykioo-reminder-note"><ShieldCheck size={16}/>{tr('Members with a pending renewal request are excluded. Sent reminders are logged to prevent duplicates.','Les membres ayant une demande de renouvellement en attente sont exclus. Les rappels envoyés sont consignés pour éviter les doublons.')}</p>
  </>}
  {notice&&<p className="mykioo-reminder-notice" role="status">{notice}</p>}
  {error&&<p className="mykioo-reminder-error" role="alert">{error}</p>}
  <div className="mykioo-reminder-history-head">
   <div><h3>{tr('Reminder delivery history','Historique des rappels')}</h3>
    <small>{tr('Latest 50 attempts','50 dernières tentatives')} · {sent} {tr('emails sent','courriels envoyés')} · {failed} {tr('failed','échecs')}</small></div>
   <button type="button" className="mykioo-reminder-refresh" disabled={loading||refreshing} onClick={()=>load(true)}><RefreshCw size={16}/>{refreshing?tr('Refreshing…','Actualisation…'):tr('Refresh','Actualiser')}</button>
  </div>
  {!loading&&(logs.length===0?<p className="mykioo-reminder-empty">{tr('No reminder attempts yet. History will appear after the daily scheduler processes an eligible subscription.','Aucune tentative de rappel pour le moment. L’historique apparaîtra après le traitement quotidien d’un abonnement admissible.')}</p>:<div className="mykioo-reminder-history">
   {logs.map(log=>{
    const sub=services.get(log.subscription_id),member=people.get(sub?.member_id);
    const stateLabel=log.state==='sent'?tr('Sent','Envoyé'):log.state==='failed'?tr('Failed','Échec'):tr('Processing','Traitement');
    const point=log.reminder_days===0?tr('Expiration day','Jour d’expiration'):tr(log.reminder_days+' days before',''+log.reminder_days+' jours avant');
    return <article className="mykioo-reminder-log" key={log.id}>
     <div className="mykioo-reminder-log-main"><strong>{sub?.service_name||tr('Subscription','Abonnement')}</strong><small>{member?.display_name||member?.email||tr('Member','Membre')} · {point}</small><small>{tr('Expires','Expire')}: {fmt(log.expires_at,fr)}</small></div>
     <div className="mykioo-reminder-log-status">
      <span className={'mykioo-reminder-status '+log.state}><Mail size={14}/>{tr('Email','Courriel')}: {stateLabel}</span>
      <small>{tr('Website notification','Notification du site')}: {log.notification_sent_at?tr('Sent','Envoyée'):'—'}</small>
      <small>{fmt(log.sent_at||log.last_attempt_at,fr)}</small>
      {log.state==='failed'&&log.error_code&&<small>{tr('Error','Erreur')}: {log.error_code}</small>}
     </div>
    </article>
   })}
  </div>)}
 </section>;
}
