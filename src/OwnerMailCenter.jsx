import React,{useCallback,useEffect,useMemo,useState} from 'react';
import {Inbox,Send,FilePenLine,Archive,RefreshCw,Mail,Search,Paperclip,Reply,ArrowLeft,Check,Trash2,Folder,Link2,Save,Plus,AlertCircle,Download,MailOpen,Star} from 'lucide-react';
import {supabase} from './supabase';
import './OwnerMailCenter.css';

const API='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-mail-center';
const MAILBOX='iptv@mykioo.icu';
const MAX_BYTES=6*1024*1024;
const validMail=(s)=>/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(s||'');
function localeDate(raw,fr){if(!raw)return '';const d=new Date(raw);return Number.isNaN(d.getTime())?'':d.toLocaleString(fr?'fr-CA':'en-CA',{dateStyle:'medium',timeStyle:'short'})}
async function api(payload){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session?.access_token)throw Error('Session expired. Sign in again.');
 const reply=await fetch(API,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)});
 const json=await reply.json().catch(()=>({}));
 if(!reply.ok||!json.ok)throw Error(json.error||'Mail service unavailable');
 return json;
}
function fileToBase64(file){
 return new Promise((resolve,reject)=>{const r=new FileReader();r.onerror=()=>reject(Error('Unable to read attachment'));r.onload=()=>resolve(String(r.result||'').split(',')[1]||'');r.readAsDataURL(file)});
}
function decodeBase64(s){
 const raw=atob(s),chunk=8192,parts=[];for(let i=0;i<raw.length;i+=chunk){const p=new Uint8Array(Math.min(chunk,raw.length-i));for(let j=0;j<p.length;j++)p[j]=raw.charCodeAt(i+j);parts.push(p)}return parts;
}
const emptyDraft=()=>({to:'',subject:'',body:'',attachments:[],replyId:'',references:'',previousUid:null,previousFolder:''});
export default function OwnerMailCenter({language='en',members=[]}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [state,setState]=useState('loading'),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const [folders,setFolders]=useState([]),[folder,setFolder]=useState('INBOX'),[items,setItems]=useState([]),[links,setLinks]=useState([]),[matches,setMatches]=useState([]),[search,setSearch]=useState(''),[busy,setBusy]=useState(false);
 const [selected,setSelected]=useState(null),[message,setMessage]=useState(null),[compose,setCompose]=useState(false),[draft,setDraft]=useState(emptyDraft()),[saving,setSaving]=useState(false);
 const [memberQuery,setMemberQuery]=useState(''),[memberResults,setMemberResults]=useState([]),[linkMode,setLinkMode]=useState(false);
 const [configured,setConfigured]=useState(false);
 const [announcementOpen,setAnnouncementOpen]=useState(false),[announcement,setAnnouncement]=useState(null);
 const [announcementLanguage,setAnnouncementLanguage]=useState('en'),[sendingAnnouncement,setSendingAnnouncement]=useState(false);
 const categories=useMemo(()=>{
  const by=(special,guess)=>folders.find(f=>f.specialUse===special)?.path||folders.find(f=>guess.some(g=>f.path.toLowerCase()===g))?.path;
  return [{id:'inbox',name:tr('Inbox','Réception'),icon:Inbox,path:by('\\Inbox',['inbox'])||'INBOX'},
   {id:'sent',name:tr('Sent','Envoyés'),icon:Send,path:by('\\Sent',['sent','sent items','sent messages','gesendet','mykioo sent'])},
   {id:'drafts',name:tr('Drafts','Brouillons'),icon:FilePenLine,path:by('\\Drafts',['drafts','draft','entwürfe','mykioo drafts'])},
   {id:'archive',name:tr('Archive','Archives'),icon:Archive,path:by('\\Archive',['archive','archives','archiv','mykioo archive'])}];
 },[folders,fr]);
 const refreshFolders=useCallback(async()=>{
  const s=await api({action:'status'});setConfigured(s.configured);
  if(!s.configured){setState('not-configured');return}
  const data=await api({action:'folders'});setFolders(data.folders||[]);setState('ready');
 },[]);
 const load=useCallback(async(target,q='')=>{
  setBusy(true);setError('');
  try{const data=await api({action:'list',folder:target,search:q});setItems(data.messages||[]);setMatches(data.matchedMembers||[]);setLinks(data.links||[])}
  catch(e){setError(e.message)}
  finally{setBusy(false)}
 },[]);
 useEffect(()=>{let cancelled=false;setState('loading');refreshFolders().catch(e=>{if(!cancelled){setError(e.message);setState('error')}});return()=>{cancelled=true}},[refreshFolders]);
 useEffect(()=>{if(state==='ready'){load(folder,'')}},[state,folder,load]);
 async function open(m){
  setError('');setSelected(m);setMessage(null);setCompose(false);setLinkMode(false);setMemberQuery('');
  try{const data=await api({action:'read',folder,uid:m.uid});setMessage(data.message);setLinks(previous=>[...previous.filter(x=>x.message_id!==data.message.messageId),...(data.links||[])]);setMatches(previous=>[...previous,...(data.members||[])].filter((x,i,a)=>a.findIndex(t=>t.user_id===x.user_id)===i));setItems(previous=>previous.map(x=>x.uid===m.uid?{...x,seen:true}:x))}
  catch(e){setError(e.message)}
 }
 async function openAnnouncement(){
  setCompose(false);setSelected(null);setMessage(null);setAnnouncementOpen(true);setAnnouncement(null);setError('');setNotice('');
  try{setAnnouncement(await api({action:'announcement_status'}))}
  catch(e){setError(e.message)}
 }
 async function sendAnnouncement(){
  if(!announcement?.remaining||sendingAnnouncement)return;
  if(!window.confirm(tr('Send this announcement to '+announcement.remaining+' remaining approved members? This cannot be undone.','Envoyer cette annonce aux '+announcement.remaining+' membres approuvés restants ? Cette action est irréversible.')))return;
  setSendingAnnouncement(true);setError('');setNotice('');
  try{
   let current=announcement,rounds=0;
   while(current.remaining>0&&rounds<125){
    const r=await api({action:'announcement_send',campaign_id:current.campaign_id,confirm:true});
    setAnnouncement(previous=>({...previous,...r}));rounds++;
    if(r.failed||r.remaining>=current.remaining)throw Error(tr('Some emails could not be sent. Check the delivery count before retrying.','Certains courriels n’ont pas pu être envoyés. Vérifiez le nombre restant avant de réessayer.'));
    current=r;
   }
   if(current.remaining)throw Error(tr('Some members remain; try sending again.','Il reste des membres ; veuillez réessayer.'));
   setNotice(tr('IONOS accepted the announcement for delivery. Ask members to check Inbox and Spam.','IONOS a accepté l’annonce pour livraison. Demandez aux membres de vérifier leur boîte de réception et leurs indésirables.'));
  }catch(e){
   setError(e.message);
   try{setAnnouncement(await api({action:'announcement_status'}))}catch(_ignored){}
  }finally{setSendingAnnouncement(false)}
 }
 function startCompose(base){
  setAnnouncementOpen(false);setDraft({...emptyDraft(),...(base||{})});setCompose(true);setSelected(null);setMessage(null);setError('');setNotice('');
 }
 function composeReply(){
  if(!message)return;
  const who=message.replyTo?.[0]?.address||message.from?.[0]?.address||'';
  const reference=[message.references,message.messageId].filter(Boolean).join(' ').slice(0,1200);
  startCompose({to:who,subject:/^re:/i.test(message.subject)?message.subject:'Re: '+message.subject,body:'\n\n--- '+tr('Original message','Message original')+' ---\n'+(message.text||'').slice(0,5000),replyId:message.messageId,references:reference});
 }
 async function addFiles(event){
  const incoming=Array.from(event.target.files||[]);event.target.value='';
  if(incoming.length+draft.attachments.length>5){setError(tr('Maximum five attachments.','Maximum de cinq pièces jointes.'));return}
  if(incoming.reduce((s,f)=>s+f.size,0)+draft.attachments.reduce((s,f)=>s+f.size,0)>MAX_BYTES){setError(tr('Maximum 6 MB total.','Maximum 6 Mo au total.'));return}
  try{const attachments=await Promise.all(incoming.map(async f=>({name:f.name,mime:f.type||'application/octet-stream',size:f.size,base64:await fileToBase64(f)})));setDraft(old=>({...old,attachments:[...old.attachments,...attachments]}));setError('')}
  catch(e){setError(e.message)}
 }
 async function submitMail(mode){
  if(!validMail(draft.to)||!draft.subject.trim()||!draft.body.trim()){setError(tr('Enter recipient, subject and message.','Indiquez le destinataire, le sujet et le message.'));return}
  setSaving(true);setError('');setNotice('');
  try{
   const data=await api({action:mode==='send'?'send':'saveDraft',...draft});
   setCompose(false);setDraft(emptyDraft());
   setNotice(mode==='send'?
    (data.savedToSent?tr('IONOS accepted the email and a copy was saved in Sent.','IONOS a accepté le courriel et une copie a été enregistrée dans Envoyés.'):tr('IONOS accepted the email, but its Sent copy could not be saved.','IONOS a accepté le courriel, mais la copie Envoyés n’a pas pu être sauvegardée.')):
    tr('Draft saved to IONOS.','Brouillon enregistré dans IONOS.'));
   await refreshFolders();await load(folder,search);
  }catch(e){setError(e.message)}finally{setSaving(false)}
 }
 async function move(destination){
  if(!selected)return;
  if(destination==='archive'&&!window.confirm(tr('Archive this message?','Archiver ce message?')))return;
  setBusy(true);setError('');
  try{await api({action:'move',folder,uid:selected.uid,destination});setMessage(null);setSelected(null);setNotice(destination==='archive'?tr('Message archived.','Message archivé.'):tr('Message moved.','Message déplacé.'));await refreshFolders();await load(folder,search)}
  catch(e){setError(e.message)}finally{setBusy(false)}
 }
 async function toggleFlag(m,flag,enabled){
  try{await api({action:'mark',folder,uid:m.uid,flag,enabled});setItems(xs=>xs.map(x=>x.uid===m.uid?{...x,[flag==='flagged'?'flagged':'seen']:enabled}:x));setMessage(x=>x&&x.uid===m.uid?{...x,[flag==='flagged'?'flagged':'seen']:enabled}:x)}
  catch(e){setError(e.message)}
 }
 async function attachment(a){
  if(!message)return;
  try{
   const result=await api({action:'attachment',folder,uid:message.uid,index:a.index});
   const blob=new Blob(decodeBase64(result.base64),{type:'application/octet-stream'}),url=URL.createObjectURL(blob);
   const node=document.createElement('a');node.href=url;node.download=result.filename||'attachment';node.click();setTimeout(()=>URL.revokeObjectURL(url),15000);
  }catch(e){setError(e.message)}
 }
 async function lookupMember(q){
  setMemberQuery(q);
  if(q.trim().length<2){setMemberResults([]);return}
  try{const r=await api({action:'members',search:q});setMemberResults(r.members||[])}
  catch(e){setError(e.message)}
 }
 async function linkMember(memberId){
  if(!message?.messageId){setError(tr('This email has no message identifier.','Ce courriel ne possède aucun identifiant.'));return}
  try{
   await api({action:'link',messageId:message.messageId,memberId});
   setLinks(old=>[...old.filter(x=>x.message_id!==message.messageId),...(memberId?[{message_id:message.messageId,member_id:memberId}]:[])]);
   setLinkMode(false);setMemberQuery('');setMemberResults([]);setNotice(tr('Member conversation link saved.','Lien avec le membre enregistré.'));
  }catch(e){setError(e.message)}
 }
 const linkedMember=(m)=>members.find(x=>x.user_id===links.find(y=>y.message_id===m.messageId)?.member_id)||matches.find(x=>x.user_id===links.find(y=>y.message_id===m.messageId)?.member_id);
 const guessedMember=(m)=>[...members,...matches].find(x=>[...(m.from||[]),...(m.to||[])].some(a=>a.address?.toLowerCase()===x.email?.toLowerCase()&&x.email?.toLowerCase()!==MAILBOX));
 function pickFolder(name){if(!name)return;setFolder(name);setSelected(null);setMessage(null);setCompose(false);setSearch('');setNotice('')}
 const activeCategory=categories.find(c=>c.path===folder);
 const isDrafts=activeCategory?.id==='drafts'||folder==='MYKIOO Drafts';
 const displayedMembers=[...members,...matches,...memberResults].filter((x,i,a)=>a.findIndex(y=>y.user_id===x.user_id)===i);
 return <section className="mykioo-mail">
  <header className="mykioo-mail-heading"><div><h2><Mail size={23}/>{tr('MYKIOO Mail Center','Centre de messagerie MYKIOO')}</h2><p>{MAILBOX} · {tr('Private IONOS mailbox','Boîte IONOS privée')}</p></div>
   <div className="mykioo-mail-heading-actions"><button type="button" onClick={()=>{setError('');refreshFolders().then(()=>load(folder,search)).catch(e=>setError(e.message))}} disabled={busy}><RefreshCw size={16}/>{tr('Refresh','Actualiser')}</button><button type="button" onClick={openAnnouncement}><Mail size={16}/>{tr('Message all members','Écrire à tous les membres')}</button><button type="button" className="primary" onClick={()=>startCompose()}><Plus size={16}/>{tr('Compose','Rédiger')}</button></div>
  </header>
  {error&&<div className="mykioo-mail-alert" role="alert"><AlertCircle size={18}/>{error}</div>}
  {notice&&<div className="mykioo-mail-notice" role="status"><Check size={18}/>{notice}</div>}
  {state==='loading'&&<p className="mykioo-mail-placeholder">{tr('Connecting securely to IONOS…','Connexion sécurisée à IONOS…')}</p>}
  {state==='not-configured'&&<div className="mykioo-mail-placeholder"><strong>{tr('Mailbox password setup required','Mot de passe de messagerie requis')}</strong><p>{tr('Add MYKIOO_IONOS_SMTP_PASSWORD in Supabase Edge Function secrets. The password never appears in website code.','Ajoutez MYKIOO_IONOS_SMTP_PASSWORD dans les secrets Edge Functions de Supabase. Le mot de passe ne figure jamais dans le code du site.')}</p></div>}
  {(state==='ready'||state==='error')&&<div className="mykioo-mail-workspace">
   <nav className="mykioo-mail-folders" aria-label={tr('Mail folders','Dossiers de courriel')}>
    {categories.map(c=><button type="button" key={c.id} className={folder===c.path?'active':''} disabled={!c.path} onClick={()=>pickFolder(c.path)}><c.icon size={17}/>{c.name}<small>{folders.find(f=>f.path===c.path)?.unseen||''}</small></button>)}
    {folders.filter(f=>!categories.some(c=>c.path===f.path)).slice(0,12).map(f=><button type="button" key={f.path} className={folder===f.path?'active':''} onClick={()=>pickFolder(f.path)}><Folder size={16}/><span title={f.path}>{f.path}</span></button>)}
   </nav>
   <div className="mykioo-mail-main">
    {announcementOpen?<div className="mykioo-mail-announcement">
     <div className="mykioo-mail-toolbar"><h3>{tr('Member announcement','Annonce aux membres')}</h3><button type="button" disabled={sendingAnnouncement} onClick={()=>setAnnouncementOpen(false)}>{tr('Close','Fermer')}</button></div>
     {!announcement?<p className="mykioo-mail-placeholder">{tr('Checking member recipients…','Vérification des destinataires…')}</p>:<>
      <p><strong>{announcement.total}</strong> {tr('approved members','membres approuvés')} · <strong>{announcement.sent}</strong> {tr('already emailed','déjà contactés')} · <strong>{announcement.remaining}</strong> {tr('remaining','restants')}</p>
      <p>{tr('Private emails will be sent individually in each approved member’s preferred language. Pending applicants and owners are excluded. Previously emailed members will not receive a duplicate.','Les courriels seront envoyés individuellement dans la langue de chaque membre approuvé. Les demandes en attente et les propriétaires sont exclus. Aucun doublon ne sera envoyé aux membres déjà contactés.')}</p>
      <div className="mykioo-mail-announcement-languages"><button type="button" className={announcementLanguage==='en'?'active':''} onClick={()=>setAnnouncementLanguage('en')}>English</button><button type="button" className={announcementLanguage==='fr'?'active':''} onClick={()=>setAnnouncementLanguage('fr')}>Français</button></div>
      <div className="mykioo-mail-announcement-preview"><strong>{announcement.previews?.[announcementLanguage]?.subject}</strong><p>{announcement.previews?.[announcementLanguage]?.body}</p></div>
      <div className="mykioo-mail-actions"><button type="button" className="primary" disabled={sendingAnnouncement||!announcement.remaining} onClick={sendAnnouncement}><Send size={17}/>{sendingAnnouncement?tr('Sending…','Envoi…'):!announcement.remaining?tr('Announcement already sent','Annonce déjà envoyée'):tr('Send to all remaining members','Envoyer à tous les membres restants')}</button><button type="button" disabled={sendingAnnouncement} onClick={openAnnouncement}><RefreshCw size={16}/>{tr('Refresh count','Actualiser le nombre')}</button></div>
     </>}
    </div>:compose?<form className="mykioo-mail-compose" onSubmit={e=>{e.preventDefault();submitMail('send')}}>
     <div className="mykioo-mail-toolbar"><h3>{tr('New message','Nouveau message')}</h3><button type="button" onClick={()=>setCompose(false)}>{tr('Close','Fermer')}</button></div>
     <label>{tr('To','À')}<input type="email" value={draft.to} maxLength={254} onChange={e=>setDraft(d=>({...d,to:e.target.value}))} required placeholder="person@example.com"/></label>
     <label>{tr('Subject','Objet')}<input value={draft.subject} maxLength={220} onChange={e=>setDraft(d=>({...d,subject:e.target.value}))} required/></label>
     <label>{tr('Message','Message')}<textarea rows={12} maxLength={50000} value={draft.body} onChange={e=>setDraft(d=>({...d,body:e.target.value}))} required/></label>
     <div className="mykioo-mail-attachments"><label className="mykioo-mail-file"><Paperclip size={16}/>{tr('Attach files (up to 6 MB)','Joindre des fichiers (6 Mo max.)')}<input type="file" multiple onChange={addFiles}/></label>{draft.attachments.map((f,i)=><span key={i}>{f.name} <button type="button" onClick={()=>setDraft(d=>({...d,attachments:d.attachments.filter((_,j)=>i!==j)}))} aria-label={tr('Remove attachment','Retirer la pièce jointe')}>×</button></span>)}</div>
     <div className="mykioo-mail-actions"><button type="submit" className="primary" disabled={saving}><Send size={17}/>{saving?tr('Sending…','Envoi…'):tr('Send with IONOS','Envoyer avec IONOS')}</button><button type="button" onClick={()=>submitMail('saveDraft')} disabled={saving}><Save size={17}/>{tr('Save draft','Enregistrer')}</button></div>
    </form>:selected?<article className="mykioo-mail-reader">
     <div className="mykioo-mail-toolbar"><button type="button" onClick={()=>{setSelected(null);setMessage(null)}}><ArrowLeft size={16}/>{tr('Back to list','Retour')}</button><div><button type="button" disabled={!message} onClick={composeReply}><Reply size={16}/>{tr('Reply','Répondre')}</button><button type="button" disabled={!message||busy} onClick={()=>move('archive')}><Archive size={16}/>{tr('Archive','Archiver')}</button></div></div>
     {!message?<p className="mykioo-mail-placeholder">{tr('Loading message…','Chargement du message…')}</p>:<>
      <h3>{message.subject}</h3>
      <div className="mykioo-mail-meta"><span><strong>{tr('From','De')}:</strong> {(message.from||[]).map(x=>x.name?x.name+' <'+x.address+'>':x.address).join(', ')}</span><span><strong>{tr('To','À')}:</strong> {(message.to||[]).map(x=>x.address).join(', ')}</span><span>{localeDate(message.date,fr)}</span></div>
      {(linkedMember(message)||guessedMember(message))&&<p className="mykioo-mail-member"><Link2 size={16}/>{tr('Member','Membre')}: {(linkedMember(message)||guessedMember(message)).display_name||'—'} · {(linkedMember(message)||guessedMember(message)).email}</p>}
      <div className="mykioo-mail-link"><button type="button" onClick={()=>setLinkMode(!linkMode)}><Link2 size={16}/>{tr('Link to a member','Associer à un membre')}</button>{linkedMember(message)&&<button type="button" onClick={()=>linkMember('')}>{tr('Unlink','Dissocier')}</button>}</div>
      {linkMode&&<div className="mykioo-mail-member-search"><input value={memberQuery} onChange={e=>lookupMember(e.target.value)} placeholder={tr('Search members by name or email','Rechercher un membre')}/>{displayedMembers.filter(x=>!memberQuery||x.email?.toLowerCase().includes(memberQuery.toLowerCase())||x.display_name?.toLowerCase().includes(memberQuery.toLowerCase())).slice(0,12).map(x=><button key={x.user_id} type="button" onClick={()=>linkMember(x.user_id)}>{x.display_name||x.email} · {x.email}</button>)}</div>}
      <div className="mykioo-mail-body">{message.text||tr('(No readable message body)','(Aucun texte lisible)')}</div>
      {!!message.attachments?.length&&<div className="mykioo-mail-downloads"><strong><Paperclip size={16}/>{tr('Attachments','Pièces jointes')}</strong>{message.attachments.map(a=><button type="button" key={a.index} onClick={()=>attachment(a)}><Download size={15}/>{a.name} ({Math.ceil(a.size/1024)} KB)</button>)}</div>}
      {isDrafts&&<button type="button" className="primary" onClick={()=>startCompose({to:message.to?.[0]?.address||'',subject:message.subject,body:message.text,previousUid:message.uid,previousFolder:folder})}><FilePenLine size={16}/>{tr('Continue draft','Reprendre le brouillon')}</button>}
     </>}
    </article>:<>
     <div className="mykioo-mail-toolbar"><div><h3>{activeCategory?.name||folder}</h3><small>{busy?tr('Refreshing…','Actualisation…'):items.length+' '+tr('messages displayed','messages affichés')}</small></div><form onSubmit={e=>{e.preventDefault();load(folder,search)}}><input type="search" placeholder={tr('Search mail','Rechercher')} value={search} maxLength={120} onChange={e=>setSearch(e.target.value)}/><button type="submit" aria-label={tr('Search','Rechercher')}><Search size={18}/></button></form></div>
     <div className="mykioo-mail-list">{!items.length?<div className="mykioo-mail-placeholder"><MailOpen size={26}/>{tr('No messages in this view.','Aucun message dans cette vue.')}</div>:items.map(m=><button key={m.uid} type="button" className={'mykioo-mail-row '+(!m.seen?'unread':'')} onClick={()=>open(m)}>
      <span className="mykioo-mail-row-top"><strong>{(activeCategory?.id==='sent'?m.to?.[0]:m.from?.[0])?.name||(activeCategory?.id==='sent'?m.to?.[0]:m.from?.[0])?.address||tr('Unknown sender','Expéditeur inconnu')}</strong><time>{localeDate(m.date,fr)}</time></span>
      <span className="mykioo-mail-subject">{m.subject}</span>
      <span className="mykioo-mail-badges">{m.flagged&&<Star size={14}/ >}{(linkedMember(m)||guessedMember(m))&&<span><Link2 size={12}/>{(linkedMember(m)||guessedMember(m)).display_name||(linkedMember(m)||guessedMember(m)).email}</span>}</span>
     </button>)}</div>
    </>}
   </div>
  </div>}
  <footer className="mykioo-mail-footer"><span>{tr('IONOS IMAP sync · owner-only · messages remain in your IONOS mailbox','Synchronisation IMAP IONOS · propriétaire uniquement · messages conservés chez IONOS')}</span><a href="https://mail.ionos.com/" target="_blank" rel="noopener noreferrer">{tr('Open IONOS Webmail','Ouvrir IONOS Webmail')}</a></footer>
 </section>;
}
