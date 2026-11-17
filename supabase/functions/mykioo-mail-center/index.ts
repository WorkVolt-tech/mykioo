import {createClient} from "npm:@supabase/supabase-js@2.57.0";
import {ImapFlow} from "npm:imapflow@2.9.1";
import PostalMime from "npm:postal-mime@4.2.1";
import nodemailer from "npm:nodemailer@10.5.0";

const ACCOUNT="iptv@mykioo.icu";
const allowedOrigins=new Set(["https://mykioo.icu","https://www.mykioo.icu","https://mykioo.pages.dev"]);
const json=(payload:unknown,status=200,origin="https://mykioo.icu")=>new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store","Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"}});
const clean=(v:unknown,max=300)=>typeof v==="string"?v.trim().slice(0,max):"";
const address=(v:unknown)=>typeof v==="string"&&v.length<=254&&/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(v);
const uid=(v:unknown)=>Number.isSafeInteger(Number(v))&&Number(v)>0&&Number(v)<2147483648?Number(v):0;
const fileName=(v:unknown)=>clean(v,120).replace(/[\/\\\r\n\x00-\x1f]/g,"_")||"attachment";
const base64=(u:Uint8Array)=>{let s="";for(let i=0;i<u.length;i+=8192)s+=String.fromCharCode(...u.subarray(i,i+8192));return btoa(s)};
const bytesFromBase64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const asText=(v:unknown)=>typeof v==="string"?v.slice(0,250000):"";
const fallbackText=(html:string)=>html.replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/gi," ").replace(/&amp;/gi,"&").replace(/&lt;/gi,"<").replace(/&gt;/gi,">").replace(/\s{3,}/g,"\n").slice(0,120000);
const formatAddress=(a:any)=>Array.isArray(a)?a.map(x=>({address:clean(x.address,254),name:clean(x.name,120)})):[];

function publicError(error:unknown){
 const code=clean((error as any)?.code,40);
 console.error("MYKIOO Mail Center failure",code||((error as any)?.name||"unknown"));
 if(["AUTHENTICATIONFAILED","NoAuthentication","EAUTH"].includes(code))return "IONOS mailbox credentials were rejected. Check the private mailbox password.";
 if(code==="ETIMEDOUT"||code==="ECONNREFUSED")return "IONOS mailbox connection unavailable. Try again.";
 return "Mailbox request could not be completed. Please try again or use IONOS Webmail.";
}

async function connectMail(password:string){
 const client=new ImapFlow({host:"imap.ionos.com",port:993,secure:true,auth:{user:ACCOUNT,pass:password},logger:false,connectionTimeout:12000,greetingTimeout:12000,socketTimeout:20000});
 client.on("error",()=>{});
 await client.connect();
 return client;
}
function findFolder(folders:any[],special:string,guesses:string[]){
 return folders.find(f=>f.specialUse===special)?.path||
   folders.find(f=>guesses.some(g=>f.path.toLowerCase()===g.toLowerCase()))?.path||null;
}
async function foldersFor(client:ImapFlow){
 const items=await client.list({statusQuery:{messages:true,unseen:true}});
 const sent=findFolder(items,"\\Sent",["Sent","Sent Items","Sent Messages","Gesendet"]);
 const drafts=findFolder(items,"\\Drafts",["Drafts","Entwürfe","Draft"]);
 const archive=findFolder(items,"\\Archive",["Archive","Archives","Archiv"]);
 const trash=findFolder(items,"\\Trash",["Trash","Deleted Messages","Deleted Items","Papierkorb"]);
 const inbox=findFolder(items,"\\Inbox",["INBOX"])||"INBOX";
 return {items,inbox,sent,drafts,archive,trash};
}
async function ensureFolder(client:ImapFlow,kind:"sent"|"drafts"|"archive"){
 const f=await foldersFor(client);
 const exists=f[kind];
 if(exists)return exists;
 const path=kind==="sent"?"MYKIOO Sent":kind==="drafts"?"MYKIOO Drafts":"MYKIOO Archive";
 await client.mailboxCreate(path);
 return path;
}
async function openFolder(client:ImapFlow,folder:string){
 const folders=await foldersFor(client);
 if(!folders.items.some(x=>x.path===folder)&&folder!=="INBOX")throw new Error("Unknown folder");
 return client.getMailboxLock(folder);
}
function serializeEnvelope(m:any){
 const e=m.envelope||{};
 return {uid:m.uid,subject:clean(e.subject,300)||"(No subject)",from:formatAddress(e.from),to:formatAddress(e.to),date:m.internalDate||e.date||null,seen:m.flags?.has("\\Seen")||false,flagged:m.flags?.has("\\Flagged")||false,size:m.size||0,messageId:clean(e.messageId,512)};
}
async function membersFor(db:any,emails:string[]){
 const unique=[...new Set(emails.filter(address).map(x=>x.toLowerCase()))].slice(0,45);
 if(!unique.length)return [];
 const {data,error}=await db.from("mykioo_members").select("user_id,email,display_name,status").in("email",unique).limit(50);
 if(error)throw error;
 return data||[];
}
async function association(db:any,ids:string[]){
 const keys=ids.filter(x=>x.length>=3&&x.length<=512).slice(0,40);
 if(!keys.length)return [];
 const {data,error}=await db.from("mykioo_mail_links").select("message_id,member_id").in("message_id",keys);
 if(error)throw error;
 return data||[];
}
function sanitizeAttachments(attachments:any[]){
 return (attachments||[]).map((a:any,i:number)=>({index:i,name:fileName(a.filename),mime:clean(a.mimeType,120)||"application/octet-stream",size:a.content?.byteLength||a.content?.length||0})).slice(0,30);
}
async function buildRaw(mail:any){
 const composer=nodemailer.createTransport({streamTransport:true,buffer:true,newline:"unix"});
 const result=await composer.sendMail(mail);
 return result.message as Uint8Array;
}
const validFolder=(v:unknown)=>typeof v==="string"&&v.length<=160&&!/[\x00-\x1f]/.test(v);


const CAMPAIGN="service-email-domain-update-nov2026";
const announcement={
 en:{subject:"MYKIOO | Important Update: Email Delivery & Our New Website",body:[
 "Hello MYKIOO Members,",
 "We'd like to share an important update and apologize for some recent technical difficulties.",
 "We experienced an issue with our email notifications that prevented some members from receiving important messages, including their subscription usernames, passwords and server information.",
 "Our team has worked to resolve this issue, and email delivery should now be functioning normally. We sincerely apologize if you were affected.",
 "We're also moving from our Cloudflare Pages website address to our official domain: https://mykioo.icu",
 "This transition has brought a few unexpected technical hiccups. We are continuously improving the experience and resolving remaining problems as quickly as possible.",
 "MYKIOO is run by a small, dedicated team. Despite our limited resources, we remain committed to giving you reliable service.",
 "Please check your Inbox and Spam/Junk folders. If you're still missing your login information, contact us through the Support section at https://mykioo.icu.",
 "As a thank-you for your patience, use discount code MYKIOO2026 at checkout to save CA$5 on a paid subscription or renewal (US$3 when paying with Zelle). This offer is valid until December 31, 2026, at 11:59 PM Toronto time. Free trials are excluded.",
 "Thank you for your patience, understanding and continued support. We truly appreciate having you in the MYKIOO community.",
 "Warm regards,\nThe MYKIOO Team"
 ].join("\n\n")},
 fr:{subject:"MYKIOO | Mise à jour importante : courriels et nouvelle adresse du site",body:[
 "Bonjour à tous les membres MYKIOO,",
 "Nous souhaitons vous informer de quelques mises à jour et nous excuser pour les difficultés techniques rencontrées récemment.",
 "Nous avons connu un problème avec les notifications par courriel. Certains membres n'ont pas reçu leurs identifiants de connexion, mots de passe ou adresses de serveur.",
 "Notre équipe a travaillé à résoudre ce problème, et l'envoi des courriels devrait maintenant fonctionner normalement. Nous sommes sincèrement désolés des désagréments occasionnés.",
 "Nous effectuons également la transition de notre adresse Cloudflare Pages vers notre domaine officiel : https://mykioo.icu",
 "Cette transition a provoqué quelques difficultés techniques imprévues. Nous travaillons continuellement à améliorer la plateforme et à corriger les problèmes restants.",
 "MYKIOO est géré par une petite équipe dévouée. Malgré nos ressources limitées, nous nous engageons à vous offrir un service fiable.",
 "Veuillez vérifier votre boîte de réception et vos courriels indésirables. Si vos identifiants sont toujours manquants, contactez l'assistance depuis https://mykioo.icu.",
 "Pour vous remercier de votre patience, utilisez le code promo MYKIOO2026 lors de votre commande pour obtenir un rabais de 5 $ CA sur un abonnement payant ou un renouvellement (3 $ US pour les paiements par Zelle). Cette offre est valable jusqu’au 31 décembre 2026 à 23 h 59, heure de Toronto. Les essais gratuits sont exclus.",
 "Merci de votre patience, de votre compréhension et de votre confiance. Votre soutien compte beaucoup pour notre équipe.",
 "Cordialement,\nL'équipe MYKIOO"
 ].join("\n\n")}
};
const mailEsc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
const mailHtml=(lang:"en"|"fr")=>'<html lang="'+lang+'"><body style="background:#0e1020;color:#f4edf5;padding:24px;font-family:Arial,sans-serif"><div style="max-width:600px;margin:auto;background:#1d1929;border:1px solid #66516c;border-top:4px solid #d9b87e;border-radius:12px;padding:28px"><h1 style="color:#e7c18b">MYKIOO</h1><h2>'+mailEsc(announcement[lang].subject.replace("MYKIOO | ",""))+'</h2><div style="white-space:pre-wrap;line-height:1.7">'+mailEsc(announcement[lang].body)+'</div><p><a style="color:#e7c18b" href="https://mykioo.icu">mykioo.icu</a></p></div></body></html>';
async function announcementState(db:any){
 const {data:members,error:me}=await db.from("mykioo_members").select("user_id,email,preferred_language").eq("role","member").eq("status","approved").order("user_id",{ascending:true}).limit(1000);
 const {data:history,error:he}=await db.from("mykioo_audit_logs").select("entity_id").eq("action","member_announcement_sent").eq("entity_type","member").contains("details",{campaign_id:CAMPAIGN}).limit(1000);
 if(me||he)throw Error("Cannot check member announcement status");
 const sent=new Set((history||[]).map((r:any)=>r.entity_id));
 const recipients=(members||[]).filter((r:any)=>address(r.email));
 return {total:recipients.length,sent:recipients.filter((m:any)=>sent.has(m.user_id)).length,pending:recipients.filter((m:any)=>!sent.has(m.user_id))};
}

Deno.serve(async request=>{
 const requestOrigin=request.headers.get("Origin")||"";
 const corsOrigin=allowedOrigins.has(requestOrigin)?requestOrigin:"https://mykioo.icu";
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{"Access-Control-Allow-Origin":corsOrigin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin","Cache-Control":"no-store"}});
 if(!allowedOrigins.has(requestOrigin))return json({error:"Origin not allowed"},403,corsOrigin);
 if(request.method!=="POST")return json({error:"Method not allowed"},405,corsOrigin);
 const auth=request.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer "))return json({error:"Sign in required"},401,corsOrigin);
 const endpoint=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!endpoint||!secret)return json({error:"Service not configured"},503,corsOrigin);
 const db=createClient(endpoint,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:{user},error:authError}=await db.auth.getUser(auth.slice(7));
 if(authError||!user)return json({error:"Invalid session"},401,corsOrigin);
 const {data:member,error:memberError}=await db.from("mykioo_members").select("role,status").eq("user_id",user.id).maybeSingle();
 if(memberError||member?.role!=="owner"||member.status!=="approved"||user.app_metadata?.mykioo_role!=="owner")
   return json({error:"Owner access required"},403,corsOrigin);
 let input:any;
 try{input=await request.json()}catch{return json({error:"Invalid request"},400,corsOrigin)}
 if(!input||typeof input!=="object")return json({error:"Invalid request"},400,corsOrigin);
 const action=clean(input.action,32);
 const password=Deno.env.get("MYKIOO_IONOS_SMTP_PASSWORD");
 if(action==="status")return json({ok:true,configured:Boolean(password),mailbox:ACCOUNT},200,corsOrigin);
 if(!password)return json({error:"IONOS mailbox password is not configured in private Supabase secrets"},503,corsOrigin);
 if(action==="announcement_status"||action==="announcement_send"){
  const a=await announcementState(db);
  if(action==="announcement_status")return json({ok:true,campaign_id:CAMPAIGN,total:a.total,sent:a.sent,remaining:a.pending.length,previews:announcement},200,corsOrigin);
  if(input.confirm!==true||input.campaign_id!==CAMPAIGN)return json({error:"Explicit confirmation required"},400,corsOrigin);
  if(!a.pending.length)return json({ok:true,campaign_id:CAMPAIGN,total:a.total,sent:a.sent,remaining:0,accepted:0,failed:0},200,corsOrigin);
  const smtp=nodemailer.createTransport({host:"smtp.ionos.com",port:465,secure:true,auth:{user:ACCOUNT,pass:password},connectionTimeout:12000,greetingTimeout:12000,socketTimeout:18000});
  let accepted=0,failed=0;
  try{
   for(const member of a.pending.slice(0,8)){
    const language=member.preferred_language==="fr"?"fr":"en",d=announcement[language];
    try{
     const result=await smtp.sendMail({from:{name:"MYKIOO",address:ACCOUNT},to:member.email,subject:d.subject,text:d.body,html:mailHtml(language)});
     if(!result.accepted?.some((x:string)=>x.toLowerCase()===member.email.toLowerCase()))throw Error("SMTP did not accept recipient");
     const {error:logError}=await db.from("mykioo_audit_logs").insert({actor_id:user.id,action:"member_announcement_sent",entity_type:"member",entity_id:member.user_id,details:{campaign_id:CAMPAIGN,language}});
     if(logError)throw Error("tracking_failed_after_send");
     accepted++;
    }catch(error){failed++;console.error("MYKIOO member announcement delivery error",(error as Error)?.name||"unknown");if((error as Error)?.message==="tracking_failed_after_send")break;}
   }
  }finally{smtp.close()}
  const after=await announcementState(db);
  return json({ok:failed===0,campaign_id:CAMPAIGN,total:after.total,sent:after.sent,remaining:after.pending.length,accepted,failed,...(failed?{error:"Some messages were not accepted. Check counts before retrying."}:{})},failed?207:200,corsOrigin);
 }
 if(action==="members"){
   const term=clean(input.search,100);
   if(term.length<2)return json({ok:true,members:[]},200,corsOrigin);
   const {data,error}=await db.from("mykioo_members").select("user_id,email,display_name,status").eq("role","member").or("email.ilike.%"+term.replace(/[%_,().]/g,"")+"%,display_name.ilike.%"+term.replace(/[%_,().]/g,"")+"%").limit(20);
   if(error)return json({error:"Member search unavailable"},503,corsOrigin);
   return json({ok:true,members:data||[]},200,corsOrigin);
 }
 if(action==="link"){
   const messageId=clean(input.messageId,512),memberId=clean(input.memberId,50);
   if(messageId.length<3||!(/^[0-9a-f-]{36}$/i.test(memberId)||memberId===""))return json({error:"Invalid link"},400,corsOrigin);
   if(memberId){
    const {data:target}=await db.from("mykioo_members").select("user_id").eq("user_id",memberId).eq("role","member").maybeSingle();
    if(!target)return json({error:"Member not found"},404,corsOrigin);
    const {error}=await db.from("mykioo_mail_links").upsert({message_id:messageId,member_id:memberId,linked_by:user.id,updated_at:new Date().toISOString()},{onConflict:"message_id"});
    if(error)return json({error:"Could not save member link"},503,corsOrigin);
   }else{
    const {error}=await db.from("mykioo_mail_links").delete().eq("message_id",messageId);
    if(error)return json({error:"Could not remove member link"},503,corsOrigin);
   }
   return json({ok:true},200,corsOrigin);
 }
 let client:ImapFlow|null=null;
 try{
  client=await connectMail(password);
  if(action==="folders"){
    const found=await foldersFor(client);
    return json({ok:true,folders:found.items.filter(x=>!x.flags?.has("\\Noselect")).map(f=>({path:f.path,specialUse:f.specialUse||null,messages:f.status?.messages||0,unseen:f.status?.unseen||0})),defaultFolder:found.inbox},200,corsOrigin);
  }
  if(action==="list"){
   const folder=clean(input.folder,160)||"INBOX";
   if(!validFolder(folder))return json({error:"Invalid folder"},400,corsOrigin);
   const lock=await openFolder(client,folder);
   try{
    const total=client.mailbox?.exists||0,query=clean(input.search,120);
    let ids:number[]=[];
    if(query){
     const all=await client.search({or:[{subject:query},{from:query},{to:query},{body:query}]},{uid:true});
     ids=(all||[]).slice(-40);
    }
    let msgs:any[]=[];
    if(query&&ids.length)msgs=await client.fetchAll(ids,{uid:true,envelope:true,flags:true,size:true,internalDate:true},{uid:true});
    if(!query&&total)msgs=await client.fetchAll(String(Math.max(1,total-39))+":"+String(total),{uid:true,envelope:true,flags:true,size:true,internalDate:true});
    const items=msgs.map(serializeEnvelope).reverse();
    const emails=items.flatMap(m=>[...m.from,...m.to].map(x=>x.address));
    const matched=await membersFor(db,emails);
    const linked=await association(db,items.map(x=>x.messageId));
    return json({ok:true,folder,total,messages:items,matchedMembers:matched,links:linked},200,corsOrigin);
   }finally{lock.release()}
  }
  if(action==="read"||action==="attachment"){
   const folder=clean(input.folder,160)||"INBOX",id=uid(input.uid);
   if(!validFolder(folder)||!id)return json({error:"Invalid message"},400,corsOrigin);
   const lock=await openFolder(client,folder);
   try{
    const result=await client.fetchOne(id,{uid:true,size:true,flags:true,envelope:true,source:true},{uid:true});
    if(!result)return json({error:"Message not found"},404,corsOrigin);
    if(result.size>12*1024*1024)return json({error:"This message is too large to open here. Use IONOS Webmail."},413,corsOrigin);
    const parsed=await PostalMime.parse(result.source as Uint8Array);
    if(action==="attachment"){
     const index=Number(input.index),a=parsed.attachments?.[index];
     if(!Number.isInteger(index)||index<0||!a)return json({error:"Attachment not found"},404,corsOrigin);
     const bytes=new Uint8Array(a.content);
     if(bytes.byteLength>5*1024*1024)return json({error:"Attachment is too large. Download from IONOS Webmail."},413,corsOrigin);
     return json({ok:true,filename:fileName(a.filename),mime:clean(a.mimeType,120)||"application/octet-stream",base64:base64(bytes)},200,corsOrigin);
    }
    if(!result.flags?.has("\\Seen"))await client.messageFlagsAdd(id,["\\Seen"],{uid:true});
    const envelope=serializeEnvelope(result);
    const links=await association(db,[envelope.messageId]);
    const members=await membersFor(db,[...envelope.from,...envelope.to].map(x=>x.address));
    return json({ok:true,message:{...envelope,text:asText(parsed.text)||fallbackText(asText(parsed.html)),attachments:sanitizeAttachments(parsed.attachments),replyTo:formatAddress(parsed.replyTo),inReplyTo:clean(parsed.inReplyTo,512),references:clean((parsed as any).references,1500)},members,links},200,corsOrigin);
   }finally{lock.release()}
  }
  if(action==="mark"||action==="move"||action==="deleteDraft"){
   const folder=clean(input.folder,160)||"INBOX",id=uid(input.uid);
   if(!id||!validFolder(folder))return json({error:"Invalid message"},400,corsOrigin);
   const boxes=await foldersFor(client);
   const moveTarget=action==="move"?(input.destination==="archive"?(boxes.archive||await ensureFolder(client,"archive")):input.destination==="trash"?boxes.trash:clean(input.destination,160)):null;
   if(action==="move"&&(!moveTarget||!validFolder(moveTarget)))return json({error:"Destination unavailable"},400,corsOrigin);
   const lock=await openFolder(client,folder);
   try{
    if(action==="mark"){
     const flag=input.flag==="flagged"?"\\Flagged":"\\Seen";
     if(input.enabled===true)await client.messageFlagsAdd(id,[flag],{uid:true});
     else await client.messageFlagsRemove(id,[flag],{uid:true});
    }else if(action==="move"){
     const target=moveTarget as string;
     if(!boxes.items.some(x=>x.path===target)&&target!=="MYKIOO Archive")return json({error:"Invalid destination"},400,corsOrigin);
     await client.messageMove(id,target,{uid:true});
    }else{
     if(folder!==boxes.drafts&&folder!=="MYKIOO Drafts")return json({error:"Not a draft folder"},400,corsOrigin);
     await client.messageDelete(id,{uid:true});
    }
    return json({ok:true},200,corsOrigin);
   }finally{lock.release()}
  }
  if(action==="send"||action==="saveDraft"){
   const to=clean(input.to,254),subject=clean(input.subject,220),body=clean(input.body,50000);
   if(!address(to)||!subject||!body)return json({error:"Recipient, subject and message are required"},400,corsOrigin);
   const incoming=Array.isArray(input.attachments)?input.attachments:[];
   if(incoming.length>5)return json({error:"Maximum five attachments"},400,corsOrigin);
   let sum=0;
   const attachments=incoming.map((x:any)=>{
    const data=clean(x.base64,8*1024*1024);
    if(!/^[A-Za-z0-9+/]*={0,2}$/.test(data)||data.length>7_000_000)throw Error("Invalid attachment");
    const content=bytesFromBase64(data);sum+=content.length;
    return {filename:fileName(x.name),content,contentType:clean(x.mime,120)||"application/octet-stream"};
   });
   if(sum>6*1024*1024)return json({error:"Attachment total exceeds 6 MB"},413,corsOrigin);
   const refs=clean(input.references,1200).replace(/[\r\n]/g," ");
   const replyId=clean(input.replyId,500).replace(/[\r\n]/g," ");
   const mail={from:{name:"MYKIOO",address:ACCOUNT},to,subject,text:body,attachments,...(replyId?{inReplyTo:replyId}:{}),...(refs?{references:refs}:{}),...(action==="saveDraft"?{date:new Date()}:{} )};
   const raw=await buildRaw(mail);
   if(action==="saveDraft"){
    const draftFolder=await ensureFolder(client,"drafts");
    const added=await client.append(draftFolder,raw,["\\Draft"]);
    if(!added)throw Error("Draft save failed");
    const previous=uid(input.previousUid),previousFolder=clean(input.previousFolder,160);
    if(previous&&previousFolder===draftFolder){const lk=await openFolder(client,draftFolder);try{await client.messageDelete(previous,{uid:true})}finally{lk.release()}}
    return json({ok:true,draftFolder,uid:added.uid||null},200,corsOrigin);
   }
   const smtp=nodemailer.createTransport({host:"smtp.ionos.com",port:465,secure:true,auth:{user:ACCOUNT,pass:password},connectionTimeout:12000,greetingTimeout:12000,socketTimeout:18000,tls:{servername:"smtp.ionos.com"}});
   let sent:any;
   try{sent=await smtp.sendMail(mail)}finally{smtp.close()}
   if(!sent?.accepted?.some((x:string)=>x.toLowerCase()===to.toLowerCase()))throw Error("SMTP did not accept recipient");
   let saved=true;
   try{
     const sentFolder=await ensureFolder(client,"sent");
     const added=await client.append(sentFolder,raw,["\\Seen"]);
     if(!added)saved=false;
   }catch(e){saved=false;console.error("MYKIOO sent message could not be filed in IONOS",e instanceof Error?e.name:"unknown")}
   if(uid(input.previousUid)&&clean(input.previousFolder,160)){
    try{
     const d=await foldersFor(client);
     if(input.previousFolder===d.drafts||input.previousFolder==="MYKIOO Drafts"){
      const lk=await openFolder(client,input.previousFolder);
      try{await client.messageDelete(uid(input.previousUid),{uid:true})}finally{lk.release()}
     }
    }catch(_e){}
   }
   return json({ok:true,sent:true,savedToSent:saved,messageId:sent.messageId||null},200,corsOrigin);
  }
  return json({error:"Unsupported action"},400,corsOrigin);
 }catch(error){
   const status=(error as any)?.message==="Invalid attachment"?400:503;
   return json({error:status===400?"Invalid attachment":publicError(error)},status,corsOrigin);
 }finally{if(client){try{await client.logout()}catch(_e){}}}
});
