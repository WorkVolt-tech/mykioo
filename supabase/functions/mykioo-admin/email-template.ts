// MYKIOO transactional invitation emails.
// Table-based, inline styles for Gmail, Outlook and mobile mail clients.
// Reuses MYKIOO's existing PNG logo, intentionally not embedding secret tokens in tracking URLs.
type InvitationEmailOptions={
 language:"en"|"fr";
 actionLink:string;
 resend?:boolean;
 inviterName?:string;
 inviterIsOwner?:boolean;
};
function htmlEscape(value:string){
 return value.replace(/[&<>"']/g,(ch)=>({
  "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"
 }[ch]||ch));
}
export function makeInvitationEmail({language,actionLink,resend=false,inviterName,inviterIsOwner=false}:InvitationEmailOptions){
 const fr=language==="fr";
 const title=fr?
  (resend?"Votre invitation vous attend":"Vous êtes invité(e)"):
  (resend?"Your invitation is waiting":"You're invited");
 const eyebrow=fr?"INVITATION PRIVÉE":"PRIVATE INVITATION";
 // Display the referring member's public profile name, never their email.
 const name=typeof inviterName==="string"?inviterName.trim().slice(0,80):"";
 const inviter=name||(inviterIsOwner?"MYKIOO":(fr?"un membre MYKIOO":"a MYKIOO member"));
 const inviterLine=fr?"Invité(e) par "+inviter:"Invited by "+inviter;
 const subtitle=fr?
  (resend?"Votre lien d’invitation a été renouvelé. Reprenez votre inscription à MYKIOO.":"Bienvenue dans MYKIOO, votre espace de divertissement privé. Votre invitation est prête."):
  (resend?"We've renewed your invitation link. Continue setting up your MYKIOO account.":"Welcome to MYKIOO, your private entertainment experience. Your invitation is ready.");
 const cta=fr?"ACCEPTER MON INVITATION":"ACCEPT MY INVITATION";
 const stepsTitle=fr?"ET ENSUITE ?":"WHAT HAPPENS NEXT?";
 const steps=fr?[
  ["01","Acceptez votre invitation","Ouvrez votre lien privé et confirmez l’accès."],
  ["02","Créez votre compte","Choisissez votre nom d’affichage et votre mot de passe."],
  ["03","Attendez l’approbation","Le propriétaire doit approuver votre adhésion avant l’accès à votre espace membre."]
 ]:[
  ["01","Accept your invitation","Open your private link to confirm your invitation."],
  ["02","Create your account","Choose your display name and a password."],
  ["03","Wait for approval","The owner approves your membership before your private dashboard is unlocked."]
 ];
 const finePrint=fr?
  "Ce lien est personnel et expire automatiquement. Ne le partagez pas. Si vous n’avez pas demandé cet accès, ignorez ce courriel.":
  "This personal link expires automatically. Do not share it. If you weren't expecting this invitation, you can ignore this email.";
 const linkHelp=fr?"Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :":"If the button doesn't work, copy this link into your browser:";
 const footer=fr?"UNE EXPÉRIENCE PRIVÉE, SUR INVITATION UNIQUEMENT":"A PRIVATE EXPERIENCE, BY INVITATION ONLY";
 const subject=fr?(resend?"MYKIOO | Votre invitation vous attend":"MYKIOO | Vous êtes invité(e)"):
  (resend?"MYKIOO | Your invitation is waiting":"MYKIOO | You're invited");
 const safeLink=htmlEscape(actionLink);
 const stepsRows=steps.map(([number,name,description],i)=>`
 <tr><td style="padding:0 0 ${i===2?0:17}px 0;vertical-align:top;width:46px">
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;color:#e8cb99;border:1px solid #6b536c;background:#33283b;border-radius:9px;text-align:center;padding:10px 0;width:34px">${number}</div>
 </td><td style="padding:0 0 ${i===2?0:17}px 0;vertical-align:top">
  <div style="font-family:Arial,Helvetica,sans-serif;font-weight:700;font-size:14px;line-height:20px;color:#f7edf9">${htmlEscape(name)}</div>
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;color:#c5b7ce;padding-top:4px">${htmlEscape(description)}</div>
 </td></tr>`).join("");
 const htmlContent=`<!doctype html>
<html lang="${fr?"fr":"en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${htmlEscape(subject)}</title></head>
<body style="margin:0;padding:0;background:#090b13;color:#f5ecf7">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;background:#090b13;border-collapse:collapse">
<tr><td align="center" style="padding:32px 14px 38px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="width:100%;max-width:560px;border-collapse:separate;border-spacing:0">
 <tr><td align="center" style="padding:0 0 22px">
  <img src="https://mykioo.pages.dev/MYKIOO-Email-Logo.png" alt="MYKIOO" width="102" height="102" style="display:block;width:102px;height:102px;max-width:102px;border:0;outline:0;text-decoration:none">
  <div style="font-family:Arial,Helvetica,sans-serif;color:#c8b4d2;font-size:10px;line-height:18px;letter-spacing:3px;font-weight:700;padding-top:4px">MYKIOO TV</div>
 </td></tr>
 <tr><td style="border:1px solid #574563;border-top:3px solid #dab77c;background:#171422;border-radius:17px;overflow:hidden">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
   <tr><td align="center" style="padding:35px 28px 12px">
    <span style="display:inline-block;padding:8px 14px;border:1px solid #6b5275;border-radius:20px;background:#2b2237;color:#e8c889;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:700;letter-spacing:2px;line-height:14px">${eyebrow}</span>
    <h1 style="font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:39px;letter-spacing:-1px;color:#fff7fc;margin:23px 0 12px;font-weight:700">${htmlEscape(title)}</h1>
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:25px;color:#d1c4d8;margin:0;max-width:440px">${htmlEscape(subtitle)}</p>
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:21px;color:#eacb91;margin:17px 0 0;font-weight:700">${htmlEscape(inviterLine)}</p>
   </td></tr>
   <tr><td align="center" style="padding:25px 25px 29px">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr><td align="center" bgcolor="#e6c38d" style="background:#e6c38d;border-radius:10px">
      <a href="${safeLink}" style="display:inline-block;background:#e6c38d;border:1px solid #e6c38d;border-radius:10px;padding:17px 26px;color:#271d2b;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:18px;letter-spacing:1px;font-weight:800">${cta} &nbsp; &#8594;</a>
    </td></tr></table>
   </td></tr>
   <tr><td style="padding:0 24px">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;border:1px solid #443850;border-radius:12px;background:#211b2d">
     <tr><td style="padding:24px 22px">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:17px;color:#e2bd82;font-weight:800;letter-spacing:2px;padding-bottom:20px">${stepsTitle}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">${stepsRows}</table>
     </td></tr>
    </table>
   </td></tr>
   <tr><td style="padding:28px 28px 33px;text-align:left">
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:20px;color:#b5a7c1;margin:0 0 10px">${linkHelp}</p>
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:20px;margin:0;word-break:break-all">
     <a href="${safeLink}" style="color:#e2c18d;text-decoration:underline">${safeLink}</a>
    </p>
    <p style="font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:20px;color:#a99db6;margin:20px 0 0">${finePrint}</p>
   </td></tr>
  </table>
 </td></tr>
 <tr><td align="center" style="padding:24px 15px 0">
  <div style="font-family:Arial,Helvetica,sans-serif;font-weight:800;font-size:11px;letter-spacing:3px;color:#dfbc81">MYKIOO</div>
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:9px;line-height:18px;letter-spacing:1.5px;color:#9990a9;padding-top:7px">${footer}</div>
  <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;padding-top:9px"><a href="https://mykioo.pages.dev/" style="color:#bd9ed0;text-decoration:none">mykioo.pages.dev</a></div>
 </td></tr>
</table>
</td></tr>
</table></body></html>`;
 const textContent=fr?
 `${title}\n\n${subtitle}\n\n${inviterLine}\n\n${cta}: ${actionLink}\n\nET ENSUITE ?\n1. Acceptez votre invitation.\n2. Créez votre compte : choisissez un nom et un mot de passe.\n3. Attendez l’approbation du propriétaire avant d’accéder à l’espace membre.\n\n${finePrint}\n\nMYKIOO | https://mykioo.pages.dev/`:
 `${title}\n\n${subtitle}\n\n${inviterLine}\n\n${cta}: ${actionLink}\n\nWHAT HAPPENS NEXT?\n1. Accept your invitation.\n2. Create your account: choose your name and password.\n3. Wait for owner approval before entering the member dashboard.\n\n${finePrint}\n\nMYKIOO | https://mykioo.pages.dev/`;
 return {subject,htmlContent,textContent};
}
