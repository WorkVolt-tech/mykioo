import React,{useEffect,useRef,useState} from 'react';
import {mykiooConfirm} from './MykiooDialog.jsx';
import {Plus,Save,RefreshCw,Eye,EyeOff,Pencil,Trash2,Megaphone} from 'lucide-react';
import {supabase} from './supabase';
import {WebsiteAnnouncementBanner} from './WebsiteAnnouncements';

const API='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-website-announcements';
const blank=()=>({
 id:'',title_en:'',title_fr:'',message_en:'',message_fr:'',
 tone:'warning',audience:'all',is_published:false,starts_at:'',ends_at:''
});
const localDate=value=>{
 if(!value)return '';
 const parsed=new Date(value);
 if(Number.isNaN(parsed.getTime()))return '';
 return new Date(parsed.getTime()-parsed.getTimezoneOffset()*60000).toISOString().slice(0,16);
};
const levels=[
 {id:'success',en:'Green — Resolved',fr:'Vert — Résolu',enHelp:'An issue has been fixed or service restored',frHelp:'Un problème est corrigé ou le service est rétabli',color:'#70d89c'},
 {id:'warning',en:'Yellow — Regular issue',fr:'Jaune — Problème courant',enHelp:'Updates, minor problems and routine notices',frHelp:'Mises à jour, problèmes mineurs et avis courants',color:'#edc66b'},
 {id:'urgent',en:'Red — Urgent',fr:'Rouge — Urgent',enHelp:'Important incidents requiring immediate attention',frHelp:'Incidents importants nécessitant une attention immédiate',color:'#ff8792'}
];
const audiences=[
 {id:'all',en:'Everyone — login, members and owner',fr:'Tout le monde — connexion, membres et propriétaire'},
 {id:'guest',en:'Login / invitation page only',fr:'Page de connexion / invitation uniquement'},
 {id:'member',en:'Approved members only',fr:'Membres approuvés uniquement'},
 {id:'owner',en:'Owner dashboard only',fr:'Tableau de bord propriétaire uniquement'}
];
async function adminRequest(payload){
 if(!supabase)throw Error('Service is not configured.');
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session?.access_token)throw Error('Sign in again to manage announcements.');
 const response=await fetch(API,{
  method:'POST',
  headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
  body:JSON.stringify(payload)
 });
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error(result.error||'Unable to save announcement.');
 return result;
}

export default function OwnerWebsiteAnnouncements({language='en'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [items,setItems]=useState([]),[form,setForm]=useState(blank);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const formRef=useRef(null);
 async function refresh(){
  setLoading(true);setError('');
  try{
   const result=await adminRequest({action:'read'});
   setItems(result.announcements||[]);
  }catch(e){setError(e.message||tr('Could not load announcements.','Impossible de charger les annonces.'))}
  finally{setLoading(false)}
 }
 useEffect(()=>{refresh()},[]);
 const change=(field,value)=>{setForm(x=>({...x,[field]:value}));setNotice('');setError('')};
 function edit(item){
  setForm({
   id:item.id,title_en:item.title_en,title_fr:item.title_fr,
   message_en:item.message_en,message_fr:item.message_fr,
   tone:item.tone,audience:item.audience,is_published:item.is_published,
   starts_at:localDate(item.starts_at),ends_at:localDate(item.ends_at)
  });
  setNotice('');setError('');
  formRef.current?.scrollIntoView({behavior:'smooth',block:'start'});
 }
 async function save(event){
  event.preventDefault();if(saving)return;
  setSaving(true);setNotice('');setError('');
  try{
   const payload={
    ...form,action:'save',
    starts_at:form.starts_at?new Date(form.starts_at).toISOString():null,
    ends_at:form.ends_at?new Date(form.ends_at).toISOString():null
   };
   await adminRequest(payload);
   setNotice(form.is_published?
    tr('Announcement saved and published.','Annonce enregistrée et publiée.'):
    tr('Announcement saved as an unpublished draft.','Annonce enregistrée comme brouillon non publié.'));
   setForm(blank());
   await refresh();
  }catch(e){setError(e.message||tr('Could not save announcement.','Impossible d’enregistrer l’annonce.'))}
  finally{setSaving(false)}
 }
 async function toggle(item){
  if(saving)return;setSaving(true);setNotice('');setError('');
  try{
   await adminRequest({action:'toggle',id:item.id,is_published:!item.is_published});
   setNotice(!item.is_published?tr('Announcement enabled.','Annonce activée.'):tr('Announcement hidden from the website.','Annonce masquée sur le site.'));
   await refresh();
  }catch(e){setError(e.message)}finally{setSaving(false)}
 }
 async function remove(item){
  if(saving)return;
  if(!await mykiooConfirm(tr('Permanently delete this announcement?','Supprimer définitivement cette annonce ?')))return;
  setSaving(true);setNotice('');setError('');
  try{
   await adminRequest({action:'delete',id:item.id});
   if(form.id===item.id)setForm(blank());
   setNotice(tr('Announcement permanently deleted.','Annonce supprimée définitivement.'));
   await refresh();
  }catch(e){setError(e.message)}finally{setSaving(false)}
 }
 function status(item){
  if(!item.is_published)return tr('Hidden / draft','Masquée / brouillon');
  const now=Date.now(),start=Date.parse(item.starts_at),end=item.ends_at?Date.parse(item.ends_at):null;
  if(start>now)return tr('Scheduled','Planifiée');
  if(end!==null&&end<=now)return tr('Expired','Expirée');
  return tr('Live','En ligne');
 }
 return <section className="mykioo-announcement-manager">
  <div><h2><Megaphone size={21}/> {tr('Website announcements','Annonces du site Web')}</h2>
   <p className="announcement-intro">{tr('Publish bilingual announcements across MYKIOO. Choose green for resolved issues, yellow for regular notices, or red for urgent problems. You can edit, hide, schedule, or permanently delete a notice. Service status announcements are managed separately in Support.','Publiez des annonces bilingues sur MYKIOO. Choisissez vert pour les problèmes résolus, jaune pour les avis courants et rouge pour les urgences. Vous pouvez modifier, masquer, planifier ou supprimer définitivement une annonce. Les alertes de service sont gérées séparément dans Assistance.')}</p>
  </div>
  <form ref={formRef} className="announcement-manager-form" onSubmit={save}>
   <h3>{form.id?tr('Edit website announcement','Modifier l’annonce du site'):tr('New website announcement','Nouvelle annonce du site')}</h3>
   <div className="announcement-manager-grid">
    <label>{tr('English title','Titre anglais')}<input required minLength={4} maxLength={120} value={form.title_en} onChange={e=>change('title_en',e.target.value)}/></label>
    <label>{tr('French title','Titre français')}<input required minLength={4} maxLength={120} value={form.title_fr} onChange={e=>change('title_fr',e.target.value)}/></label>
    <label>{tr('English message','Message anglais')}<textarea required minLength={10} maxLength={2000} rows={4} value={form.message_en} onChange={e=>change('message_en',e.target.value)}/></label>
    <label>{tr('French message','Message français')}<textarea required minLength={10} maxLength={2000} rows={4} value={form.message_fr} onChange={e=>change('message_fr',e.target.value)}/></label>
   </div>
   <strong>{tr('Announcement colour and priority','Couleur et priorité de l’annonce')}</strong>
   <div className="announcement-tone-options">
    {levels.map(level=><button type="button" key={level.id}
     style={{'--tone':level.color}}
     aria-pressed={form.tone===level.id} className={form.tone===level.id?'selected':''}
     onClick={()=>change('tone',level.id)}>
     <strong>{fr?level.fr:level.en}</strong>
     <small>{fr?level.frHelp:level.enHelp}</small>
    </button>)}
   </div>
   <div className="announcement-manager-grid">
    <label>{tr('Who should see it?','Qui doit voir l’annonce ?')}
     <select value={form.audience} onChange={e=>change('audience',e.target.value)}>
      {audiences.map(a=><option key={a.id} value={a.id}>{fr?a.fr:a.en}</option>)}
     </select>
    </label>
    <label>{tr('Start date/time (blank: now)','Début (vide : maintenant)')}
     <input type="datetime-local" value={form.starts_at} onChange={e=>change('starts_at',e.target.value)}/>
    </label>
    <label>{tr('End date/time (optional)','Fin (facultative)')}
     <input type="datetime-local" min={form.starts_at||undefined} value={form.ends_at} onChange={e=>change('ends_at',e.target.value)}/>
    </label>
    <label className="announcement-toggle">
     <input type="checkbox" checked={form.is_published} onChange={e=>change('is_published',e.target.checked)}/>
     {tr('Publish announcement (otherwise save privately)','Publier l’annonce (sinon enregistrer en privé)')}
    </label>
   </div>
   {(form.title_en.trim()&&form.title_fr.trim()&&form.message_en.trim()&&form.message_fr.trim())?
    <div className="announcement-preview"><strong>{tr('Preview','Aperçu')}</strong><WebsiteAnnouncementBanner announcement={form} language={language}/></div>:null}
   <div className="announcement-manager-actions">
    <button className="primary" type="submit" disabled={saving||loading}><Save size={15}/> {saving?tr('Saving…','Enregistrement…'):form.id?tr('Save changes','Enregistrer les modifications'):tr('Save announcement','Enregistrer l’annonce')}</button>
    <button type="button" disabled={saving} onClick={()=>{setForm(blank());setError('');setNotice('')}}><Plus size={15}/>{tr('Clear form / new','Nouveau / effacer')}</button>
    <button type="button" disabled={loading||saving} onClick={refresh}><RefreshCw size={15}/>{tr('Refresh list','Actualiser')}</button>
   </div>
   {error&&<p className="announcement-manager-status error" role="alert">{error}</p>}
   {notice&&<p className="announcement-manager-status" role="status">{notice}</p>}
  </form>
  <section className="announcement-manager-list">
   <h3>{tr('Your announcements','Vos annonces')} ({items.length})</h3>
   {loading?<p className="announcement-manager-empty">{tr('Loading announcements…','Chargement des annonces…')}</p>:
    items.length===0?<p className="announcement-manager-empty">{tr('No announcements yet. Create your first one above.','Aucune annonce pour le moment. Créez la première ci-dessus.')}</p>:
    items.map(item=><article className="announcement-manager-item" key={item.id}>
     <div className="announcement-manager-item-main">
      <strong>{fr?item.title_fr:item.title_en}</strong>
      <small>{levels.find(l=>l.id===item.tone)?.[fr?'fr':'en']} · {audiences.find(a=>a.id===item.audience)?.[fr?'fr':'en']} · {status(item)}</small>
      <small>{tr('Starts','Début')} {new Date(item.starts_at).toLocaleString(fr?'fr-CA':'en-CA')}{item.ends_at?' · '+tr('Ends','Fin')+' '+new Date(item.ends_at).toLocaleString(fr?'fr-CA':'en-CA'):''}</small>
     </div>
     <div className="announcement-manager-item-actions">
      <button type="button" disabled={saving} onClick={()=>edit(item)}><Pencil size={14}/>{tr('Edit','Modifier')}</button>
      <button type="button" disabled={saving} onClick={()=>toggle(item)}>{item.is_published?<EyeOff size={14}/>:<Eye size={14}/>} {item.is_published?tr('Hide','Masquer'):tr('Publish','Publier')}</button>
      <button type="button" className="danger" disabled={saving} onClick={()=>remove(item)}><Trash2 size={14}/>{tr('Delete','Supprimer')}</button>
     </div>
    </article>)
   }
  </section>
 </section>;
}
