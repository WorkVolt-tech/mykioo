import {useEffect,useState} from 'react';
import {readRemembered} from './useRememberedState';

// The URL is the source of truth for deep links and browser navigation.
// A per-account remembered section handles an iOS app reopening at the home URL.
const slug=value=>String(value).trim().toLowerCase().replace(/\s+/g,'-');

export function usePageSection(validSections,defaultSection,scope=''){
 const storageKey=scope?'mykioo-ui:'+scope+':section':null;
 const match=value=>validSections.find(section=>slug(section)===slug(value||''))||null;
 const fromUrl=()=>{
  const query=new URLSearchParams(window.location.search);
  const requested=query.get('section');
  if(requested)return match(requested)||defaultSection;
  // Never restore a dashboard section over an invitation or recovery link.
  if(storageKey&&!query.has('invite_token')&&!query.has('reset_password')){
   return match(readRemembered(storageKey,null))||defaultSection;
  }
  return defaultSection;
 };
 const [section,setSection]=useState(fromUrl);

 useEffect(()=>{
  if(storageKey){
   try{window.localStorage.setItem(storageKey,JSON.stringify(section))}catch{}
  }
  const url=new URL(window.location.href);
  const value=slug(section);
  if(url.searchParams.get('section')!==value){
   url.searchParams.set('section',value);
   window.history.replaceState(window.history.state,'',url.pathname+url.search+url.hash);
  }
 },[section,storageKey]);

 useEffect(()=>{
  const restorePage=()=>{
   const requested=new URLSearchParams(window.location.search).get('section');
   setSection(match(requested)||defaultSection);
  };
  window.addEventListener('popstate',restorePage);
  return ()=>window.removeEventListener('popstate',restorePage);
 },[defaultSection,scope]);

 return [section,setSection];
}
