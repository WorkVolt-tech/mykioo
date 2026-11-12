import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
function escapeHtml(value:unknown){return String(value||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c))}

async function createInAppReminder(db:any,sub:any,member:any,remaining:number,reminderDays:number,logId:string){
 const service=String(sub.service_name||"MYKIOO");
 const labelEn=remaining<0?"has expired":remaining===0?"expires today":"expires in "+remaining+" day"+(remaining===1?"":"s");
 const labelFr=remaining<0?"a expiré":remaining===0?"expire aujourd’hui":"expire dans "+remaining+" jour"+(remaining===1?"":"s");
 const note={
  user_id:sub.member_id,kind:"subscription_expiry_reminder",source_id:logId,destination:"subscription",
  title_en:"Subscription renewal reminder",title_fr:"Rappel de renouvellement d’abonnement",
  body_en:service+" "+labelEn+". Open Subscriptions to request renewal.",
  body_fr:service+" "+labelFr+". Ouvrez Abonnements pour demander un renouvellement."
 };
 const {error}=await db.from("mykioo_notifications").upsert(note,{onConflict:"user_id,kind,source_id",ignoreDuplicates:true});
 if(error){console.error("MYKIOO in-app expiry reminder failed",sub.id,error.code);return false}
 const {error:logError}=await db.from("mykioo_expiry_email_log").update({notification_sent_at:new Date().toISOString()}).eq("id",logId);
 if(logError){console.error("MYKIOO expiry reminder notification log failed",sub.id,logError.code);return false}
 return true;
}

Deno.serve(async request=>{
 if(request.method!=="POST")return respond({error:"Method not allowed"},405);
 const token=request.headers.get("x-mykioo-cron-token");
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!secret||!token)return respond({error:"Not authorized"},401);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authorized,error:checkError}=await db.rpc("mykioo_validate_reminder_cron_token",{provided:token});
 if(checkError||authorized!==true)return respond({error:"Not authorized"},401);
 const {data:settings,error:settingsError}=await db.from("mykioo_reminder_settings")
  .select("enabled,in_app_enabled").eq("id",1).single();
 if(settingsError||!settings)return respond({error:"Reminder configuration unavailable"},503);
 if(!settings.enabled)return respond({ok:true,disabled:true,email_sent:0,in_app_sent:0});
 const {dry_run=false}=await request.json().catch(()=>({}));
 if(dry_run){
   const {count,error}=await db.from("mykioo_subscriptions").select("id",{count:"exact",head:true})
     .eq("status","active").not("expires_at","is",null);
   if(error)return respond({error:"Dry-run query failed"},500);
   return respond({ok:true,dry_run:true,active_dated_subscriptions:count||0,email_sent:0,in_app_sent:0});
 }
 const brevo=Deno.env.get("BREVO_API_KEY");
 if(!brevo)return respond({error:"Transactional email is not configured"},503);
 const now=new Date();
 const utcToday=Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate());
 const horizon=new Date(utcToday+31*86400000).toISOString();
 const floor=new Date(utcToday-86400000).toISOString();
 const {data:subs,error:queryError}=await db.from("mykioo_subscriptions")
   .select("id,member_id,service_name,status,expires_at")
   .in("status",["active","expired"]).not("expires_at","is",null).gte("expires_at",floor).lte("expires_at",horizon)
   .order("expires_at",{ascending:true}).limit(150);
 if(queryError)return respond({error:"Unable to load subscription dates"},500);
 let sent=0,skipped=0,failed=0,notified=0,notificationFailures=0;
 for(const sub of subs||[]){
   const expiration=new Date(sub.expires_at);
   const expiryDay=Date.UTC(expiration.getUTCFullYear(),expiration.getUTCMonth(),expiration.getUTCDate());
   const remaining=Math.round((expiryDay-utcToday)/86400000);
   if(remaining < -1 || remaining > 30){skipped++;continue}
   const reminderDays=remaining<=0?0:remaining<=1?1:remaining<=7?7:30;
   // A customer who already asked to renew should not be pressured to request again.
   const {data:pendingRenewal,error:pendingError}=await db.from("mykioo_subscription_requests")
    .select("id").eq("request_type","renewal").eq("renewal_subscription_id",sub.id)
    .in("status",["pending","in_review"]).limit(1);
   if(pendingError){failed++;continue}
   if(pendingRenewal?.length){skipped++;continue}
   const {data:member,error:memberError}=await db.from("mykioo_members")
    .select("email,display_name,preferred_language,status,role").eq("user_id",sub.member_id).maybeSingle();
   if(memberError||!member||member.status!=="approved"){skipped++;continue}
   const {data:existing,error:existError}=await db.from("mykioo_expiry_email_log").select("id,state,last_attempt_at,attempt_count,notification_sent_at")
    .eq("subscription_id",sub.id).eq("expires_at",sub.expires_at).eq("reminder_days",reminderDays).maybeSingle();
   if(existError){failed++;continue}
   if(existing?.state==="sent"){
     if(settings.in_app_enabled&&!existing.notification_sent_at){
       const ok=await createInAppReminder(db,sub,member,remaining,reminderDays,existing.id);
       if(ok)notified++;else notificationFailures++;
     }
     skipped++;continue;
   }
   if(existing?.state==="sending"&&now.getTime()-Date.parse(existing.last_attempt_at)<15*60000){
     skipped++;continue;
   }
   if(existing&&existing.attempt_count>=4){skipped++;continue}
   let logId=existing?.id;
   if(existing){
    const {data:locked,error:lockError}=await db.from("mykioo_expiry_email_log")
     .update({state:"sending",attempt_count:existing.attempt_count+1,last_attempt_at:now.toISOString(),error_code:null})
     .eq("id",existing.id).eq("attempt_count",existing.attempt_count).select("id").maybeSingle();
    if(lockError||!locked){skipped++;continue}
   }else{
    const {data:created,error:insertError}=await db.from("mykioo_expiry_email_log")
     .insert({subscription_id:sub.id,expires_at:sub.expires_at,reminder_days:reminderDays})
     .select("id").single();
    if(insertError){skipped++;continue}
    logId=created.id;
   }
   if(settings.in_app_enabled&&!existing?.notification_sent_at&&logId){
     const ok=await createInAppReminder(db,sub,member,remaining,reminderDays,logId);
     if(ok)notified++;else notificationFailures++;
   }
   const french=member.preferred_language==="fr";
   const safeName=escapeHtml(member.display_name||"");
   const service=escapeHtml(sub.service_name||"MYKIOO");
   const formatted=new Intl.DateTimeFormat(french?"fr-CA":"en-CA",{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"}).format(expiration);
   const deadline=remaining<0?(french?"a expiré":"has expired"):remaining===0?
     (french?"expire aujourd'hui":"expires today"):
     (french?"expire dans "+remaining+" jour"+(remaining>1?"s":""):"expires in "+remaining+" day"+(remaining>1?"s":""));
   const subject=french?"MYKIOO | Rappel d'expiration de votre abonnement":"MYKIOO | Your subscription expiration reminder";
   const body=french?
     "<p>Bonjour "+safeName+",</p><p>Votre abonnement <strong>"+service+"</strong> "+deadline+".</p><p>Date d’expiration : <strong>"+formatted+"</strong></p><p>Connectez-vous à MYKIOO pour demander un renouvellement de votre service.</p>":
     "<p>Hello "+safeName+",</p><p>Your <strong>"+service+"</strong> subscription "+deadline+".</p><p>Expiration date: <strong>"+formatted+"</strong></p><p>Sign in to MYKIOO to request a renewal of your service.</p>";
   const html='<div style="font-family:Arial,sans-serif;background:#16111d;color:#f5edf8;padding:28px"><h1 style="color:#dfbb7d">MYKIOO</h1>'+body+'<p><a style="color:#dfbb7d" href="https://mykioo.pages.dev/?section=subscription">MYKIOO</a></p></div>';
   try{
    const outbound=await fetch("https://api.brevo.com/v3/smtp/email",{
     method:"POST",headers:{"api-key":brevo,"Content-Type":"application/json","Accept":"application/json"},
     body:JSON.stringify({sender:{name:"MYKIOO",email:"mykiootv@outlook.com"},to:[{email:member.email}],subject,htmlContent:html,
       tags:["mykioo","subscription-expiry"]})
    });
    if(!outbound.ok){
     failed++;
     await db.from("mykioo_expiry_email_log").update({state:"failed",error_code:"brevo_"+outbound.status}).eq("id",logId);
     console.error("MYKIOO reminder dispatch failed",sub.id,outbound.status);
     continue;
    }
    sent++;
    await db.from("mykioo_expiry_email_log").update({state:"sent",sent_at:new Date().toISOString(),error_code:null}).eq("id",logId);
   }catch(err){
    failed++;
    await db.from("mykioo_expiry_email_log").update({state:"failed",error_code:"network_error"}).eq("id",logId);
    console.error("MYKIOO reminder network error",sub.id);
   }
 }
 return respond({ok:true,reviewed:(subs||[]).length,sent,skipped,failed,in_app_sent:notified,in_app_failed:notificationFailures});
});
