import {createClient} from "npm:@supabase/supabase-js@2.57.0";

// Staged Agent API: deploy only after migrations, RLS audit and controlled testing.
// Never trust agent/customer IDs, discounts, prices or payment claims from the browser.
const origin="https://mykioo.icu";
const allowedOrigins=new Set([origin,"https://www.mykioo.icu","https://mykioo.pages.dev"]);
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const validEmail=(v:unknown)=>typeof v==="string"&&v.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const amount=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)&&v>=0&&v<=100000?Math.round(v*100)/100:null;
Deno.serve(async request=>{
 const requestOrigin=request.headers.get("Origin")||"";
 const headers={"Access-Control-Allow-Origin":allowedOrigins.has(requestOrigin)?requestOrigin:origin,
   "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
   "Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin","Content-Type":"application/json","Cache-Control":"no-store"};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
 if(request.method!=="POST")return reply({error:"Method not allowed"},405);
 if(!allowedOrigins.has(requestOrigin))return reply({error:"Origin not allowed"},403);
 const token=request.headers.get("Authorization")||"";
 if(!token.startsWith("Bearer "))return reply({error:"Authentication required"},401);
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!secret)return reply({error:"Server not configured"},503);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:{user},error:authError}=await db.auth.getUser(token.slice(7));
  if(authError||!user)return reply({error:"Invalid session"},401);
  const {data:member,error:memberError}=await db.from("mykioo_members")
    .select("user_id,email,role,status").eq("user_id",user.id).maybeSingle();
  if(memberError||!member||member.status!=="approved")return reply({error:"Approved account required"},403);
  const input=await request.json().catch(()=>null);
  if(!input||typeof input!=="object")return reply({error:"Invalid request"},400);
  const owner=member.role==="owner";
  const action=String(input.action||"");
  async function activeAgent(){
   const {data,error}=await db.from("mykioo_agent_accounts").select("agent_user_id,status")
      .eq("agent_user_id",user!.id).maybeSingle();
   return !error&&data?.status==="active";
  }
  async function isAssigned(customerId:string){
   const {data}=await db.from("mykioo_agent_customers").select("customer_user_id")
      .eq("agent_user_id",user!.id).eq("customer_user_id",customerId).maybeSingle();
   return Boolean(data);
  }
  async function approvedMember(memberId:string){
   const {data}=await db.from("mykioo_members").select("user_id,status,role,email")
     .eq("user_id",memberId).maybeSingle();
   return data?.status==="approved"&&data.role==="member"?data:null;
  }

  if(action==="owner_list"){
   if(!owner)return reply({error:"Owner only"},403);
   const [agents,customers,invites,orders,members,services]=await Promise.all([
    db.from("mykioo_agent_accounts").select("*").order("created_at",{ascending:false}),
    db.from("mykioo_agent_customers").select("*").order("assigned_at",{ascending:false}),
    db.from("mykioo_agent_invitation_requests").select("*").order("created_at",{ascending:false}).limit(100),
    db.from("mykioo_agent_order_intents").select("*").order("created_at",{ascending:false}).limit(100),
    db.from("mykioo_members").select("user_id,email,display_name,role,status").limit(1000),
    db.from("mykioo_agent_service_requests").select("*").order("created_at",{ascending:false}).limit(100)
   ]);
   if([agents,customers,invites,orders,members,services].some(x=>x.error))return reply({error:"Unable to load agent records"},503);
   return reply({ok:true,agents:agents.data,customers:customers.data,invites:invites.data,orders:orders.data,members:members.data,services:services.data});
  }
  if(action==="owner_set_agent"){
   if(!owner)return reply({error:"Owner only"},403);
   if(!uuid(input.agent_user_id))return reply({error:"Invalid agent"},400);
   const target=await approvedMember(input.agent_user_id);
   if(!target)return reply({error:"Agent must have an approved member account"},400);
   const status=["pending","active","suspended"].includes(input.status)?input.status:null;
   const accessType=["free","paid"].includes(input.access_type)?input.access_type:null;
   const period=["none","one_time","monthly","yearly"].includes(input.access_fee_period)?input.access_fee_period:null;
   const fee=amount(input.access_fee_cad);
   const discount=amount(input.discount_cad);
   if(!status||!accessType||!period||fee===null||discount===null||discount>1000)
     return reply({error:"Set a valid fee and a discount from $0 to $1,000 CAD"},400);
   if(accessType==="free"&&(fee!==0||period!=="none"))return reply({error:"Free agents must have no access fee"},400);
   if(accessType==="paid"&&(fee<=0||period==="none"))return reply({error:"Paid agents need an access fee and period"},400);
   // Only an authenticated owner may set the agent discount. No agent can edit it.
   const {data,error}=await db.from("mykioo_agent_accounts").upsert({
    agent_user_id:target.user_id,status,access_type:accessType,access_fee_cad:fee,
    access_fee_period:period,discount_cad:discount,updated_at:new Date().toISOString()
   }).select().single();
   if(error)return reply({error:"Agent update failed"},503);
   return reply({ok:true,agent:data});
  }
  if(action==="owner_remove_agent"){
   if(!owner)return reply({error:"Owner only"},403);
   if(!uuid(input.agent_user_id))return reply({error:"Invalid agent"},400);
   const {data:agent,error:agentError}=await db.from("mykioo_agent_accounts")
     .select("status").eq("agent_user_id",input.agent_user_id).maybeSingle();
   if(agentError||!agent)return reply({error:"Agent not found"},404);
   if(agent.status==="removed")return reply({ok:true,already_removed:true});
   const [customers,openOrders]=await Promise.all([
     db.from("mykioo_agent_customers").select("customer_user_id",{count:"exact",head:true})
       .eq("agent_user_id",input.agent_user_id),
     db.from("mykioo_agent_order_intents").select("id",{count:"exact",head:true})
       .eq("agent_user_id",input.agent_user_id).in("status",["pending_payment","owner_review"])
   ]);
   if(customers.error||openOrders.error)return reply({error:"Unable to verify agent customers or orders"},503);
   if((customers.count||0)>0)return reply({
     error:"Transfer all "+customers.count+" assigned customer(s) to another active agent before removal."
   },409);
   if((openOrders.count||0)>0)return reply({
     error:"Resolve the agent's "+openOrders.count+" outstanding order(s) before removal."
   },409);
   const {data:removed,error:removeError}=await db.from("mykioo_agent_accounts")
     .update({status:"removed",access_type:"free",access_fee_cad:0,access_fee_period:"none",discount_cad:0,
       updated_at:new Date().toISOString()})
     .eq("agent_user_id",input.agent_user_id).neq("status","removed")
     .select("agent_user_id,status").maybeSingle();
   if(removeError||!removed)return reply({error:"Unable to remove Agent"},503);
   return reply({ok:true,agent:removed});
  }
  if(action==="owner_assign_customer"){
   if(!owner)return reply({error:"Owner only"},403);
   if(!uuid(input.agent_user_id)||!uuid(input.customer_user_id)||input.agent_user_id===input.customer_user_id)
     return reply({error:"Invalid assignment"},400);
   const customer=await approvedMember(input.customer_user_id);
   if(!customer)return reply({error:"Customer must be an approved regular member"},400);
   const {data:agent}=await db.from("mykioo_agent_accounts").select("status")
      .eq("agent_user_id",input.agent_user_id).maybeSingle();
   if(agent?.status!=="active")return reply({error:"Agent must be active"},400);
   const {data,error}=await db.from("mykioo_agent_customers").upsert({
    customer_user_id:input.customer_user_id,agent_user_id:input.agent_user_id,
    assigned_by:user.id,assigned_at:new Date().toISOString()
   }).select().single();
   if(error)return reply({error:"Unable to assign customer"},503);
   return reply({ok:true,assignment:data});
  }
  if(action==="agent_invite_request"){
   if(!await activeAgent())return reply({error:"Active agent required"},403);
   if(!validEmail(input.email))return reply({error:"Valid email required"},400);
   const email=input.email.trim().toLowerCase();
   const {data:recent}=await db.from("mykioo_agent_invitation_requests").select("created_at")
    .eq("agent_user_id",user.id).gte("created_at",new Date(Date.now()-86400000).toISOString()).limit(20);
   if((recent||[]).length>=20)return reply({error:"Daily invitation request limit reached"},429);
   const {data,error}=await db.from("mykioo_agent_invitation_requests").insert({
    agent_user_id:user.id,invitee_email:email,status:"pending"
   }).select("id,status,created_at").single();
   if(error)return reply({error:"Unable to request invitation"},503);
   // Existing owner invitation flow remains the only sender; do not imply delivery.
   return reply({ok:true,request:data,delivered:false});
  }
  if(action==="agent_list"){
   if(!await activeAgent())return reply({error:"Active agent required"},403);
   const [customers,renewals,orders,invites,services]=await Promise.all([
    db.from("mykioo_agent_customers").select("customer_user_id,assigned_at")
      .eq("agent_user_id",user.id).order("assigned_at",{ascending:false}),
    db.from("mykioo_agent_renewal_requests").select("id,customer_user_id,status,message,created_at")
      .eq("agent_user_id",user.id).order("created_at",{ascending:false}),
    db.from("mykioo_agent_order_intents").select("id,customer_user_id,kind,contract_days,device_count,customer_price_cad,wholesale_price_cad,status,created_at")
      .eq("agent_user_id",user.id).order("created_at",{ascending:false}),
    db.from("mykioo_agent_invitation_requests").select("id,invitee_email,status,created_at")
      .eq("agent_user_id",user.id).order("created_at",{ascending:false}),
    db.from("mykioo_agent_service_requests").select("id,customer_user_id,contract_days,device_count,service_name,notes,status,created_at")
      .eq("agent_user_id",user.id).order("created_at",{ascending:false})
   ]);
   if([customers,renewals,orders,invites,services].some(x=>x.error))return reply({error:"Unable to load agent dashboard"},503);
   return reply({ok:true,customers:customers.data,renewals:renewals.data,orders:orders.data,invites:invites.data,services:services.data});
  }
  if(action==="agent_submit_order"){
   if(!await activeAgent())return reply({error:"Active agent required"},403);
   const customerId=String(input.customer_user_id||"");
   if(!uuid(customerId)||!await isAssigned(customerId))return reply({error:"Customer is not assigned to you"},403);
   const kind=["new","renewal"].includes(input.kind)?input.kind:null;
   const days=Number(input.contract_days),devices=Number(input.device_count);
   const retail=amount(input.customer_price_cad);
   const method=["interac","zelle","cash","manual","btc","shib"].includes(input.payment_method)?input.payment_method:null;
   if(!kind||!method||retail===null||![365,730].includes(days)||!Number.isInteger(devices)||devices<1||devices>5)
     return reply({error:"Invalid order details"},400);
   if(input.discount_code)return reply({error:"Discount codes do not apply to agent orders"},400);
   const {data:price,error:priceError}=await db.from("mykioo_package_prices")
     .select("price_cad").eq("contract_days",days).eq("device_count",devices).maybeSingle();
   if(priceError||!price)return reply({error:"Package unavailable"},503);
   // Re-read the owner-assigned discount and active status for every order.
   const {data:agentTier,error:tierError}=await db.from("mykioo_agent_accounts")
     .select("access_type,status,discount_cad").eq("agent_user_id",user.id).maybeSingle();
   if(tierError||agentTier?.status!=="active"||!["free","paid"].includes(agentTier.access_type))
     return reply({error:"Active agent pricing unavailable"},403);
   const discountCad=Number(agentTier.discount_cad);
   const basePrice=Number(price.price_cad);
   if(!Number.isFinite(discountCad)||discountCad<0||discountCad>1000||
      !Number.isFinite(basePrice)||basePrice<=0)
     return reply({error:"Package or agent discount unavailable"},503);
   if(discountCad>=basePrice)return reply({
     error:"Agent discount must be less than this package's base price; contact the MYKIOO owner."
   },409);
   const wholesale=Math.round((basePrice-discountCad)*100)/100;
   const {data:order,error:orderError}=await db.from("mykioo_agent_order_intents").insert({
    agent_user_id:user.id,customer_user_id:customerId,kind,
    contract_days:days,device_count:devices,customer_price_cad:retail,
    wholesale_price_cad:wholesale,payment_method:method,status:"pending_payment"
   }).select("id,status,wholesale_price_cad,customer_price_cad").single();
   if(orderError)return reply({error:"Unable to create order"},503);
   // IMPORTANT: no account activation or subscription request completion here.
   // Owner must verify funds and submit via the existing canonical order pipeline.
   return reply({ok:true,order,discount_cad:discountCad,payment_verified:false});
  }
  if(action==="owner_verify_agent_order"){
   if(!owner)return reply({error:"Owner only"},403);
   if(!uuid(input.order_id))return reply({error:"Invalid order"},400);
   const {data:order}=await db.from("mykioo_agent_order_intents")
      .select("id,status").eq("id",input.order_id).maybeSingle();
   if(!order||order.status!=="pending_payment")return reply({error:"Order not awaiting payment"},409);
   const reference=typeof input.payment_reference==="string"?input.payment_reference.trim().slice(0,160):"";
   const {data,error}=await db.from("mykioo_agent_order_intents").update({
    status:"owner_review",payment_verified_at:new Date().toISOString(),payment_reference:reference
   }).eq("id",input.order_id).eq("status","pending_payment")
    .select("id,status,payment_verified_at").maybeSingle();
   if(error||!data)return reply({error:"Payment verification failed"},409);
   return reply({ok:true,order:data});
  }
  if(action==="customer_service_request"){
   const {data:assignment}=await db.from("mykioo_agent_customers").select("agent_user_id")
    .eq("customer_user_id",user.id).maybeSingle();
   if(!assignment)return reply({error:"No assigned agent"},403);
   const {data:agent}=await db.from("mykioo_agent_accounts").select("status")
    .eq("agent_user_id",assignment.agent_user_id).maybeSingle();
   if(agent?.status!=="active")return reply({error:"Assigned agent unavailable"},409);
   const days=Number(input.contract_days),devices=Number(input.device_count);
   const notes=typeof input.notes==="string"?input.notes.trim():"";
   if(![365,730].includes(days)||!Number.isInteger(devices)||devices<1||devices>5||notes.length>1000)
    return reply({error:"Invalid service selection"},400);
   const {data:recent}=await db.from("mykioo_agent_service_requests").select("id")
    .eq("customer_user_id",user.id).gte("created_at",new Date(Date.now()-86400000).toISOString()).limit(5);
   if((recent||[]).length>=5)return reply({error:"Too many requests; contact your agent"},429);
   const {data:record,error}=await db.from("mykioo_agent_service_requests").insert({
    customer_user_id:user.id,agent_user_id:assignment.agent_user_id,
    contract_days:days,device_count:devices,service_name:"MYKIOO TV",notes,status:"pending"
   }).select("id,status").single();
   if(error)return reply({error:"Unable to save service request"},503);
   let emailed=false;
   const {data:agentMember}=await db.from("mykioo_members").select("email")
    .eq("user_id",assignment.agent_user_id).maybeSingle();
   if(validEmail(agentMember?.email)){
    try{
     const response=await fetch(url+"/functions/v1/mykioo-email-dispatch?route=email",{
      method:"POST",headers:{"api-key":secret,"Content-Type":"application/json"},
      body:JSON.stringify({
       to:[{email:agentMember!.email}],subject:"MYKIOO | Customer service selection",
       textContent:"An assigned customer requested a "+days+"-day MYKIOO TV service for "+devices+" device(s). Review the request in your Agent dashboard. No payment has been taken."
      })
     });
     emailed=response.ok&&Boolean((await response.json().catch(()=>null))?.messageId);
    }catch{}
   }
   return reply({ok:true,request:record,agent_email_accepted:emailed});
  }
  if(action==="customer_renewal_request"){
   const {data:assignment}=await db.from("mykioo_agent_customers").select("agent_user_id")
     .eq("customer_user_id",user.id).maybeSingle();
   if(!assignment)return reply({error:"No assigned agent"},403);
   const {data:agent}=await db.from("mykioo_agent_accounts").select("status")
     .eq("agent_user_id",assignment.agent_user_id).maybeSingle();
   if(agent?.status!=="active")return reply({error:"Assigned agent unavailable"},409);
   const subscriptionId=String(input.subscription_id||"");
   if(!uuid(subscriptionId))return reply({error:"Invalid subscription"},400);
   const {data:subscription}=await db.from("mykioo_subscriptions")
     .select("id").eq("id",subscriptionId).eq("member_id",user.id).maybeSingle();
   if(!subscription)return reply({error:"Subscription not found"},404);
   const {data:previous}=await db.from("mykioo_agent_renewal_requests")
     .select("id").eq("customer_user_id",user.id).eq("subscription_id",subscriptionId)
     .eq("status","pending").maybeSingle();
   if(previous)return reply({ok:true,existing:true,request_id:previous.id});
   const {data:created,error}=await db.from("mykioo_agent_renewal_requests").insert({
     customer_user_id:user.id,agent_user_id:assignment.agent_user_id,
     subscription_id:subscriptionId,status:"pending"
   }).select("id,agent_user_id").single();
   if(error)return reply({error:"Unable to record renewal request"},503);
   let emailed=false;
   const {data:agentMember}=await db.from("mykioo_members").select("email")
     .eq("user_id",assignment.agent_user_id).maybeSingle();
   if(validEmail(agentMember?.email)){
     const emailText="A customer assigned to you requested a MYKIOO renewal. Sign in to your Agent dashboard to review the request. No payment or service activation has been recorded.";
     try{
       const result=await fetch(url+"/functions/v1/mykioo-email-dispatch?route=email",{
         method:"POST",headers:{"api-key":secret,"Content-Type":"application/json"},
         body:JSON.stringify({to:[{email:agentMember!.email}],subject:"MYKIOO | Customer renewal request",textContent:emailText})
       });
       emailed=result.ok&&Boolean((await result.json().catch(()=>null))?.messageId);
       if(emailed)await db.from("mykioo_agent_renewal_requests").update({agent_notified_at:new Date().toISOString()}).eq("id",created.id);
     }catch{ /* request persists in agent dashboard even if email fails */ }
   }
   return reply({ok:true,request_id:created.id,agent_email_accepted:emailed});
  }
  return reply({error:"Unknown action"},400);
 }catch(error){
  console.error("MYKIOO agent request failed",error instanceof Error?error.name:"unknown");
  return reply({error:"Unable to process agent request"},500);
 }
});
