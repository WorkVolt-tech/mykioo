import React,{useCallback,useEffect,useState} from 'react';
import {BookOpen,Search,Monitor,Smartphone,HelpCircle,ChevronDown,ChevronUp,CheckCircle2,Pencil,Eye,EyeOff,Copy,ExternalLink,Download} from 'lucide-react';
import {supabase} from './supabase';
import {useRememberedState} from './useRememberedState';

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
 {id:'smart_tv',en:'Smart TVs & Apple TV',fr:'Téléviseurs intelligents et Apple TV'},
 {id:'web',en:'Web browser',fr:'Navigateur Web'},
 {id:'other',en:'Other',fr:'Autre'}
];
const titleFor=(options,id,fr)=>options.find(o=>o.id===id)?.[fr?'fr':'en']||id;

// Shared Downloader catalog: intentionally a built-in guide so it remains pinned
// without creating or changing any Supabase guide records.
const androidDownloaderGuide={
 id:'mykioo-android-downloader-collection',category:'setup',platform:'general',published:true,sort_order:-1,
 title_en:'START HERE — Android app downloads (code 6050216)',
 title_fr:'COMMENCEZ ICI — Applications Android (code 6050216)',
 summary_en:'Use Downloader code 6050216 to browse a collection of apps for compatible Android and Fire OS devices. Follow these steps before choosing an app.',
 summary_fr:'Utilisez le code Downloader 6050216 pour parcourir une sélection d’applications pour les appareils Android et Fire OS compatibles. Suivez ces étapes avant de choisir une application.',
 steps_en:[
  '1. Check your device: this guide is for Android TV, Google TV, Android phones/tablets and Fire TV Sticks running Fire OS. Android APKs do not work on Vega OS, iPhone or Apple TV.',
  '2. Install the Downloader app by AFTVnews from your device’s app store, if available.',
  '3. Fire OS only: when required, allow Downloader under Settings > My Fire TV > Developer Options > Install Unknown Apps. If Developer Options is hidden, open My Fire TV > About and select the device name seven times, then return to settings.',
  '4. Android TV, Google TV or Android phone/tablet: if asked, allow Downloader to install apps from this source in your device’s settings.',
  '5. Open Downloader, enter 6050216 into the address/code box and select Go.',
  '6. Browse the collection and pick just the app that works with your device. The code opens a selection of download options; it does not install every app automatically.',
  '7. Check the publisher and source before installing. Follow the selected player’s login instructions: some use Xtream Codes/M3U credentials, while others require an activation code. They are not interchangeable.',
  '8. For safety, revoke Downloader’s install-unknown-apps permission after installation if you no longer need it. Contact MYKIOO Support if setup fails.'
 ].join('\\n'),
 steps_fr:[
  '1. Vérifiez votre appareil : ce guide concerne Android TV, Google TV, les téléphones/tablettes Android et les Fire TV Stick sous Fire OS. Les APK Android ne fonctionnent pas sous Vega OS, sur iPhone ou sur Apple TV.',
  '2. Installez l’application Downloader d’AFTVnews depuis la boutique d’applications de votre appareil, si disponible.',
  '3. Sous Fire OS seulement : au besoin, autorisez Downloader dans Paramètres > Ma Fire TV > Options pour les développeurs > Installer des applis inconnues. Si ce menu est masqué, ouvrez Ma Fire TV > À propos et sélectionnez sept fois le nom de l’appareil, puis revenez aux paramètres.',
  '4. Sur Android TV, Google TV ou téléphone/tablette Android : si demandé, autorisez Downloader à installer des applications de cette source dans les paramètres de l’appareil.',
  '5. Ouvrez Downloader, saisissez 6050216 dans la barre d’adresse ou de code, puis sélectionnez Go.',
  '6. Parcourez la sélection et choisissez uniquement l’application compatible avec votre appareil. Le code donne accès à plusieurs options de téléchargement; il ne les installe pas toutes automatiquement.',
  '7. Vérifiez l’éditeur et la provenance avant d’installer. Suivez la méthode de connexion du lecteur choisi : certains utilisent Xtream Codes/M3U, d’autres un code d’activation. Ces méthodes ne sont pas interchangeables.',
  '8. Pour votre sécurité, retirez l’autorisation d’installer des applications inconnues après l’installation si elle n’est plus nécessaire. Contactez l’assistance MYKIOO en cas de problème.'
 ].join('\\n')
};


// These download URLs, compatible platforms and login types are transcribed from
// the owner's reseller-panel screenshot. They are third-party APKs, not hosted by MYKIOO.
// The URL must appear in a published guide's steps for its download controls to appear.
const apkDownloads=[
 {url:'http://apk.streamsky.online/yestream.apk',platforms:['android','android_tv'],login:'credentials',downloaderCode:'2940403'},
 {url:'http://apk.streamsky.online/v12mate.apk',platforms:['android','android_tv','fire_tv'],login:'credentials'},
 {url:'http://apk.streamsky.online/v12.apk',platforms:['android','android_tv'],login:'credentials'},
 {url:'http://apk.streamsky.online/max-ott.apk',platforms:['android','android_tv'],login:'activation'},
 {url:'http://apk.streamsky.online/max-ott-firestick.apk',platforms:['fire_tv'],login:'activation'}
];
const downloadFor=guide=>apkDownloads.find(app=>(guide.steps_en||'').includes(app.url)||(guide.steps_fr||'').includes(app.url));
const officialProtonLink=guide=>([guide.steps_en,guide.steps_fr].some(s=>(s||'').includes('https://protonvpn.com/free-vpn'))
 ?'https://protonvpn.com/free-vpn':null);
const xciptvPlayUrl='https://play.google.com/store/apps/details?id=com.nathnetwork.xciptv';
const officialXciptvLink=guide=>guide.platform==='android_tv'&&(guide.steps_en||'').includes(xciptvPlayUrl)?xciptvPlayUrl:null;
// Guide titles now identify exactly one device type, so don't label an
// Android tutorial as Fire TV just because that APK happens to support both.
const guidePlatformLabel=(guide,fr)=>guide.id===androidDownloaderGuide.id?(fr?'Android / Fire OS':'Android / Fire OS'):titleFor(platformOptions,guide.platform,fr);

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

function GuideCard({guide,language='en',owner=false,userId=''}){
 const guideScope='mykioo-ui:member:'+userId+':guide:'+guide.id;
 const [expanded,setExpanded]=useRememberedState(guideScope+':expanded',false);
 const [currentStep,setCurrentStep]=useRememberedState(guideScope+':step',0);
 const [copied,setCopied]=useState(''),[showAll,setShowAll]=useState(false);
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const app=downloadFor(guide);
 const protonLink=officialProtonLink(guide);
 const xciptvLink=officialXciptvLink(guide);
 const isDownloaderCatalog=guide.id===androidDownloaderGuide.id;
 const instructions=(fr?guide.steps_fr:guide.steps_en)||'';
 const steps=instructions.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
  .filter(step=>!(app&&step.endsWith(app.url)&&/^(download url|lien de téléchargement)\s*:/i.test(step)));
 const safeStep=Number.isInteger(currentStep)?Math.max(0,Math.min(steps.length-1,currentStep)):0;
 async function copyValue(value,kind){
  try{await navigator.clipboard.writeText(value);setCopied(kind)}
  catch(_error){setCopied('')}
 }
 return <article className="mykioo-guide-card">
  <button type="button" className="mykioo-guide-summary-button" onClick={()=>setExpanded(v=>!v)} aria-expanded={expanded}>
   <span className="mykioo-guide-card-icon">{guide.platform==='ios'||guide.platform==='android'?<Smartphone size={20}/>:guide.platform==='account'?<HelpCircle size={20}/>:<Monitor size={20}/>}</span>
   <span className="mykioo-guide-description">
    <strong>{fr?guide.title_fr:guide.title_en}</strong>
    <small>{titleFor(categoryOptions,guide.category,fr)} · {guidePlatformLabel(guide,fr)}</small>
    <span>{fr?guide.summary_fr:guide.summary_en}</span>
   </span>
   {expanded?<ChevronUp size={19}/>:<ChevronDown size={19}/>}
  </button>
  {expanded&&<div className="mykioo-guide-detail">
   <h4>{tr('Follow each step in order','Suivez chaque étape dans l’ordre')}</h4>
   {isDownloaderCatalog&&<div className="mykioo-guide-downloader-code">
    <span>{tr('Shared Downloader code','Code Downloader commun')}: <strong>6050216</strong></span>
    <button type="button" onClick={()=>copyValue('6050216','catalog') }><Copy size={15}/>{copied==='catalog'?tr('Copied!','Copié !'):tr('Copy code','Copier le code')}</button>
   </div>}
   <div className="mykioo-guide-wizard" aria-label={tr('Guided installation','Installation guidée')}>
    <div className="mykioo-guide-progress-header">
     <strong>{tr('Step','Étape')} {Math.min(safeStep+1,steps.length)} {tr('of','sur')} {steps.length}</strong>
     <span>{Math.round((safeStep+1)/Math.max(steps.length,1)*100)}%</span>
    </div>
    <div className="mykioo-guide-progress-track" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={safeStep+1} aria-label={tr('Installation guide progress','Progression du guide d’installation')}>
     <span style={{width:((safeStep+1)/Math.max(steps.length,1)*100)+'%'}}/>
    </div>
    <div className="mykioo-guide-current-step" aria-live="polite">
     <small>{tr('Do this now','À faire maintenant')}</small>
     <p>{(steps[safeStep]||'').replace(/^\d+[.)]\s*/, '')}</p>
    </div>
    <div className="mykioo-guide-step-actions">
     <button type="button" disabled={safeStep===0} onClick={()=>setCurrentStep(n=>Math.max(0,n-1))}>{tr('Previous step','Étape précédente')}</button>
     <button type="button" disabled={safeStep>=steps.length-1} onClick={()=>setCurrentStep(n=>Math.min(steps.length-1,n+1))}>{safeStep>=steps.length-1?tr('All steps complete','Toutes les étapes sont terminées'):tr('Done — next step','Terminé — étape suivante')}</button>
    </div>
    <button type="button" className="mykioo-guide-show-all" aria-expanded={showAll} onClick={()=>setShowAll(v=>!v)}>{showAll?tr('Hide complete checklist','Masquer la liste complète'):tr('See all steps together','Voir toutes les étapes')}</button>
    {showAll&&<ol className="mykioo-guide-all-steps">{steps.map((step,i)=><li key={i}><button type="button" onClick={()=>{setCurrentStep(i);setShowAll(false)}}>{step.replace(/^\d+[.)]\s*/, '')}</button></li>)}</ol>}
   </div>
   {xciptvLink&&<div className="mykioo-guide-app-download">
    <strong className="mykioo-guide-app-heading"><Download size={17}/>{tr('XCIPTV PLAYER — official Google Play listing','XCIPTV PLAYER — fiche officielle Google Play')}</strong>
    <p>{tr('Look for XCIPTV PLAYER by OTTRUN in Google Play on your television. Install it directly from the store; no Downloader or developer settings are needed.','Recherchez XCIPTV PLAYER du développeur OTTRUN dans Google Play sur votre téléviseur. Installez-le depuis la boutique, sans Downloader ni options développeur.')}</p>
    <div className="mykioo-guide-download-actions">
     <a href={xciptvLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>{tr('View official Google Play app','Voir l’application officielle Google Play')}</a>
    </div>
   </div>}
   {protonLink&&<div className="mykioo-guide-app-download">
    <strong className="mykioo-guide-app-heading"><Download size={17}/>{tr('Official Proton VPN website','Site officiel de Proton VPN')}</strong>
    <p>{tr('Choose the app for your device from Proton’s official website or app store. A free Proton account is separate from your MYKIOO login.','Choisissez l’application correspondant à votre appareil depuis le site officiel ou sa boutique d’applications. Le compte Proton gratuit est distinct de votre compte MYKIOO.')}</p>
    <code className="mykioo-guide-apk-url">{protonLink}</code>
    <div className="mykioo-guide-download-actions">
     <a href={protonLink} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>{tr('Open official download page','Ouvrir la page de téléchargement')}</a>
     <button type="button" onClick={()=>copyValue(protonLink,'proton')}><Copy size={15}/>{copied==='proton'?tr('Copied!','Copié !'):tr('Copy link','Copier le lien')}</button>
    </div>
   </div>}
   {app&&<div className="mykioo-guide-app-download">
    <strong className="mykioo-guide-app-heading"><Download size={17}/>{tr('App download','Téléchargement de l’application')}</strong>
    <p>{app.login==='credentials'?
      tr('Sign in with the server address, username and password supplied for your subscription.','Connectez-vous avec l’adresse du serveur, le nom d’utilisateur et le mot de passe fournis pour votre abonnement.'):
      tr('This app signs in with an activation code provided for your subscription.','Cette application utilise un code d’activation fourni pour votre abonnement.')}</p>
    <label>{tr('APK link','Lien APK')}</label>
    <code className="mykioo-guide-apk-url">{app.url}</code>
    <div className="mykioo-guide-download-actions">
     <a href={app.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={15}/>{tr('Open download link','Ouvrir le lien de téléchargement')}</a>
     <button type="button" onClick={()=>copyValue(app.url,'url')}><Copy size={15}/>{copied==='url'?tr('Copied!','Copié !'):tr('Copy link','Copier le lien')}</button>
    </div>
    {app.downloaderCode&&<div className="mykioo-guide-downloader-code">
     <span>{tr('Downloader code','Code Downloader')}: <strong>{app.downloaderCode}</strong></span>
     <button type="button" onClick={()=>copyValue(app.downloaderCode,'code')}><Copy size={15}/>{copied==='code'?tr('Copied!','Copié !'):tr('Copy code','Copier le code')}</button>
    </div>}
    <small>{tr('Third-party APK provided by your service panel. Links use HTTP, not encrypted HTTPS. Install only if you trust the source and your device permits it.','APK tiers fourni par votre panneau de service. Les liens utilisent HTTP et non HTTPS chiffré. Installez uniquement si vous faites confiance à la source et si votre appareil le permet.')}</small>
   </div>}
   {owner&&<small>{tr('Only published guides are visible to members.','Seuls les guides publiés sont visibles aux membres.')}</small>}
  </div>}
 </article>;
}

export function MemberSetupGuides({language='en',onOpenSupport,userId=''}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const {guides,loading,error}=useSetupGuides();
 const scope='mykioo-ui:member:'+userId+':guides';
 const [search,setSearch]=useRememberedState(scope+':search','', 'session');
 const [category,setCategory]=useRememberedState(scope+':category','all');
 const [platform,setPlatform]=useRememberedState(scope+':platform','all');
 const showDownloaderGuide=(category==='all'||category==='setup')&&['all','fire_tv','android_tv','android'].includes(platform);
 const visible=guides.filter(g=>g.published).filter(g=>{
  const term=search.trim().toLocaleLowerCase();
  return (!term||[g.title_en,g.title_fr,g.summary_en,g.summary_fr,g.steps_en,g.steps_fr].some(x=>(x||'').toLocaleLowerCase().includes(term)))
    &&(category==='all'||g.category===category)
    &&(platform==='all'||g.platform==='general'||g.platform===platform||(platform==='smart_tv'&&g.platform==='apple_tv'));
 }).sort(orderGuides);
 return <section className="mykioo-guide-page">
  <div className="mykioo-guide-intro">
   <BookOpen size={26}/>
   <div><h2>{tr('Setup & help guides','Guides d’installation et d’aide')}</h2>
    <p>{tr('New to this? First choose your device below, then open its installation guide. If you use a Fire Stick, first check whether it runs Vega OS or Fire OS. Vega OS users should start with “Vega OS Fire Sticks — Why Android apps do not install”; Fire OS users can follow “START HERE — First-time Fire TV Stick setup.” Follow one instruction at a time and press “Done — next step” only after you have completed it.','C’est votre première fois ? Choisissez d’abord votre appareil ci-dessous, puis ouvrez son guide. Si vous utilisez un Fire Stick, vérifiez d’abord s’il fonctionne sous Vega OS ou Fire OS. Sous Vega OS, ouvrez « Fire Stick Vega OS — Pourquoi les applications Android ne s’installent pas »; sous Fire OS, suivez « COMMENCEZ ICI — Première installation Fire TV Stick ». Suivez une instruction à la fois et appuyez sur « Terminé — étape suivante » seulement après l’avoir effectuée.')}</p></div>
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
  {platform==='android_tv'&&<div className="mykioo-vega-explainer" role="note">
   <strong>{tr('Google TV / Android TV — any television brand','Google TV / Android TV — toutes les marques')}</strong>
   <p>{tr('If your television has Google TV or Android TV with Google Play, you can try XCIPTV PLAYER by OTTRUN when MAX OTT is unavailable. This also applies to compatible streaming boxes; no APK or Developer Mode is needed for apps available directly in Google Play. Open the XCIPTV guide below. It requires service login credentials or an M3U playlist, not just a MAX OTT Smart Code.','Si votre téléviseur utilise Google TV ou Android TV avec Google Play, vous pouvez essayer XCIPTV PLAYER d’OTTRUN lorsque MAX OTT est indisponible. Cela fonctionne aussi sur les boîtiers compatibles; aucune installation APK ni mode développeur n’est nécessaire pour une application de Google Play. Ouvrez le guide XCIPTV ci-dessous. Il faut des identifiants de service ou une liste M3U, pas seulement un Smart Code MAX OTT.')}</p>
  </div>}
  {platform==='smart_tv'&&<div className="mykioo-vega-explainer" role="note">
   <strong>{tr('LG, Samsung or Apple TV? Start here.','LG, Samsung ou Apple TV ? Commencez ici.')}</strong>
   <p>{tr('LG webOS, Samsung Tizen and Apple TV use their own app stores and device-specific Smart Codes. If your television instead runs Google TV or Android TV with Google Play — whatever its brand — choose the Google TV / Android TV guides, including the XCIPTV PLAYER alternative.','LG webOS, Samsung Tizen et Apple TV utilisent leurs propres boutiques et des Smart Codes propres à chaque appareil. Si votre téléviseur utilise plutôt Google TV ou Android TV avec Google Play — peu importe la marque — choisissez les guides Google TV / Android TV, dont l’alternative XCIPTV PLAYER.')}</p>
   <button type="button" className="mykioo-vega-switch" onClick={()=>{setPlatform('android_tv');setCategory('all');setSearch('')}}>{tr('Show Google TV / Android TV guides','Voir les guides Google TV / Android TV')}</button>
  </div>}
  {platform==='fire_tv'&&<div className="mykioo-vega-explainer" role="note">
   <strong>{tr('New Fire Stick? Check for Vega OS first.','Nouveau Fire Stick ? Vérifiez d’abord Vega OS.')}</strong>
   <p>{tr('Vega OS cannot run the Android APK players used in these guides. For MYKIOO, we recommend a compatible Android TV / Google TV streaming box instead; you can keep your existing television. Specific recommended box models will be listed only after MYKIOO tests them.','Vega OS ne peut pas exécuter les lecteurs APK Android de ces guides. Pour MYKIOO, nous recommandons plutôt un boîtier de streaming Android TV / Google TV compatible; vous pouvez garder votre téléviseur. Nous proposerons des modèles précis uniquement après les avoir testés.')}</p>
  </div>}
  {error&&<p role="alert" className="mykioo-profile-error">{tr('Could not load guides. Please refresh this page.','Impossible de charger les guides. Veuillez actualiser cette page.')}</p>}
  {loading?<p className="mykioo-guide-empty">{tr('Loading guides…','Chargement des guides…')}</p>:
   (visible.length===0&&!showDownloaderGuide)?<div className="mykioo-guide-empty">
    <BookOpen size={24}/><strong>{guides.length===0?tr('Guides are being prepared.','Les guides sont en préparation.'):tr('No guides match your search.','Aucun guide ne correspond à votre recherche.')}</strong>
    <p>{tr('Need assistance? You can contact MYKIOO Support.','Besoin d’aide ? Vous pouvez contacter l’assistance MYKIOO.')}</p>
   </div>:<div className="mykioo-guide-list">{showDownloaderGuide&&<GuideCard key={androidDownloaderGuide.id} guide={androidDownloaderGuide} language={language} userId={userId}/>} {visible.map(g=><GuideCard key={g.id} guide={g} language={language} userId={userId}/>)}</div>}
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
     <span><strong>{fr?g.title_fr:g.title_en}</strong><small>{titleFor(categoryOptions,g.category,fr)} · {guidePlatformLabel(g,fr)}</small>
      <small className={g.published?'mykioo-guide-published':'mykioo-guide-draft'}>{g.published?tr('Published','Publié'):tr('Draft / private','Brouillon / privé')}</small></span>
     <button type="button" onClick={()=>{setForm({id:g.id,title_en:g.title_en,title_fr:g.title_fr,summary_en:g.summary_en,summary_fr:g.summary_fr,steps_en:g.steps_en,steps_fr:g.steps_fr,category:g.category,platform:g.platform,published:g.published,sort_order:g.sort_order});setNotice('');setError('');}}><Pencil size={14}/>{tr('Edit','Modifier')}</button>
     <button type="button" disabled={saving} onClick={()=>toggle(g)}>{g.published?<EyeOff size={14}/>:<Eye size={14}/>}
      {g.published?tr('Unpublish','Retirer'):tr('Publish','Publier')}</button>
    </article>)}
  </div>
 </section>;
}
