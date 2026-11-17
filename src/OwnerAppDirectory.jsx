import React,{useEffect,useState} from 'react';
import {Plus,Save,RefreshCw,ExternalLink,Trash2,ArrowUp,ArrowDown,Copy,ShieldCheck,Link2,BookOpen,AlertTriangle} from 'lucide-react';
import {supabase} from './supabase';
import './OwnerAppDirectory.css';

const API='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-app-directory';
const LIBRARY='https://mykioo.icu/apps/';
const platforms=[
 ['fire_tv','Fire TV / Fire Stick'],['android_tv','Android TV / Google TV'],
 ['android','Android phone / tablet'],['ios','iPhone / iPad'],
 ['apple_tv','Apple TV'],['smart_tv','Smart TV'],['web','Web browser']
];
const makeEntry=()=>({id:'app_'+crypto.randomUUID(),name_en:'',name_fr:'',
 description_en:'',description_fr:'',url:'',source:'store',platforms:['android_tv'],
 downloader_code:'',published:false,rights_confirmed:false,blocked_platforms:[],blocked_reason_en:'',blocked_reason_fr:'',logo_url:'',guide_id:'',install_notes_en:'',install_notes_fr:''});
async function api(payload){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session?.access_token)throw Error('Sign in as owner again.');
 const response=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json',
  'Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},
  body:JSON.stringify(payload)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error(result.error||'Unable to save app links');
 return result;
}
export default function OwnerAppDirectory({language='en'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [revision,setRevision]=useState('initial'),[apps,setApps]=useState([]),[code,setCode]=useState('');
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [error,setError]=useState(''),[notice,setNotice]=useState('');
 const [expanded,setExpanded]=useState(null),[changed,setChanged]=useState(false);
 const [guideOptions,setGuideOptions]=useState([]),[guidesError,setGuidesError]=useState('');
 useEffect(()=>{let active=true;supabase.from('mykioo_setup_guides')
  .select('id,title_en,title_fr,platform').eq('published',true).order('sort_order')
  .then(({data,error})=>{if(!active)return;if(error)setGuidesError(fr?'Impossible de charger les guides. Les liens existants sont conservés.':'Setup guides could not load. Existing links are preserved.');else setGuideOptions(data||[])});
  return()=>{active=false};
 },[fr]);
 async function reload(){
  if(changed&&!window.confirm(tr('Discard unsaved edits and reload?','Abandonner les modifications et actualiser ?')))return;
  setLoading(true);setError('');setNotice('');
  try{
   const r=await api({action:'read'});
   setApps(r.apps||[]);setCode(r.downloader_code||'');setRevision(r.revision);
   setChanged(false);setExpanded(null);
  }catch(e){setError(e.message)}
  finally{setLoading(false)}
 }
 useEffect(()=>{let active=true;
  api({action:'read'}).then(r=>{if(!active)return;setApps(r.apps||[]);setCode(r.downloader_code||'');setRevision(r.revision)})
   .catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});
  return()=>{active=false}
 },[]);
 const edit=(id,patch)=>{setApps(rows=>rows.map(r=>r.id===id?{...r,...patch}:r));setChanged(true);setNotice('')};
 const add=()=>{if(apps.length>=60){setError(tr('Maximum of 60 apps.','Maximum de 60 applications.'));return}
  const entry=makeEntry();setApps(rows=>[...rows,entry]);setExpanded(entry.id);setChanged(true);setNotice('')};
 const remove=id=>{if(!window.confirm(tr('Remove this app from the library? Save to confirm.','Retirer cette application de la bibliothèque ? Enregistrez pour confirmer.')))return;
  setApps(rows=>rows.filter(a=>a.id!==id));setChanged(true);setExpanded(null)};
 const move=(id,delta)=>{setApps(rows=>{const a=[...rows],i=a.findIndex(x=>x.id===id),j=i+delta;if(i<0||j<0||j>=a.length)return rows;[a[i],a[j]]=[a[j],a[i]];return a});setChanged(true)};
 function changePlatform(row,id,on){edit(row.id,{platforms:on?[...new Set([...row.platforms,id])]:row.platforms.filter(p=>p!==id),
  blocked_platforms:on?(row.blocked_platforms||[]).filter(p=>p!==id):(row.blocked_platforms||[])})}
 function changeBlocked(row,id,on){edit(row.id,{blocked_platforms:on?[...new Set([...(row.blocked_platforms||[]),id])]: (row.blocked_platforms||[]).filter(p=>p!==id),
  platforms:on?row.platforms.filter(p=>p!==id):row.platforms})}
 async function save(){
  if(saving||loading)return;
  setSaving(true);setError('');setNotice('');
  try{
   const r=await api({action:'save',revision,apps,downloader_code:code.trim()});
   setApps(r.apps||[]);setRevision(r.revision);setCode(r.downloader_code||'');setChanged(false);
   setNotice(tr('App directory saved. Published links are available on the public page.',
    'Bibliothèque enregistrée. Les liens publiés sont visibles sur la page publique.'));
  }catch(e){setError(e.message)}finally{setSaving(false)}
 }
 async function copy(text){
  try{await navigator.clipboard.writeText(text);setNotice(tr('Copied.','Copié.'))}
  catch{setNotice(tr('Select the displayed address to copy it.','Sélectionnez l’adresse affichée pour la copier.'))}
 }
 return <section className="mykioo-app-editor">
  <div className="app-editor-top">
   <div><h2><BookOpen size={22}/>{tr('App Downloads Library','Bibliothèque des applications')}</h2>
    <p>{tr('Manage safe, published links for the public TV setup page. You do not need to upload APK files to MYKIOO.',
     'Gérez les liens publiés sur la page de configuration TV. Il n’est pas nécessaire de téléverser les fichiers APK sur MYKIOO.')}</p>
   </div>
   <a className="app-editor-public" href="/apps/" target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{tr('Open public library','Ouvrir la page publique')}</a>
  </div>
  <div className="app-editor-codebox">
   <strong>{tr('Your permanent Downloader destination','Adresse permanente pour Downloader')}</strong>
   <div className="app-editor-share"><code>{LIBRARY}</code><button type="button" onClick={()=>copy(LIBRARY)}><Copy size={14}/>{tr('Copy','Copier')}</button></div>
   <p>{tr('Generate ONE numeric code for this page at the official AFTVnews URL shortener; then enter it below. You can update the links later and keep that code.',
    'Créez UN code numérique pour cette page via le raccourcisseur officiel AFTVnews, puis saisissez-le ci-dessous. Vous pourrez modifier les liens sans changer ce code.')}</p>
   <div className="app-editor-code-input">
    <label>{tr('Shared Downloader code (optional)','Code Downloader général (facultatif)')}<input inputMode="numeric" pattern="[0-9]*" maxLength={10}
     value={code} onChange={e=>{setCode(e.target.value.replace(/\D/g,'').slice(0,10));setChanged(true)}} placeholder="123456"/></label>
    <a href="https://go.aftvnews.com/" target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>{tr('Generate code at AFTVnews','Créer le code sur AFTVnews')}</a>
   </div>
  </div>
  <div className="app-editor-warning"><ShieldCheck size={19}/><p>{tr('Use official app-store or developer HTTPS links whenever possible. Only list direct APK files if you have permission to share them and trust their origin. This tool does not upload or redistribute APK binaries.',
   'Privilégiez les liens HTTPS des boutiques officielles ou des éditeurs. Partagez un fichier APK direct uniquement avec l’autorisation nécessaire et une source fiable. Cet outil ne téléverse ni ne redistribue de fichiers APK.')}</p></div>
  {error&&<p role="alert" className="app-editor-error"><AlertTriangle size={16}/>{error}</p>}
  {notice&&<p role="status" className="app-editor-notice">{notice}</p>}
  <div className="app-editor-toolbar"><div><strong>{tr('Apps','Applications')} ({apps.length})</strong><p>{apps.filter(a=>a.published).length} {tr('published','publiées')}</p></div>
   <div className="app-editor-actions"><button type="button" onClick={reload} disabled={loading||saving}><RefreshCw size={15}/>{tr('Refresh','Actualiser')}</button>
    <button type="button" onClick={add} disabled={loading||saving}><Plus size={15}/>{tr('Add app link','Ajouter un lien')}</button>
    <button type="button" className="primary" onClick={save} disabled={loading||saving||!changed}><Save size={16}/>{saving?tr('Saving…','Enregistrement…'):tr('Save library','Enregistrer')}</button></div>
  </div>
  {loading?<p>{tr('Loading links…','Chargement des liens…')}</p>:apps.length===0?<div className="app-editor-empty">{tr('No app links added. Select Add app link to start.','Aucun lien. Cliquez sur Ajouter un lien pour commencer.')}</div>:
   <div className="app-editor-list">{apps.map((app,i)=><article className="app-editor-card" key={app.id}>
    <div className="app-editor-cardbar"><button type="button" className="app-editor-row-title" onClick={()=>setExpanded(expanded===app.id?null:app.id)}>
     <span><strong>{fr?app.name_fr||app.name_en||tr('Untitled app','Application sans titre'):app.name_en||app.name_fr||'Untitled app'}</strong><small>{app.source} · {app.published?tr('Published','Publiée'):tr('Draft','Brouillon')}{(app.blocked_platforms||[]).length?' · '+tr('Blocked on','Bloqué sur')+' '+app.blocked_platforms.map(p=>platforms.find(x=>x[0]===p)?.[1]||p).join(', '):''}</small></span>
     <span>{expanded===app.id?'−':'+'}</span></button>
     <button type="button" aria-label={tr('Move up','Monter')} disabled={!i} onClick={()=>move(app.id,-1)}><ArrowUp size={16}/></button>
     <button type="button" aria-label={tr('Move down','Descendre')} disabled={i===apps.length-1} onClick={()=>move(app.id,1)}><ArrowDown size={16}/></button>
    </div>
    {expanded===app.id&&<div className="app-editor-form">
     <div className="app-editor-grid">
      <label>{tr('App name (English)','Nom de l’application (anglais)')}<input maxLength={95} value={app.name_en} onChange={e=>edit(app.id,{name_en:e.target.value})}/></label>
      <label>{tr('App name (French)','Nom de l’application (français)')}<input maxLength={95} value={app.name_fr} onChange={e=>edit(app.id,{name_fr:e.target.value})}/></label>
      <label>{tr('Description (English)','Description (anglais)')}<textarea rows={3} maxLength={480} value={app.description_en} onChange={e=>edit(app.id,{description_en:e.target.value})}/></label>
      <label>{tr('Description (French)','Description (français)')}<textarea rows={3} maxLength={480} value={app.description_fr} onChange={e=>edit(app.id,{description_fr:e.target.value})}/></label>
     </div>
     <label>{tr('Download or official store link (HTTPS only)','Lien de téléchargement ou boutique officielle (HTTPS uniquement)')}
      <input type="url" placeholder="https://..." maxLength={1600} value={app.url} onChange={e=>edit(app.id,{url:e.target.value})}/></label>
     <div className="app-editor-grid">
      <label>{tr('Link type','Type de lien')}<select value={app.source} onChange={e=>edit(app.id,{source:e.target.value,rights_confirmed:false})}>
       <option value="store">{tr('App store','Boutique d’applications')}</option>
       <option value="publisher">{tr('Publisher website','Site de l’éditeur')}</option>
       <option value="apk">{tr('Direct APK link — permission required','Lien APK direct — autorisation requise')}</option>
      </select></label>
      <label>{tr('App-specific Downloader code (optional)','Code Downloader pour cette application (facultatif)')}
       <input inputMode="numeric" pattern="[0-9]*" maxLength={10} value={app.downloader_code} onChange={e=>edit(app.id,{downloader_code:e.target.value.replace(/\D/g,'').slice(0,10)})}/></label>
     </div>
     <div className="app-editor-grid">
      <label>{tr('Optional app logo URL (HTTPS)','Logo de l’application (URL HTTPS facultative)')}
       <input type="url" maxLength={1600} placeholder="https://example.com/logo.png" value={app.logo_url||''} onChange={e=>edit(app.id,{logo_url:e.target.value})}/></label>
      <label>{tr('Related installation guide','Guide d’installation associé')}
       <select value={app.guide_id||''} onChange={e=>edit(app.id,{guide_id:e.target.value})}>
        <option value="">{tr('General Downloader setup guide (default)','Guide Downloader général (par défaut)')}</option>
        {(app.guide_id&&!guideOptions.some(g=>g.id===app.guide_id))&&<option value={app.guide_id}>{tr('Existing guide (unavailable)','Guide existant (indisponible)')}</option>}
        {guideOptions.map(g=><option key={g.id} value={g.id}>{fr?g.title_fr:g.title_en} — {g.platform}</option>)}
       </select></label>
     </div>
     {guidesError&&<p className="app-editor-warning">{guidesError}</p>}
     <div className="app-editor-grid">
      <label>{tr('Installation notes (English)','Notes d’installation (anglais)')}<textarea rows={3} maxLength={600} value={app.install_notes_en||''} onChange={e=>edit(app.id,{install_notes_en:e.target.value})}/></label>
      <label>{tr('Installation notes (French)','Notes d’installation (français)')}<textarea rows={3} maxLength={600} value={app.install_notes_fr||''} onChange={e=>edit(app.id,{install_notes_fr:e.target.value})}/></label>
     </div>
     <fieldset><legend>{tr('Compatible devices','Appareils compatibles')}</legend>
      <div className="app-editor-platforms">{platforms.map(([key,label])=><label key={key}><input type="checkbox" checked={app.platforms.includes(key)} onChange={e=>changePlatform(app,key,e.target.checked)}/>{label}</label>)}</div>
     </fieldset>
     <fieldset className="app-editor-blocked-devices"><legend>{tr('Blocked / download not working on','Bloqué / téléchargement impossible sur')}</legend>
      <p>{tr('Check devices where the app download does not work. Those members will see a warning instead of a download button. Other devices remain available.',
       'Cochez les appareils où le téléchargement ne fonctionne pas. Ces membres verront un avertissement à la place du bouton de téléchargement. Les autres appareils restent disponibles.')}</p>
      <div className="app-editor-platforms">{platforms.map(([key,label])=><label key={key}><input type="checkbox" checked={(app.blocked_platforms||[]).includes(key)} onChange={e=>changeBlocked(app,key,e.target.checked)}/>{label}</label>)}</div>
      {!!(app.blocked_platforms||[]).length&&<div className="app-editor-grid">
       <label>{tr('Blocked reason (English)','Raison du blocage (anglais)')}<textarea rows={2} maxLength={360} value={app.blocked_reason_en||''} onChange={e=>edit(app.id,{blocked_reason_en:e.target.value})} placeholder="Download does not work on this device."/></label>
       <label>{tr('Blocked reason (French)','Raison du blocage (français)')}<textarea rows={2} maxLength={360} value={app.blocked_reason_fr||''} onChange={e=>edit(app.id,{blocked_reason_fr:e.target.value})} placeholder="Le téléchargement ne fonctionne pas sur cet appareil."/></label>
      </div>}
     </fieldset>
     {app.source==='apk'&&<label className="app-editor-check"><input type="checkbox" checked={app.rights_confirmed} onChange={e=>edit(app.id,{rights_confirmed:e.target.checked})}/>
      {tr('I confirm I have permission to share this APK link, and the source is trustworthy.',
       'Je confirme que je suis autorisé à partager ce lien APK et que la source est fiable.')}</label>}
     <label className="app-editor-check"><input type="checkbox" checked={app.published} onChange={e=>edit(app.id,{published:e.target.checked})}/>
      {tr('Publish this app on the public library','Publier cette application dans la bibliothèque publique')}</label>
     <button type="button" className="app-editor-remove" onClick={()=>remove(app.id)}><Trash2 size={15}/>{tr('Remove entry','Supprimer le lien')}</button>
    </div>}
   </article>)}</div>}
  <div className="app-editor-footer"><Link2 size={16}/><span>{tr('Downloader codes are created by AFTVnews, not by MYKIOO. A code links to the destination URL; MYKIOO cannot guarantee it stays available.',
   'Les codes Downloader sont créés par AFTVnews, et non par MYKIOO. Un code pointe vers son adresse et sa disponibilité dépend du service tiers.')}</span></div>
 </section>;
}