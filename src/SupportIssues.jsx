import React,{useEffect,useState,useCallback} from 'react';
import {supabase} from './supabase';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-support-issues';
const statuses={investigating:['Investigating','Enquête en cours'],identified:['Identified','Cause identifiée'],monitoring:['Monitoring','Surveillance'],resolved:['Resolved','Résolu']};
async function runAction(payload){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session)throw Error('Sign in again to continue.');
 const response=await fetch(endpoint,{method:'POST',headers:{
  'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
  'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
 },body:JSON.stringify(payload)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error(result.error||'Support operation failed.');
 return result;
}
export function useSharedIssues(enabled=true){
 const [issues,setIssues]=useState([]);
 const refresh=useCallback(async()=>{
  if(!enabled||!supabase)return;
  const {data,error}=await supabase.from('mykioo_support_issues').select('*').order('updated_at',{ascending:false}).limit(100);
  if(!error)setIssues(old=>JSON.stringify(old)===JSON.stringify(data||[])?old:data||[]);
 },[enabled]);
 useEffect(()=>{
  if(!enabled)return;
  refresh();
  const channel=supabase.channel('mykioo-shared-issues-'+Math.random().toString(36).slice(2))
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_support_issues'},refresh)
   .subscribe(status=>{if(status==='SUBSCRIBED')refresh()});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},60000);
  const resume=()=>{if(document.visibilityState==='visible')refresh()};
  window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return()=>{clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);supabase.removeChannel(channel)};
 },[refresh,enabled]);
 return {issues,refresh};
}
export function RelatedIssue({issueId,language='en'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [issue,setIssue]=useState(null),[updates,setUpdates]=useState([]);
 useEffect(()=>{
  if(!issueId)return;
  let mounted=true;
  async function sync(){
   const [a,b]=await Promise.all([
    supabase.from('mykioo_support_issues').select('id,title,description,status,latest_update,updated_at').eq('id',issueId).maybeSingle(),
    supabase.from('mykioo_support_issue_updates').select('id,body,status,created_at').eq('issue_id',issueId).order('created_at',{ascending:false}).limit(50)
   ]);
   if(mounted){if(!a.error)setIssue(a.data);if(!b.error)setUpdates(b.data||[])}
  }
  sync();
  const channel=supabase.channel('mykioo-member-issue-'+issueId)
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_support_issues',filter:'id=eq.'+issueId},sync)
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'mykioo_support_issue_updates',filter:'issue_id=eq.'+issueId},sync).subscribe();
  const timer=setInterval(()=>{if(document.visibilityState==='visible')sync()},60000);
  return()=>{mounted=false;clearInterval(timer);supabase.removeChannel(channel)};
 },[issueId]);
 if(!issueId||!issue)return null;
 return <section className="mykioo-linked-issue">
  <strong>{tr('Related known issue','Problème connu associé')}: {issue.title}</strong>
  <span className="mykioo-ticket-status">{statuses[issue.status]?.[fr?1:0]||issue.status}</span>
  <p>{issue.description}</p>
  {updates.length>0&&<div className="mykioo-linked-issue-updates"><h4>{tr('Shared updates','Mises à jour communes')}</h4>
   {updates.map(u=><div key={u.id}><small>{new Date(u.created_at).toLocaleString(fr?'fr-CA':'en-CA')} · {statuses[u.status]?.[fr?1:0]}</small><p>{u.body}</p></div>)}
  </div>}
  <small>{tr('Only updates from MYKIOO are shared here. Other members’ tickets remain private.','Seules les mises à jour de MYKIOO sont partagées ici. Les demandes des autres membres demeurent privées.')}</small>
 </section>;
}
export function OwnerIssuePanel({tickets=[],language='en',selected=[],setSelected,onRefresh}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const {issues,refresh}=useSharedIssues();
 const [form,setForm]=useState({id:'',title:'',description:'',status:'investigating'});
 const [issueId,setIssueId]=useState(''),[updateText,setUpdateText]=useState(''),[status,setStatus]=useState('investigating');
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function act(payload,success){
  if(busy)return;
  setBusy(true);setError('');setNotice('');
  try{
   const result=await runAction(payload);
   setNotice(success||tr('Changes saved.','Modifications enregistrées.'));
   await Promise.all([refresh(),onRefresh?.()]);
   return result;
  }catch(err){setError(err.message||tr('Unable to save.','Impossible d’enregistrer.'));return null}
  finally{setBusy(false)}
 }
 async function saveIssue(e){
  e.preventDefault();
  const res=await act({action:'save_issue',...form},tr('Main issue saved.','Problème principal enregistré.'));
  if(res){setIssueId(res.id);setForm({id:'',title:'',description:'',status:'investigating'})}
 }
 async function publish(e){
  e.preventDefault();if(!issueId)return;
  const result=await act({action:'post_update',issue_id:issueId,body:updateText.trim(),status},
    tr('Update published to linked members.','Mise à jour publiée aux membres concernés.'));
  if(result)setUpdateText('');
 }
 async function link(){
  if(!issueId||!selected.length)return;
  const result=await act({action:'link_tickets',issue_id:issueId,ticket_ids:selected},
   tr('Tickets linked. Members have been notified.','Demandes associées. Les membres ont été avisés.'));
  if(result)setSelected([]);
 }
 async function resolveLinked(){
  if(!issueId)return;
  const issue=issues.find(x=>x.id===issueId);
  if(!issue||issue.status!=='resolved'){setError(tr('Mark this main issue resolved before completing linked tickets.','Marquez le problème principal comme résolu avant de terminer les demandes liées.'));return}
  const affected=tickets.filter(t=>t.main_issue_id===issueId&&!['resolved','closed'].includes(t.status)).length;
  if(!affected){setNotice(tr('No unresolved linked tickets remain.','Aucune demande liée non résolue.'));return}
  if(!window.confirm(tr('Resolve '+affected+' linked ticket(s) for '+issue.title+'? Each member will receive a completion notice.','Résoudre '+affected+' demande(s) associée(s) à '+issue.title+' ? Chaque membre recevra un avis de résolution.')))return;
  await act({action:'resolve_issue_tickets',issue_id:issueId,status:'resolved'},
   tr('Linked tickets resolved. Completion notifications have been queued.','Demandes associées résolues. Les notifications de résolution ont été programmées.'));
 }
 async function bulk(status){
  if(!selected.length)return;
  if(!window.confirm(tr('Update '+selected.length+' selected ticket(s) to '+status+'?','Mettre à jour '+selected.length+' demande(s) sélectionnée(s) comme '+status+' ?')))return;
  const result=await act({action:'bulk_status',ticket_ids:selected,status},tr('Selected tickets updated.','Demandes sélectionnées mises à jour.'));
  if(result)setSelected([]);
 }
 return <section className="mykioo-issue-manager">
  <h2>{tr('Main issues and bulk ticket actions','Problèmes principaux et actions groupées')}</h2>
  <p>{tr('Create one shared issue, select related tickets below, and publish updates once for all affected members. Their individual conversations stay private.','Créez un problème commun, sélectionnez les demandes liées ci-dessous et publiez une seule mise à jour pour les membres concernés. Leurs conversations demeurent privées.')}</p>
  <div className="mykioo-issue-bulk">
   <strong>{selected.length} {tr('tickets selected','demandes sélectionnées')}</strong>
   <button type="button" onClick={()=>setSelected(tickets.filter(x=>x.status!=='closed').map(x=>x.id))}>{tr('Select open tickets','Sélectionner les demandes ouvertes')}</button>
   <button type="button" onClick={()=>setSelected([])}>{tr('Clear selection','Effacer la sélection')}</button>
   <button type="button" disabled={!selected.length||busy} onClick={()=>bulk('resolved')}>{tr('Resolve selected','Résoudre la sélection')}</button>
   <button type="button" disabled={!selected.length||busy} onClick={()=>bulk('closed')}>{tr('Close selected','Fermer la sélection')}</button>
  </div>
  <div className="mykioo-issue-columns">
   <form className="mykioo-issue-form" onSubmit={saveIssue}>
    <h3>{form.id?tr('Edit main issue','Modifier le problème principal'):tr('Create main issue','Créer un problème principal')}</h3>
    <label>{tr('Title','Titre')}<input required minLength={5} maxLength={140} value={form.title} onChange={e=>setForm(old=>({...old,title:e.target.value}))}/></label>
    <label>{tr('Shared description','Description commune')}<textarea required rows={4} minLength={10} maxLength={4000} value={form.description} onChange={e=>setForm(old=>({...old,description:e.target.value}))}/></label>
    <label>{tr('Status','Statut')}<select value={form.status} onChange={e=>setForm(old=>({...old,status:e.target.value}))}>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v[fr?1:0]}</option>)}</select></label>
    <button type="submit" disabled={busy}>{form.id?tr('Save issue','Enregistrer le problème'):tr('Create issue','Créer le problème')}</button>
   </form>
   <div className="mykioo-issue-form">
    <h3>{tr('Link tickets and broadcast updates','Associer les demandes et envoyer les mises à jour')}</h3>
    <label>{tr('Main issue','Problème principal')}<select value={issueId} onChange={e=>setIssueId(e.target.value)}><option value="">{tr('Select main issue','Choisir un problème principal')}</option>{issues.map(i=><option key={i.id} value={i.id}>{i.title} ({statuses[i.status]?.[fr?1:0]})</option>)}</select></label>
    <button type="button" disabled={!issueId||!selected.length||busy} onClick={link}>{tr('Link selected tickets','Associer les demandes sélectionnées')}</button><button type="button" className="mykioo-issue-resolve-all" disabled={!issueId||busy||issues.find(x=>x.id===issueId)?.status!=='resolved'} onClick={resolveLinked}>{tr('Resolve all linked tickets','Résoudre toutes les demandes associées')}</button>
    <small>{tr('First publish an update with status Resolved. This button then completes all outstanding tickets linked to that issue and sends individual completion notices.','Publiez d’abord une mise à jour avec le statut Résolu. Ce bouton termine ensuite toutes les demandes non résolues associées au problème et envoie un avis de résolution à chaque membre.')}</small>
    <form onSubmit={publish} className="mykioo-issue-publish">
     <label>{tr('Update for all linked members','Mise à jour pour tous les membres associés')}<textarea required rows={3} minLength={3} maxLength={4000} value={updateText} onChange={e=>setUpdateText(e.target.value)}/></label>
     <label>{tr('Progress','Progression')}<select value={status} onChange={e=>setStatus(e.target.value)}>{Object.entries(statuses).map(([k,v])=><option key={k} value={k}>{v[fr?1:0]}</option>)}</select></label>
     <button type="submit" disabled={!issueId||busy}>{tr('Publish shared update','Publier la mise à jour commune')}</button>
    </form>
   </div>
  </div>
  {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
  {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  <div className="mykioo-issue-list"><h3>{tr('Known issues','Problèmes connus')}</h3>{issues.length===0?<p>{tr('No main issues yet.','Aucun problème principal.')}</p>:issues.map(i=><div className="mykioo-issue-row" key={i.id}>
    <span><strong>{i.title}</strong><small>{statuses[i.status]?.[fr?1:0]} · {tickets.filter(t=>t.main_issue_id===i.id).length} {tr('tickets linked','demandes associées')}</small></span>
    <button type="button" onClick={()=>{setForm({id:i.id,title:i.title,description:i.description,status:i.status});setIssueId(i.id)}}>{tr('Edit','Modifier')}</button>
    <button type="button" onClick={()=>setIssueId(i.id)}>{tr('Select','Sélectionner')}</button>
   </div>)}</div>
 </section>;
}
