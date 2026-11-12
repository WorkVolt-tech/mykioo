import React,{useEffect,useState} from 'react';
import {RefreshCw,X} from 'lucide-react';
import './SiteUpdatePrompt.css';

const currentBuild=__MYKIOO_BUILD_VERSION__;
const dismissedKey='mykioo-dismissed-deployment';

export default function SiteUpdatePrompt(){
 const [available,setAvailable]=useState('');
 const [language,setLanguage]=useState(()=>document.documentElement.lang==='fr'?'fr':'en');

 useEffect(()=>{
  if(import.meta.env.DEV)return;
  let live=true;
  let checking=false;
  async function check(){
   if(checking||!navigator.onLine)return;
   checking=true;
   try{
    const response=await fetch('/version.json?cache='+Date.now(),{
     cache:'no-store',headers:{'Cache-Control':'no-cache','Accept':'application/json'}
    });
    if(!response.ok)return;
    const data=await response.json();
    const next=typeof data?.version==='string'?data.version:'';
    if(live&&next&&next!==currentBuild&&sessionStorage.getItem(dismissedKey)!==next){
     setAvailable(next);
    }
   }catch{
    // Offline / temporary network errors should not interrupt the member's work.
   }finally{checking=false;}
  }
  check();
  const interval=window.setInterval(check,90000);
  const onFocus=()=>check();
  const onVisible=()=>{if(document.visibilityState==='visible')check()};
  const onLanguage=event=>setLanguage(event.detail==='fr'?'fr':'en');
  window.addEventListener('focus',onFocus);
  window.addEventListener('online',onFocus);
  window.addEventListener('mykioo-language-changed',onLanguage);
  document.addEventListener('visibilitychange',onVisible);
  return()=>{
   live=false;window.clearInterval(interval);
   window.removeEventListener('focus',onFocus);
   window.removeEventListener('online',onFocus);
   window.removeEventListener('mykioo-language-changed',onLanguage);
   document.removeEventListener('visibilitychange',onVisible);
  };
 },[]);
 if(!available)return null;
 const fr=language==='fr';
 const later=()=>{try{sessionStorage.setItem(dismissedKey,available)}catch{}setAvailable('')};
 return <aside className="mykioo-update-prompt" role="status" aria-live="polite" aria-label={fr?'Mise à jour disponible':'Update available'}>
   <div className="mykioo-update-icon"><RefreshCw size={20}/></div>
   <div className="mykioo-update-copy">
    <strong>{fr?'Une nouvelle version de MYKIOO est disponible.':'A new version of MYKIOO is available.'}</strong>
    <span>{fr?'Actualisez pour obtenir les dernières améliorations. Votre page restera ouverte après l’actualisation.':'Refresh for the latest improvements. You will return to the same page after refreshing.'}</span>
   </div>
   <button type="button" className="mykioo-update-now" onClick={()=>window.location.reload()}>{fr?'Actualiser maintenant':'Refresh now'}</button>
   <button type="button" className="mykioo-update-later" onClick={later}>{fr?'Plus tard':'Later'}</button>
   <button type="button" className="mykioo-update-close" onClick={later} aria-label={fr?'Fermer la notification':'Dismiss update notice'}><X size={18}/></button>
  </aside>;
}
