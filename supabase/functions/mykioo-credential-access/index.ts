import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const origin="https://mykioo.pages.dev";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const validId=(x:unknown)=>typeof x==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(x);
const fromB64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function key(){
 const encoded=Deno.env.get("MYKIOO_CREDENTIAL_KEY");
 if(!encoded)return null;
 try{const raw=fromB64(encoded);if(raw.length!==32)return null;
 return crypto.subtle.importKey("raw",raw,{name:"AES-GCM"},false,["decrypt"])}catch{return null}
}
async function hash(challenge:string,user:string,code:string){
 const secret=Deno.env.get("MYKIOO_CREDENTIAL_KEY")||"";
 const encoded=new TextEncoder().encode([secret,challenge,user,code].join(":"));
 const bytes=new Uint8Array(await crypto.subtle.digest("SHA-256",encoded));
 return Array.from(bytes).map(b=>b.toString(16).padStart(2,"0")).join("");
}
Deno.serve(async req=>{
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(req.method!=="POST")return reply({error:"Method not allowed"},405);
 if(req.headers.get("Origin")!==origin)return reply({error:"Origin not allowed"},403);
 const auth=req.headers.get("Authorization")||"";
 if(!auth.startsWith("Bearer "))return reply({error:"Sign in required"},401);
 const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!service)return reply({error:"Service unavailable"},503);
 const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:{user},error:authError}=await db.auth.getUser(auth.slice(7));
  if(authError||!user)return reply({error:"Session expired; please sign in again."},401);
  if(!user.email||!user.email_confirmed_at)return reply({error:"A verified account email is required."},403);
  const {data:member,error:memberError}=await db.from("mykioo_members")
   .select("user_id,status,role,display_name,email").eq("user_id",user.id).maybeSingle();
  if(memberError||member?.role!=="member"||member.status!=="approved"||member.email.toLowerCase()!==user.email.toLowerCase())
   return reply({error:"Approved membership required"},403);
  const input=await req.json().catch(()=>null);
  if(!input||!validId(input.subscription_id))return reply({error:"Invalid subscription"},400);
  const {data:sub,error:subError}=await db.from("mykioo_subscriptions")
   .select("id,member_id,has_password,service_name").eq("id",input.subscription_id).eq("member_id",user.id).maybeSingle();
  if(subError||!sub)return reply({error:"Subscription not found"},404);
  if(!sub.has_password)return reply({error:"No service password is stored for this subscription."},404);
  const aesKey=await key();
  if(!aesKey)return reply({error:"Secure credential service is not configured."},503);
  const now=Date.now();
  if(input.action==="request_code"){
   const mailerKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
   if(!mailerKeyreturn reply({error:"Email verification service is unavailable."},503);
   const {data:recent,error:recentError}=await db.from("mykioo_credential_challenges")
    .select("created_at").eq("user_id",user.id).gte("created_at",new Date(now-3600000).toISOString()).order("created_at",{ascending:false}).limit(4);
   if(recentError)return reply({error:"Unable to request verification at this time."},503);
   if(recent&&recent.length>=3)return reply({error:"Too many verification requests. Please try again later."},429);
   if(recent?.[0]&&now-Date.parse(recent[0].created_at)<60000)return reply({error:"Please wait one minute before requesting another code."},429);
   const code=String(crypto.getRandomValues(new Uint32Array(1))[0]%1000000).padStart(6,"0");
   const id=crypto.randomUUID(),expires_at=new Date(now+10*60000).toISOString();
   const code_hash=await hash(id,user.id,code);
   const {error:storeError}=await db.from("mykioo_credential_challenges")
    .insert({id,user_id:user.id,subscription_id:sub.id,code_hash,expires_at});
   if(storeError)return reply({error:"Unable to create verification request."},500);
   const fr=member.email&&input.language==="fr";
   const subject=fr?"MYKIOO | Votre code de vérification":"MYKIOO | Your verification code";
   const safeName=(member.display_name||"").replace(/[<>&"'\u0000-\u001f]/g,"").slice(0,40);
   const html=fr?
    '<div style="font-family:Arial;background:#17111f;color:#fff;padding:28px"><h1 style="color:#e7c182">MYKIOO</h1><p>Bonjour '+safeName+',</p><p>Voici votre code pour afficher le mot de passe de votre abonnement :</p><p style="font-size:32px;letter-spacing:8px;color:#e7c182"><b>'+code+'</b></p><p>Ce code expire dans 10 minutes. Si vous n’avez pas demandé ce code, ignorez ce courriel.</p></div>':
    '<div style="font-family:Arial;background:#17111f;color:#fff;padding:28px"><h1 style="color:#e7c182">MYKIOO</h1><p>Hello '+safeName+',</p><p>Use this one-time code to reveal your subscription password:</p><p style="font-size:32px;letter-spacing:8px;color:#e7c182"><b>'+code+'</b></p><p>This code expires in 10 minutes. If you did not request it, ignore this email.</p></div>';
   const sent=await fetch(((Deno.env.get("SUPABASE_URL")||"")+"/functions/v1/mykioo-email-dispatch?route=email"),{method:"POST",
     headers:{"api-key":mailerKey,"Content-Type":"application/json","Accept":"application/json"},
     body:JSON.stringify({sender:{name:"MYKIOO",email:"mykiootv@outlook.com"},to:[{email:user.email}],subject,htmlContent:html,tags:["mykioo","credential-verification"]})});
   if(!sent.ok){
    await db.from("mykioo_credential_challenges").delete().eq("id",id).eq("user_id",user.id);
    console.error("MYKIOO verification mail rejected by Gmail",sent.status);
    return reply({error:"Verification email could not be sent."},502);
   }
   return reply({ok:true,challenge_id:id,expires_in_seconds:600});
  }
  if(input.action==="verify_code"){
   const challengeId=input.challenge_id,code=input.code;
   if(!validId(challengeId)||typeof code!=="string"||!/^[0-9]{6}$/.test(code))return reply({error:"Invalid code"},400);
   const {data:challenge,error:challengeError}=await db.from("mykioo_credential_challenges")
    .select("*").eq("id",challengeId).eq("user_id",user.id).eq("subscription_id",sub.id).maybeSingle();
   if(challengeError||!challenge||challenge.consumed_at||Date.parse(challenge.expires_at)<=now||challenge.attempts>=5)
    return reply({error:"Code expired or unavailable. Request a new one."},400);
   const expected=await hash(challenge.id,user.id,code);
   // Increment attempts before checking. Concurrent incorrect guesses are additionally bounded by database updates.
   const {data:attempt,error:attemptError}=await db.from("mykioo_credential_challenges")
    .update({attempts:challenge.attempts+1}).eq("id",challenge.id).eq("attempts",challenge.attempts)
    .is("consumed_at",null).select("id").maybeSingle();
   if(attemptError||!attempt)return reply({error:"Please retry verification."},409);
   if(expected!==challenge.code_hash)return reply({error:"Incorrect code."},400);
   const {data:claimed,error:claimError}=await db.from("mykioo_credential_challenges")
    .update({consumed_at:new Date().toISOString()}).eq("id",challenge.id).is("consumed_at",null).select("id").maybeSingle();
   if(claimError||!claimed)return reply({error:"Code already used."},409);
   const {data:credential,error:credError}=await db.from("mykioo_subscription_credentials")
    .select("iv,cipher_text").eq("subscription_id",sub.id).maybeSingle();
   if(credError||!credential)return reply({error:"Password unavailable."},404);
   let password:string;
   try{
    const decrypted=await crypto.subtle.decrypt({name:"AES-GCM",iv:fromB64(credential.iv),
      additionalData:new TextEncoder().encode(sub.id)},aesKey,fromB64(credential.cipher_text));
    password=new TextDecoder().decode(decrypted);
   }catch{return reply({error:"Unable to decrypt this password. Contact support."},500)}
   await db.from("mykioo_audit_logs").insert({actor_id:user.id,action:"subscription_password_revealed",
    entity_type:"subscription",entity_id:sub.id,details:{verified_by:"email_otp"}});
   return reply({ok:true,password});
  }
  return reply({error:"Unknown action"},400);
 }catch(error){
  console.error("MYKIOO credential function failed",error instanceof Error?error.message:"unknown");
  return reply({error:"Verification service temporarily unavailable."},500);
 }
});
