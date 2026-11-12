import React,{useCallback,useEffect,useRef,useState} from 'react';
import {ImagePlus,Image,Trash2,RefreshCw,ExternalLink} from 'lucide-react';
import {supabase} from './supabase';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-support-screenshots';
export const SCREENSHOT_MAX_BYTES=4*1024*1024;
export const SCREENSHOT_MAX_PER_TICKET=10;
export const SCREENSHOT_INITIAL_MAX=3;
const allowed=['image/png','image/jpeg','image/webp'];
export function validateSupportScreenshots(files,maxCount=SCREENSHOT_INITIAL_MAX){
 const list=Array.from(files||[]);
 if(list.length>maxCount)return {files:[],error:'too_many'};
 if(list.some(f=>!allowed.includes(f.type)))return {files:[],error:'format'};
 if(list.some(f=>f.size<1||f.size>SCREENSHOT_MAX_BYTES))return {files:[],error:'size'};
 return {files:list,error:null};
}
const errorMessage=(code,fr)=>({
 too_many:fr?'Choisissez moins de captures à la fois.':'Choose fewer screenshots at once.',
 format:fr?'Utilisez des captures PNG, JPEG ou WebP.':'Use PNG, JPEG or WebP screenshots.',
 size:fr?'Chaque capture doit faire 4 Mo ou moins.':'Each screenshot must be 4 MB or smaller.'
})[code]||(fr?'Capture non valide.':'Invalid screenshot.');
async function authHeader(){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session)throw Error('Please sign in again to continue.');
 return {'Authorization':'Bearer '+session.access_token,'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY};
}
async function sendJson(payload){
 const response=await fetch(endpoint,{method:'POST',headers:{...(await authHeader()),'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error(result.error||'Screenshot request failed.');
 return result;
}
export async function uploadSupportScreenshot(ticketId,file){
 const check=validateSupportScreenshots([file],1);
 if(check.error)throw Error(check.error);
 const form=new FormData();
 form.append('ticket_id',ticketId);
 form.append('file',file,file.name);
 const response=await fetch(endpoint,{method:'POST',headers:await authHeader(),body:form});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error(result.error||'Screenshot upload failed.');
 return result;
}
export function SupportScreenshots({ticket,language='en',userId,owner=false}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const input=useRef(null);
 const [items,setItems]=useState([]),[loading,setLoading]=useState(true),[working,setWorking]=useState(false),
  [error,setError]=useState(''),[notice,setNotice]=useState('');
 const load=useCallback(async({silent=false}={})=>{
  if(!ticket?.id)return;
  if(!silent)setLoading(true);
  try{const result=await sendJson({action:'list',ticket_id:ticket.id});setItems(result.items||[]);if(!silent)setError('')}
  catch(err){if(!silent)setError(err.message||tr('Unable to load screenshots.','Impossible de charger les captures.'))}
  finally{if(!silent)setLoading(false)}
 },[ticket.id,fr]);
 useEffect(()=>{
  load();
  const timer=setInterval(()=>{if(document.visibilityState==='visible'&&!working)load({silent:true})},120000);
  const onResume=()=>{if(document.visibilityState==='visible')load({silent:true})};
  window.addEventListener('focus',onResume);document.addEventListener('visibilitychange',onResume);
  return()=>{clearInterval(timer);window.removeEventListener('focus',onResume);document.removeEventListener('visibilitychange',onResume)};
 },[load,working]);
 async function addFiles(event){
  const selected=Array.from(event.target.files||[]);
  event.target.value='';
  if(!selected.length||working)return;
  setError('');setNotice('');
  const left=SCREENSHOT_MAX_PER_TICKET-items.length;
  if(left<=0){setError(tr('This ticket already has 10 screenshots.','Cette demande contient déjà 10 captures.'));return}
  const validated=validateSupportScreenshots(selected,Math.min(3,left));
  if(validated.error){setError(errorMessage(validated.error,fr));return}
  setWorking(true);
  let saved=0;let failed='';
  for(const file of validated.files){
   try{await uploadSupportScreenshot(ticket.id,file);saved++}
   catch(err){failed=err.message||tr('Upload failed.','Échec du téléversement.');break}
  }
  await load({silent:true});
  setWorking(false);
  if(saved)setNotice(tr(saved+' screenshot(s) uploaded. They are visible only on this ticket.',saved+' capture(s) ajoutée(s). Elles sont visibles uniquement dans cette demande.'));
  if(failed)setError(failed);
 }
 async function remove(item){
  if(!window.confirm(tr('Remove this screenshot from the ticket?','Supprimer cette capture de la demande ?')))return;
  setWorking(true);setError('');setNotice('');
  try{await sendJson({action:'delete',ticket_id:ticket.id,id:item.id});await load({silent:true});
   setNotice(tr('Screenshot removed.','Capture supprimée.'))}
  catch(err){setError(err.message||tr('Could not remove screenshot.','Impossible de supprimer la capture.'))}
  finally{setWorking(false)}
 }
 const canAdd=ticket.status!=='closed'||owner;
 return <section className="mykioo-screenshot-panel">
  <div className="mykioo-screenshot-header">
   <h4><Image size={17}/>{tr('Ticket screenshots','Captures de la demande')}{!loading&&<span>({items.length}/{SCREENSHOT_MAX_PER_TICKET})</span>}</h4>
   <button type="button" onClick={()=>load()} disabled={working} aria-label={tr('Refresh screenshots','Actualiser les captures')}><RefreshCw size={15}/>{tr('Refresh','Actualiser')}</button>
  </div>
  <p>{tr('Private images shared only with the ticket owner and MYKIOO support. PNG, JPEG or WebP; up to 4 MB each.','Images privées visibles uniquement par le membre concerné et l’assistance MYKIOO. PNG, JPEG ou WebP; 4 Mo maximum chacune.')}</p>
  {loading?<p>{tr('Loading screenshots…','Chargement des captures…')}</p>:items.length===0?
   <p className="mykioo-screenshot-empty">{tr('No screenshots attached yet.','Aucune capture jointe pour le moment.')}</p>:
   <div className="mykioo-screenshot-grid">{items.map(item=><div key={item.id} className="mykioo-screenshot-item">
    {item.url?<a href={item.url} target="_blank" rel="noopener noreferrer" aria-label={tr('Open screenshot ','Ouvrir la capture ')+item.name}>
      <img src={item.url} alt={item.name} loading="lazy"/><ExternalLink size={14}/>
     </a>:<div className="mykioo-screenshot-unavailable">{tr('Preview unavailable — refresh','Aperçu indisponible — actualiser')}</div>}
    <small title={item.name}>{item.name}</small>
    <small>{(item.size/(1024*1024)).toFixed(2)} MB · {item.uploaded_by===userId?tr('You','Vous'):owner?tr('Member','Membre'):'MYKIOO'}</small>
    {item.can_delete&&<button type="button" disabled={working} onClick={()=>remove(item)}><Trash2 size={14}/>{tr('Remove','Supprimer')}</button>}
   </div>)}</div>}
  {canAdd&&items.length<SCREENSHOT_MAX_PER_TICKET&&<div className="mykioo-screenshot-picker">
   <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={addFiles} disabled={working} aria-label={tr('Choose screenshots','Choisir des captures')}/>
   <button type="button" disabled={working} onClick={()=>input.current?.click()}><ImagePlus size={16}/>{working?tr('Uploading…','Téléversement…'):tr('Add screenshots','Ajouter des captures')}</button>
   <small>{tr('Select up to 3 images at a time.','Sélectionnez jusqu’à 3 images à la fois.')}</small>
  </div>}
  {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
  {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
 </section>;
}
