import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const origin="https://mykioo.icu";
const allowedOrigins=new Set([origin,"https://www.mykioo.icu","https://mykioo.pages.dev"]);
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=(s:unknown)=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
Deno.serve(async (req) => {
 const requestOrigin=req.headers.get("Origin")||"";
 const requestCors={...cors,"Access-Control-Allow-Origin":allowedOrigins.has(requestOrigin)?requestOrigin:origin};
 const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...requestCors,"Content-Type":"application/json","Cache-Control":"no-store"}});
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:requestCors});
 if(req.method!=="POST")return respond({error:"Method not allowed"},405);
 if(!allowedOrigins.has(requestOrigin))return respond({error:"Origin not allowed"},403);
 const token=req.headers.get("Authorization")||"";
 if(!token.startsWith("Bearer "))return respond({error:"Sign in to continue"},401);
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!secret)return respond({error:"Server is not configured"},503);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:{user},error:authError}=await db.auth.getUser(token.slice(7));
  if(authError||!user)return respond({error:"Session expired. Please sign in again."},401);
  const {data:member,error:memberError}=await db.from("mykioo_members").select("user_id,role,status").eq("user_id",user.id).maybeSingle();
  if(memberError||!member||member.status!=="approved")return respond({error:"Approved MYKIOO membership is required"},403);
  const input=await req.json().catch(()=>null);
  if(!input||typeof input!=="object")return respond({error:"Invalid request"},400);

  // A client cannot submit its own price: quote always comes from the catalog.
  async function chosenPackage(){
   const days=Number(input.contract_days),devices=Number(input.device_count),method=input.preferred_payment_method;
   if(![365,730].includes(days)||!Number.isInteger(devices)||devices<1||devices>5||
      !["interac","zelle","btc","shib"].includes(method))
     return {error:"Choose a 12- or 24-month package, 1–5 devices and a payment method"};
   const {data:price,error}=await db.from("mykioo_package_prices")
     .select("price_cad").eq("contract_days",days).eq("device_count",devices).maybeSingle();
   if(error||!price)return {error:"Selected package price is unavailable"};
   return {device_count:devices,preferred_payment_method:method,quoted_price_cad:Number(price.price_cad)};
  }


  // Free trials are manually provisioned, 24 hours, one device, once per member.
  // No package quote, payment method or billing invoice is generated.
  async function createTrial(targetId:string,serviceName:string,notes:string,requestedByOwner=false){
   if(serviceName.length<3||serviceName.length>80||notes.length>1000)
     return respond({error:"Enter a valid service name and notes (maximum 1000 characters)"},400);
   const {data:previous,error:previousError}=await db.from("mykioo_subscription_requests")
     .select("id").eq("member_id",targetId).eq("request_type","trial").limit(1);
   if(previousError)return respond({error:"Unable to check free trial eligibility"},503);
   if(previous?.length)return respond({error:"A free trial has already been requested for this account. One trial per member."},409);
   const {data:created,error:createError}=await db.from("mykioo_subscription_requests")
     .insert({member_id:targetId,service_name:serviceName,notes,request_type:"trial",
       contract_days:1,device_count:1,preferred_payment_method:null,quoted_price_cad:null,
       renewal_subscription_id:null})
     .select("id,member_id,service_name,status,request_type,contract_days,device_count,created_at").single();
   if(createError)return respond({error:createError.code==="23505"?
     "A free trial has already been requested for this account. One trial per member.":
     "Could not submit the free trial request. Please try again."},createError.code==="23505"?409:500);
   await db.from("mykioo_audit_logs").insert({actor_id:user.id,action:requestedByOwner?
     "owner_free_trial_requested":"free_trial_requested",entity_type:"subscription_request",entity_id:created.id,
     details:{member_id:targetId,request_type:"trial",service_name:serviceName}});
   if(!requestedByOwner){
    const {data:owners}=await db.from("mykioo_members").select("user_id").eq("role","owner").eq("status","approved");
    if(owners?.length){
      await db.from("mykioo_notifications").upsert(owners.map(o=>({
        user_id:o.user_id,kind:"subscription_request",source_id:created.id,destination:"subscription",
        title_en:"Free trial request needs review",title_fr:"Essai gratuit à examiner",
        body_en:"A member requested a one-time 24-hour free trial for "+serviceName+".",
        body_fr:"Un membre demande un essai gratuit unique de 24 heures pour "+serviceName+"."
      })),{onConflict:"user_id,kind,source_id"});
    }
   }
   return respond({ok:true,request:created,invoice:null});
  }
  if(input.action==="trial"){
   if(member.role!=="member")return respond({error:"Member access required"},403);
   const serviceName=typeof input.service_name==="string"?input.service_name.trim():"";
   const notes=typeof input.notes==="string"?input.notes.trim():"";
   const {data:recent,error:recentError}=await db.from("mykioo_subscription_requests")
     .select("created_at").eq("member_id",user.id).gte("created_at",new Date(Date.now()-86400000).toISOString())
     .order("created_at",{ascending:false}).limit(6);
   if(recentError)return respond({error:"Unable to verify request limits"},503);
   if((recent||[]).length>=5)return respond({error:"Daily request limit reached. Contact support if you need more services."},429);
   if(recent?.[0]&&Date.now()-Date.parse(recent[0].created_at)<60000)
     return respond({error:"Please wait a minute before sending another request."},429);
   return await createTrial(user.id,serviceName,notes);
  }

  if(input.action==="get_checkout"){
   const days=Number(input.contract_days),devices=Number(input.device_count),method=input.preferred_payment_method;
   if(![365,730].includes(days)||!Number.isInteger(devices)||devices<1||devices>5||
       !["interac","zelle","btc","shib"].includes(method))
     return respond({error:"Select a valid package and payment method"},400);
   const {data:price,error:priceError}=await db.from("mykioo_package_prices")
      .select("price_cad,price_usd").eq("contract_days",days).eq("device_count",devices).maybeSingle();
   if(priceError||!price)return respond({error:"Package unavailable"},503);
   const grossCad=Number(price.price_cad),grossUsd=Number(price.price_usd);
   if(!Number.isFinite(grossUsd)||grossUsd<=0)return respond({error:"USD package pricing is not configured"},503);
   const promo=typeof input.discount_code==="string"?input.discount_code.trim().toUpperCase():"";
   let discountCad=0,discountUsd=0,discountType:null|string=null,discountPercent:null|number=null;
   if(promo){
    if(!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(promo))return respond({error:"Enter a valid discount code"},400);
    const {data:coupon,error:couponError}=await db.from("mykioo_discount_codes")
      .select("id,active,starts_at,expires_at,max_uses,used_count,per_member_limit,discount_type,percent_off,amount_cad,amount_usd")
      .eq("code",promo).maybeSingle();
    if(couponError)return respond({error:"Unable to check discount right now"},503);
    const now=Date.now();
    if(!coupon||!coupon.active||(coupon.starts_at&&Date.parse(coupon.starts_at)>now)||
       (coupon.expires_at&&Date.parse(coupon.expires_at)<=now)||
       (coupon.max_uses!==null&&coupon.used_count>=coupon.max_uses))
      return respond({error:"Discount code is invalid, unavailable or expired"},400);
    const targetId=member.role==="member"?user.id:(uuid(input.member_id)?input.member_id:null);
    if(targetId){
     const {count,error:limitError}=await db.from("mykioo_discount_redemptions")
       .select("id",{count:"exact",head:true}).eq("code_id",coupon.id).eq("member_id",targetId);
     if(limitError)return respond({error:"Unable to check discount eligibility"},503);
     if((count||0)>=coupon.per_member_limit)return respond({error:"This account has already used this discount code"},400);
    }
    discountType=coupon.discount_type;
    discountPercent=discountType==="percent"?Number(coupon.percent_off):null;
    const round=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
    discountCad=discountType==="percent"?round(grossCad*Number(discountPercent)/100):Number(coupon.amount_cad);
    discountUsd=discountType==="percent"?round(grossUsd*Number(discountPercent)/100):Number(coupon.amount_usd);
   }
   const netCad=Math.round((grossCad-discountCad+Number.EPSILON)*100)/100;
   const netUsd=Math.round((grossUsd-discountUsd+Number.EPSILON)*100)/100;
   if(netCad<0.01||netUsd<0.01)return respond({error:"This discount is too large for the selected plan"},400);
   const base={ok:true,amount_cad:netCad,amount_usd:netUsd,gross_amount_cad:grossCad,gross_amount_usd:grossUsd,
    discount_code:promo||null,discount_amount_cad:discountCad,discount_amount_usd:discountUsd,
    discount_type:discountType,discount_percent:discountPercent};
   if(method==="btc"||method==="shib")
     return respond({...base,available:true,requires_crypto_invoice:true});
   const {data:settings,error:settingsError}=await db.from("mykioo_billing_settings")
      .select("interac_destination,zelle_destination").eq("id",1).maybeSingle();
   if(settingsError||!settings)return respond({error:"Payment settings unavailable"},503);
   const destination=method==="interac"?settings.interac_destination:settings.zelle_destination;
   const amount_due=method==="interac"?netCad:netUsd;
   const available=Boolean(destination&&String(destination).trim()&&amount_due>0);
   return respond({...base,available,method,currency:method==="interac"?"CAD":"USD",
    amount_due:available?amount_due:null,destination:available?String(destination).trim():null,
    reason:available?null:"Receiving details not configured"});
  }

  async function submitPricedRequest(params:{member_id:string;request_type:string;renewal_subscription_id:string|null;service_name:string;notes:string;contract_days:number;device_count:number;preferred_payment_method:string}){
   const promo=typeof input.discount_code==="string"?input.discount_code.trim().toUpperCase():"";
   if(promo&&!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(promo))return respond({error:"Invalid discount code"},400);
   const {data:created,error:createError}=await db.rpc("mykioo_create_priced_request",{
    p_member_id:params.member_id,p_actor_id:user.id,p_request_type:params.request_type,
    p_renewal_subscription_id:params.renewal_subscription_id,
    p_service_name:params.service_name,p_contract_days:params.contract_days,
    p_device_count:params.device_count,p_payment_method:params.preferred_payment_method,
    p_notes:params.notes,p_discount_code:promo||null
   });
   if(createError){
    const reason=String(createError.message||"");
    const known=["Bank payment method not configured","Renewal already pending","Subscription cannot be renewed",
     "Package pricing is not configured","Invalid discount code","Discount code is unavailable",
     "Discount code use limit","This discount is too large","Invalid subscription package",
     "Invalid new service name","Account must be approved","Select an existing subscription"].find(x=>reason.includes(x));
    if(!known)console.error("MYKIOO subscription checkout",createError.code||"unknown");
    return respond({error:known?reason:"Unable to create subscription request; nothing was charged."},known?409:500);
   }
   return respond({ok:true,request:created.request,invoice:created.invoice,payment_submitted:false});
  }
  if(input.action==="create"){
   if(member.role!=="member")return respond({error:"Member access required"},403);
   const service_name=typeof input.service_name==="string"?input.service_name.trim():"";
   const notes=typeof input.notes==="string"?input.notes.trim():"";
   const contract_days=Number(input.contract_days);
   if(service_name.length<3||service_name.length>80||notes.length>1000||![365,730].includes(contract_days))
    return respond({error:"Enter a service name (3–80 characters), a valid contract duration and optional notes up to 1000 characters."},400);
   const packageSelection=await chosenPackage();
   if(packageSelection.error)return respond({error:packageSelection.error},400);
   const {data:recent,error:recentError}=await db.from("mykioo_subscription_requests")
     .select("created_at").eq("member_id",user.id).gte("created_at",new Date(Date.now()-86400000).toISOString())
     .order("created_at",{ascending:false}).limit(6);
   if(recentError)return respond({error:"Unable to verify request limits"},503);
   if((recent||[]).length>=5)return respond({error:"Daily request limit reached. Contact support if you need more services."},429);
   if(recent?.[0]&&Date.now()-Date.parse(recent[0].created_at)<60000)return respond({error:"Please wait a minute before sending another request."},429);
   return await submitPricedRequest({member_id:user.id,request_type:"new",renewal_subscription_id:null,
      service_name,notes,contract_days,device_count:packageSelection.device_count,
      preferred_payment_method:packageSelection.preferred_payment_method});
  }
  if(input.action==="renew"){
   if(member.role!=="member"||!uuid(input.subscription_id))return respond({error:"Invalid renewal request"},400);
   const days=Number(input.contract_days);
   if(![365,730].includes(days))return respond({error:"Select a valid contract duration"},400);
   const notes=typeof input.notes==="string"?input.notes.trim():"";
   if(notes.length>1000)return respond({error:"Notes too long"},400);
   const {data:sub,error:subError}=await db.from("mykioo_subscriptions")
     .select("id,member_id,service_name,status").eq("id",input.subscription_id).eq("member_id",user.id).maybeSingle();
   if(subError||!sub)return respond({error:"Subscription not found"},404);
   if(!["active","expired"].includes(sub.status))return respond({error:"Only active or expired subscriptions can be renewed"},409);
   const {data:existing,error:existingError}=await db.from("mykioo_subscription_requests")
     .select("id").eq("renewal_subscription_id",sub.id).in("status",["pending","in_review"]).limit(1);
   if(existingError)return respond({error:"Could not check existing requests"},500);
   if(existing?.length)return respond({error:"A renewal for this subscription is already being reviewed"},409);
   const packageSelection=await chosenPackage();
   if(packageSelection.error)return respond({error:packageSelection.error},400);
   const {data:recent,error:recentError}=await db.from("mykioo_subscription_requests")
     .select("created_at").eq("member_id",user.id).gte("created_at",new Date(Date.now()-86400000).toISOString())
     .order("created_at",{ascending:false}).limit(6);
   if(recentError)return respond({error:"Could not check request limits"},503);
   if((recent||[]).length>=5)return respond({error:"Daily request limit reached"},429);
   if(recent?.[0]&&Date.now()-Date.parse(recent[0].created_at)<60000)return respond({error:"Please wait a minute before sending another request"},429);
   return await submitPricedRequest({member_id:user.id,request_type:"renewal",renewal_subscription_id:sub.id,
      service_name:sub.service_name||"Subscription renewal",notes,contract_days:days,
      device_count:packageSelection.device_count,preferred_payment_method:packageSelection.preferred_payment_method});
  }
  if(input.action==="owner_create"){
   if(member.role!=="owner"||user.app_metadata?.mykioo_role!=="owner")
     return respond({error:"Owner access required"},403);
   const member_id=input.member_id,request_type=input.request_type;
   if(!uuid(member_id)||!["new","renewal","trial"].includes(request_type))
     return respond({error:"Select a valid account and request type"},400);
   const {data:target,error:targetError}=await db.from("mykioo_members")
     .select("user_id,role,status").eq("user_id",member_id).maybeSingle();
   if(targetError||!target||
       !(target.status==="approved"||(["new","trial"].includes(request_type)&&target.status==="pending"))||
       !(target.role==="member"||(target.role==="owner"&&target.user_id===user.id&&target.status==="approved")))
     return respond({error:"Choose a valid member. Only new requests may use accounts awaiting approval."},403);
   const contract_days=Number(input.contract_days);
   const notes=typeof input.notes==="string"?input.notes.trim():"";
   if(request_type==="trial"){
     if(target.role!=="member"&&!(target.role==="owner"&&member_id===user.id))return respond({error:"Free trials are only available to members or the owner's own account"},403);
     const serviceName=typeof input.service_name==="string"?input.service_name.trim():"";
     return await createTrial(member_id,serviceName,notes,true);
   }
   if(![365,730].includes(contract_days)||notes.length>1000)
     return respond({error:"Select a valid duration and notes up to 1000 characters"},400);
   const packageSelection=await chosenPackage();
   if(packageSelection.error)return respond({error:packageSelection.error},400);
   let service_name="",renewal_subscription_id=null;
   if(request_type==="new"){
     service_name=typeof input.service_name==="string"?input.service_name.trim():"";
     if(service_name.length<3||service_name.length>80)
       return respond({error:"Service name must be between 3 and 80 characters"},400);
   }else{
     if(!uuid(input.subscription_id))return respond({error:"Choose a subscription to renew"},400);
     const {data:sub,error:subError}=await db.from("mykioo_subscriptions")
       .select("id,member_id,service_name,status").eq("id",input.subscription_id).eq("member_id",member_id).maybeSingle();
     if(subError||!sub)return respond({error:"This subscription does not belong to the selected account"},404);
     if(!["active","expired"].includes(sub.status))
       return respond({error:"Only active or expired subscriptions can be renewed"},409);
     const {data:existing,error:existingError}=await db.from("mykioo_subscription_requests")
       .select("id").eq("renewal_subscription_id",sub.id).in("status",["pending","in_review"]).limit(1);
     if(existingError)return respond({error:"Unable to check existing renewal requests"},500);
     if(existing?.length)return respond({error:"A renewal is already pending for this subscription"},409);
     service_name=sub.service_name||"Subscription renewal";
     renewal_subscription_id=sub.id;
   }
   return await submitPricedRequest({member_id,request_type,renewal_subscription_id,service_name,notes,contract_days,
      device_count:packageSelection.device_count,preferred_payment_method:packageSelection.preferred_payment_method});
  }
  if(input.action==="request_cancellation"){
   if(member.role!=="member")return respond({error:"Only the member who submitted the request may ask for cancellation"},403);
   if(!uuid(input.request_id))return respond({error:"Invalid subscription request"},400);
   const reason=typeof input.reason==="string"?input.reason.trim():"";
   if(reason.length>500)return respond({error:"Cancellation reason must be 500 characters or fewer"},400);
   const {data:result,error:requestError}=await db.rpc("mykioo_request_subscription_cancellation",{
     p_request_id:input.request_id,p_member_id:user.id,p_reason:reason
   });
   if(requestError){
     const message=String(requestError.message||"");
     const known=[
       "Subscription request not found",
       "Subscription request already completed",
       "A cancellation decision or request already exists",
       "Invalid request or reason"
     ].find(t=>message.includes(t));
     return respond({error:known||"Unable to request cancellation. Please try again."},known?409:500);
   }
   return respond({ok:true,request:result});
  }
  if(input.action==="review_cancellation"){
   if(member.role!=="owner"||user.app_metadata?.mykioo_role!=="owner")
     return respond({error:"Owner permission required"},403);
   if(!uuid(input.request_id)||!["approve","deny"].includes(input.decision))
     return respond({error:"Invalid cancellation decision"},400);
   const note=typeof input.note==="string"?input.note.trim():"";
   if(note.length>500)return respond({error:"Decision note is too long"},400);
   const {data:result,error:decisionError}=await db.rpc("mykioo_review_subscription_cancellation",{
     p_request_id:input.request_id,p_owner_id:user.id,p_decision:input.decision,p_note:note
   });
   if(decisionError){
     const message=String(decisionError.message||"");
     const known=["Subscription request not found","Cancellation request already decided or absent",
         "Invalid cancellation decision"].find(t=>message.includes(t));
     return respond({error:known||"Unable to review cancellation. Refresh and retry."},known?409:500);
   }
   return respond({ok:true,result});
  }
  if(input.action==="mark_activated"){
   if(member.role!=="owner"||user.app_metadata?.mykioo_role!=="owner")
     return respond({error:"Owner permission required"},403);
   if(!uuid(input.request_id))return respond({error:"Invalid subscription request"},400);
   const {data:marked,error:markError}=await db.rpc("mykioo_mark_external_service_activated",{
     p_request_id:input.request_id,p_owner_id:user.id
   });
   if(markError){
     const msg=String(markError.message||"");
     const known=[
       "Request not found",
       "Request already cancelled or completed",
       "Activation was already recorded"
     ].find(t=>msg.includes(t));
     if(!known)console.error("MYKIOO external activation failed",markError.code||"unknown");
     return respond({error:known||"Could not record service activation. Refresh and try again."},known?409:500);
   }
   return respond({ok:true,activation:marked});
  }
  // Notify the member when the owner declines a request (trial, new or renewal).
  async function emailDecline(request:{member_id:string;request_type:string;service_name:string;id:string}){
   try{
    const {data:recipient,error:recipientError}=await db.from("mykioo_members")
      .select("email,preferred_language").eq("user_id",request.member_id).single();
    const mailerKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(recipientError||!recipient?.email||!mailerKey)throw Error("Missing email prerequisites");
    const fr=recipient.preferred_language==="fr";
    const trial=request.request_type==="trial";
    const name=trial?(fr?"essai gratuit":"free trial"):request.request_type==="renewal"?(fr?"renouvellement":"renewal"):(fr?"abonnement":"subscription");
    const title=fr?"Votre demande a été refusée":"Your request was declined";
    const message=fr?
      "Votre demande de "+name+" pour "+request.service_name+" n’a pas été approuvée. Aucun accès n’a été activé à la suite de cette demande. Si vous avez des questions, veuillez contacter le soutien MYKIOO.":
      "Your "+name+" request for "+request.service_name+" was not approved. No access was activated from this request. If you have questions, please contact MYKIOO support.";
    const senderResponse=await fetch(((Deno.env.get("SUPABASE_URL")||"")+"/functions/v1/mykioo-email-dispatch?route=template&id=")+(fr?2:1),{headers:{"api-key":mailerKey}});
    const senderTemplate=await senderResponse.json().catch(()=>null);
    if(!senderResponse.ok||!senderTemplate?.sender?.email)throw Error("Email sender unavailable");
    const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
    const html=`<!doctype html><html lang="${fr?"fr":"en"}"><body style="margin:0;background:#090b13;padding:24px;font-family:Arial,sans-serif;color:#f5ecf7"><table role="presentation" style="max-width:560px;width:100%;margin:auto;background:#171422;border:1px solid #574563;border-top:3px solid #dab77c;border-radius:16px"><tr><td style="padding:28px"><img src="${origin}/MYKIOO-Email-Logo.png" width="90" alt="MYKIOO"><h1 style="color:#e6c38d;font-size:25px">${escape(title)}</h1><p style="line-height:1.6">${escape(message)}</p><p style="font-size:13px;color:#b9aabe">${fr?"Référence de la demande":"Request reference"}: ${escape(request.id)}</p><p><a href="${origin}" style="color:#e6c38d">${fr?"Accéder à MYKIOO":"Open MYKIOO"}</a></p></td></tr></table></body></html>`;
    const sent=await fetch(((Deno.env.get("SUPABASE_URL")||"")+"/functions/v1/mykioo-email-dispatch?route=email"),{method:"POST",headers:{"api-key":mailerKey,"Content-Type":"application/json"},body:JSON.stringify({
      sender:{email:senderTemplate.sender.email,name:"MYKIOO"},to:[{email:recipient.email}],subject:"MYKIOO | "+title,
      htmlContent:html,textContent:[title,message,(fr?"Référence":"Reference")+": "+request.id,origin].join("\n"),
      tags:["mykioo","request-declined"]
    })});
    const result=await sent.json().catch(()=>({}));
    if(!sent.ok||!result.messageId)throw Error("Gmail did not accept the message");
    return "accepted";
   }catch(err){
    console.error("MYKIOO request decline email failed",request.id,err instanceof Error?err.message:"unknown");
    return "failed";
   }
  }
  if(input.action==="change_status"){
   if(member.role!=="owner"||user.app_metadata?.mykioo_role!=="owner")return respond({error:"Owner only"},403);
   if(!uuid(input.request_id)||!["pending","in_review","declined"].includes(input.status))return respond({error:"Invalid request or status"},400);
   const {data:existing,error:fetchError}=await db.from("mykioo_subscription_requests").select("id,member_id,request_type,service_name,status,service_activated_at").eq("id",input.request_id).maybeSingle();
   if(fetchError||!existing)return respond({error:"Request not found"},404);
   if(["fulfilled","cancelled"].includes(existing.status))return respond({error:"Completed or withdrawn requests cannot be changed"},409);
   if(existing.service_activated_at&&input.status==="declined")
     return respond({error:"This service has already been activated. Complete its subscription details instead of declining the request."},409);
   const {error:changeError}=await db.from("mykioo_subscription_requests")
      .update({status:input.status,updated_at:new Date().toISOString()}).eq("id",input.request_id).not("status","in",'("fulfilled","cancelled")');
   if(changeError)return respond({error:"Unable to update request"},500);
   let notification:"accepted"|"failed"|"not_required"="not_required";
   if(input.status==="declined"&&existing.status!=="declined"){
    const {error:noticeError}=await db.from("mykioo_notifications").upsert({
      user_id:existing.member_id,kind:"subscription_request",source_id:existing.id,destination:"subscription",
      title_en:"Your request was declined",title_fr:"Votre demande a été refusée",
      body_en:"Your "+(existing.request_type==="trial"?"free trial":existing.request_type==="renewal"?"renewal":"subscription")+" request for "+existing.service_name+" was declined.",
      body_fr:"Votre demande "+(existing.request_type==="trial"?"d’essai gratuit":existing.request_type==="renewal"?"de renouvellement":"d’abonnement")+" pour "+existing.service_name+" a été refusée."
    },{onConflict:"user_id,kind,source_id"});
    if(noticeError)console.error("MYKIOO decline in-app notice failed",existing.id,noticeError.code||"unknown");
    notification=await emailDecline(existing);
   }
   await db.from("mykioo_audit_logs").insert({actor_id:user.id,action:"subscription_request_status",entity_type:"subscription_request",entity_id:input.request_id,details:{status:input.status,email_notification:notification}});
   return respond({ok:true,notification});
  }
  return respond({error:"Unknown action"},400);
 }catch(err){console.error("MYKIOO subscription requests",err instanceof Error?err.message:"unknown");return respond({error:"Request service temporarily unavailable"},500)}
});
