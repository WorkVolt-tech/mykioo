import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const origin="https://mykioo.pages.dev";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
const respond=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=(s:unknown)=>typeof s==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return respond({error:"Method not allowed"},405);
 if(req.headers.get("Origin")!==origin)return respond({error:"Origin not allowed"},403);
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
   const {data:created,error:createError}=await db.from("mykioo_subscription_requests")
     .insert({member_id:user.id,service_name,contract_days,notes,...packageSelection}).select("id,status,created_at").single();
   if(createError)return respond({error:"Could not submit subscription request"},500);
   await db.from("mykioo_audit_logs").insert({actor_id:user.id,action:"subscription_requested",entity_type:"subscription_request",entity_id:created.id,details:{service_name,contract_days}});
   return respond({ok:true,request:created});
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
   const {data:created,error:insertError}=await db.from("mykioo_subscription_requests").insert({
     member_id:user.id,service_name:sub.service_name||"Subscription renewal",contract_days:days,notes,request_type:"renewal",
     renewal_subscription_id:sub.id,...packageSelection
   }).select("id,status,created_at").single();
   if(insertError)return respond({error:"Could not submit renewal request"},500);
   await db.from("mykioo_audit_logs").insert({actor_id:user.id,action:"subscription_renewal_requested",
     entity_type:"subscription_request",entity_id:created.id,details:{subscription_id:sub.id,contract_days:days}});
   return respond({ok:true,request:created});
  }
  if(input.action==="owner_create"){
   if(member.role!=="owner"||user.app_metadata?.mykioo_role!=="owner")
     return respond({error:"Owner access required"},403);
   const member_id=input.member_id,request_type=input.request_type;
   if(!uuid(member_id)||!["new","renewal"].includes(request_type))
     return respond({error:"Select a valid account and request type"},400);
   const {data:target,error:targetError}=await db.from("mykioo_members")
     .select("user_id,role,status").eq("user_id",member_id).maybeSingle();
   if(targetError||!target||target.status!=="approved"||
       !(target.role==="member"||(target.role==="owner"&&target.user_id===user.id)))
     return respond({error:"Choose an approved member or your own owner account"},403);
   const contract_days=Number(input.contract_days);
   const notes=typeof input.notes==="string"?input.notes.trim():"";
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
   const {data:created,error:createError}=await db.from("mykioo_subscription_requests")
     .insert({member_id,service_name,contract_days,notes,request_type,renewal_subscription_id,...packageSelection})
     .select("id,status,created_at,request_type,member_id").single();
   if(createError)return respond({error:"Could not submit owner subscription request"},500);
   await db.from("mykioo_audit_logs").insert({
     actor_id:user.id,action:request_type==="renewal"?"owner_subscription_renewal_requested":"owner_subscription_requested",
     entity_type:"subscription_request",entity_id:created.id,
     details:{member_id,service_name,contract_days,request_type,renewal_subscription_id}
   });
   return respond({ok:true,request:created});
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
  if(input.action==="change_status"){
   if(member.role!=="owner"||user.app_metadata?.mykioo_role!=="owner")return respond({error:"Owner only"},403);
   if(!uuid(input.request_id)||!["pending","in_review","declined"].includes(input.status))return respond({error:"Invalid request or status"},400);
   const {data:existing,error:fetchError}=await db.from("mykioo_subscription_requests").select("status,service_activated_at").eq("id",input.request_id).maybeSingle();
   if(fetchError||!existing)return respond({error:"Request not found"},404);
   if(["fulfilled","cancelled"].includes(existing.status))return respond({error:"Completed or withdrawn requests cannot be changed"},409);
   if(existing.service_activated_at&&input.status==="declined")
     return respond({error:"This service has already been activated. Complete its subscription details instead of declining the request."},409);
   const {error:changeError}=await db.from("mykioo_subscription_requests")
      .update({status:input.status,updated_at:new Date().toISOString()}).eq("id",input.request_id).not("status","in",'("fulfilled","cancelled")');
   if(changeError)return respond({error:"Unable to update request"},500);
   await db.from("mykioo_audit_logs").insert({actor_id:user.id,action:"subscription_request_status",entity_type:"subscription_request",entity_id:input.request_id,details:{status:input.status}});
   return respond({ok:true});
  }
  return respond({error:"Unknown action"},400);
 }catch(err){console.error("MYKIOO subscription requests",err instanceof Error?err.message:"unknown");return respond({error:"Request service temporarily unavailable"},500)}
});
