import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';
import {AlertTriangle,CheckCircle2,Clock3} from 'lucide-react';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-service-alerts';
const states={scheduled:['Scheduled','Planifié'],investigating:['Investigating','Enquête en cours'],identified:['Identified','Cause identifiée'],monitoring:['Monitoring','Surveillance'],resolved:['Resolved','Résolu']};
const categories={outage:['Service outage','Panne de service'],maintenance:['Maintenance','Maintenance'],notice:['Service notice','Avis de service']};
const blank=()=>({id:'',title_en:'',title_fr:'',message_en:'',message_fr:'',category:'outage',status:'investigating',scope:'all',service_name:'',starts_at:'',ends_at:'',affected_regions_text:'',provider_checked_at:''});
const localInput=v=>{if(!v)return '';const d=new Date(v);if(Number.isNaN(d.getTime()))return '';const offset=d.getTimezoneOffset()*60000;return new Date(d.getTime()-offset).toISOString().slice(0,16)};
const human=(value,fr)=>new Date(value).toLocaleString(fr?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short'});

export function useServiceAlerts({enabled=true}={}){
 const [alerts,setAlerts]=useState([]);
 useEffect(()=>{
  if(!enabled||!supabase)return;
  let active=true,busy=false;
  async function refresh(){
   if(!active||busy)return;busy=true;
   try{
    const {data,error}=await supabase.from('mykioo_service_alerts').select('*').order('created_at',{ascending:false}).limit(100);
    if(!error&&active)setAlerts(old=>JSON.stringify(old)===JSON.stringify(data||[])?old:data||[]);
   }finally{busy=false}
  }
  refresh();
  const channel=supabase.channel('mykioo-alerts-'+Math.random().toString(36).slice(2))
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_service_alerts'},refresh)
   .subscribe(status=>{if(status==='SUBSCRIBED')refresh()});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},60000);
  const resume=()=>{if(document.visibilityState==='visible')refresh()};
  window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return()=>{active=false;clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);supabase.removeChannel(channel)};
 },[enabled]);
 return [alerts,setAlerts];
}
export function visibleAlert(alert,now=Date.now()){
 const start=Date.parse(alert.starts_at);
 const end=alert.ends_at?Date.parse(alert.ends_at):null;
 return alert.status!=='resolved'&&start<=now&&(!end||end>now);
}
export function ServiceAlertBanner({alerts=[],language='en',onOpen}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const active=alerts.filter(x=>visibleAlert(x));
 if(!active.length)return null;
 return <section className="mykioo-alert-banner" role="status" aria-label={tr('Active service alerts','Alertes de service actives')}>
  <div className="mykioo-alert-banner-heading"><AlertTriangle size={20}/><strong>{active.length===1?tr('Service announcement','Annonce de service'):tr('Service announcements','Annonces de service')}</strong></div>
  {active.slice(0,3).map(x=><div key={x.id} className="mykioo-alert-banner-entry"><strong>{fr?x.title_fr:x.title_en}</strong><p>{fr?x.message_fr:x.message_en}</p><small>{states[x.status]?.[fr?1:0]} · {categories[x.category]?.[fr?1:0]}</small>
   {!!x.affected_regions?.length&&<small>{tr('Affected regions','Régions touchées')}: {x.affected_regions.join(', ')}</small>}
   {x.provider_checked_at&&<small>{tr('Provider last checked','Dernière vérification du fournisseur')}: {human(x.provider_checked_at,fr)}</small>}
  </div>)}
  {onOpen&&<button type="button" onClick={onOpen}>{tr('View service status','Voir l’état des services')}</button>}
 </section>;
}
export function ServiceAlertHistory({alerts=[],language='en'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 return <section className="mykioo-support-card mykioo-alert-history">
  <h2>{tr('Service status and announcements','État des services et annonces')}</h2>
  <p>{tr('Current incidents, planned maintenance, and recent service history.','Incidents en cours, maintenance planifiée et historique récent des services.')}</p>
  {alerts.length===0?<div className="mykioo-alert-all-clear"><CheckCircle2 size={19}/>{tr('No service announcements at this time.','Aucune annonce de service pour le moment.')}</div>:
  <div className="mykioo-alert-history-list">{alerts.map(x=><article key={x.id} className={'mykioo-alert-history-card '+(visibleAlert(x)?'active':'')}>
   <div className="mykioo-alert-history-top"><strong>{fr?x.title_fr:x.title_en}</strong><span className="mykioo-ticket-status">{states[x.status]?.[fr?1:0]||x.status}</span></div>
   <p>{fr?x.message_fr:x.message_en}</p>
   <small>{categories[x.category]?.[fr?1:0]} · {x.scope==='all'?tr('All services','Tous les services'):x.service_name} · {tr('From','Depuis')} {human(x.starts_at,fr)}</small>
   {!!x.affected_regions?.length&&<small>{tr('Affected regions','Régions touchées')}: {x.affected_regions.join(', ')}</small>}
   {x.provider_checked_at&&<small>{tr('Provider last checked','Dernière vérification du fournisseur')}: {human(x.provider_checked_at,fr)} — {tr('Manual update; provider status may have changed.','Mise à jour manuelle; l’état du fournisseur peut avoir changé.')}</small>}
   {x.ends_at&&<small>{tr('Expected end','Fin prévue')} {human(x.ends_at,fr)}</small>}
   {x.resolved_at&&<small>{tr('Resolved','Résolu')} {human(x.resolved_at,fr)}</small>}
  </article>)}</div>}
 </section>;
}
export function ServiceAlertEditor({alerts=[],subscriptions=[],language='en',onRefresh}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [form,setForm]=useState(blank),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const services=[...new Set(subscriptions.map(x=>x.service_name?.trim()).filter(Boolean))].sort();
 function set(field,value){setForm(old=>({...old,[field]:value}));setError('');setNotice('')}
 function edit(x){setForm({id:x.id,title_en:x.title_en,title_fr:x.title_fr,message_en:x.message_en,message_fr:x.message_fr,category:x.category,status:x.status,scope:x.scope,service_name:x.service_name||'',starts_at:localInput(x.starts_at),ends_at:localInput(x.ends_at),affected_regions_text:(x.affected_regions||[]).join(', '),provider_checked_at:localInput(x.provider_checked_at)});setNotice('');setError('')}
 async function call(payload){
  const {data:{session},error:authError}=await supabase.auth.getSession();
  if(authError||!session)throw Error(tr('Sign in again to continue.','Reconnectez-vous pour continuer.'));
  const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.ok)throw Error(body.error||tr('Unable to save service announcement.','Impossible d’enregistrer l’annonce.'));
  return body;
 }
 async function submit(e){e.preventDefault();if(saving)return;setSaving(true);setError('');setNotice('');
  try{
   const regions=[...new Set(form.affected_regions_text.split(/[,;\s]+/).map(v=>v.trim().toUpperCase()).filter(Boolean))];
   if(regions.length>30||regions.some(v=>!/^[A-Z0-9_-]{2,32}$/.test(v)))throw Error(tr('Enter valid region codes, separated by commas (for example: FR, US, CA).','Saisissez des codes de régions valides, séparés par des virgules (exemple : FR, US, CA).'));
   await call({action:'save',...form,affected_regions:regions,provider_checked_at:form.provider_checked_at?new Date(form.provider_checked_at).toISOString():null,starts_at:form.starts_at?new Date(form.starts_at).toISOString():new Date().toISOString(),ends_at:form.ends_at?new Date(form.ends_at).toISOString():null});
   setForm(blank());setNotice(tr('Service announcement saved.','Annonce de service enregistrée.'));onRefresh?.();
  }catch(err){setError(err.message)}finally{setSaving(false)}
 }
 async function resolve(alert){if(saving)return;setSaving(true);setError('');setNotice('');
  try{await call({action:'resolve',id:alert.id});setNotice(tr('Service announcement marked resolved.','Annonce marquée comme résolue.'));onRefresh?.()}
  catch(err){setError(err.message)}finally{setSaving(false)}
 }
 return <section className="mykioo-alert-editor">
  <h2>{tr('Manage service announcements','Gérer les annonces de service')}</h2>
  <p>{tr('Publish bilingual service outages or scheduled maintenance. Add affected regions and the date you manually checked the provider; active notices appear on member dashboards and Support. The provider does not supply automatic status updates.','Publiez des annonces bilingues sur les pannes et les maintenances. Ajoutez les régions touchées et la date de votre dernière vérification manuelle du fournisseur; les avis actifs apparaissent dans les espaces membres et l’assistance. Le fournisseur ne fournit pas de mises à jour automatiques.')}</p>
  <form onSubmit={submit} className="mykioo-alert-editor-form">
   <label>{tr('English title','Titre anglais')}<input required minLength={4} maxLength={120} value={form.title_en} onChange={e=>set('title_en',e.target.value)}/></label>
   <label>{tr('French title','Titre français')}<input required minLength={4} maxLength={120} value={form.title_fr} onChange={e=>set('title_fr',e.target.value)}/></label>
   <label>{tr('English message','Message anglais')}<textarea required minLength={10} maxLength={2000} rows={3} value={form.message_en} onChange={e=>set('message_en',e.target.value)}/></label>
   <label>{tr('French message','Message français')}<textarea required minLength={10} maxLength={2000} rows={3} value={form.message_fr} onChange={e=>set('message_fr',e.target.value)}/></label>
   <label>{tr('Type','Type')}<select value={form.category} onChange={e=>set('category',e.target.value)}>{Object.keys(categories).map(k=><option key={k} value={k}>{categories[k][fr?1:0]}</option>)}</select></label>
   <label>{tr('Progress','Progression')}<select value={form.status} onChange={e=>set('status',e.target.value)}>{Object.keys(states).map(k=><option key={k} value={k}>{states[k][fr?1:0]}</option>)}</select></label>
   <label>{tr('Audience','Public')}<select value={form.scope} onChange={e=>set('scope',e.target.value)}><option value="all">{tr('All members','Tous les membres')}</option><option value="service">{tr('Only customers of one service','Seulement les abonnés d’un service')}</option></select></label>
   {form.scope==='service'&&<label>{tr('Affected service name','Nom du service concerné')}
    <input list="mykioo-alert-service-list" required minLength={2} maxLength={80} value={form.service_name} onChange={e=>set('service_name',e.target.value)} placeholder={tr('Service name must match the subscription','Le nom doit correspondre à l’abonnement')}/>
    <datalist id="mykioo-alert-service-list">{services.map(name=><option key={name} value={name}/>)}</datalist>
   </label>}
   <label>{tr('Affected regions (optional)','Régions touchées (facultatif)')}
    <input type="text" maxLength={220} value={form.affected_regions_text} onChange={e=>set('affected_regions_text',e.target.value)} placeholder="FR, US, CA, CAF"/>
    <small>{tr('Use MyPanel region codes separated by commas; leave blank if all services are affected.','Utilisez les codes de régions MyPanel séparés par des virgules; laissez vide si tous les services sont touchés.')}</small>
   </label>
   <label>{tr('Last checked on provider panel (optional)','Dernière vérification dans le panneau fournisseur (facultatif)')}
    <input type="datetime-local" value={form.provider_checked_at} max={localInput(new Date().toISOString())} onChange={e=>set('provider_checked_at',e.target.value)}/>
    <button className="mykioo-alert-checked-now" type="button" onClick={()=>set('provider_checked_at',localInput(new Date().toISOString()))}>{tr('I checked MyPanel just now','Je viens de vérifier MyPanel')}</button>
    <small>{tr('Only mark this after checking the provider page yourself. This is not an automatic sync.','Indiquez cette date uniquement après avoir vérifié le panneau du fournisseur. Ce n’est pas une synchronisation automatique.')}</small>
   </label>
   <label>{tr('Start date/time (blank: now)','Date/heure de début (vide : maintenant)')}<input type="datetime-local" value={form.starts_at} onChange={e=>set('starts_at',e.target.value)}/></label>
   <label>{tr('Expected end (optional)','Fin prévue (facultatif)')}<input type="datetime-local" value={form.ends_at} onChange={e=>set('ends_at',e.target.value)}/></label>
   <div className="mykioo-alert-editor-actions"><button type="submit" disabled={saving}>{saving?tr('Saving…','Enregistrement…'):form.id?tr('Save changes','Enregistrer les modifications'):tr('Publish announcement','Publier l’annonce')}</button>{form.id&&<button type="button" onClick={()=>setForm(blank())}>{tr('Cancel editing','Annuler')}</button>}</div>
  </form>
  {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
  {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  <div className="mykioo-alert-admin-list">
   <h3>{tr('Announcements','Annonces')}</h3>
   {alerts.length===0?<p>{tr('No announcements created.','Aucune annonce créée.')}</p>:
    alerts.map(x=><article key={x.id} className="mykioo-alert-admin-row">
      <div><strong>{fr?x.title_fr:x.title_en}</strong><small>{states[x.status]?.[fr?1:0]} · {x.scope==='all'?tr('All members','Tous les membres'):x.service_name}</small>
      {!!x.affected_regions?.length&&<small>{tr('Regions','Régions')}: {x.affected_regions.join(', ')}</small>}
      {x.provider_checked_at&&<small>{tr('Provider checked','Fournisseur vérifié')}: {human(x.provider_checked_at,fr)}</small>}</div>
      <button type="button" onClick={()=>edit(x)}>{tr('Edit','Modifier')}</button>
      {x.status!=='resolved'&&<button type="button" disabled={saving} onClick={()=>resolve(x)}>{tr('Mark resolved','Marquer résolu')}</button>}
    </article>)}
  </div>
 </section>;
}
