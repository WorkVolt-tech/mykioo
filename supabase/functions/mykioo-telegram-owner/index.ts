import {createClient} from "npm:@supabase/supabase-js@2.57.0";

// Server-only dispatcher: called by the existing authenticated MYKIOO cron pattern.
// Telegram BOT TOKEN never enters browser code or the database; recipient ID is RLS-protected.
const root="https://mykioo.icu/";
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
type Alert={key:string;kind:string;title:string;details:string;section:string;reference:string};
const short=(v:unknown,max=100)=>String(v??"").replace(/[\u0000-\u001f\u007f]/g," ").trim().slice(0,max);
const sectionUrl=(section:string)=>root+"?section="+encodeURIComponent(section);
const safeError=(status:number)=>"Telegram HTTP "+status;

Deno.serve(async req=>{
 if(req.method!=="POST")return respond({error:"Method not allowed"},405);
 const supplied=req.headers.get("x-mykioo-cron-token");
 const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!supplied||!url||!serviceKey)return respond({error:"Not authorized"},401);
 const db=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authorized,error:checkError}=await db.rpc("mykioo_validate_reminder_cron_token",{provided:supplied});
 if(checkError||authorized!==true)return respond({error:"Not authorized"},401);

 const {data:settings,error:settingsError}=await db.from("mykioo_telegram_owner_settings")
  .select("enabled,started_at,chat_id").eq("id",1).single();
 if(settingsError||!settings)return respond({error:"Owner alert settings unavailable"},503);
 const botToken=Deno.env.get("TELEGRAM_BOT_TOKEN")?.trim();
 // The recipient ID is protected by RLS; only the service-role dispatcher can read it.
 // The Telegram bot token remains exclusively in Supabase Edge Function secrets.
 const chatId=String(settings.chat_id||Deno.env.get("TELEGRAM_OWNER_CHAT_ID")||"").trim();
 const params=await req.json().catch(()=>({}));
 const mode=params?.mode==="test"?"test":params?.mode==="dry_run"?"dry_run":"dispatch";
 if(mode!=="dry_run"&&(!botToken||!chatId||!/^(-?[0-9]{5,20})$/.test(chatId)))
   return respond({error:"Telegram owner bot settings are missing or invalid",
    bot_token_configured:Boolean(botToken),chat_id_configured:Boolean(chatId),
    chat_id_numeric:Boolean(chatId&&/^(-?[0-9]{5,20})$/.test(chatId))},503);
 const send=async(alert:Alert)=>{
  const text="🔔 MYKIOO Owner Alerts\n\n"+alert.title+"\n"+
   (alert.details?"\n"+alert.details+"\n":"")+
   "\nReference: "+short(alert.reference,45)+"\n"+
   "Sign in to MYKIOO to review and take action.";
  try{
   const response=await fetch("https://api.telegram.org/bot"+botToken+"/sendMessage",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({chat_id:chatId,text:text.slice(0,3900),disable_web_page_preview:true,
      reply_markup:{inline_keyboard:[[{
       text:"Open MYKIOO",url:sectionUrl(alert.section)
      }]]}}),
    signal:AbortSignal.timeout(10000)
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok||data?.ok!==true)return {ok:false,error:safeError(response.status)};
   return {ok:true,error:""};
  }catch{return {ok:false,error:"Telegram connection failed"}}
 };
 if(mode==="test"){
  const sent=await send({key:"test",kind:"test",title:"✅ Telegram alerts are connected!",
    details:"Owner-only MYKIOO notifications are configured. New requests will appear here.",
    reference:"Connection test",section:"overview"});
  return respond({ok:sent.ok,notification:sent.ok?"accepted":"failed",error:sent.error||undefined},
   sent.ok?200:502);
 }
 if(!settings.enabled)return respond({ok:true,enabled:false});
 const since=settings.started_at;
 const {data:ownerRows,error:ownerError}=await db.from("mykioo_members")
  .select("user_id").eq("role","owner").eq("status","approved");
 if(ownerError||!ownerRows?.length)return respond({error:"Owner account not found"},503);
 const ownerIds=ownerRows.map(x=>x.user_id);
 const ownerSet=new Set(ownerIds);
 const alerts:Alert[]=[];
 const found=new Set<string>();
 const add=(item:Alert)=>{
  if(!found.has(item.key)){found.add(item.key);alerts.push(item)}
 };
 let errors=0;
 async function load(table:string,select:string,apply:(query:any)=>any){
  const {data,error}=await apply(db.from(table).select(select)).limit(100);
  if(error){console.error("MYKIOO Telegram source error",table,error.code||"unknown");errors++;return []}
  return data||[];
 }

 const invites=await load("mykioo_invitation_requests","id,email,created_at,status",
  q=>q.eq("status","pending").gte("created_at",since).order("created_at",{ascending:true}));
 for(const i of invites)add({key:"invite-request:"+i.id,kind:"invitation",title:"✉️ Invitation needs approval",
  details:"A member requested an invitation. Review the request in the invitation manager.",
  section:"invitations",reference:i.id});

 const renewals=await load("mykioo_invitations","id,renewal_requested_at,status",
  q=>q.gte("renewal_requested_at",since).order("renewal_requested_at",{ascending:true}));
 for(const i of renewals){
  if(i.status==="accepted")continue;
  add({key:"invite-renewal:"+i.id+":"+i.renewal_requested_at,kind:"invitation",
    title:"🔄 Invitation link renewal requested",
    details:"An invited user needs a new invitation link.",
    section:"invitations",reference:i.id});
 }
 const approvals=await load("mykioo_members","user_id,display_name,updated_at,status",
  q=>q.eq("status","pending").not("display_name","is",null).gte("updated_at",since)
   .order("updated_at",{ascending:true}));
 for(const m of approvals){
  if(!String(m.display_name||"").trim())continue;
  add({key:"member-approval:"+m.user_id,kind:"membership",
   title:"👤 Member awaiting approval",
   details:"A registered member is awaiting access approval.",
   section:"members",reference:m.user_id});
 }

 const requests=await load("mykioo_subscription_requests","id,request_type,service_name,status,created_at,device_count",
  q=>q.in("status",["pending","in_review"]).gte("created_at",since).order("created_at",{ascending:true}));
 for(const r of requests){
  const trial=r.request_type==="trial",renew=r.request_type==="renewal";
  add({key:"subscription-request:"+r.id,kind:"subscription",
    title:trial?"🎁 Free trial request":renew?"🔄 Renewal request":"📺 New subscription request",
    details:"Service: "+short(r.service_name,70)+(trial?" · 24-hour trial":" · "+(r.device_count||1)+" device(s)")+
      "\nStatus: "+(r.status==="in_review"?"Under review":"Needs review"),
    section:"subscriptions",reference:r.id});
 }

 const invoices=await load("mykioo_billing_invoices","id,request_id,state,submitted_at,method,currency,amount_due",
  q=>q.eq("state","payment_submitted").gte("submitted_at",since).order("submitted_at",{ascending:true}));
 for(const inv of invoices)add({key:"payment-submitted:"+inv.id,kind:"payment",
   title:"💳 Customer payment requires verification",
   details:"A customer reported a payment. Verify receipt before activating service."+
    (inv.method?"\nMethod: "+short(inv.method,20):""),
   section:"billing",reference:inv.id});

 const cancels=await load("mykioo_subscription_cancellation_requests","request_id,status,created_at",
  q=>q.eq("status","pending").gte("created_at",since).order("created_at",{ascending:true}));
 for(const c of cancels)add({key:"cancellation:"+c.request_id,kind:"cancellation",
  title:"⚠️ Cancellation requires your approval",
  details:"A member requested to cancel an order. Review it before taking action.",
  section:"subscriptions",reference:c.request_id});

 const tickets=await load("mykioo_support_tickets","id,subject,status,created_at",
  q=>q.gte("created_at",since).order("created_at",{ascending:true}));
 for(const t of tickets){
  if(["closed","resolved","cancelled","merged"].includes(t.status))continue;
  add({key:"support-ticket:"+t.id,kind:"support",title:"🎧 New support ticket",
   details:"Subject: "+short(t.subject,110),section:"support",reference:t.id});
 }
 const messages=await load("mykioo_support_messages","id,ticket_id,sender_id,created_at",
  q=>q.gte("created_at",since).order("created_at",{ascending:true}));
 for(const m of messages){
  if(ownerSet.has(m.sender_id))continue;
  add({key:"support-reply:"+m.id,kind:"support",title:"💬 Customer replied to support",
   details:"A member sent a new support message that may need your reply.",
   section:"support",reference:m.ticket_id});
 }
 const followups=await load("mykioo_support_followups","ticket_id,due_at,status,created_at",
  q=>q.lte("due_at",new Date().toISOString()).gte("created_at",since).order("due_at",{ascending:true}));
 for(const f of followups){
  if(["done","completed","closed","resolved"].includes(f.status))continue;
  add({key:"support-followup:"+f.ticket_id+":"+f.due_at,kind:"support",
   title:"⏰ Support follow-up is due",
   details:"A support follow-up is due and still needs attention.",
   section:"support",reference:f.ticket_id});
 }

 const ownerNotices=await load("mykioo_notifications","id,user_id,kind,source_id,title_en,created_at,destination",
  q=>q.in("user_id",ownerIds).gte("created_at",since).order("created_at",{ascending:true}));
 for(const n of ownerNotices){
  if(n.kind==="provider_status_review"){
   // A once-per-Sunday owner reminder. The provider does not expose status through its API.
   // The existing delivery log prevents repeats when the dispatcher runs each minute.
   add({key:"owner-notification:"+n.id,kind:"weekly_review",
    title:"📺 Sunday reminder: Review MyPanel channel issues",
    details:"Check https://reseller.mypanel.cx/status for current affected channels. Then open MYKIOO Owner → Support → Announcements, update the affected regions and last-checked date, and mark resolved issues when confirmed. The provider is not synchronized automatically.",
    section:"support",reference:"Weekly channel-status review"});
   continue;
  }
  // Other sources above already provide these notifications; avoid sending them twice.
  if(/invit|trial|subscription|payment|support|ticket|cancell|member_approv/i.test(n.kind||""))continue;
  const section=["overview","members","invitations","subscriptions","orders","billing","support","notifications"].includes(n.destination)?n.destination:"notifications";
  add({key:"owner-notification:"+n.id,kind:"other",title:"🔔 "+short(n.title_en||"Owner action needed",100),
   details:"An owner notification was received. Open MYKIOO to review it.",
   section,reference:n.source_id||n.id});
 }
 if(errors)return respond({error:"Unable to check one or more MYKIOO alert sources",failed_sources:errors},503);
 if(mode==="dry_run")return respond({ok:true,dry_run:true,candidates:alerts.length,owner_accounts:ownerIds.length});

 // Limit the number of Telegram API calls per dispatch; any remaining alerts are found next minute.
 let sent=0,skipped=0,failed=0;
 for(const alert of alerts){
  if(sent+failed>=15)break;
  const attempt=new Date().toISOString();
  const initial={event_key:alert.key,kind:alert.kind,state:"sending",
   attempts:1,last_attempt_at:attempt,last_error:null};
  const {error:insertError}=await db.from("mykioo_telegram_alert_log").insert(initial);
  if(insertError){
   if(insertError.code!=="23505"){failed++;continue}
   const {data:prior,error:priorError}=await db.from("mykioo_telegram_alert_log")
     .select("state,attempts,last_attempt_at").eq("event_key",alert.key).maybeSingle();
   if(priorError||!prior){failed++;continue}
   if(prior.state==="sent"||prior.attempts>=4||
      Date.now()-Date.parse(prior.last_attempt_at)<(prior.state==="sending"?10*60000:60000)){
     skipped++;continue;
   }
   const {data:claimed,error:claimError}=await db.from("mykioo_telegram_alert_log")
    .update({state:"sending",attempts:prior.attempts+1,last_attempt_at:attempt,last_error:null})
    .eq("event_key",alert.key).eq("state",prior.state).eq("attempts",prior.attempts)
    .select("event_key").maybeSingle();
   if(claimError||!claimed){skipped++;continue}
  }
  const result=await send(alert);
  const {error:saveError}=await db.from("mykioo_telegram_alert_log")
   .update({state:result.ok?"sent":"failed",sent_at:result.ok?new Date().toISOString():null,
    last_error:result.ok?null:result.error}).eq("event_key",alert.key).eq("state","sending");
  if(saveError)console.error("MYKIOO Telegram delivery-log update failed",alert.kind);
  if(result.ok)sent++;else failed++;
 }
 return respond({ok:true,scanned:alerts.length,sent,skipped,failed});
});
