import React,{useEffect,useRef} from 'react';
import {createRoot} from 'react-dom/client';
import {AlertTriangle,X} from 'lucide-react';
import './MykiooDialog.css';

/**
 * Promise-based branded confirmation, for event handlers that previously used
 * window.confirm. Does not modify window globals or bypass the owner's choice.
 */
export function mykiooConfirm(message,{title,confirmText,cancelText,danger=false}={}){
 return new Promise(resolve=>{
  if(typeof document==='undefined'){resolve(false);return;}
  const fr=document.documentElement.lang?.toLowerCase().startsWith('fr');
  title=title||(fr?'Veuillez confirmer':'Please confirm');
  confirmText=confirmText||(fr?'Confirmer':'Confirm');
  cancelText=cancelText||(fr?'Annuler':'Cancel');
  const mount=document.createElement('div');
  document.body.appendChild(mount);
  const root=createRoot(mount);
  let closed=false;
  const finish=value=>{
   if(closed)return;
   closed=true;
   root.unmount();
   mount.remove();
   resolve(value);
  };
  root.render(<Confirmation message={message} title={title} confirmText={confirmText}
   cancelText={cancelText} danger={danger} finish={finish}/>);
 });
}
function Confirmation({message,title,confirmText,cancelText,danger,finish}){
 const confirmRef=useRef(null);
 useEffect(()=>{
  const previouslyFocused=document.activeElement;
  const oldOverflow=document.body.style.overflow;
  document.body.style.overflow='hidden';
  confirmRef.current?.focus();
  function onKey(e){
   if(e.key==='Escape'){e.preventDefault();finish(false);}
   if(e.key==='Tab'){
    const options=Array.from(document.querySelectorAll('.mykioo-confirm-dialog button'));
    if(!options.length)return;
    const first=options[0],last=options[options.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
    else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
   }
  }
  document.addEventListener('keydown',onKey);
  return()=>{document.removeEventListener('keydown',onKey);document.body.style.overflow=oldOverflow;previouslyFocused?.focus?.();};
 },[finish]);
 return <div className="mykioo-confirm-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)finish(false)}}>
  <div className="mykioo-confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="mykioo-confirm-title" aria-describedby="mykioo-confirm-message">
   <button type="button" className="mykioo-confirm-close" aria-label={cancelText} onClick={()=>finish(false)}><X size={19}/></button>
   <div className={'mykioo-confirm-icon'+(danger?' danger':'')}><AlertTriangle size={22}/></div>
   <h2 id="mykioo-confirm-title">{title}</h2>
   <p id="mykioo-confirm-message">{message}</p>
   <div className="mykioo-confirm-actions">
    <button type="button" className="mykioo-confirm-cancel" onClick={()=>finish(false)}>{cancelText}</button>
    <button type="button" className={'mykioo-confirm-accept'+(danger?' danger':'')} ref={confirmRef} onClick={()=>finish(true)}>{confirmText}</button>
   </div>
  </div>
 </div>;
}
