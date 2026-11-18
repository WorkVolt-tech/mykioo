import nodemailer from "npm:nodemailer@10.5.0";

// Internal-only transactional mail gateway for MYKIOO.
// IONOS is the only transactional sender; credentials stay in private Supabase secrets.
const ionosAddress="iptv@mykioo.icu";
const senderName="MYKIOO";
const reply=(payload:unknown,status=200)=>new Response(JSON.stringify(payload),{
 status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}
});
const validAddress=(value:unknown):value is string=>typeof value==="string"&&value.length<=254&&
 /^[a-zA-Z0-9.!#$%&'*+/=?^`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)+$/.test(value);
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]||c));
const template=(id:number,params:Record<string,unknown>)=>{
 const fr=id===2||id===4,rejected=id===3||id===4;
 const name=typeof params?.NAME==="string"?params.NAME.slice(0,80):"";
 const title=rejected?(fr?"Votre demande d’adhésion n’a pas été approuvée":"Your membership request was not approved"):
  (fr?"Votre adhésion MYKIOO est approuvée":"Your MYKIOO membership is approved");
 const text=rejected?
  (fr?"Bonjour "+name+",\n\nVotre demande d’adhésion MYKIOO n’a pas été approuvée. Si vous avez des questions, contactez l’assistance depuis le site.":"Hello "+name+",\n\nYour MYKIOO membership request was not approved. If you have questions, please contact MYKIOO support."):
  (fr?"Bonjour "+name+",\n\nVotre adhésion MYKIOO est approuvée. Connectez-vous à votre espace membre pour continuer.":"Hello "+name+",\n\nYour MYKIOO membership has been approved. Sign in to your member dashboard to continue.");
 const html=`<!doctype html><html lang="${fr?"fr":"en"}"><body style="background:#101019;padding:24px;color:#f4edf5;font-family:Arial,sans-serif">
 <table role="presentation" style="max-width:560px;width:100%;margin:auto;background:#1b1727;border:1px solid #594963;border-top:3px solid #dfbd89;border-radius:14px"><tr><td style="padding:30px">
 <h1 style="color:#e6c58e;font-size:26px">MYKIOO</h1><h2 style="color:#fff;font-size:21px">${esc(title)}</h2>
 <p style="color:#f1e5ee;line-height:1.8;white-space:pre-wrap">${esc(text)}</p>
 <p><a style="color:#e4c58c" href="https://mykioo.icu/">${fr?"Ouvrir MYKIOO":"Open MYKIOO"}</a></p>
 </td></tr></table></body></html>`;
 return {subject:"MYKIOO | "+title,text,html};
};
Deno.serve(async request=>{
 if(request.method!=="POST"&&request.method!=="GET")return reply({error:"Method not allowed"},405);
 const expected=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!expected||request.headers.get("api-key")!==expected)return reply({error:"Unauthorized"},401);
 const url=new URL(request.url);
 if(request.method==="GET"&&url.searchParams.get("route")==="status"){
  const ready=Boolean(Deno.env.get("MYKIOO_IONOS_SMTP_PASSWORD")?.trim());
  return reply({ready,provider:ready?"ionos":null,sender:ionosAddress},ready?200:503);
 }
 if(request.method==="GET"&&url.searchParams.get("route")==="template"){
  const id=Number(url.searchParams.get("id"));
  if(![1,2,3,4].includes(id))return reply({error:"Template unavailable"},404);
  return reply({id,sender:{email:ionosAddress,name:senderName}});
 }
 if(request.method!=="POST"||url.searchParams.get("route")!=="email")return reply({error:"Unsupported action"},400);
 const password=Deno.env.get("MYKIOO_IONOS_SMTP_PASSWORD");
 const provider="ionos";
 if(!password?.trim())return reply({error:"IONOS SMTP password is not configured",provider},503);
 const senderAddress=ionosAddress;
 const smtpHost="smtp.ionos.com";
 let body:any;
 try{body=await request.json()}catch{return reply({error:"Invalid JSON"},400)}
 const to=body?.to;
 if(!Array.isArray(to)||to.length!==1||!validAddress(to[0]?.email))return reply({error:"One valid recipient required"},400);
 if(body.cc||body.bcc||body.attachments)return reply({error:"Unsupported email fields"},400);
 let subject=body.subject,html=body.htmlContent,text=body.textContent;
 if(body.templateId!==undefined){
  if(![1,2,3,4].includes(Number(body.templateId)))return reply({error:"Unknown email template"},400);
  const t=template(Number(body.templateId),body.params||{});
  subject=t.subject;html=t.html;text=t.text;
 }
 if(typeof subject!=="string"||!subject.trim()||subject.length>250||
  (typeof html!=="string"&&typeof text!=="string")||
  (typeof html==="string"&&html.length>90000)||
  (typeof text==="string"&&text.length>40000))
   return reply({error:"Invalid email content"},400);
 const transport=nodemailer.createTransport({
  host:smtpHost,port:465,secure:true,pool:false,
  auth:{user:senderAddress,pass:password},
  connectionTimeout:12000,greetingTimeout:12000,socketTimeout:15000,
  tls:{servername:smtpHost}
 });
 try{
  const sent=await transport.sendMail({
   from:{name:senderName,address:senderAddress},
   to:to[0].email,subject,
   html:typeof html==="string"?html:undefined,
   text:typeof text==="string"?text:undefined
  });
  if(!sent.messageId||!sent.accepted?.some((addr:string)=>addr.toLowerCase()===to[0].email.toLowerCase()))
    throw Error("SMTP server did not accept recipient");
  return reply({messageId:sent.messageId,provider});
 }catch(error){
  // Never log passwords, credentials, message HTML, full recipient addresses or tokens.
  const code=typeof (error as any)?.code==="string"?(error as any).code:"unknown";
  console.error("MYKIOO transactional delivery failed",provider,code);
  return reply({error:"Email delivery failed",code},503);
 }finally{transport.close()}
});
