import {useEffect,useState} from 'react';

// Save only harmless UI preferences (which page, tab, filter, or guide step).
// Never use this hook for passwords, tokens, payment details, or support messages.
export function readRemembered(key,fallback,mode='local'){
 try{
  const storage=mode==='session'?window.sessionStorage:window.localStorage;
  const raw=storage.getItem(key);
  if(!raw||raw.length>4096)return fallback;
  return JSON.parse(raw);
 }catch{return fallback}
}

export function useRememberedState(key,fallback,mode='local'){
 const [value,setValue]=useState(()=>readRemembered(key,fallback,mode));
 useEffect(()=>{
  try{
   const storage=mode==='session'?window.sessionStorage:window.localStorage;
   storage.setItem(key,JSON.stringify(value));
  }catch{/* Privacy mode or storage quota: keep working in memory. */}
 },[key,mode,value]);
 return [value,setValue];
}
