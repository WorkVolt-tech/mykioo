import {makeInvitationEmail} from "./email-template.ts";
import { createClient } from "npm:@supabase/supabase-js@2.57.0";

const origin = "https://mykioo.pages.dev";
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
Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (request.method !== "POST") return reply({ error: "Method not allowed" }, 405);
  if (request.headers.get("Origin") !== origin) return reply({ error: "Origin not allowed" }, 403);
  const bearer = request.headers.get("Authorization") || "";
  if (!bearer.startsWith("Bearer ")) return reply({ error: "Authentication required" }, 401);
  const url = Deno.env.get("SUPABASE_URL");
  const secret = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !secret) return reply({ error: "Server configuration unavailable" }, 503);
  const server = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
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
    const input = await request.json();
    if (!input || typeof input !== "object") return reply({ error: "Invalid request" }, 400);
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
      // Send a one-time recovery/setup link using the existing user, via MYKIOO's verified Brevo sender.
      if(!validUUID(input.request_id))return reply({error:"Select an approved invitation"},400);
      const {data:requestRow,error:requestError}=await server.from("mykioo_invitation_requests")
        .select("id,email,status,language,invited_user_id,requested_by")
        .eq("id",input.request_id).maybeSingle();
      if(requestError||!requestRow)return reply({error:"Invitation not found"},404);
      if(requestRow.status!=="approved"||!requestRow.invited_user_id)
        return reply({error:"Only approved invitations can be resent"},409);
      const {data:invitedMember,error:memberLookupError}=await server.from("mykioo_members")
        .select("user_id,email,status,invited_by").eq("user_id",requestRow.invited_user_id).maybeSingle();
      if(memberLookupError||!invitedMember||invitedMember.email.toLowerCase()!==requestRow.email.toLowerCase()
         ||!["pending","approved"].includes(invitedMember.status))
        return reply({error:"Invitation account needs owner review before resending"},409);
      const {data:authUser,error:authLookupError}=await server.auth.admin.getUserById(requestRow.invited_user_id);
      if(authLookupError||!authUser?.user||authUser.user.email?.toLowerCase()!==requestRow.email.toLowerCase())
        return reply({error:"Unable to verify invited account"},409);
      if(authUser.user.email_confirmed_at||authUser.user.last_sign_in_at)
        return reply({error:"Account setup is already complete. The member can use Forgot password."},409);
      const brevoKey=Deno.env.get("BREVO_API_KEY");
      if(!brevoKey)return reply({error:"MYKIOO email service is not configured. Connect a verified Brevo sender."},503);
      // Prevent repeated one-time link generation from flooding a recipient.
      const {count,error:countError}=await server.from("mykioo_audit_logs")
        .select("id",{count:"exact",head:true}).eq("action","member_invite_setup_email_accepted")
        .eq("entity_type","member").eq("entity_id",requestRow.invited_user_id)
        .gte("created_at",new Date(Date.now()-24*60*60*1000).toISOString());
      if(countError)return reply({error:"Unable to check resend limits"},503);
      if((count||0)>=3)return reply({error:"This address has received the maximum of three setup emails in 24 hours"},429);
      const language=requestRow.language==="fr"?"fr":"en";
      const templateId=language==="fr"?2:1;
      let sender:{email:string;name:string};
      try{
        const templateResponse=await fetch("https://api.brevo.com/v3/smtp/templates/"+templateId,{
          headers:{"api-key":brevoKey,"Accept":"application/json"}
        });
        const template=await templateResponse.json().catch(()=>({}));
        if(!templateResponse.ok||!validEmail(template?.sender?.email))
          return reply({error:"The verified MYKIOO email sender is unavailable. Check Brevo transactional sender settings."},503);
        sender={email:template.sender.email,name:"MYKIOO"};
      }catch(_e){return reply({error:"Unable to check MYKIOO's email sender right now"},503)}
      const {data:linkData,error:linkError}=await server.auth.admin.generateLink({
        type:"recovery",email:requestRow.email,
        options:{redirectTo:origin+"/?reset_password=1"}
      });
      const setupToken=extractVerificationToken(linkData?.properties,"recovery");
      if(linkError||!setupToken){
        console.error("MYKIOO invite resend: unable to extract verification token",{
          errorCode:linkError?.code||null,
          hasActionLink:typeof linkData?.properties?.action_link==="string",
          tokenLength:typeof linkData?.properties?.hashed_token==="string"?linkData.properties.hashed_token.length:0
        });
        return reply({error:"Could not create a secure account-setup link"},503);
      }
      const actionLink=origin+"/?invite_token="+encodeURIComponent(setupToken)+"&invite_type=recovery";
      const inviter=await inviterDetails(requestRow.requested_by||invitedMember.invited_by||actor.id);
      const {subject,htmlContent:html,textContent}=makeInvitationEmail({
        language,actionLink,resend:true,...inviter
      });
      let mailResponse:Response;
      try{
        mailResponse=await fetch("https://api.brevo.com/v3/smtp/email",{
          method:"POST",headers:{"api-key":brevoKey,"Content-Type":"application/json","Accept":"application/json"},
          body:JSON.stringify({
            sender,to:[{email:requestRow.email}],subject,htmlContent:html,textContent,
            tags:["mykioo","invitation-setup"]
          })
        });
      }catch(_e){
        console.error("MYKIOO invite resend provider transport error");
        return reply({error:"Email provider could not be reached. Please try again."},503);
      }
      const mailData=await mailResponse.json().catch(()=>({}));
      if(!mailResponse.ok||!mailData.messageId){
        console.error("MYKIOO invite resend provider rejected request",mailResponse.status);
        return reply({error:"Email provider rejected the invitation. Check Brevo sender verification and email logs."},503);
      }
      await server.from("mykioo_audit_logs").insert({
        actor_id:actor.id,action:"member_invite_setup_email_accepted",
        entity_type:"member",entity_id:requestRow.invited_user_id,
        details:{request_id:requestRow.id,channel:"brevo",language}
      });
      // Brevo acceptance is not the same as final mailbox delivery.
      return reply({ok:true,notification:"accepted",message:"Account-setup email accepted by Brevo. Ask the recipient to check Inbox and Junk; delivery is not guaranteed."});
    }
    let reviewRequest:null|{id:string;email:string;requested_by:string;language:string;status:string}=null;
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
    if (action === "invite" || action === "review_invite") {
      if(action==="invite"&&!validEmail(input.email))return reply({error:"Enter a valid email address"},400);
      const email=reviewRequest?reviewRequest.email:String(input.email).trim().toLowerCase();
      const language=reviewRequest?.language||(input.language==="fr"?"fr":"en");
      const {data:pendingReferral}=reviewRequest?{data:reviewRequest}:await server.from("mykioo_invitation_requests")
        .select("id,email,requested_by,language,status").eq("email",email).eq("status","pending").maybeSingle();
      const inviterId=pendingReferral?.requested_by||actor.id;
      const { data: existing } = await server.from("mykioo_members").select("user_id").ilike("email", email).maybeSingle();
      if (existing) return reply({ error: "This email already has a MYKIOO membership." }, 409);
      // Verify a working MYKIOO Brevo sender before creating an Auth user.
      // Supabase generateLink creates the user and a secure one-time link without dispatching email.
      const brevoKey=Deno.env.get("BREVO_API_KEY");
      if(!brevoKey)return reply({error:"MYKIOO invitation mail is not configured. No account was created."},503);
      let sender:{name:string;email:string};
      try{
        const response=await fetch("https://api.brevo.com/v3/smtp/templates/"+(language==="fr"?2:1),{
          headers:{"api-key":brevoKey,"Accept":"application/json"}
        });
        const template=await response.json().catch(()=>({}));
        if(!response.ok||!validEmail(template?.sender?.email))
          return reply({error:"Brevo sender is unavailable. Check verified sender and transactional email access. No account was created."},503);
        sender={name:"MYKIOO",email:template.sender.email};
      }catch(_error){return reply({error:"Could not reach MYKIOO Brevo sender. No account was created."},503)}
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
      const uid=invited.user.id,actionLink=origin+"/?invite_token="+encodeURIComponent(token);
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
      // This hash is only an internal tracking identifier. The actual invite token
      // is created, sent and expired by Supabase Auth.
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      const tokenHash = Array.from(bytes).map(n => n.toString(16).padStart(2, "0")).join("");
      const {data:inviteLog,error:logError}=await server.from("mykioo_invitations").insert({
        email,token_hash:tokenHash,status:"pending",invited_by:inviterId,accepted_by:uid
      }).select("id").single();
      if(logError||!inviteLog){
        await server.from("mykioo_members").delete().eq("user_id",uid).eq("status","pending");
        const {error:cleanupError}=await server.auth.admin.deleteUser(uid);
        if(cleanupError)console.error("MYKIOO invite tracking cleanup failed",uid);
        return reply({error:"Could not track the new account. No email was sent. Please retry or contact support if the address remains registered."},500);
      }
      // Deliver a first-party acceptance URL. MYKIOO verifies the token only after
      // a deliberate click, avoiding accidental consumption by email link scanners.
      // Send with the existing Brevo provider.
      const inviter=await inviterDetails(inviterId);
      const {subject,htmlContent:html,textContent}=makeInvitationEmail({
        language,actionLink,...inviter
      });
      let emailOk=false,emailMessageId="";
      try{
        const response=await fetch("https://api.brevo.com/v3/smtp/email",{
          method:"POST",headers:{"api-key":brevoKey,"Content-Type":"application/json","Accept":"application/json"},
          body:JSON.stringify({sender,to:[{email}],subject,htmlContent:html,
            textContent,
            tags:["mykioo","account-invitation"]})
        });
        const result=await response.json().catch(()=>({}));
        emailOk=response.ok&&Boolean(result.messageId);
        if(emailOk)emailMessageId=String(result.messageId);
        if(!emailOk)console.error("MYKIOO invite rejected by Brevo",response.status);
      }catch(_error){console.error("MYKIOO invite Brevo connection failed")}
      if(!emailOk){
        await server.from("mykioo_invitations").delete().eq("id",inviteLog.id);
        await server.from("mykioo_members").delete().eq("user_id",uid).eq("status","pending");
        const {error:cleanupError}=await server.auth.admin.deleteUser(uid);
        if(cleanupError)console.error("MYKIOO invite provider-rejection cleanup failed",uid);
        return reply({error:cleanupError?
          "Brevo rejected the email and account cleanup needs attention before retrying.":
          "Brevo rejected the invitation email. No account remains; check the sender and retry."},503);
      }
      if(pendingReferral){
        const {error:finalizeError}=await server.from("mykioo_invitation_requests")
          .update({status:"approved",reviewed_by:actor.id,reviewed_at:new Date().toISOString(),
            updated_at:new Date().toISOString(),invited_user_id:uid,invitation_id:inviteLog?.id||null})
          .eq("id",pendingReferral.id).eq("status","pending");
        if(finalizeError)console.error("MYKIOO referral linking failed",finalizeError.code);
        await server.from("mykioo_notifications").upsert({
          user_id:inviterId,kind:"membership_invitation_approved",source_id:pendingReferral.id,destination:"Invitations",
          title_en:"Your invitation was approved",title_fr:"Votre invitation a été approuvée",
          body_en:"MYKIOO has issued an invitation for "+email+".",body_fr:"MYKIOO a envoyé une invitation pour "+email+"."
        },{onConflict:"user_id,kind,source_id"});
      }
      await server.from("mykioo_audit_logs").insert({actor_id:actor.id,action:"member_invited",
        entity_type:"member",entity_id:uid,details:{email,language,invited_by:inviterId,review_request_id:pendingReferral?.id||null,email_provider:"brevo",email_message_id:emailMessageId}});
      return reply({ok:true,member_id:uid,invitation_id:inviteLog.id,notification:"accepted",
        message:pendingReferral?"Invitation approved; Brevo accepted the setup email (inbox delivery not yet verified).":"Brevo accepted the account-setup email (delivery not yet verified)."});
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
      // Send only after a successful membership update. The Brevo API key is a
      // Supabase Edge Function secret, never shipped to a browser.
      let notification = "not_applicable";
      if (status === "approved" || status === "rejected") {
        const brevoKey = Deno.env.get("BREVO_API_KEY");
        if (!brevoKey) {
          notification = "not_configured";
        } else {
          const language = target.preferred_language === "fr" ? "fr" : "en";
          const templateId = status === "approved" ? (language === "fr" ? 2 : 1) : (language === "fr" ? 4 : 3);
          try {
            const emailResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
              method: "POST",
              headers: { "api-key": brevoKey, "Content-Type": "application/json", "Accept": "application/json" },
              body: JSON.stringify({
                to: [{email:target.email, name:target.display_name || target.email.split("@")[0]}],
                templateId,
                params: { NAME:target.display_name || target.email.split("@")[0] },
                tags: ["mykioo", "membership"]
              })
            });
            const emailData = await emailResponse.json().catch(()=>({}));
            notification = emailResponse.ok && emailData.messageId ? "accepted" : "failed";
            if(notification==="failed")console.error("MYKIOO Brevo mail failed",emailResponse.status);
          } catch (err) {
            notification = "failed";
            console.error("MYKIOO Brevo mail error",err instanceof Error?err.message:"unknown");
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
