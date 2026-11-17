import React,{useEffect,useState} from 'react';
import {AlertTriangle,CheckCircle2,Info} from 'lucide-react';
import {supabase} from './supabase';
import './WebsiteAnnouncements.css';

// Reading is restricted by Supabase RLS; the client also filters owner-visible drafts.
const readable=['id','title_en','title_fr','message_en','message_fr','tone','audience','is_published','starts_at','ends_at','created_at'].join(',');
const rank={urgent:0,warning:1,success:2};

export function useWebsiteAnnouncements(){
 const [announcements,setAnnouncements]=useState([]);
 useEffect(()=>{
  if(!supabase)return;
  let active=true;
  const refresh=async()=>{
   const {data,error}=await supabase.from('mykioo_website_announcements')
    .select(readable).order('created_at',{ascending:false}).limit(100);
   if(active&&!error)setAnnouncements(data||[]);
  };
  refresh();
  const timer=setInterval(()=>{if(document.visibilityState==='visible')refresh()},60000);
  const resume=()=>{if(document.visibilityState==='visible')refresh()};
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('focus',resume);
  window.addEventListener('online',resume);
  return ()=>{active=false;clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('focus',resume);window.removeEventListener('online',resume)};
 },[]);
 return announcements;
}

export function WebsiteAnnouncementBanner({announcement,language='en'}){
 const fr=language==='fr';
 const tone=['success','warning','urgent'].includes(announcement.tone)?announcement.tone:'warning';
 const Icon=tone==='success'?CheckCircle2:tone==='urgent'?AlertTriangle:Info;
 const label=tone==='success'?(fr?'Résolu':'Resolved'):tone==='urgent'?(fr?'Urgent':'Urgent'):(fr?'Avis':'Notice');
 return <section className={'mykioo-website-announcement tone-'+tone} role={tone==='urgent'?'alert':'status'}>
  <Icon size={21} aria-hidden="true"/>
  <div className="mykioo-website-announcement-copy">
   <div className="mykioo-website-announcement-title"><strong>{fr?announcement.title_fr:announcement.title_en}</strong><span>{label}</span></div>
   <p>{fr?announcement.message_fr:announcement.message_en}</p>
  </div>
 </section>;
}

export default function WebsiteAnnouncements({language='en',audience='member'}){
 const entries=useWebsiteAnnouncements(),now=Date.now();
 const shown=entries.filter(x=>{
  if(!x.is_published)return false;
  const starts=Date.parse(x.starts_at),ends=x.ends_at?Date.parse(x.ends_at):null;
  if(Number.isNaN(starts)||starts>now||(ends!==null&&ends<=now))return false;
  return x.audience==='all'||x.audience===audience;
 }).sort((a,b)=>(rank[a.tone]??1)-(rank[b.tone]??1)||Date.parse(b.created_at)-Date.parse(a.created_at));
 if(!shown.length)return null;
 return <div className="mykioo-website-announcements" aria-label={language==='fr'?'Annonces MYKIOO':'MYKIOO announcements'}>
  {shown.map(entry=><WebsiteAnnouncementBanner key={entry.id} announcement={entry} language={language}/>)}
 </div>;
}
