import React,{useCallback,useEffect,useState} from 'react';
import {supabase} from './supabase';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-support-templates';
const cats={login:['Login / Account','Connexion / Compte'],streaming:['Buffering / Playback','Lecture / Mise en mémoire tampon'],channels:['Channels','Chaînes'],billing:['Subscription / Billing','Abonnement / Facturation'],setup:['Setup','Installation'],other:['General','Général']};
const fresh=()=>({id:'',title_en:'',title_fr:'',body_en:'',body_fr:'',category:'other',is_active:true});
export function useReplyTemplates(enabled=true){
 const [templates,setTemplates]=useState([]);
 const refresh=useCallback(async()=>{
  if(!enabled||!supabase)return;
  const {data,error}=await supabase.from('mykioo_support_reply_templates').select('*').order('sort_order').order('title_en').limit(100);
  if(!error)setTemplates(old=>JSON.stringify(old)===JSON.stringify(data||[])?old:data||[]);
 },[enabled]);
 useEffect(()=>{
  if(!enabled)return;refresh();
  const channel=supabase.channel('mykioo-reply-templates-'+Math.random().toString(36).slice(2))
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_support_reply_templates'},refresh).subscribe(status=>{if(status==='SUBSCRIBED')refresh()});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},12000);
  const resume=()=>{if(document.visibilityState==='visible')refresh()};
  window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return()=>{clearInterval(timer);window.removeEventListener('focus',resume);window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);supabase.removeChannel(channel)};
 },[enabled,refresh]);
 return {templates,refresh};
}
async function call(payload){
 const {data:{session},error:authError}=await supabase.auth.getSession();
 if(authError||!session)throw Error('Please sign in again.');
 const response=await fetch(endpoint,{method:'POST',headers:{
  'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
  'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
 },body:JSON.stringify(payload)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error(result.error||'Unable to save template.');
 return result;
}
export function ReplyTemplateEditor({language='en'}){
 const fr=language==='fr',tr=(en,frText)=>fr?frText:en;
 const {templates,refresh}=useReplyTemplates();
 const [form,setForm]=useState(fresh),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 function set(field,value){setForm(current=>({...current,[field]:value}));setError('');setNotice('')}
 async function save(e){
  e.preventDefault();if(saving)return;setSaving(true);setError('');setNotice('');
  try{await call({action:'save',...form});setForm(fresh());setNotice(tr('Saved reply template.','Réponse enregistrée.'));await refresh()}
  catch(err){setError(err.message)}finally{setSaving(false)}
 }
 async function toggle(t){
  if(saving)return;setSaving(true);setError('');setNotice('');
  try{await call({action:'set_active',id:t.id,is_active:!t.is_active});setNotice(tr('Template status updated.','Statut de la réponse mis à jour.'));await refresh()}
  catch(err){setError(err.message)}finally{setSaving(false)}
 }
 return <section className="mykioo-template-manager">
  <h2>{tr('Saved support replies','Réponses d’assistance enregistrées')}</h2>
  <p>{tr('Write each reply in English and French. Select one when replying to a ticket, then review the draft before sending.','Rédigez chaque réponse en anglais et en français. Sélectionnez-la dans une demande, puis vérifiez le brouillon avant de l’envoyer.')}</p>
  <form onSubmit={save} className="mykioo-template-form">
   <label>{tr('English title','Titre anglais')}<input minLength={3} maxLength={100} required value={form.title_en} onChange={e=>set('title_en',e.target.value)}/></label>
   <label>{tr('French title','Titre français')}<input minLength={3} maxLength={100} required value={form.title_fr} onChange={e=>set('title_fr',e.target.value)}/></label>
   <label className="wide">{tr('English reply','Réponse anglaise')}<textarea rows={4} minLength={5} maxLength={4000} required value={form.body_en} onChange={e=>set('body_en',e.target.value)}/></label>
   <label className="wide">{tr('French reply','Réponse française')}<textarea rows={4} minLength={5} maxLength={4000} required value={form.body_fr} onChange={e=>set('body_fr',e.target.value)}/></label>
   <label>{tr('Category','Catégorie')}<select value={form.category} onChange={e=>set('category',e.target.value)}>{Object.entries(cats).map(([key,v])=><option key={key} value={key}>{v[fr?1:0]}</option>)}</select></label>
   <label className="mykioo-template-active"><input type="checkbox" checked={form.is_active} onChange={e=>set('is_active',e.target.checked)}/>{tr('Available to insert','Disponible pour insertion')}</label>
   <div className="mykioo-template-form-actions"><button disabled={saving} type="submit">{saving?tr('Saving…','Enregistrement…'):form.id?tr('Update reply','Modifier la réponse'):tr('Save reply','Enregistrer la réponse')}</button>{form.id&&<button type="button" onClick={()=>setForm(fresh())}>{tr('Cancel','Annuler')}</button>}</div>
  </form>
  {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}{notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  <div className="mykioo-template-list">{templates.length===0?<p>{tr('No saved replies yet. Create your first one above.','Aucune réponse enregistrée. Créez la première ci-dessus.')}</p>:templates.map(t=><article key={t.id} className="mykioo-template-row">
   <div><strong>{fr?t.title_fr:t.title_en}</strong><small>{cats[t.category]?.[fr?1:0]} · {t.is_active?tr('Available','Disponible'):tr('Inactive','Inactive')}</small></div>
   <button type="button" onClick={()=>{setForm({id:t.id,title_en:t.title_en,title_fr:t.title_fr,body_en:t.body_en,body_fr:t.body_fr,category:t.category,is_active:t.is_active});setNotice('');setError('')}}>{tr('Edit','Modifier')}</button>
   <button type="button" disabled={saving} onClick={()=>toggle(t)}>{t.is_active?tr('Disable','Désactiver'):tr('Enable','Activer')}</button>
  </article>)}</div>
 </section>;
}
