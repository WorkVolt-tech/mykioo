import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const escapeHtml=(text:unknown)=>String(text??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
Deno.serve(async req=>{
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 const token=req.headers.get("x-mykioo-cron-token"),url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!secret||!token)return reply({error:"Unauthorized"},401);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authorized,error:authError}=await db.rpc("mykioo_validate_reminder_cron_token",{provided:token});
 if(authError||authorized!==true)return reply({error:"Unauthorized"},401);
 const {dry_run=false}=await req.json().catch(()=>({}));
 const {data:queue,error:queueError}=await db.from("mykioo_completion_email_log")
  .select("id,kind,entity_id,user_id,state,attempts")
  .in("state",["pending","failed","sending"]).lte("next_attempt_at",new Date().toISOString())
  .lt("attempts",5).order("created_at",{ascending:true}).limit(40);
 if(queueError)return reply({error:"Cannot read queue"},500);
 if(dry_run)return reply({ok:true,dry_run:true,queued:queue?.length||0,sent:0});
 const mailerKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!mailerKeyreturn reply({error:"Gmail API key unavailable"},503);
 let sent=0,failed=0,skipped=0;
 for(const row of queue||[]){
  const {data:claimed,error:claimError}=await db.from("mykioo_completion_email_log")
    .update({state:"sending",attempts:row.attempts+1,next_attempt_at:new Date(Date.now()+15*60000).toISOString()})
    .eq("id",row.id).eq("state",row.state).eq("attempts",row.attempts)
    .select("id").maybeSingle();
  if(claimError||!claimed){skipped++;continue}
  try{
   const {data:member}=await db.from("mykioo_members")
    .select("email,display_name,preferred_language,status,role").eq("user_id",row.user_id).maybeSingle();
   if(!member||member.role!=="member"||member.status!=="approved"||!member.email){
    await db.from("mykioo_completion_email_log").update({state:"failed",last_error:"member_ineligible",attempts:5}).eq("id",row.id);skipped++;continue;
   }
   const fr=member.preferred_language==="fr";
   let detail="",kindLabel="";
   if(row.kind==="subscription"||row.kind==="renewal"){
    const {data:r}=await db.from("mykioo_subscription_requests")
     .select("service_name,status,subscription_id,request_type").eq("id",row.entity_id).eq("member_id",row.user_id).maybeSingle();
    if(!r||r.status!=="fulfilled"){skipped++;await db.from("mykioo_completion_email_log").update({state:"failed",last_error:"not_fulfilled",attempts:5}).eq("id",row.id);continue}
    const {data:sub}=await db.from("mykioo_subscriptions").select("expires_at").eq("id",r.subscription_id).eq("member_id",row.user_id).maybeSingle();
    const date=sub?.expires_at?new Intl.DateTimeFormat(fr?"fr-CA":"en-CA",{year:"numeric",month:"long",day:"numeric",timeZone:"UTC"}).format(new Date(sub.expires_at)):"";
    kindLabel=row.kind==="renewal"?(fr?"Renouvellement terminé":"Renewal completed"):(fr?"Abonnement activé":"Subscription ready");
    detail=fr?"Votre "+(row.kind==="renewal"?"renouvellement":"abonnement")+" pour "+escapeHtml(r.service_name)+" est terminé.":"Your "+(row.kind==="renewal"?"renewal":"subscription")+" for "+escapeHtml(r.service_name)+" is complete.";
    if(date)detail+=" "+(fr?"Expiration : ":"Expiration: ")+escapeHtml(date)+".";
    detail+=" "+(fr?"Connectez-vous pour voir les détails du service.":"Sign in to view your service details.");
   }else if(row.kind==="support"){
    const {data:t}=await db.from("mykioo_support_tickets").select("subject,status").eq("id",row.entity_id).eq("member_id",row.user_id).maybeSingle();
    if(!t||!["resolved","closed"].includes(t.status)){skipped++;await db.from("mykioo_completion_email_log").update({state:"failed",last_error:"ticket_not_completed",attempts:5}).eq("id",row.id);continue}
    kindLabel=fr?"Demande d’assistance terminée":"Support request completed";
    detail=fr?"Votre demande « "+escapeHtml(t.subject)+" » a été résolue.":"Your ticket “"+escapeHtml(t.subject)+"” has been resolved.";
   }else if(row.kind==="issue_update"){
    const {data:update}=await db.from("mykioo_support_issue_updates").select("issue_id,body,status").eq("id",row.entity_id).maybeSingle();
    if(!update){skipped++;await db.from("mykioo_completion_email_log").update({state:"failed",last_error:"update_missing",attempts:5}).eq("id",row.id);continue}
    const {data:linked}=await db.from("mykioo_support_tickets").select("id").eq("main_issue_id",update.issue_id).eq("member_id",row.user_id).limit(1);
    if(!linked?.length){skipped++;await db.from("mykioo_completion_email_log").update({state:"failed",last_error:"no_longer_linked",attempts:5}).eq("id",row.id);continue}
    const {data:issue}=await db.from("mykioo_support_issues").select("title").eq("id",update.issue_id).maybeSingle();
    kindLabel=fr?"Mise à jour de votre problème":"Update on your support issue";
    detail=escapeHtml(issue?.title||"MYKIOO")+": "+escapeHtml(update.body);
   }else if(row.kind==="issue_linked"){
    const {data:ticket}=await db.from("mykioo_support_tickets").select("main_issue_id").eq("id",row.entity_id).eq("member_id",row.user_id).maybeSingle();
    if(!ticket?.main_issue_id){skipped++;continue}
    const {data:issue}=await db.from("mykioo_support_issues").select("title,description,latest_update").eq("id",ticket.main_issue_id).maybeSingle();
    kindLabel=fr?"Votre demande est liée à un problème connu":"Your ticket is linked to a known issue";
    detail=escapeHtml(issue?.title||"MYKIOO")+" — "+escapeHtml(issue?.latest_update||issue?.description||"");
   }else{skipped++;continue}
   const name=escapeHtml(member.display_name||"");
   const html='<div style="font-family:Arial,sans-serif;background:#18121f;color:#f7edf8;padding:28px"><h1 style="color:#e6bd87">MYKIOO</h1><p>'+(fr?"Bonjour ":"Hello ")+name+',</p><p>'+detail+'</p><p><a href="https://mykioo.pages.dev" style="color:#e6bd87">'+(fr?"Ouvrir MYKIOO":"Open MYKIOO")+'</a></p></div>';
   const outgoing=await fetch(((Deno.env.get("SUPABASE_URL")||"")+"/functions/v1/mykioo-email-dispatch?route=email"),{
    method:"POST",headers:{"api-key":mailerKey,"Content-Type":"application/json"},
    body:JSON.stringify({sender:{name:"MYKIOO",email:"mykiootv@outlook.com"},
     to:[{email:member.email}],subject:"MYKIOO | "+kindLabel,htmlContent:html,tags:["mykioo","account-notification"]})
   });
   if(!outgoing.ok)throw Error("gmail_"+outgoing.status);
   const {error:markError}=await db.from("mykioo_completion_email_log")
    .update({state:"sent",sent_at:new Date().toISOString(),last_error:null}).eq("id",row.id);
   if(markError)console.error("Email sent but log update failed",row.id);
   sent++;
  }catch(error){
   failed++;
   const delay=Math.min(60,5*(row.attempts+1));
   await db.from("mykioo_completion_email_log").update({state:"failed",last_error:String(error instanceof Error?error.message:"send_error").slice(0,120),
     next_attempt_at:new Date(Date.now()+delay*60000).toISOString()}).eq("id",row.id);
   console.error("MYKIOO email queued retry",row.id);
  }
 }
 return reply({ok:true,processed:queue?.length||0,sent,failed,skipped});
});
