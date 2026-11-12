import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const ORIGIN="https://mykioo.pages.dev";
const cors={"Access-Control-Allow-Origin":ORIGIN,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=(v:unknown)=>typeof v==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const eth=/^0x[a-fA-F0-9]{40}$/;
const btc=/^bc1[023456789acdefghjklmnpqrstuvwxyz]{20,85}$/i;
const hash=/^(0x)?[a-fA-F0-9]{64}$/;
const methods=["interac","zelle","btc","shib"];
const cryptoMethods=["btc","shib"];
const money=(v:unknown)=>{const n=Number(v);return Number.isFinite(n)&&n>=0.01&&n<=100000&&Math.round(n*100)===n*100?Number(n.toFixed(2)):null};
function safe(s:unknown,max=254){return typeof s==="string"?s.trim().slice(0,max+1):""}
const isOwner=(m:{role:string},user:{app_metadata?:Record<string,unknown>})=>m.role==="owner"&&user.app_metadata?.mykioo_role==="owner";
async function getPrice(method:string){
 const response=await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,shiba-inu&vs_currencies=cad",{signal:AbortSignal.timeout(8500),headers:{"Accept":"application/json"}});
 if(!response.ok)throw new Error("Live crypto quote service is unavailable. Try again or enter a manually checked amount.");
 const d=await response.json();const rate=Number(d[method==="btc"?"bitcoin":"shiba-inu"]?.cad);
 if(!Number.isFinite(rate)||rate<=0)throw new Error("Unable to verify the current crypto price. Try again.");
 return rate;
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 if(req.headers.get("Origin")!==ORIGIN)return reply({error:"Origin not allowed"},403);
 const authorization=req.headers.get("Authorization")||"";
 if(!authorization.startsWith("Bearer "))return reply({error:"Sign in to continue"},401);
 const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!key)return reply({error:"Server not configured"},503);
 const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:{user},error:userError}=await db.auth.getUser(authorization.slice(7));
  if(userError||!user)return reply({error:"Session expired"},401);
  const {data:member,error:memberError}=await db.from("mykioo_members").select("user_id,status,role").eq("user_id",user.id).maybeSingle();
  if(memberError||!member||member.status!=="approved")return reply({error:"Approved membership required"},403);
  const owner=isOwner(member,user);
  const input=await req.json().catch(()=>null);
  if(!input||typeof input!=="object")return reply({error:"Invalid request"},400);
  const action=safe(input.action,40);
  const audit=async(name:string,record:{id:string,member_id:string},extra:Record<string,unknown>={})=>{
   const {error}=await db.from("mykioo_audit_logs").insert({actor_id:user.id,action:name,entity_type:"billing_invoice",entity_id:record.id,
    details:{member_id:record.member_id,...extra}});
   if(error)console.warn("Billing activity could not be recorded",error.code);
  };
  if(action==="save_settings"){
   if(!owner)return reply({error:"Owner access required"},403);
   const default_cad=money(input.default_cad),default_usd=money(input.default_usd);
   if(default_cad===null||default_usd===null)return reply({error:"Enter valid CAD and USD prices"},400);
   const interac_destination=safe(input.interac_destination),zelle_destination=safe(input.zelle_destination);
   if(interac_destination.length>254||zelle_destination.length>254)return reply({error:"Payment instructions are too long"},400);
   const {data,error}=await db.from("mykioo_billing_settings").update({default_cad,default_usd,
    interac_destination:interac_destination||null,zelle_destination:zelle_destination||null,updated_by:user.id,updated_at:new Date().toISOString()})
    .eq("id",1).select("id,default_cad,default_usd,interac_destination,zelle_destination").single();
   if(error)return reply({error:"Could not save billing settings"},500);
   await db.from("mykioo_audit_logs").insert({actor_id:user.id,action:"billing_settings_updated",entity_type:"settings",entity_id:"1",details:{default_cad,default_usd}});
   return reply({ok:true,settings:data});
  }
  if(action==="issue_invoice"){
   if(!owner||!uuid(input.request_id))return reply({error:"Owner and subscription request required"},403);
   const {data:request,error:requestError}=await db.from("mykioo_subscription_requests")
    .select("id,member_id,status,service_name,contract_days").eq("id",input.request_id).maybeSingle();
   if(requestError||!request)return reply({error:"Subscription request not found"},404);
   if(!["pending","in_review"].includes(request.status))return reply({error:"Only active pending requests can be invoiced"},409);
   const {data:cancel,error:cancelError}=await db.from("mykioo_subscription_cancellation_requests")
    .select("status").eq("request_id",request.id).maybeSingle();
   if(cancelError)return reply({error:"Could not check cancellation status"},503);
   if(cancel&&["pending","approved"].includes(cancel.status))return reply({error:"Resolve the cancellation request before invoicing"},409);
   const {data:existing,error:existingError}=await db.from("mykioo_billing_invoices").select("id").eq("request_id",request.id).maybeSingle();
   if(existingError)return reply({error:"Unable to check existing invoices"},500);
   if(existing)return reply({error:"An invoice already exists for this subscription request"},409);
   const {data:settings,error:settingsError}=await db.from("mykioo_billing_settings").select("*").eq("id",1).single();
   if(settingsError)return reply({error:"Billing settings unavailable"},500);
   const amount_cad=input.amount_cad===undefined?Number(settings.default_cad):money(input.amount_cad);
   const amount_usd=input.amount_usd===undefined?Number(settings.default_usd):money(input.amount_usd);
   if(amount_cad===null||amount_usd===null)return reply({error:"Invalid CAD or USD amount"},400);
   const {data:invoice,error:insertError}=await db.from("mykioo_billing_invoices")
    .insert({request_id:request.id,member_id:request.member_id,created_by:user.id,amount_cad,amount_usd})
    .select("*").single();
   if(insertError)return reply({error:insertError.code==="23505"?"An invoice already exists":"Could not create invoice"},insertError.code==="23505"?409:500);
   await audit("billing_invoice_issued",invoice,{amount_cad,amount_usd,service_name:request.service_name});
   return reply({ok:true,invoice});
  }
  if(!uuid(input.invoice_id))return reply({error:"Select a valid invoice"},400);
  const {data:invoice,error:invoiceError}=await db.from("mykioo_billing_invoices").select("*").eq("id",input.invoice_id).maybeSingle();
  if(invoiceError||!invoice)return reply({error:"Invoice not found"},404);
  if(!owner&&invoice.member_id!==user.id)return reply({error:"This invoice does not belong to your account"},403);
  if(["cancelled","paid"].includes(invoice.state))return reply({error:"This invoice is already closed"},409);
  const {data:request,error:requestError}=await db.from("mykioo_subscription_requests")
    .select("status,service_activated_at").eq("id",invoice.request_id).maybeSingle();
  if(requestError||!request)return reply({error:"Linked subscription request not found"},404);
  if(["cancelled","declined"].includes(request.status))return reply({error:"This subscription request is no longer eligible for payment"},409);
  if(action==="select_method"){
   if(invoice.state==="payment_submitted")return reply({error:"Payment already submitted. Contact the owner."},409);
   if(!["awaiting_method","awaiting_instructions","awaiting_payment"].includes(invoice.state))return reply({error:"Invoice cannot be changed"},409);
   const method=safe(input.method);
   if(!methods.includes(method))return reply({error:"Choose an accepted payment method"},400);
   if(method===invoice.method)return reply({ok:true,invoice});
   const {data:settings,error:settingError}=await db.from("mykioo_billing_settings").select("interac_destination,zelle_destination").eq("id",1).single();
   if(settingError)return reply({error:"Billing settings unavailable"},500);
   const fiat=method==="interac"||method==="zelle";
   const destination=fiat?(method==="interac"?settings.interac_destination:settings.zelle_destination):null;
   const patch={method,state:destination?"awaiting_payment":"awaiting_instructions",destination:destination||null,
    network:method==="btc"?"Bitcoin Mainnet":method==="shib"?"Ethereum Mainnet (ERC-20)":null,
    amount_due:fiat?Number(method==="interac"?invoice.amount_cad:invoice.amount_usd):null,
    currency:method==="interac"?"CAD":method==="zelle"?"USD":method.toUpperCase(),
    quote_expires_at:null,rate_cad:null,quote_source:null,sender_name:null,payment_reference:null,submitted_note:null,submitted_at:null,
    updated_at:new Date().toISOString()};
   const {data,error}=await db.from("mykioo_billing_invoices").update(patch).eq("id",invoice.id)
     .in("state",["awaiting_method","awaiting_instructions","awaiting_payment"]).select("*").single();
   if(error)return reply({error:"Unable to choose payment method"},500);
   await audit("billing_method_selected",invoice,{method});
   return reply({ok:true,invoice:data});
  }
  if(action==="set_destination"){
   if(!owner)return reply({error:"Owner access required"},403);
   if(!invoice.method||!["awaiting_instructions","awaiting_payment"].includes(invoice.state))
    return reply({error:"Customer must choose a payment method before you can send instructions"},409);
   const destination=safe(input.destination);
   if(!destination||destination.length>254)return reply({error:"Enter the receiving address or payment contact"},400);
   if(invoice.method==="btc"&&!btc.test(destination))return reply({error:"BTC requires a Coinbase Bitcoin Mainnet bc1 receiving address. Never use a BCH address."},400);
   if(invoice.method==="shib"&&!eth.test(destination))return reply({error:"SHIB requires an Ethereum 0x receiving address. Confirm Ethereum Mainnet (ERC-20) in Coinbase."},400);
   let amount_due=invoice.amount_due,quote_expires_at=null,rate_cad=null,quote_source=null;
   if(cryptoMethods.includes(invoice.method)){
    if(input.manual_amount!==undefined&&String(input.manual_amount).trim()!==""){
     const custom=Number(input.manual_amount);
     if(!Number.isFinite(custom)||custom<=0||custom>=1e12)return reply({error:"Invalid manually verified crypto amount"},400);
     amount_due=invoice.method==="btc"?Number(custom.toFixed(8)):Math.ceil(custom);
     quote_source="owner";
    }else{
     try{
      rate_cad=await getPrice(invoice.method);
      const calculated=Number(invoice.amount_cad)/rate_cad;
      amount_due=invoice.method==="btc"?Math.ceil(calculated*1e8)/1e8:Math.ceil(calculated);
      quote_source="coingecko";
     }catch(e){return reply({error:e instanceof Error?e.message:"Crypto quote unavailable"},503)}
    }
    if(!Number.isFinite(amount_due)||amount_due<=0)return reply({error:"Could not calculate a valid crypto amount"},503);
    quote_expires_at=new Date(Date.now()+24*60*60*1000).toISOString();
   }
   const {data,error}=await db.from("mykioo_billing_invoices").update({destination,amount_due,quote_expires_at,rate_cad,quote_source,
    state:"awaiting_payment",updated_at:new Date().toISOString()}).eq("id",invoice.id).in("state",["awaiting_instructions","awaiting_payment"]).select("*").single();
   if(error)return reply({error:"Could not issue payment instructions"},500);
   await audit("billing_payment_instructions_ready",invoice,{method:invoice.method,amount_due,currency:invoice.currency,quote_source});
   return reply({ok:true,invoice:data});
  }
  if(action==="submit_payment"){
   if(invoice.member_id!==user.id && !owner)return reply({error:"Not your invoice"},403);
   if(invoice.state!=="awaiting_payment"||!invoice.method||!invoice.destination||!invoice.amount_due)
    return reply({error:"Payment instructions are not ready"},409);
   if(cryptoMethods.includes(invoice.method)){
    if(input.ack_network!==true)return reply({error:"Confirm the exact cryptocurrency and network before submitting"},400);
    if(!invoice.quote_expires_at||Date.now()>new Date(invoice.quote_expires_at).getTime())
     return reply({error:"Crypto quote has expired. Ask for a new quote before paying."},409);
   }
   const sender_name=safe(input.sender_name,120);
   const payment_reference=safe(input.payment_reference,160),submitted_note=safe(input.submitted_note,500);
   if(sender_name.length<2||sender_name.length>120)return reply({error:"Enter the name on the sending account (2–120 characters)"},400);
   if(payment_reference.length<3||payment_reference.length>160)return reply({error:"Enter the transfer confirmation or transaction number (3–160 characters)"},400);
   if(submitted_note.length>500)return reply({error:"Payment note is too long"},400);
   if(cryptoMethods.includes(invoice.method)&&!hash.test(payment_reference))return reply({error:"Enter the complete 64-character blockchain transaction hash"},400);
   if(invoice.method==="shib"&&!payment_reference.startsWith("0x"))return reply({error:"Enter the Ethereum transaction hash beginning with 0x"},400);
   const {data,error}=await db.from("mykioo_billing_invoices").update({state:"payment_submitted",sender_name,payment_reference,
     submitted_note:submitted_note||null,submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()})
      .eq("id",invoice.id).eq("state","awaiting_payment").select("*").single();
   if(error)return reply({error:error.code==="23505"?"This transaction hash has already been submitted":"Could not submit payment reference"},error.code==="23505"?409:500);
   await audit("billing_payment_submitted",invoice,{method:invoice.method,currency:invoice.currency,amount_due:invoice.amount_due});
   return reply({ok:true,invoice:data});
  }
  if(action==="confirm_paid"){
   if(!owner||input.verified!==true)return reply({error:"Owner must confirm verified receipt of funds"},403);
   if(!["payment_submitted","awaiting_payment"].includes(invoice.state))return reply({error:"Invoice is not ready to confirm"},409);
   if(!invoice.destination||!invoice.amount_due)return reply({error:"No complete payment instructions on this invoice"},409);
   const verification_note=safe(input.verification_note,500);
   const payment_reference=invoice.payment_reference||safe(input.payment_reference,160)||null;
   if(cryptoMethods.includes(invoice.method)&&(!payment_reference||!hash.test(payment_reference)|| (invoice.method==="shib"&&!payment_reference.startsWith("0x"))))
    return reply({error:"Verify and record the real on-chain transaction hash before marking crypto as paid"},400);
   const {data,error}=await db.from("mykioo_billing_invoices").update({state:"paid",payment_reference,paid_at:new Date().toISOString(),
      paid_by:user.id,verification_note:verification_note||null,updated_at:new Date().toISOString()})
      .eq("id",invoice.id).in("state",["awaiting_payment","payment_submitted"]).select("*").single();
   if(error)return reply({error:error.code==="23505"?"This transaction hash is already used on another invoice":"Could not confirm payment"},error.code==="23505"?409:500);
   await audit("billing_payment_confirmed",invoice,{method:invoice.method,currency:invoice.currency,amount_due:invoice.amount_due});
   return reply({ok:true,invoice:data});
  }
  if(action==="reject_submission"){
   if(!owner||invoice.state!=="payment_submitted")return reply({error:"Only submitted payments can be returned for correction"},409);
   const {data,error}=await db.from("mykioo_billing_invoices").update({state:"awaiting_payment",sender_name:null,payment_reference:null,submitted_note:null,submitted_at:null,
      updated_at:new Date().toISOString()}).eq("id",invoice.id).eq("state","payment_submitted").select("*").single();
   if(error)return reply({error:"Unable to return submission for correction"},500);
   await audit("billing_submission_rejected",invoice,{method:invoice.method});
   return reply({ok:true,invoice:data});
  }
  if(action==="cancel_invoice"){
   if(!owner||invoice.state==="paid")return reply({error:"Owner only; paid invoices cannot be cancelled here"},403);
   const {data,error}=await db.from("mykioo_billing_invoices").update({state:"cancelled",updated_at:new Date().toISOString()})
    .eq("id",invoice.id).neq("state","paid").select("*").single();
   if(error)return reply({error:"Unable to cancel invoice"},500);
   await audit("billing_invoice_cancelled",invoice,{method:invoice.method});
   return reply({ok:true,invoice:data});
  }
  return reply({error:"Unknown billing action"},400);
 }catch(error){console.error("MYKIOO billing:",error instanceof Error?error.message:"unknown");
  return reply({error:"Billing is temporarily unavailable"},500)}
});
