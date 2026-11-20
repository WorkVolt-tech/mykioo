import {hashInvitationToken,newInvitationLink} from "./invitation-link.ts";
import {makeInvitationEmail} from "./email-template.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const origin="https://mykioo.icu";
const allowedOrigins=new Set([origin,"https://www.mykioo.icu","https://mykioo.pages.dev"]);
const cors = {
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin"
};
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" }
});
function validEmail(email: unknown): email is string {
  return typeof email === "string" && email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
// Supabase Auth's action_link is the canonical verify URL. A strict 64-hex
// check incorrectly rejected usable links from the current Auth response.
// Only the verification token is extracted; never send the Supabase Auth URL
// itself to members. VerifyOtp enforces the one-time token's validity.
function extractVerificationToken(properties:unknown,expectedType:"invite"|"recovery"):string|null {
  if(!properties||typeof properties!=="object")return null;
  const p=properties as {action_link?:string;hashed_token?:string;verification_type?:string};
  if(p.verification_type&&p.verification_type!==expectedType)return null;
  let token="";
  if(typeof p.action_link==="string"){
    try{
      const link=new URL(p.action_link);
      const authOrigin=new URL(Deno.env.get("SUPABASE_URL")||"https://invalid.example").origin;
      if(link.origin===authOrigin&&link.pathname.endsWith("/auth/v1/verify")&&link.searchParams.get("type")===expectedType){
        token=link.searchParams.get("token")||"";
      }
    }catch(_error){/* use the documented hashed_token property below */}
  }
  if(!token&&typeof p.hashed_token==="string")token=p.hashed_token;
  return /^[A-Za-z0-9_-]{16,512}$/.test(token)?token:null;
}
// Send transactional invitations only through MYKIOO's IONOS mail dispatcher.
// On failure, the owner can still copy/send the secure 48-hour invitation.
async function sendInviteEmail(to:string,subject:string,htmlContent:string,textContent:string):Promise<boolean>{
 const apiKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 const base=Deno.env.get("SUPABASE_URL");
 if(!apiKey||!base)return false;
 try{
  const result=await fetch(base+"/functions/v1/mykioo-email-dispatch?route=email",{
   method:"POST",
   headers:{"api-key":apiKey,"Content-Type":"application/json"},
   body:JSON.stringify({to:[{email:to}],subject,htmlContent,textContent})
  });
  const payload=await result.json().catch(()=>null);
  return result.ok&&typeof payload?.messageId==="string"&&payload.provider==="ionos";
 }catch(error){
  console.error("MYKIOO invitation mail transport error",error instanceof Error?error.name:"unknown");
  return false;
 }
}

Deno.serve(async (request) => {
 const requestOrigin=request.headers.get("Origin")||"";
 const requestCors={...cors,"Access-Control-Allow-Origin":allowedOrigins.has(requestOrigin)?requestOrigin:origin};
 const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...requestCors,"Content-Type":"application/json","Cache-Control":"no-store"}});
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers:requestCors });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (!allowedOrigins.has(requestOrigin)) return reply({ error: "Origin not allowed" }, 403);
  const bearer = request.headers.get("Authorization") || "";

  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return reply({ error: "Server configuration unavailable" }, 503);
  const server = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const input = await request.json();
    if (!input || typeof input !== "object") return reply({ error: "Invalid request" }, 400);
    // The random, hashed invitation secret authenticates this one operation.
    // Auth tokens are generated only when the invitee deliberately accepts.
    if(input.action==="accept_invitation"){
      if(typeof input.token!=="string"||!/^[a-f0-9]{64}$/.test(input.token))
        return reply({error:"Invalid invitation"},400);
      const now=new Date().toISOString();
      const {data:invitation,error:lookupError}=await server.from("mykioo_invitations")
        .select("id,email,accepted_by,accepted_at,status,expires_at")
        .eq("token_hash",await hashInvitationToken(input.token)).eq("managed_link",true).maybeSingle();
      if(lookupError)return reply({error:"Invitation service unavailable"},503);
      if(!invitation||invitation.status==="revoked"||invitation.accepted_at||invitation.expires_at<=now)
        return reply({error:"Invitation expired or already used"},410);
      const {data:profile}=await server.from("mykioo_members").select("status,email")
        .eq("user_id",invitation.accepted_by).maybeSingle();
      if(!profile||!["pending","approved"].includes(profile.status)||profile.email.toLowerCase()!==invitation.email.toLowerCase())
        return reply({error:"Invitation unavailable"},410);
      // Serialize exchanges so repeated taps cannot invalidate a token in flight.
      const {data:locked,error:lockError}=await server.from("mykioo_invitations")
        .update({exchange_started_at:now}).eq("id",invitation.id).is("accepted_at",null)
        .or("exchange_started_at.is.null,exchange_started_at.lt."+new Date(Date.now()-60000).toISOString())
        .select("id").maybeSingle();
      if(lockError)return reply({error:"Invitation service unavailable"},503);
      if(!locked)return reply({error:"Please wait one minute before trying again"},429);
      const {data:generated,error:generateError}=await server.auth.admin.generateLink({type:"recovery",email:invitation.email});
      const token=extractVerificationToken(generated?.properties,"recovery");
      if(generateError||!token){
        await server.from("mykioo_invitations").update({exchange_started_at:null}).eq("id",invitation.id).eq("exchange_started_at",now);
        return reply({error:"Unable to prepare invitation. Please try again."},503);
      }
      return reply({token,type:"recovery"});
    }
    if (!bearer.startsWith("Bearer ")) return reply({ error: "Authentication required" }, 401);
    // Verify the current access token against Supabase Auth, then check a separate
    // DB-backed owner authorization. Never trust an email or role from the request.
    const { data: session, error: authError } = await server.auth.getUser(bearer.slice(7));
    if (authError || !session.user) return reply({ error: "Session expired. Sign in again." }, 401);
    const actor = session.user;
    const { data: member, error: memberError } = await server.from("mykioo_members")
      .select("user_id,role,status,display_name,email").eq("user_id", actor.id).maybeSingle();
    if (memberError || !member || member.status !== "approved" || !["owner","member"].includes(member.role)) {
      return reply({ error: "An approved membership is required" }, 403);
    }
    const owner = member.role==="owner" && actor.app_metadata?.mykioo_role==="owner";
    const action = input.action;

    const validUUID=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
    const emailFor=(value:unknown)=>validEmail(value)?value.trim().toLowerCase():"";
    // Read the inviter's own MYKIOO display name, not a name supplied by the recipient.
    // Do not disclose the inviter's private email address in the invitation.
    const inviterDetails=async(id:string)=>{
      const {data:profile,error:profileError}=id===actor.id?
        {data:member,error:null}:
        await server.from("mykioo_members").select("display_name,role").eq("user_id",id).maybeSingle();
      if(profileError)console.error("MYKIOO inviter profile lookup failed",profileError.code);
      const inviterName=typeof profile?.display_name==="string"?profile.display_name.trim().slice(0,80):"";
      return {inviterName,inviterIsOwner:profile?.role==="owner"};
    };
    if(action==="test_email_templates"){
      if(!owner)return reply({error:"Owner permission required"},403);
      // Dedicated test, intentionally never creates invitations, subscriptions or real credentials.
      const recipient="ancmarx@gmail.com";
      const {data:testMember,error:testError}=await server.from("mykioo_members")
       .select("user_id,email,status").ilike("email",recipient).maybeSingle();
      if(testError||!testMember||testMember.status!=="approved")return reply({error:"Test recipient must be an existing approved member"},409);
      const lang=input.language==="fr"?"fr":"en";
      const invitation=makeInvitationEmail({language:lang,actionLink:"https://mykioo.icu/",inviterName:"MYKIOO",inviterIsOwner:true});
      const mark=(content:string)=>'<div style="background:#47304d;padding:14px;color:#fff;font:bold 16px Arial;text-align:center">TEST ONLY — EMAIL PREVIEW — NO LIVE INVITATION OR ACCOUNT</div>'+content;
      const invitationSent=await sendInviteEmail(recipient,"[TEST / ESSAI] "+invitation.subject,mark(invitation.htmlContent),"[TEST ONLY — No working invitation link]\n\n"+invitation.textContent);
      const fr=lang==="fr";
      const title=fr?"Votre commande est terminée":"Your order is complete";
      const sample=fr?
       ["Ce courriel est un essai. Ces identifiants ne sont pas réels.","Nom d’utilisateur : DEMO-USER","Mot de passe : DEMO-PASSWORD-NOT-VALID","Adresse du serveur : https://example.invalid"]:
       ["This is a test message. These credentials are not real.","Username: DEMO-USER","Password: DEMO-PASSWORD-NOT-VALID","Host URL: https://example.invalid"];
      const escape=(v:string)=>v.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
      const html='<!doctype html><html lang="'+lang+'"><body style="background:#090b13;padding:24px;font-family:Arial,sans-serif;color:#f5ecf7"><table style="max-width:560px;margin:auto;width:100%;background:#171422;border:1px solid #574563;border-top:3px solid #dab77c;border-radius:16px"><tr><td style="padding:28px"><img src="https://mykioo.pages.dev/MYKIOO-Email-Logo.png" width="90" alt="MYKIOO"/><h1 style="color:#e6c38d">'+escape(title)+'</h1><p style="font-size:16px;color:#ffe5a3">TEST ONLY / ESSAI SEULEMENT — NO LIVE SUBSCRIPTION</p>'+sample.map(x=>'<p style="padding:8px;background:#211b2d">'+escape(x)+'</p>').join('')+'<p><a href="https://mykioo.icu" style="color:#e6c38d">MYKIOO</a></p></td></tr></table></body></html>';
      const credentialsSent=await sendInviteEmail(recipient,"[TEST / ESSAI] MYKIOO | "+title,html,"TEST ONLY — No live subscription\n\n"+title+"\n\n"+sample.join("\n"));
      await server.from("mykioo_audit_logs").insert({actor_id:actor.id,action:"owner_email_template_test",entity_type:"member",entity_id:testMember.user_id,details:{recipient,invitationAccepted:invitationSent,credentialsAccepted:credentialsSent,sampleOnly:true}});
      return reply({ok:invitationSent&&credentialsSent,invitationAccepted:invitationSent,credentialsAccepted:credentialsSent,recipient,message:invitationSent&&credentialsSent?"SMTP accepted both test templates. Check Inbox and Spam; delivery is not guaranteed.":"One or both email tests failed. Check the SMTP provider and logs."},invitationSent&&credentialsSent?200:503);
    }
    if(action==="request_invite"){
      if(member.role!=="member")return reply({error:"Member access required"},403);
      const email=emailFor(input.email);
      if(!email)return reply({error:"Enter a valid email address"},400);
      if(email===String(actor.email||"").toLowerCase())return reply({error:"You cannot invite yourself"},400);
      const {data:exists,error:existsError}=await server.from("mykioo_members").select("user_id").ilike("email",email).limit(1);
      if(existsError)return reply({error:"Unable to check invitations"},503);
      if(exists?.length)return reply({error:"This address is already registered or invited"},409);
      const {data:existingRequest,error:pendingError}=await server.from("mykioo_invitation_requests").select("id").eq("email",email).eq("status","pending").limit(1);
      if(pendingError)return reply({error:"Unable to verify invitation requests"},503);
      if(existingRequest?.length)return reply({error:"An invitation for this address is already awaiting approval"},409);
      const {count,error:countError}=await server.from("mykioo_invitation_requests")
        .select("id",{count:"exact",head:true}).eq("requested_by",actor.id)
        .gte("created_at",new Date(Date.now()-86400000).toISOString());
      if(countError)return reply({error:"Unable to check invitation limits"},503);
      if((count||0)>=10)return reply({error:"Daily invitation request limit reached (10 per 24 hours)"},429);
      const language=input.language==="fr"?"fr":"en";
      const {data:requested,error:requestError}=await server.from("mykioo_invitation_requests")
        .insert({email,requested_by:actor.id,language,status:"pending"})
        .select("id,email,status,created_at").single();
      if(requestError)return reply({error:requestError.code==="23505"?
        "An invitation for this address is already awaiting approval":"Could not submit invitation request"},requestError.code==="23505"?409:500);
      const {data:owners}=await server.from("mykioo_members").select("user_id").eq("role","owner").eq("status","approved");
      if(owners?.length){
        const inviter=member.display_name||member.email||"A member";
        await server.from("mykioo_notifications").upsert(owners.map(o=>({
          user_id:o.user_id,kind:"membership_invitation_requested",source_id:requested.id,destination:"invitations",
          title_en:"Member invitation needs approval",title_fr:"Invitation à approuver",
          body_en:inviter+" requested to invite "+email+".",body_fr:inviter+" souhaite inviter "+email+"."
        })),{onConflict:"user_id,kind,source_id"});
      }
      await server.from("mykioo_audit_logs").insert({
        actor_id:actor.id,action:"member_invitation_requested",entity_type:"invitation_request",
        entity_id:requested.id,details:{email}
      });
      return reply({ok:true,request:requested,message:"Invitation request submitted for owner approval. No email was sent yet."});
    }
    if(!owner)return reply({error:"Owner permission required"},403);
    if(action==="resend_invite_setup"){
      // An already-invited Supabase Auth user cannot be invited a second time.
      // Send a one-time recovery/setup link through MYKIOO's IONOS mailbox.
      let invitationId=input.invitation_id;
      if(!validUUID(invitationId)&&validUUID(input.request_id)){
        const {data:referral}=await server.from("mykioo_invitation_requests").select("invitation_id")
          .eq("id",input.request_id).eq("status","approved").maybeSingle();
        invitationId=referral?.invitation_id;
      }
      if(!validUUID(invitationId))return reply({error:"Select an invitation"},400);
      const {data:invitation,error:invitationError}=await server.from("mykioo_invitations")
        .select("id,email,status,accepted_by,invited_by").eq("id",invitationId).maybeSingle();
      if(invitationError||!invitation||invitation.status==="revoked"||!invitation.accepted_by)
        return reply({error:"Invitation unavailable"},404);
      const requestRow={id:invitation.id,email:invitation.email,invited_user_id:invitation.accepted_by,requested_by:invitation.invited_by};
      const {data:invitedMember,error:memberLookupError}=await server.from("mykioo_members")
        .select("user_id,email,status,invited_by,display_name,preferred_language").eq("user_id",requestRow.invited_user_id).maybeSingle();
      if(memberLookupError||!invitedMember||invitedMember.email.toLowerCase()!==requestRow.email.toLowerCase()
         ||!["pending","approved"].includes(invitedMember.status))
        return reply({error:"Invitation account needs owner review before resending"},409);
      const {data:authUser,error:authLookupError}=await server.auth.admin.getUserById(requestRow.invited_user_id);
      if(authLookupError||!authUser?.user||authUser.user.email?.toLowerCase()!==requestRow.email.toLowerCase())
        return reply({error:"Unable to verify invited account"},409);
      if(authUser.user.email_confirmed_at&&invitedMember.display_name?.trim())
        return reply({error:"Account setup is already complete. The member can use Forgot password."},409);
      // Owner can issue a link while email-provider delivery is unavailable.
      // Prevent repeated one-time link generation from flooding a recipient.
      const {count,error:countError}=await server.from("mykioo_audit_logs")
        .select("id",{count:"exact",head:true}).in("action",["member_invite_setup_email_accepted","member_invite_setup_link_generated"])
        .eq("entity_type","member").eq("entity_id",requestRow.invited_user_id)
        .gte("created_at",new Date(Date.now()-24*60*60*1000).toISOString());
      if(countError)return reply({error:"Unable to check resend limits"},503);
      if((count||0)>=3)return reply({error:"A maximum of three setup links can be generated for this account in 24 hours"},429);
      const language=invitedMember.preferred_language==="fr"?"fr":"en";
      // The owner will send the 48-hour link from their email account.
      const {actionLink,...linkRecord}=await newInvitationLink(origin);
      const {error:trackingError}=await server.from("mykioo_invitations")
        .update({...linkRecord,status:"pending",accepted_at:null}).eq("id",invitation.id);
      if(trackingError)return reply({error:"Could not prepare invitation tracking"},503);
      const inviter=await inviterDetails(requestRow.requested_by||invitedMember.invited_by||actor.id);
      const {subject,htmlContent,textContent}=makeInvitationEmail({
        language,actionLink,resend:true,...inviter
      });
      const accepted=await sendInviteEmail(requestRow.email,subject,htmlContent,textContent);
      await server.from("mykioo_audit_logs").insert({
        actor_id:actor.id,action:accepted?"member_invite_setup_email_accepted":"member_invite_setup_link_generated",
        entity_type:"member",entity_id:requestRow.invited_user_id,
        details:{request_id:requestRow.id,channel:accepted?"ionos":"manual",language}
      });
      return reply({ok:true,notification:accepted?"accepted":"manual",
        ...(accepted?{}:{delivery:{to:requestRow.email,link:actionLink,subject,body:textContent}}),
        message:accepted?"IONOS accepted the new invitation email. Ask the recipient to check Inbox and Spam.":
         "IONOS could not send the invitation. Copy and email the prepared private link manually."});
    }
    let reviewRequest:null|{id:string;email:string;requested_by:string;language:string;status:string}=null;
    let agentReviewRequestId:string|null=null;
    let agentReviewType:"member"|"customer"|null=null;
    if(action==="review_agent_invite"){
      if(!owner)return reply({error:"Owner permission required"},403);
      if(!validUUID(input.request_id)||!["approve","reject"].includes(input.decision))
        return reply({error:"Choose a valid agent invitation and decision"},400);
      const {data:pending,error:pendingError}=await server.from("mykioo_agent_invitation_requests")
        .select("id,agent_user_id,invitee_email,invitation_type,status").eq("id",input.request_id).maybeSingle();
      if(pendingError||!pending)return reply({error:"Agent invitation request not found"},404);
      if(pending.status!=="pending")return reply({error:"This agent invitation has already been reviewed"},409);
      if(input.decision==="reject"){
        const {data:rejected,error:rejectError}=await server.from("mykioo_agent_invitation_requests")
          .update({status:"declined",updated_at:new Date().toISOString()})
          .eq("id",pending.id).eq("status","pending").select("id").maybeSingle();
        if(rejectError||!rejected)return reply({error:"Agent invitation was already reviewed. Refresh and retry."},409);
        await server.from("mykioo_notifications").upsert({
          user_id:pending.agent_user_id,kind:"membership_invitation_rejected",source_id:pending.id,destination:"Invitations",
          title_en:"Agent invitation declined",title_fr:"Invitation de l’agent refusée",
          body_en:"Your invitation request for "+pending.invitee_email+" was declined.",
          body_fr:"Votre demande d’invitation pour "+pending.invitee_email+" a été refusée."
        },{onConflict:"user_id,kind,source_id"});
        await server.from("mykioo_audit_logs").insert({actor_id:actor.id,action:"agent_invitation_declined",
          entity_type:"agent_invitation_request",entity_id:pending.id,details:{email:pending.invitee_email,agent_user_id:pending.agent_user_id}});
        return reply({ok:true,message:"Agent invitation declined. No email was sent."});
      }
      agentReviewRequestId=pending.id;
      agentReviewType=pending.invitation_type==="customer"?"customer":"member";
      reviewRequest={id:pending.id,email:pending.invitee_email,requested_by:pending.agent_user_id,language:input.language==="fr"?"fr":"en",status:"pending"};
    }

    if(action==="review_invite"){
      if(!validUUID(input.request_id)||!["approve","reject"].includes(input.decision))
        return reply({error:"Choose a valid invitation and decision"},400);
      const {data:pending,error:pendingError}=await server.from("mykioo_invitation_requests")
        .select("id,email,requested_by,language,status").eq("id",input.request_id).maybeSingle();
      if(pendingError||!pending)return reply({error:"Invitation request not found"},404);
      if(pending.status!=="pending")return reply({error:"This invitation has already been reviewed"},409);
      reviewRequest=pending;
      if(input.decision==="reject"){
        const {data:rejected,error:rejectError}=await server.from("mykioo_invitation_requests")
          .update({status:"rejected",reviewed_by:actor.id,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()})
          .eq("id",pending.id).eq("status","pending").select("id").maybeSingle();
        if(rejectError||!rejected)return reply({error:"Invitation was already reviewed. Refresh and retry."},409);
        await server.from("mykioo_notifications").upsert({
          user_id:pending.requested_by,kind:"membership_invitation_rejected",source_id:pending.id,destination:"Invitations",
          title_en:"Invitation request declined",title_fr:"Demande d’invitation refusée",
          body_en:"Your invitation request for "+pending.email+" was declined.",body_fr:"Votre demande d’invitation pour "+pending.email+" a été refusée."
        },{onConflict:"user_id,kind,source_id"});
        await server.from("mykioo_audit_logs").insert({
          actor_id:actor.id,action:"member_invitation_rejected",entity_type:"invitation_request",entity_id:pending.id,details:{email:pending.email,requested_by:pending.requested_by}
        });
        return reply({ok:true,message:"Invitation request rejected. No email was sent."});
      }
    }
    if (action === "invite" || action === "review_invite" || action === "review_agent_invite") {
      if(action==="invite"&&!validEmail(input.email))return reply({error:"Enter a valid email address"},400);
      const email=reviewRequest?reviewRequest.email:String(input.email).trim().toLowerCase();
      const language=reviewRequest?.language||(input.language==="fr"?"fr":"en");
      const {data:pendingReferral}=reviewRequest?{data:reviewRequest}:await server.from("mykioo_invitation_requests")
        .select("id,email,requested_by,language,status").eq("email",email).eq("status","pending").maybeSingle();
      const inviterId=pendingReferral?.requested_by||actor.id;
      const { data: existing } = await server.from("mykioo_members").select("user_id").ilike("email", email).maybeSingle();
      if (existing) return reply({ error: "This email already has a MYKIOO membership." }, 409);
      // The existing private invitation link is supplied to the owner if IONOS cannot send it.
      const {data:invited,error:inviteError}=await server.auth.admin.generateLink({
        type:"invite",email,options:{redirectTo:origin+"/?invite=1"}
      });
      if(inviteError||!invited?.user?.id)
        return reply({error:inviteError?.message||"Unable to create a secure invitation link."},409);
      const token=extractVerificationToken(invited.properties,"invite");
      if(!token){
        // Only log the non-secret response shape for troubleshooting, never the token or action link.
        console.error("MYKIOO invitation: unable to extract verification token",{
          hasActionLink:typeof invited.properties?.action_link==="string",
          tokenLength:typeof invited.properties?.hashed_token==="string"?invited.properties.hashed_token.length:0,
          verificationType:invited.properties?.verification_type||null
        });
        const {error:cleanupError}=await server.auth.admin.deleteUser(invited.user.id);
        if(cleanupError)console.error("MYKIOO missing invitation token cleanup failed",invited.user.id);
        return reply({error:cleanupError?
          "Unable to prepare invitation link; account cleanup needs attention.":
          "Unable to prepare invitation link. No email was sent and no account remains."},503);
      }
      const uid=invited.user.id;
      const {actionLink,...linkRecord}=await newInvitationLink(origin);
      const { error: memberError } = await server.from("mykioo_members").insert({
        user_id: uid, email, status: "pending", role: "member", invited_by: inviterId, preferred_language: language
      });
      if(memberError){
        const {error:cleanupError}=await server.auth.admin.deleteUser(uid);
        if(cleanupError)console.error("MYKIOO invite cleanup failed",uid);
        return reply({error:cleanupError?
          "Account creation failed and cleanup needs owner attention. No email was sent.":
          "Account creation failed. Nothing was emailed; please retry."},500);
      }
      // Only explicitly marked customer invitations create an agent-customer assignment.
      // An agent can also recommend regular MYKIOO members who keep the standard retail portal.
      if(agentReviewRequestId && agentReviewType==="customer"){
        const {data:activeAgent,error:agentError}=await server.from("mykioo_agent_accounts")
          .select("agent_user_id,status").eq("agent_user_id",inviterId).maybeSingle();
        if(agentError||activeAgent?.status!=="active"){
          await server.from("mykioo_members").delete().eq("user_id",uid).eq("status","pending");
          await server.auth.admin.deleteUser(uid);
          return reply({error:"The requesting agent is not active. No invitation was sent."},409);
        }
        const {error:assignmentError}=await server.from("mykioo_agent_customers")
          .insert({customer_user_id:uid,agent_user_id:inviterId,assigned_by:actor.id});
        if(assignmentError){
          await server.from("mykioo_members").delete().eq("user_id",uid).eq("status","pending");
          const {error:cleanupError}=await server.auth.admin.deleteUser(uid);
          if(cleanupError)console.error("Agent invite assignment cleanup needs attention",uid);
          return reply({error:"Unable to link the invited member to the agent. No invitation was sent."},503);
        }
      }
      const {data:inviteLog,error:logError}=await server.from("mykioo_invitations").insert({
        email,...linkRecord,status:"pending",invited_by:inviterId,accepted_by:uid
      }).select("id").single();
      if(logError||!inviteLog){
        await server.from("mykioo_members").delete().eq("user_id",uid).eq("status","pending");
        const {error:cleanupError}=await server.auth.admin.deleteUser(uid);
        if(cleanupError)console.error("MYKIOO invite tracking cleanup failed",uid);
        return reply({error:"Could not track the new account. No email was sent. Please retry or contact support if the address remains registered."},500);
      }
      // Preserve the 48-hour managed invitation used by MYKIOO's acceptance screen.
      const inviter=await inviterDetails(inviterId);
      const {subject,htmlContent,textContent}=makeInvitationEmail({language,actionLink,...inviter});
      const accepted=await sendInviteEmail(email,subject,htmlContent,textContent);
      if(pendingReferral){
        const {error:finalizeError}=agentReviewRequestId
          ? await server.from("mykioo_agent_invitation_requests")
            .update({status:"sent",updated_at:new Date().toISOString()})
            .eq("id",agentReviewRequestId).eq("status","pending")
          : await server.from("mykioo_invitation_requests")
            .update({status:"approved",reviewed_by:actor.id,reviewed_at:new Date().toISOString(),
              updated_at:new Date().toISOString(),invited_user_id:uid,invitation_id:inviteLog?.id||null})
            .eq("id",pendingReferral.id).eq("status","pending");
        if(finalizeError)console.error("MYKIOO referral linking failed",finalizeError.code);
        await server.from("mykioo_notifications").upsert({
          user_id:inviterId,kind:"membership_invitation_approved",source_id:pendingReferral.id,destination:"Invitations",
          title_en:"Your invitation was approved",title_fr:"Votre invitation a été approuvée",
          body_en:"MYKIOO has issued an invitation for "+email+".",body_fr:"MYKIOO a préparé une invitation pour "+email+"."
        },{onConflict:"user_id,kind,source_id"});
      }
      await server.from("mykioo_audit_logs").insert({actor_id:actor.id,action:agentReviewRequestId?"agent_customer_invited":"member_invited",
        entity_type:"member",entity_id:uid,details:{email,language,invited_by:inviterId,invitation_type:agentReviewType,review_request_id:pendingReferral?.id||null,email_provider:accepted?"ionos":"manual"}});
      return reply({ok:true,member_id:uid,invitation_id:inviteLog.id,notification:accepted?"accepted":"manual",
        ...(accepted?{}:{delivery:{to:email,link:actionLink,subject,body:textContent}}),
        message:accepted?"Invitation approved; IONOS accepted the email. Ask the recipient to check Inbox and Spam.":
        "Invitation link ready, but IONOS could not send it. Copy and send the prepared email yourself."});
    }
    if (action === "set_status") {
      const id = input.member_id;
      const status = input.status;
      if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) return reply({ error: "Invalid member ID" }, 400);
      if (!["approved", "rejected", "suspended", "deactivated"].includes(status)) return reply({ error: "Invalid status" }, 400);
      const { data: target, error: targetError } = await server.from("mykioo_members")
        .select("user_id,email,display_name,preferred_language,role,status").eq("user_id", id).maybeSingle();
      if (targetError || !target) return reply({ error: "Member not found" }, 404);
      if (target.role !== "member" || id === actor.id) return reply({ error: "Owner and administrator accounts cannot be changed here." }, 403);
      if (target.status === status) return reply({ ok:true, message:"Member status is already up to date.", notification:"unchanged" });
      const { error: updateError } = await server.from("mykioo_members").update({
        status, approved_at: status === "approved" ? new Date().toISOString() : null, updated_at: new Date().toISOString()
      }).eq("user_id", id).eq("role", "member");
      if (updateError) return reply({ error: "Unable to update member." }, 500);
      await server.from("mykioo_membership_history").insert({
        member_id: id, admin_id: actor.id, action: "status_changed", old_status: target.status, new_status: status
      });
      await server.from("mykioo_audit_logs").insert({
        actor_id: actor.id, action: "member_status_changed", entity_type: "member", entity_id: id,
        details: { previous_status: target.status, status }
      });
      // Send only after a successful membership update via the IONOS dispatcher.
      // The service role key is a Supabase Edge Function secret, never shipped to a browser.
      let notification = "not_applicable";
      if (status === "approved" || status === "rejected") {
        const mailerKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
        if (!mailerKey) {
          notification = "not_configured";
        } else {
          const language = target.preferred_language === "fr" ? "fr" : "en";
          const templateId = status === "approved" ? (language === "fr" ? 2 : 1) : (language === "fr" ? 4 : 3);
          try {
            const emailResponse = await fetch(((Deno.env.get("SUPABASE_URL")||"")+"/functions/v1/mykioo-email-dispatch?route=email"), {
              method: "POST",
              headers: { "api-key": mailerKey, "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify({
                to: [{email:target.email, name:target.display_name || target.email.split("@")[0]}],
                templateId,
                params: { NAME:target.display_name || target.email.split("@")[0] },
                tags: ["mykioo", "membership"]
              })
            });
            const emailData = await emailResponse.json().catch(()=>({}));
            notification = emailResponse.ok && emailData.messageId && emailData.provider==="ionos" ? "accepted" : "failed";
            if(notification==="failed")console.error("MYKIOO IONOS mail failed",emailResponse.status);
          } catch (err) {
            notification = "failed";
            console.error("MYKIOO IONOS mail error",err instanceof Error?err.message:"unknown");
          }
        }
        await server.from("mykioo_audit_logs").insert({
          actor_id:actor.id,
          action:"membership_email_"+notification,
          entity_type:"member",
          entity_id:id,
          details:{status,notification,language:target.preferred_language==="fr"?"fr":"en"}
        });
      }
      return reply({ok:true,message:"Member status updated.",notification});
    }
    return reply({ error: "Unknown action" }, 400);
  } catch (e) {
    console.error("MYKIOO admin action error", e instanceof Error ? e.message : "unknown");
    return reply({ error: "Administration request failed." }, 500);
  }
});
