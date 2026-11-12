import React,{useCallback,useEffect,useState} from 'react';
import {BookOpen,Search,Monitor,Smartphone,HelpCircle,ChevronDown,ChevronUp,CheckCircle2,Pencil,Eye,EyeOff} from 'lucide-react';
import {supabase} from './supabase';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-setup-guides';
const categoryOptions=[
 {id:'setup',en:'Installation / Setup',fr:'Installation / Configuration'},
 {id:'troubleshooting',en:'Troubleshooting',fr:'Dépannage'},
 {id:'account',en:'Account & subscription',fr:'Compte et abonnement'}
];
const platformOptions=[
 {id:'general',en:'All devices',fr:'Tous les appareils'},
 {id:'fire_tv',en:'Fire TV / Fire Stick',fr:'Fire TV / Fire Stick'},
 {id:'android_tv',en:'Android TV / Google TV',fr:'Android TV / Google TV'},
 {id:'apple_tv',en:'Apple TV',fr:'Apple TV'},
 {id:'ios',en:'iPhone / iPad',fr:'iPhone / iPad'},
 {id:'android',en:'Android phone / tablet',fr:'Téléphone / tablette Android'},
 {id:'smart_tv',en:'Smart TV',fr:'Téléviseur intelligent'},
 {id:'web',en:'Web browser',fr:'Navigateur Web'},
 {id:'other',en:'Other',fr:'Autre'}
];
const titleFor=(options,id,fr)=>options.find(o=>o.id===id)?.[fr?'fr':'en']||id;
const fresh=()=>({id:'',title_en:'',title_fr:'',summary_en:'',summary_fr:'',steps_en:'',steps_fr:'',category:'setup',platform:'general',published:false,sort_order:0});
const orderGuides=(a,b)=>a.sort_order-b.sort_order||new Date(b.updated_at)-new Date(a.updated_at);

export function useSetupGuides(enabled=true){
 const [guides,setGuides]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const refresh=useCallback(async()=>{
  if(!enabled||!supabase)return;
  try{
   const {data,error:readError}=await supabase.from('mykioo_setup_guides').select('id,title_en,title_fr,summary_en,summary_fr,steps_en,steps_fr,category,platform,published,sort_order,updated_at,created_at').order('sort_order',{ascending:true}).order('updated_at',{ascending:false}).limit(200);
   if(readError)throw readError;
   setGuides(previous=>JSON.stringify(previous)===JSON.stringify(data||[])?previous:data||[]);
   setError('');
  }catch(err){setError(err?.message||'Unable to load guides')}finally{setLoading(false)}
 },[enabled]);
 useEffect(()=>{
  if(!enabled)return;
  refresh();
  const channel=supabase.channel('mykioo-setup-guides-'+Math.random().toString(36).slice(2))
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_setup_guides'},refresh)
   .subscribe(status=>{if(status==='SUBSCRIBED')refresh()});
  const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},120000);
  const onResume=()=>{if(document.visibilityState==='visible')refresh()};
  window.addEventListener('focus',onResume);window.addEventListener('online',onResume);document.addEventListener('visibilitychange',onResume);
  return()=>{clearInterval(timer);window.removeEventListener('focus',onResume);window.removeEventListener('online',onResume);document.removeEventListener('visibilitychange',onResume);supabase.removeChannel(channel)}
 },[enabled,refresh]);
 return {guides,loading,error,refresh};
}

async function ownerAction(payload){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session)throw Error('Please sign in again.');
 const response=await fetch(endpoint,{method:'POST',headers:{
  'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
  'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
 },body:JSON.stringify(payload)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error(result.error||'Unable to save guide');
 return result;
}

function GuideCard({guide,language='en',owner=false}){
 const [expanded,setExpanded]=useState(false);
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const instructions=(fr?guide.steps_fr:guide.steps_en)||'';
 const steps=instructions.split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
 return <article className="mykioo-guide-card">
  <button type="button" className="mykioo-guide-summary-button" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>
   <span className="mykioo-guide-card-icon">{guide.platform==='ios'||guide.platform==='android'?<Smartphone size={20}/>:guide.platform==='account'?<HelpCircle size={20}/>:<Monitor size={20}/>}</span>
   <span className="mykioo-guide-description">
    <strong>{fr?guide.title_fr:guide.title_en}</strong>
    <small>{titleFor(categoryOptions,guide.category,fr)} · {titleFor(platformOptions,guide.platform,fr)}</small>
    <span>{fr?guide.summary_fr:guide.summary_en}</span>
   </span>
   {expanded?<ChevronUp size={19}/>:<ChevronDown size={19}/>}
  </button>
  {expanded&&<div className="mykioo-guide-detail">
   <h4>{tr('Step-by-step instructions','Instructions étape par étape')}</h4>
   <ol>{steps.map((step,i)=><li key={i}>{step.replace(/^\d+[.)]\s*/, '')}</li>)}</ol>
   {owner&&<small>{tr('Only published guides are visible to members.','Seuls les guides publiés sont visibles aux membres.')}</small>}
  </div>}
 </article>;
}

export function MemberSetupGuides({language='en',onOpenSupport}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const {guides,loading,error}=useSetupGuides();
 const [search,setSearch]=useState(''),[category,setCategory]=useState('all'),[platform,setPlatform]=useState('all');
 const visible=guides.filter(g=>g.published).filter(g=>{
  const term=search.trim().toLocaleLowerCase();
  return (!term||[g.title_en,g.title_fr,g.summary_en,g.summary_fr,g.steps_en,g.steps_fr].some(x=>(x||'').toLocaleLowerCase().includes(term)))
    &&(category==='all'||g.category===category)
    &&(platform==='all'||g.platform===platform||g.platform==='general');
 }).sort(orderGuides);
 return <section className="mykioo-guide-page">
  <div className="mykioo-guide-intro">
   <BookOpen size={26}/>
   <div><h2>{tr('Setup & help guides','Guides d’installation et d’aide')}</h2>
    <p>{tr('Find installation instructions and answers to common questions. Select a guide to view its steps.','Trouvez des instructions d’installation et des réponses aux questions fréquentes. Sélectionnez un guide pour voir les étapes.')}</p></div>
  </div>
  <div className="mykioo-guide-filters">
   <label><Search size={16}/><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder={tr('Search help guides…','Rechercher dans les guides…')} aria-label={tr('Search help guides','Rechercher dans les guides')}/></label>
   <select aria-label={tr('Guide category','Catégorie de guide')} value={category} onChange={e=>setCategory(e.target.value)}>
    <option value="all">{tr('All categories','Toutes les catégories')}</option>{categoryOptions.map(opt=><option value={opt.id} key={opt.id}>{fr?opt.fr:opt.en}</option>)}
   </select>
   <select aria-label={tr('Device / platform','Appareil / plateforme')} value={platform} onChange={e=>setPlatform(e.target.value)}>
    <option value="all">{tr('All devices','Tous les appareils')}</option>{platformOptions.filter(opt=>opt.id!=='general').map(opt=><option value={opt.id} key={opt.id}>{fr?opt.fr:opt.en}</option>)}
   </select>
  </div>
  {error&&<p role="alert" className="mykioo-profile-error">{tr('Could not load guides. Please refresh this page.','Impossible de charger les guides. Veuillez actualiser cette page.')}</p>}
  {loading?<p className="mykioo-guide-empty">{tr('Loading guides…','Chargement des guides…')}</p>:
   visible.length===0?<div className="mykioo-guide-empty">
    <BookOpen size={24}/><strong>{guides.length===0?tr('Guides are being prepared.','Les guides sont en préparation.'):tr('No guides match your search.','Aucun guide ne correspond à votre recherche.')}</strong>
    <p>{tr('Need assistance? You can contact MYKIOO Support.','Besoin d’aide ? Vous pouvez contacter l’assistance MYKIOO.')}</p>
   </div>:<div className="mykioo-guide-list">{visible.map(g=><GuideCard key={g.id} guide={g} language={language}/>)}</div>}
  <div className="mykioo-guide-help">
   <div><strong>{tr('Still need help?','Vous avez encore besoin d’aide ?')}</strong>
    <p>{tr('Send a support request. Please allow up to 24 hours for an initial reply.','Envoyez une demande d’assistance. Veuillez prévoir jusqu’à 24 heures pour une première réponse.')}</p></div>
   <button type="button" onClick={()=>onOpenSupport?.()}>{tr('Contact Support','Contacter l’assistance')}</button>
  </div>
 </section>;
}

export function OwnerSetupGuideEditor({language='en'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const {guides,loading,error:readError,refresh}=useSetupGuides();
 const [form,setForm]=useState(fresh),[saving,setSaving]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[filter,setFilter]=useState('all');
 const set=(name,value)=>{setForm(current=>({...current,[name]:value}));setNotice('');setError('')};
 async function save(e){
  e.preventDefault();if(saving)return;
  setSaving(true);setError('');setNotice('');
  try{
   const payload={action:'save',...form,sort_order:Number(form.sort_order)};
   const result=await ownerAction(payload);
   setNotice(result.published?tr('Guide saved and published.','Guide enregistré et publié.'):tr('Guide saved as a draft.','Guide enregistré comme brouillon.'));
   setForm(fresh());await refresh();
  }catch(err){setError(err?.message||tr('Could not save guide.','Impossible d’enregistrer le guide.'))}finally{setSaving(false)}
 }
 async function toggle(guide){
  if(saving)return;setSaving(true);setError('');setNotice('');
  try{
   await ownerAction({action:'set_published',id:guide.id,published:!guide.published});
   setNotice(!guide.published?tr('Guide published.','Guide publié.'):tr('Guide unpublished.','Guide retiré.'));
   if(form.id===guide.id)setForm(current=>({...current,published:!guide.published}));
   await refresh();
  }catch(err){setError(err?.message||tr('Could not change publication status.','Impossible de modifier la publication.'))}finally{setSaving(false)}
 }
 return <section className="mykioo-guide-editor">
  <div className="mykioo-guide-editor-heading"><BookOpen size={22}/><div><h2>{tr('Setup guide library','Bibliothèque des guides')}</h2>
   <p>{tr('Create installation and troubleshooting help in English and French. Save drafts privately, then publish when ready.','Créez des guides d’installation et de dépannage en anglais et en français. Enregistrez des brouillons privés, puis publiez-les lorsque vous êtes prêt.')}</p></div></div>
  <form className="mykioo-guide-editor-form" onSubmit={save}>
   <h3>{form.id?tr('Edit guide','Modifier le guide'):tr('Create a guide','Créer un guide')}</h3>
   <div className="mykioo-guide-editor-grid">
    <label>{tr('English title','Titre anglais')}<input required minLength={5} maxLength={120} value={form.title_en} onChange={e=>set('title_en',e.target.value)}/></label>
    <label>{tr('French title','Titre français')}<input required minLength={5} maxLength={120} value={form.title_fr} onChange={e=>set('title_fr',e.target.value)}/></label>
    <label>{tr('English summary','Résumé anglais')}<textarea required rows={2} minLength={10} maxLength={500} value={form.summary_en} onChange={e=>set('summary_en',e.target.value)}/></label>
    <label>{tr('French summary','Résumé français')}<textarea required rows={2} minLength={10} maxLength={500} value={form.summary_fr} onChange={e=>set('summary_fr',e.target.value)}/></label>
    <label>{tr('English steps (one per line)','Étapes anglaises (une par ligne)')}<textarea required rows={7} minLength={10} maxLength={7000} value={form.steps_en} onChange={e=>set('steps_en',e.target.value)} placeholder="Open the app&#10;Sign in with your own account&#10;Check the connection"/></label>
    <label>{tr('French steps (one per line)','Étapes françaises (une par ligne)')}<textarea required rows={7} minLength={10} maxLength={7000} value={form.steps_fr} onChange={e=>set('steps_fr',e.target.value)} placeholder="Ouvrez l’application&#10;Connectez-vous avec votre compte&#10;Vérifiez la connexion"/></label>
    <label>{tr('Category','Catégorie')}<select value={form.category} onChange={e=>set('category',e.target.value)}>{categoryOptions.map(opt=><option key={opt.id} value={opt.id}>{fr?opt.fr:opt.en}</option>)}</select></label>
    <label>{tr('Device / platform','Appareil / plateforme')}<select value={form.platform} onChange={e=>set('platform',e.target.value)}>{platformOptions.map(opt=><option key={opt.id} value={opt.id}>{fr?opt.fr:opt.en}</option>)}</select></label>
    <label>{tr('Display order','Ordre d’affichage')}<input type="number" min={0} max={9999} value={form.sort_order} onChange={e=>set('sort_order',e.target.value)}/></label>
    <label className="mykioo-guide-publish-checkbox"><input type="checkbox" checked={form.published} onChange={e=>set('published',e.target.checked)}/>{tr('Publish to members','Publier aux membres')}</label>
   </div>
   <div className="mykioo-guide-actions">
    <button type="submit" disabled={saving}>{saving?tr('Saving…','Enregistrement…'):form.id?tr('Save changes','Enregistrer les modifications'):tr('Save guide','Enregistrer le guide')}</button>
    {form.id&&<button type="button" disabled={saving} onClick={()=>setForm(fresh())}>{tr('Cancel editing','Annuler la modification')}</button>}
   </div>
  </form>
  {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
  {readError&&<p role="alert" className="mykioo-profile-error">{tr('Unable to load the guide library.','Impossible de charger la bibliothèque des guides.')}</p>}
  {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  <div className="mykioo-guide-owner-list">
   <div className="mykioo-guide-owner-top"><h3>{tr('Your guides','Vos guides')} ({guides.length})</h3><select value={filter} onChange={e=>setFilter(e.target.value)}>
    <option value="all">{tr('All','Tous')}</option><option value="published">{tr('Published','Publiés')}</option><option value="draft">{tr('Drafts','Brouillons')}</option></select>
   </div>
   {loading?<p>{tr('Loading…','Chargement…')}</p>:guides.length===0?<p>{tr('No guides created yet. Start with a frequently asked question.','Aucun guide créé. Commencez par une question fréquente.')}</p>:
    guides.filter(g=>filter==='all'||(filter==='published'?g.published:!g.published)).sort(orderGuides).map(g=><article className="mykioo-guide-owner-row" key={g.id}>
     <span><strong>{fr?g.title_fr:g.title_en}</strong><small>{titleFor(categoryOptions,g.category,fr)} · {titleFor(platformOptions,g.platform,fr)}</small>
      <small className={g.published?'mykioo-guide-published':'mykioo-guide-draft'}>{g.published?tr('Published','Publié'):tr('Draft / private','Brouillon / privé')}</small></span>
     <button type="button" onClick={()=>{setForm({id:g.id,title_en:g.title_en,title_fr:g.title_fr,summary_en:g.summary_en,summary_fr:g.summary_fr,steps_en:g.steps_en,steps_fr:g.steps_fr,category:g.category,platform:g.platform,published:g.published,sort_order:g.sort_order});setNotice('');setError('');}}><Pencil size={14}/>{tr('Edit','Modifier')}</button>
     <button type="button" disabled={saving} onClick={()=>toggle(g)}>{g.published?<EyeOff size={14}/>:<Eye size={14}/>}
      {g.published?tr('Unpublish','Retirer'):tr('Publish','Publier')}</button>
    </article>)}
  </div>
 </section>;
}
