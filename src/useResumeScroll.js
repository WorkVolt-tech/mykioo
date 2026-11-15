import {useEffect,useRef} from 'react';

// Remember a dashboard's vertical reading position in the current browser tab.
// This stores a number only, never form contents, tokens or customer details.
export function useResumeScroll(scope,section,ready=true){
 const previousSection=useRef(null);
 useEffect(()=>{
  if(!scope||!section||!ready)return;
  const key='mykioo-ui-scroll:'+scope+':'+String(section).toLowerCase().replace(/\s+/g,'-');
  const changedSection=previousSection.current!==null&&previousSection.current!==section;
  previousSection.current=section;
  let saved=0;
  try{saved=Math.max(0,Number(window.sessionStorage.getItem(key))||0)}catch{}
  saved=Math.min(saved,1000000);
  let live=true,interacted=false,restoring=true,frame=0,restoredOnce=false;
  const restore=()=>{
   if(!live||interacted)return;
   // Restore on first paint; only retry if saved content was not tall enough.
   // Never undo a later scrollIntoView action by resetting a page to the top.
   if(!restoredOnce){
    if(changedSection||window.scrollY<3)window.scrollTo(0,saved);
    restoredOnce=true;
   }else if(saved>0&&window.scrollY<3){
    window.scrollTo(0,saved);
   }
  };
  const save=()=>{
   if(!live||restoring)return;
   try{window.sessionStorage.setItem(key,String(Math.max(0,Math.round(window.scrollY))))}catch{}
  };
  const onScroll=()=>{
   if(restoring)return;
   if(frame)window.cancelAnimationFrame(frame);
   frame=window.requestAnimationFrame(()=>{frame=0;save()});
  };
  const onUserAction=()=>{interacted=true;restoring=false;save()};
  const onPageHide=()=>{restoring=false;save()};
  const first=window.requestAnimationFrame(()=>window.requestAnimationFrame(restore));
  const later=window.setTimeout(restore,180);
  const afterData=window.setTimeout(()=>{restore();restoring=false;save()},750);
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('pagehide',onPageHide);
  window.addEventListener('wheel',onUserAction,{passive:true});
  window.addEventListener('touchstart',onUserAction,{passive:true});
  window.addEventListener('keydown',onUserAction);
  return ()=>{
   window.clearTimeout(later);window.clearTimeout(afterData);
   window.cancelAnimationFrame(first);
   if(frame)window.cancelAnimationFrame(frame);
   restoring=false;save();live=false;
   window.removeEventListener('scroll',onScroll);
   window.removeEventListener('pagehide',onPageHide);
   window.removeEventListener('wheel',onUserAction);
   window.removeEventListener('touchstart',onUserAction);
   window.removeEventListener('keydown',onUserAction);
  };
 },[scope,section,ready]);
}
