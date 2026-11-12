import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {BookOpen,Search,HelpCircle,ChevronDown,ChevronUp,ArrowRight,FileQuestion,Eye,EyeOff,Pencil,Lightbulb} from 'lucide-react';
import {supabase} from './supabase';
import {useSetupGuides} from './SetupGuides';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-support-faqs';
const categories=[
 {id:'login',en:'Login / Account',fr:'Connexion / Compte'},
 {id:'streaming',en:'Buffering / Playback',fr:'Lecture / Chargement'},
 {id:'channels',en:'Missing channels',fr:'Chaînes manquantes'},
 {id:'billing',en:'Subscription / Billing',fr:'Abonnement / Facturation'},
 {id:'setup',en:'Installation / Setup',fr:'Installation / Configuration'},
 {id:'other',en:'General questions',fr:'Questions générales'}
];
const label=(category,fr)=>categories.find(c=>c.id===category)?.[fr?'fr':'en']||category;
const empty=()=>({id:'',question_en:'',question_fr:'',answer_en:'',answer_fr:'',category:'other',
 guide_id:'',sort_order:0,published:false});
const scoreText=(source,words)=>{
 const normalized=(source||'').toLocaleLowerCase();
 return words.reduce((score,word)=>score+(word&&normalized.includes(word)?1:0),0);
};
function useFAQs(enabled=true){
 const [faqs,setFAQs]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState('');
 const refresh=useCallback(async()=>{
  if(!enabled)return;
  try{
   const {data,error:readError}=await supabase.from('mykioo_support_faqs')
    .select('id,question_en,question_fr,answer_en,answer_fr,category,guide_id,published,sort_order,updated_at')
    .order('sort_order',{ascending:true}).order('updated_at',{ascending:false}).limit(200);
   if(readError)throw readError;
   setFAQs(previous=>JSON.stringify(previous)===JSON.stringify(data||[])?previous:data||[]);
   setError('');
  }catch(err){setError(err?.message||'Could not load FAQs')}finally{setLoading(false)}
 },[enabled]);
 useEffect(()=>{
  if(!enabled)return;
  refresh();
  const channel=supabase.channel('mykioo-faq-'+Math.random().toString(36).slice(2))
   .on('postgres_changes',{event:'*',schema:'public',table:'mykioo_support_faqs'},refresh)
   .subscribe(status=>{if(status==='SUBSCRIBED')refresh()});
  const interval=setInterval(()=>{if(document.visibilityState==='visible')refresh()},16000);
  const resume=()=>{if(document.visibilityState==='visible')refresh()};
  window.addEventListener('focus',resume);window.addEventListener('online',resume);document.addEventListener('visibilitychange',resume);
  return()=>{clearInterval(interval);window.removeEventListener('focus',resume);
   window.removeEventListener('online',resume);document.removeEventListener('visibilitychange',resume);
   supabase.removeChannel(channel)};
 },[enabled,refresh]);
 return {faqs,loading,error,refresh};
}
async function manage(payload){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session)throw Error('Sign in again to continue.');
 const response=await fetch(endpoint,{method:'POST',headers:{
  'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
  'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
 },body:JSON.stringify(payload)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error(result.error||'Unable to manage FAQ.');
 return result;
}

function Question({faq,language,guide}){
 const [expanded,setExpanded]=useState(false);
 const [showGuide,setShowGuide]=useState(false);
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const answer=fr?faq.answer_fr:faq.answer_en;
 const steps=(fr?guide?.steps_fr:guide?.steps_en||'')?.split(/\r?\n/).map(t=>t.trim()).filter(Boolean)||[];
 return <article className="mykioo-faq-question">
  <button type="button" className="mykioo-faq-question-toggle" onClick={()=>setExpanded(value=>!value)} aria-expanded={expanded}>
   <span><strong>{fr?faq.question_fr:faq.question_en}</strong><small>{label(faq.category,fr)}</small></span>
   {expanded?<ChevronUp size={19}/>:<ChevronDown size={19}/>}
  </button>
  {expanded&&<div className="mykioo-faq-answer">
   <p>{answer}</p>
   {guide?.published&&<div className="mykioo-faq-linked-guide">
    <button type="button" onClick={()=>setShowGuide(open=>!open)} aria-expanded={showGuide}>
     <BookOpen size={16}/>{tr('Related guide','Guide associé')}: {fr?guide.title_fr:guide.title_en}
     {showGuide?<ChevronUp size={15}/>:<ChevronDown size={15}/>}
    </button>
    {showGuide&&<div><p>{fr?guide.summary_fr:guide.summary_en}</p>
     <ol>{steps.map((step,index)=><li key={index}>{step.replace(/^\d+[.)]\s*/,'')}</li>)}</ol>
    </div>}
   </div>}
  </div>}
 </article>;
}

export function MemberSupportFAQ({language='en',category='other',subject='',onOpenGuides}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const {faqs,loading,error}=useFAQs();
 const {guides}=useSetupGuides();
 const [search,setSearch]=useState('');
 const [showAll,setShowAll]=useState(false);
 const query=(search.trim()||subject.trim()).toLocaleLowerCase();
 const words=query.length>=3?query.split(/\s+/).filter(w=>w.length>=3):[];
 const visible=useMemo(()=>{
  const ranked=faqs.filter(f=>f.published).map(f=>{
   const categoryBoost=f.category===category?6:f.category==='other'?1:0;
   const match=scoreText([f.question_en,f.question_fr].join(' '),words)*4+
     scoreText([f.answer_en,f.answer_fr].join(' '),words);
   return {faq:f,rank:categoryBoost+match,match};
  }).filter(({faq,match})=>words.length?match>0:faq.category===category||faq.category==='other')
    .sort((a,b)=>b.rank-a.rank||a.faq.sort_order-b.faq.sort_order);
  return ranked.slice(0,showAll?20:5).map(x=>x.faq);
 },[faqs,category,query,showAll]);
 const suggested=useMemo(()=>{
  const guidesPublished=guides.filter(g=>g.published);
  const guideCategory={login:'account',billing:'account',setup:'setup',streaming:'troubleshooting',channels:'troubleshooting',other:null}[category];
  const scored=guidesPublished.map(g=>{
   const c=guideCategory&&g.category===guideCategory?5:0;
   const m=scoreText([g.title_en,g.title_fr,g.summary_en,g.summary_fr].join(' '),words)*3;
   return {guide:g,score:c+m};
  }).filter(item=>words.length?item.score>0:!guideCategory||item.guide.category===guideCategory)
    .sort((a,b)=>b.score-a.score||a.guide.sort_order-b.guide.sort_order);
  return scored.slice(0,3).map(x=>x.guide);
 },[guides,category,query]);
 const published=faqs.filter(f=>f.published).length;
 return <section className="mykioo-faq-member">
  <div className="mykioo-faq-heading"><Lightbulb size={22}/><div>
   <h2>{tr('Answers before you contact support','Des réponses avant de contacter l’assistance')}</h2>
   <p>{tr('Find an answer yourself, or continue to submit a support request below.','Trouvez une réponse ou continuez pour envoyer une demande d’assistance ci-dessous.')}</p>
  </div></div>
  <label className="mykioo-faq-search"><Search size={17}/><input type="search" value={search} onChange={e=>{setSearch(e.target.value);setShowAll(false)}}
   placeholder={tr('Search common questions…','Rechercher des questions fréquentes…')} aria-label={tr('Search common questions','Rechercher des questions fréquentes')}/></label>
  {!search.trim()&&subject.trim().length>=3&&<p className="mykioo-faq-suggestions-note">
   {tr('Suggested for your ticket subject:','Suggestions selon le sujet de votre demande :')} <strong>{subject.trim()}</strong>
  </p>}
  {error&&<p role="alert" className="mykioo-profile-error">{tr('Unable to load FAQs. Please refresh.','Impossible de charger la FAQ. Veuillez actualiser.')}</p>}
  {loading?<p className="mykioo-faq-empty">{tr('Loading common questions…','Chargement des questions fréquentes…')}</p>:
   visible.length?<div className="mykioo-faq-items">{visible.map(f=><Question key={f.id} faq={f} language={language}
    guide={guides.find(g=>g.id===f.guide_id&&g.published)}/>)}</div>:
   <p className="mykioo-faq-empty">{published===0?tr('FAQs are being prepared. You can still submit a ticket below.','Les questions fréquentes sont en préparation. Vous pouvez toujours envoyer une demande ci-dessous.'):
    tr('No published answers match yet. You can still contact support.','Aucune réponse publiée ne correspond. Vous pouvez toujours contacter l’assistance.')}</p>}
  {published>visible.length&&!showAll&&!words.length&&<button className="mykioo-faq-showmore" type="button" onClick={()=>setShowAll(true)}>
   {tr('Show more questions','Afficher plus de questions')} <ChevronDown size={15}/></button>}
  {suggested.length>0&&<div className="mykioo-faq-guide-suggestions">
   <h3><BookOpen size={17}/>{tr('Suggested help guides','Guides d’aide suggérés')}</h3>
   {suggested.map(g=><div key={g.id}><strong>{fr?g.title_fr:g.title_en}</strong><small>{fr?g.summary_fr:g.summary_en}</small></div>)}
   {onOpenGuides&&<button type="button" onClick={onOpenGuides}>{tr('Open Setup Guides','Ouvrir les guides d’installation')}<ArrowRight size={15}/></button>}
  </div>}
 </section>;
}

export function OwnerFAQEditor({language='en'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const {faqs,loading,error:loadError,refresh}=useFAQs();
 const {guides}=useSetupGuides();
 const [form,setForm]=useState(empty),[saving,setSaving]=useState(false),
   [notice,setNotice]=useState(''),[error,setError]=useState(''),[filter,setFilter]=useState('all');
 const update=(field,value)=>{setForm(old=>({...old,[field]:value}));setError('');setNotice('')};
 async function save(e){
  e.preventDefault();if(saving)return;
  setSaving(true);setError('');setNotice('');
  try{
   const result=await manage({...form,sort_order:Number(form.sort_order),guide_id:form.guide_id||null,action:'save'});
   setNotice(result.published?tr('FAQ saved and published.','FAQ enregistrée et publiée.'):tr('FAQ saved as a private draft.','FAQ enregistrée comme brouillon privé.'));
   setForm(empty());await refresh();
  }catch(err){setError(err.message||tr('Could not save FAQ.','Impossible d’enregistrer la FAQ.'))}finally{setSaving(false)}
 }
 async function changePublished(faq){
  if(saving)return;
  setSaving(true);setError('');setNotice('');
  try{
   await manage({action:'set_published',id:faq.id,published:!faq.published});
   setNotice(faq.published?tr('FAQ unpublished.','FAQ retirée.'):tr('FAQ published.','FAQ publiée.'));
   if(form.id===faq.id)setForm(x=>({...x,published:!faq.published}));
   await refresh();
  }catch(err){setError(err.message||tr('Could not change publication status.','Impossible de modifier la publication.'))}
  finally{setSaving(false)}
 }
 return <section className="mykioo-faq-owner">
  <div className="mykioo-faq-heading"><FileQuestion size={24}/><div>
   <h2>{tr('Support FAQs','Questions fréquentes de l’assistance')}</h2>
   <p>{tr('Write bilingual answers to common questions. Optionally link a published setup guide. Only published FAQs are shown to members.','Rédigez des réponses bilingues aux questions fréquentes. Associez un guide publié au besoin. Seules les FAQ publiées sont visibles aux membres.')}</p>
  </div></div>
  <form className="mykioo-faq-edit-form" onSubmit={save}>
   <h3>{form.id?tr('Edit FAQ','Modifier la FAQ'):tr('Create FAQ','Créer une FAQ')}</h3>
   <div className="mykioo-faq-edit-grid">
    <label>{tr('Question in English','Question en anglais')}<input required minLength={8} maxLength={180} value={form.question_en} onChange={e=>update('question_en',e.target.value)}/></label>
    <label>{tr('Question in French','Question en français')}<input required minLength={8} maxLength={180} value={form.question_fr} onChange={e=>update('question_fr',e.target.value)}/></label>
    <label>{tr('Answer in English','Réponse en anglais')}<textarea rows={4} required minLength={10} maxLength={4000} value={form.answer_en} onChange={e=>update('answer_en',e.target.value)}/></label>
    <label>{tr('Answer in French','Réponse en français')}<textarea rows={4} required minLength={10} maxLength={4000} value={form.answer_fr} onChange={e=>update('answer_fr',e.target.value)}/></label>
    <label>{tr('Support category','Catégorie d’assistance')}<select value={form.category} onChange={e=>update('category',e.target.value)}>
     {categories.map(c=><option value={c.id} key={c.id}>{fr?c.fr:c.en}</option>)}</select></label>
    <label>{tr('Related setup guide (optional)','Guide associé (facultatif)')}<select value={form.guide_id} onChange={e=>update('guide_id',e.target.value)}>
     <option value="">{tr('None','Aucun')}</option>
     {guides.map(g=><option key={g.id} value={g.id}>{fr?g.title_fr:g.title_en}{g.published?'':tr(' (draft)',' (brouillon)')}</option>)}
    </select></label>
    <label>{tr('Display order','Ordre d’affichage')}<input type="number" min={0} max={9999} value={form.sort_order} onChange={e=>update('sort_order',e.target.value)}/></label>
    <label className="mykioo-faq-publish"><input type="checkbox" checked={form.published} onChange={e=>update('published',e.target.checked)}/>{tr('Publish to approved members','Publier aux membres approuvés')}</label>
   </div>
   <div className="mykioo-faq-actions"><button type="submit" disabled={saving}>{saving?tr('Saving…','Enregistrement…'):form.id?tr('Save changes','Enregistrer les modifications'):tr('Save FAQ','Enregistrer la FAQ')}</button>
    {form.id&&<button type="button" disabled={saving} onClick={()=>setForm(empty())}>{tr('Cancel edit','Annuler')}</button>}
   </div>
  </form>
  {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
  {loadError&&<p role="alert" className="mykioo-profile-error">{tr('Could not load FAQs.','Impossible de charger les FAQ.')}</p>}
  {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
  <div className="mykioo-faq-manage">
   <div className="mykioo-faq-manage-head"><h3>{tr('Your questions','Vos questions')} ({faqs.length})</h3>
    <select value={filter} onChange={e=>setFilter(e.target.value)} aria-label={tr('Filter FAQs','Filtrer les FAQ')}>
     <option value="all">{tr('All','Toutes')}</option>
     <option value="published">{tr('Published','Publiées')}</option><option value="draft">{tr('Drafts','Brouillons')}</option>
    </select>
   </div>
   {loading?<p>{tr('Loading…','Chargement…')}</p>:
    faqs.length===0?<p>{tr('No FAQs yet. Add answers to common member questions above.','Aucune FAQ. Ajoutez ci-dessus des réponses aux questions fréquentes.')}</p>:
    faqs.filter(f=>filter==='all'||(filter==='published'?f.published:!f.published)).map(f=><article className="mykioo-faq-manage-item" key={f.id}>
     <div><strong>{fr?f.question_fr:f.question_en}</strong><small>{label(f.category,fr)} · {f.published?tr('Published','Publiée'):tr('Draft','Brouillon')}</small></div>
     <button type="button" onClick={()=>{setForm({id:f.id,question_en:f.question_en,question_fr:f.question_fr,answer_en:f.answer_en,answer_fr:f.answer_fr,category:f.category,guide_id:f.guide_id||'',sort_order:f.sort_order,published:f.published});setError('');setNotice('')}}><Pencil size={14}/>{tr('Edit','Modifier')}</button>
     <button type="button" disabled={saving} onClick={()=>changePublished(f)}>{f.published?<EyeOff size={14}/>:<Eye size={14}/>}
      {f.published?tr('Unpublish','Retirer'):tr('Publish','Publier')}</button>
    </article>)}
  </div>
 </section>;
}
