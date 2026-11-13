import {createClient} from "npm:@supabase/supabase-js@2.57.0";

const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
 status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
const escapeHtml=(value:unknown)=>String(value??"").replace(/[&<>"']/g,char=>
 ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]||char));

Deno.serve(async req=>{
 if(req.method!=="POST")return respond({error:"Method not allowed"},405);
 const token=req.headers.get("x-mykioo-cron-token");
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!secret||!token)return respond({error:"Not authorized"},401);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data:authorized,error:validationError}=await db.rpc("mykioo_validate_reminder_cron_token",{provided:token});
 if(validationError||authorized!==true)return respond({error:"Not authorized"},401);
 const {dry_run=false}=await req.json().catch(()=>({}));
 const now=new Date();
 const threshold=new Date(now.getTime()-10*60*1000).toISOString();
 const {data:due,error:queryError}=await db.from("mykioo_billing_invoices")
  .select("id,member_id,request_id,state,method,amount_due,currency,destination,payment_instructions_at")
  .eq("state","awaiting_payment").not("payment_instructions_at","is",null)
  .lte("payment_instructions_at",threshold)
  .order("payment_instructions_at",{ascending:true}).limit(100);
 if(queryError)return respond({error:"Could not load due reminders"},500);
 if(dry_run)return respond({ok:true,dry_run:true,due_count:due?.length||0,sent:0});
 const brevo=Deno.env.get("BREVO_API_KEY");
 if(!brevo)return respond({error:"Transactional mail not configured"},503);
 let sent=0,skipped=0,failed=0;
 for(const invoice of due||[]){
  // A cancellation or completed request must never receive an unpaid reminder.
  const [{data:member,error:memberError},{data:order,error:orderError},
    {data:cancellations,error:cancelError}]=await Promise.all([
   db.from("mykioo_members").select("email,display_name,preferred_language,status")
    .eq("user_id",invoice.member_id).maybeSingle(),
   db.from("mykioo_subscription_requests").select("status,service_name")
    .eq("id",invoice.request_id).maybeSingle(),
   db.from("mykioo_subscription_cancellation_requests").select("status")
    .eq("request_id",invoice.request_id).in("status",["pending","approved"]).limit(1)
  ]);
  if(memberError||orderError||cancelError){failed++;continue}
  if(!member||member.status!=="approved"||!member.email||
    !order||!["pending","in_review"].includes(order.status)||cancellations?.length||
    !invoice.destination||!invoice.amount_due){skipped++;continue}
  if(["btc","shib"].includes(invoice.method)&&invoice.payment_instructions_at){
   // Cryptocurrency quotes expire; query the invoice before sending.
   const {data:latest}=await db.from("mykioo_billing_invoices")
    .select("quote_expires_at").eq("id",invoice.id).maybeSingle();
   if(latest?.quote_expires_at&&new Date(latest.quote_expires_at).getTime()<=now.getTime()){
    skipped++;continue;
   }
  }
  const {data:prior,error:priorError}=await db.from("mykioo_payment_reminder_log")
   .select("id,state,attempt_count,last_attempt_at").eq("invoice_id",invoice.id).maybeSingle();
  if(priorError){failed++;continue}
  if(prior?.state==="sent"||prior?.state==="skipped"||Number(prior?.attempt_count||0)>=3){
   skipped++;continue;
  }
  if(prior&&(now.getTime()-new Date(prior.last_attempt_at).getTime()<5*60000)){
   skipped++;continue;
  }
  let logId=prior?.id;
  if(prior){
   const {data:claimed,error:claimError}=await db.from("mykioo_payment_reminder_log")
    .update({state:"sending",attempt_count:prior.attempt_count+1,last_attempt_at:now.toISOString(),error_code:null})
    .eq("id",prior.id).eq("state",prior.state).eq("attempt_count",prior.attempt_count)
    .select("id").maybeSingle();
   if(claimError||!claimed){skipped++;continue}
  }else{
   const {data:created,error:insertError}=await db.from("mykioo_payment_reminder_log")
    .insert({invoice_id:invoice.id,state:"sending",attempt_count:1,last_attempt_at:now.toISOString()})
    .select("id").maybeSingle();
   if(insertError||!created){skipped++;continue}
   logId=created.id;
  }
  // Recheck after claiming to avoid notifying someone who has just confirmed sending payment.
  const {data:latestInvoice,error:latestError}=await db.from("mykioo_billing_invoices")
   .select("state,submitted_at,payment_instructions_at,quote_expires_at")
   .eq("id",invoice.id).maybeSingle();
  if(latestError){failed++;await db.from("mykioo_payment_reminder_log").update({state:"failed",error_code:"recheck_error"}).eq("id",logId);continue}
  if(!latestInvoice||latestInvoice.state!=="awaiting_payment"||latestInvoice.submitted_at||
    latestInvoice.payment_instructions_at!==invoice.payment_instructions_at||
    (latestInvoice.quote_expires_at&&Date.parse(latestInvoice.quote_expires_at)<=Date.now())){
   skipped++;await db.from("mykioo_payment_reminder_log").update({state:"skipped"}).eq("id",logId);continue;
  }
  const fr=member.preferred_language==="fr",name=escapeHtml(member.display_name||""),
   service=escapeHtml(order.service_name||"MYKIOO");
  const subject=fr?"MYKIOO | Rappel : confirmez votre paiement":"MYKIOO | Reminder: confirm your payment";
  const plain=fr?
   "Bonjour"+(name?" "+member.display_name:"")+",\n\nVotre demande "+order.service_name+
    " attend votre paiement ou votre confirmation d'envoi. Veuillez ouvrir MYKIOO > Paiements, vérifier les instructions et cliquer sur « J'ai envoyé mon paiement » uniquement après l'avoir réellement envoyé.\n\nL'équipe MYKIOO vérifiera les fonds avant toute activation.":
   "Hello"+(name?" "+member.display_name:"")+",\n\nYour subscription request for "+order.service_name+
    " is awaiting payment or your confirmation that it was sent. Open MYKIOO > Payments, follow the instructions, and select 'I've sent my payment' only after sending it.\n\nMYKIOO verifies actual receipt before activating service.";
  const link="https://mykioo.pages.dev/?section=payments";
  const content=fr?
   "<p>Votre demande pour <strong>"+service+"</strong> attend votre confirmation de paiement.</p><p>Ouvrez la page Paiements, vérifiez les instructions et cliquez sur <strong>J’ai envoyé mon paiement</strong> uniquement après avoir effectué le paiement.</p><p>Le propriétaire vérifiera la réception avant d’activer le service.</p>":
   "<p>Your request for <strong>"+service+"</strong> is still awaiting your payment confirmation.</p><p>Open Payments, follow the instructions, and click <strong>I've sent my payment</strong> only after sending it.</p><p>The owner verifies receipt before activating service.</p>";
  const html='<div style="background:#15111d;color:#f8f1fa;font-family:Arial,sans-serif;padding:28px"><h1 style="color:#ddbd85">MYKIOO</h1><p>'+(fr?"Bonjour":"Hello")+(name?" "+name:"")+',</p>'+content+'<p><a href="'+link+'" style="color:#eccb8a;font-weight:700">'+(fr?"Ouvrir Paiements":"Open Payments")+'</a></p></div>';
  try{
   const response=await fetch("https://api.brevo.com/v3/smtp/email",{
    method:"POST",headers:{"api-key":brevo,"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({sender:{name:"MYKIOO",email:"mykiootv@outlook.com"},
      to:[{email:member.email}],subject,htmlContent:html,textContent:plain,
      tags:["mykioo","payment-confirmation-reminder"]})
   });
   if(!response.ok)throw new Error("brevo_"+response.status);
   await db.from("mykioo_payment_reminder_log")
    .update({state:"sent",sent_at:new Date().toISOString(),error_code:null}).eq("id",logId);
   sent++;
  }catch(error){
   failed++;const code=error instanceof Error&&error.message.startsWith("brevo_")?error.message:"network_error";
   await db.from("mykioo_payment_reminder_log").update({state:"failed",error_code:code}).eq("id",logId);
   console.error("MYKIOO payment reminder failed",invoice.id,code);
  }
 }
 return respond({ok:true,checked:due?.length||0,sent,skipped,failed});
});
