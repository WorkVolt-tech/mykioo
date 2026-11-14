import { createClient } from "npm:@supabase/supabase-js@2.57.0";
const origin="https://mykioo.pages.dev";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const limitText=(value:unknown,max:number)=>typeof value==="string"?value.trim().slice(0,max+1):"";

const b64=(bytes:Uint8Array)=>btoa(String.fromCharCode(...bytes));
const fromB64=(str:string)=>Uint8Array.from(atob(str),c=>c.charCodeAt(0));
async function encryptionKey(){
 const raw=Deno.env.get("MYKIOO_CREDENTIAL_KEY");
 if(!raw)return null;
 try{const material=fromB64(raw);if(material.length!==32)return null;
 return await crypto.subtle.importKey("raw",material,{name:"AES-GCM"},false,["encrypt","decrypt"]);
 }catch{return null;}
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return response({error:"Method not allowed"},405);
 if(req.headers.get("Origin")!==origin)return response({error:"Origin not allowed"},403);
 const authorization=req.headers.get("Authorization")||"";
 if(!authorization.startsWith("Bearer "))return response({error:"Sign in required"},401);
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!secret)return response({error:"Server unavailable"},503);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:{user},error:identityError}=await db.auth.getUser(authorization.slice(7));
  if(identityError||!user)return response({error:"Sign in again"},401);
  const {data:actor,error:actorError}=await db.from("mykioo_members").select("role,status").eq("user_id",user.id).maybeSingle();
  if(actorError||actor?.role!=="owner"||actor.status!=="approved"||user.app_metadata?.mykioo_role!=="owner")
   return response({error:"Owner permission required"},403);
  const data=await req.json().catch(()=>null);
  if(!data||typeof data!=="object")return response({error:"Invalid request"},400);
  if(data.action==="save"){
   const member_id=data.member_id, id=data.id;
   if(!uuid(member_id)||id&&!uuid(id))return response({error:"Invalid member or subscription ID"},400);
   const requestId=data.request_id||null;
   if(requestId&&!uuid(requestId))return response({error:"Invalid request ID"},400);
   let pendingRequest=null;
   if(requestId){
    const {data:requested,error:requestError}=await db.from("mykioo_subscription_requests")
      .select("id,member_id,status,request_type,renewal_subscription_id,contract_days,device_count,preferred_payment_method").eq("id",requestId).maybeSingle();
    if(requestError||!requested||requested.member_id!==member_id||!["pending","in_review"].includes(requested.status))
      return response({error:"This request cannot be completed for the selected member."},409);
    pendingRequest=requested;
    if(requested.request_type==="trial"&&(
      requested.contract_days!==1||requested.device_count!==1||
      requested.preferred_payment_method!==null||Number(data.contract_days)!==1||
      Number(data.device_count)!==1||data.status!=="active"))
      return response({error:"Free trials must be activated for one device and exactly 24 hours, without payment."},409);
    if(requested.preferred_payment_method){
     const {data:paidInvoice,error:paymentError}=await db.from("mykioo_billing_invoices")
       .select("id").eq("request_id",requestId).eq("member_id",member_id).eq("state","paid").maybeSingle();
     if(paymentError)return response({error:"Unable to verify the invoice. Try again."},503);
     if(!paidInvoice)return response({error:"Payment must be verified in Billing before completing this request."},409);
     if(Number(data.contract_days)!==Number(requested.contract_days))
       return response({error:"The selected duration must match the paid request."},409);
    }
    if(requested.request_type==="renewal"&&requested.renewal_subscription_id!==id)
      return response({error:"Renewal must update its existing subscription."},409);
    if(requested.request_type!=="renewal"&&id)
      return response({error:"A new request must create a new subscription."},409);
   }
   if(id&&!uuid(id))return response({error:"Invalid subscription ID"},400);
   const isRenewal=Boolean(pendingRequest?.request_type==="renewal");
   const {data:member,error:memberError}=await db.from("mykioo_members").select("user_id,role,status").eq("user_id",member_id).maybeSingle();
   if(memberError||!member||(member.role!=="member"&&!(member.role==="owner"&&member.user_id===user.id)))return response({error:"Member not found or not eligible"},404);
   if(pendingRequest?.request_type==="trial"&&member.status!=="approved")
     return response({error:"Approve the member account before activating the free trial."},409);
   const service_name=limitText(data.service_name,80),
         service_username=limitText(data.service_username,160),supplier_reference=limitText(data.supplier_reference,160);
   const password=typeof data.service_password==="string"?data.service_password:"";
   if(password.length>256||(/[\x00-\x1f\x7f]/).test(password))return response({error:"Invalid service password"},400);
   // Refuse password writes until the server-side encryption key is configured.
   const key=password?await encryptionKey():null;
   if(password&&!key)return response({error:"Encrypted credential storage must be configured by the owner first."},503);
   if(requestId&&!isRenewal&&(!service_username||!password)){
     return response({error:"To complete a new member request, enter both the service username and password."},400);
   }
   const contract_days=data.contract_days==null?null:Number(data.contract_days);
   const device_count=Number(data.device_count??pendingRequest?.device_count??1);
   if(!Number.isInteger(device_count)||device_count<1||device_count>5)
     return response({error:"Choose between 1 and 5 devices."},400);
   if(pendingRequest?.preferred_payment_method&&device_count!==Number(pendingRequest.device_count))
     return response({error:"Device count must match the paid request."},409);
   if(contract_days!==null&&![1,30,90,183,365,730].includes(contract_days))return response({error:"Invalid contract duration"},400);
   const status=data.status;
   if(!service_name||service_name.length>80||service_username.length>160||supplier_reference.length>160||
      !["pending","active","expired","suspended","cancelled"].includes(status))
      return response({error:"Invalid subscription details"},400);
   function dateValue(v:unknown){if(!v)return null;if(typeof v!=="string"||Number.isNaN(Date.parse(v)))throw Error("Invalid date");return new Date(v).toISOString();}
   const starts_at=dateValue(data.starts_at),expires_at=dateValue(data.expires_at);
   if(starts_at&&expires_at&&Date.parse(expires_at)<Date.parse(starts_at))return response({error:"End date must not precede start date"},400);
   if(contract_days&&(!starts_at||!expires_at))return response({error:"A contract requires both a start date and an expiry date."},400);
   // Renewal reuses its subscription and stored credentials; do not change the original start date.
   let subscriptionStart=starts_at;
   let finalExpiry=expires_at;
   if(isRenewal){
     const {data:previous,error:previousError}=await db.from("mykioo_subscriptions")
       .select("id,member_id,starts_at,expires_at,service_username").eq("id",id).eq("member_id",member_id).maybeSingle();
     if(previousError||!previous)return response({error:"Original subscription not found"},404);
     if(!previous.service_username)return response({error:"Original service login is missing; please edit the subscription first."},409);
     if(!contract_days||!expires_at)return response({error:"Please select a contract duration and expiry date."},400);
     if(previous.expires_at&&Date.parse(expires_at)<=Date.parse(previous.expires_at))
       return response({error:"Renewal must extend the existing expiry date."},400);
     if(password)return response({error:"Renewal keeps the original password; edit the subscription separately if it needs changing."},400);
     subscriptionStart=previous.starts_at||starts_at;
   }
   // Complete renewals atomically: update the original subscription, capture both expiry
   // dates, fulfill the request and record the audit event in one database transaction.
   if(isRenewal){
     const {data:renewed,error:renewalError}=await db.rpc("mykioo_complete_subscription_renewal",{
       p_request_id:requestId,p_member_id:member_id,p_subscription_id:id,p_actor_id:user.id,
       p_service_name:service_name,p_service_username:service_username,
       p_supplier_reference:supplier_reference||null,p_status:status,
       p_contract_days:contract_days,p_expires_at:finalExpiry
     });
     if(renewalError){
       console.error("MYKIOO atomic renewal failed",renewalError.code||"unknown");
       const known=[
         "Renewal request is no longer pending",
         "Renewal request does not match its subscription",
         "Original subscription not found",
         "Original service login is missing",
         "Renewal must extend the existing expiry date",
         "Invalid renewal details"
       ].find(message=>String(renewalError.message||"").includes(message));
       return response({error:known||"Unable to complete renewal. No subscription dates were changed."},
         known?409:500);
     }
     if(!renewed?.subscription)return response({error:"Renewal result was unavailable. Please refresh before retrying."},500);
     return response({ok:true,subscription:renewed.subscription});
   }
   // Complete new requests atomically with the same row lock used for cancellation
   // approval. Encrypt credentials before starting the database transaction.
   if(requestId&&!isRenewal){
     if(!key||!password)return response({error:"Service credentials are required to complete this request"},400);
     const subscriptionId=crypto.randomUUID();
     const nonce=crypto.getRandomValues(new Uint8Array(12));
     const encrypted=await crypto.subtle.encrypt(
       {name:"AES-GCM",iv:nonce,additionalData:new TextEncoder().encode(subscriptionId)},
       key,new TextEncoder().encode(password)
     );
     const {data:completed,error:completeError}=await db.rpc("mykioo_complete_new_subscription_request",{
       p_request_id:requestId,p_member_id:member_id,p_actor_id:user.id,
       p_subscription_id:subscriptionId,p_service_name:service_name,
       p_service_username:service_username,p_supplier_reference:supplier_reference||null,
       p_status:status,p_contract_days:contract_days,p_starts_at:starts_at,
       p_expires_at:expires_at,p_credential_iv:b64(nonce),
       p_credential_cipher:b64(new Uint8Array(encrypted))
     });
     if(completeError){
       const message=String(completeError.message||"");
       if(message.includes("Request already cancelled, completed or unavailable"))
         return response({error:"The request was cancelled or already completed. Refresh before retrying."},409);
       console.error("MYKIOO atomic new subscription completion failed",completeError.code||"unknown");
       return response({error:"Could not complete the request. No subscription was created."},500);
     }
     return response({ok:true,subscription:completed?.subscription});
   }
   const payload={member_id,service_name,contract_days,device_count,device_label:null,service_username:service_username||null,
      supplier_reference:supplier_reference||null,status,starts_at:subscriptionStart,expires_at:finalExpiry,updated_at:new Date().toISOString()};
   let query=id?db.from("mykioo_subscriptions").update(payload).eq("id",id).eq("member_id",member_id):
     db.from("mykioo_subscriptions").insert(payload);
   const {data:record,error:saveError}=await query.select("id,member_id,service_name,device_label,service_username,status,starts_at,expires_at").single();
   if(saveError)return response({error:"Unable to save subscription"},500);
   if(password&&key){
     const nonce=crypto.getRandomValues(new Uint8Array(12));
     const plain=new TextEncoder().encode(password);
     const encrypted=await crypto.subtle.encrypt({name:"AES-GCM",iv:nonce,additionalData:new TextEncoder().encode(record.id)},key,plain);
     const {error:credentialError}=await db.from("mykioo_subscription_credentials").upsert({
       subscription_id:record.id,iv:b64(nonce),cipher_text:b64(new Uint8Array(encrypted)),updated_at:new Date().toISOString()
     },{onConflict:"subscription_id"});
     if(credentialError)return response({error:"Subscription saved but secure credential storage failed; please retry."},500);
     const {error:flagError}=await db.from("mykioo_subscriptions").update({has_password:true}).eq("id",record.id);
     if(flagError)return response({error:"Password encrypted but visibility flag update failed; please retry."},500);
   }

   if(requestId){
     const {data:fulfilled,error:fulfillmentError}=await db.from("mykioo_subscription_requests")
       .update({status:"fulfilled",subscription_id:record.id,completed_at:new Date().toISOString(),updated_at:new Date().toISOString()})
       .eq("id",requestId).eq("member_id",member_id).in("status",["pending","in_review"])
       .select("id").maybeSingle();
     if(fulfillmentError||!fulfilled){
       return response({error:"Subscription created but the request could not be marked complete. Contact support before retrying."},500);
     }
   }
   await db.from("mykioo_audit_logs").insert({actor_id:user.id,action:isRenewal?"subscription_renewed":id?"subscription_updated":"subscription_created",
    entity_type:"subscription",entity_id:record.id,details:{member_id,service_name,status}});
   return response({ok:true,subscription:record});
  }
  return response({error:"Unknown action"},400);
 }catch(err){console.error("MYKIOO subscription error",err instanceof Error?err.message:"unknown");
 return response({error:err instanceof Error&&err.message==="Invalid date"?"Invalid date":"Unable to save subscription"},400);}
});
