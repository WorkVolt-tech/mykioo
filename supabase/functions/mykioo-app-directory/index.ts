import {createClient} from "npm:@supabase/supabase-js@2.57.0";

const SITE="https://mykioo.icu";
const ORIGINS=new Set([SITE,"https://www.mykioo.icu","https://mykioo.pages.dev"]);
const CAMPAIGN="main";
const TABLE="mykioo_audit_logs";
const kindOptions=new Set(["store","publisher","apk"]);
const platforms=new Set(["fire_tv","android_tv","android","ios","apple_tv","smart_tv","web"]);
const text=(s:unknown,max:number)=>typeof s==="string"?s.trim().slice(0,max+1):"";
const isCode=(s:string)=>!s||/^[0-9]{4,10}$/.test(s);
function isWebUrl(s:string,allowedProtocols=["https:"]){
 try{const u=new URL(s);return allowedProtocols.includes(u.protocol)&&!u.username&&!u.password&&!["localhost","127.0.0.1","::1"].includes(u.hostname.toLowerCase())&&u.hostname.includes(".")&&u.href.length<=1600}catch{return false}
}
const respond=(data:unknown,status=200,origin="*")=>new Response(status===204?null:JSON.stringify(data),{status,headers:{"Content-Type":"application/json","Cache-Control":"no-store",
 "Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Access-Control-Allow-Methods":"GET,POST,OPTIONS","Vary":"Origin"}});
type Entry={id:string;name_en:string;name_fr:string;description_en:string;description_fr:string;url:string;
 source:"store"|"publisher"|"apk";logo_url:string;guide_id:string;install_notes_en:string;install_notes_fr:string;platforms:string[];blocked_platforms:string[];blocked_reason_en:string;blocked_reason_fr:string;downloader_code:string;published:boolean;rights_confirmed:boolean};
function sanitizeEntry(raw:any):Entry|null{
 if(!raw||typeof raw!=="object")return null;
 const id=text(raw.id,70),name_en=text(raw.name_en,95),name_fr=text(raw.name_fr,95);
 const description_en=text(raw.description_en,480),description_fr=text(raw.description_fr,480);
 const url=text(raw.url,1600),source=text(raw.source,20);
 const logo_url=text(raw.logo_url,1600),guide_id=text(raw.guide_id,80);
 const install_notes_en=text(raw.install_notes_en,600),install_notes_fr=text(raw.install_notes_fr,600);
 const downloader_code=text(raw.downloader_code,12);
 const deviceTypes=Array.isArray(raw.platforms)?[...new Set(raw.platforms.filter((x:unknown)=>typeof x==="string"&&platforms.has(x)))]:[];
 const blockedTypes=Array.isArray(raw.blocked_platforms)?[...new Set(raw.blocked_platforms.filter((x:unknown)=>typeof x==="string"&&platforms.has(x)))]:[];
 const reasonEn=text(raw.blocked_reason_en,360),reasonFr=text(raw.blocked_reason_fr,360);
 if(!/^[A-Za-z0-9_-]{8,70}$/.test(id)||name_en.length<2||name_fr.length<2||!isWebUrl(url,["http:","https:"])||
    !kindOptions.has(source)||!isCode(downloader_code)||!(deviceTypes.length||blockedTypes.length)||
    (logo_url&&!isWebUrl(logo_url))||(guide_id&&!/^[0-9a-f-]{36}$/i.test(guide_id))||
    description_en.length>480||description_fr.length>480||reasonEn.length>360||reasonFr.length>360||
    deviceTypes.some(id=>blockedTypes.includes(id)))return null;
 if(source==="apk"&&raw.rights_confirmed!==true)return null;
 return {id,name_en,name_fr,description_en,description_fr,url,source:source as Entry["source"],
  logo_url,guide_id,install_notes_en,install_notes_fr,
  platforms:deviceTypes,blocked_platforms:blockedTypes,blocked_reason_en:reasonEn,blocked_reason_fr:reasonFr,
  downloader_code,published:raw.published===true,rights_confirmed:raw.rights_confirmed===true};
}
async function loadCurrent(db:any){
 const {data,error}=await db.from(TABLE).select("id,details,created_at").eq("action","app_directory_saved")
   .eq("entity_type","app_directory").eq("entity_id",CAMPAIGN).order("id",{ascending:false}).limit(1).maybeSingle();
 if(error)throw Error("Could not load app library");
 const details=data?.details||{};
 const apps=Array.isArray(details.apps)?details.apps.map((app:any)=>({...app,blocked_platforms:app.blocked_platforms||[],blocked_reason_en:app.blocked_reason_en||"",blocked_reason_fr:app.blocked_reason_fr||""})):[];
 return {revision:data?.id?String(data.id):"initial",updated_at:data?.created_at||null,
  downloader_code:isCode(String(details.downloader_code||""))?String(details.downloader_code||""):"",apps};
}
Deno.serve(async request=>{
 const origin=request.headers.get("Origin")||"";
 const ownOrigin=ORIGINS.has(origin)?origin:SITE;
 if(request.method==="OPTIONS")return respond(null,204,ownOrigin);
 if(request.method!=="GET"&&request.method!=="POST")return respond({error:"Method not allowed"},405);
 const base=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!base||!key)return respond({error:"Service is not configured"},503);
 const db=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  if(request.method==="GET"){
   const current=await loadCurrent(db);
   return respond({ok:true,apps:current.apps.filter((a:Entry)=>a.published===true).map((a:Entry)=>({
    id:a.id,name_en:a.name_en,name_fr:a.name_fr,description_en:a.description_en,
    description_fr:a.description_fr,url:a.url,source:a.source,platforms:a.platforms,
    blocked_platforms:a.blocked_platforms||[],blocked_reason_en:a.blocked_reason_en||"",blocked_reason_fr:a.blocked_reason_fr||"",logo_url:a.logo_url||"",guide_id:a.guide_id||"",install_notes_en:a.install_notes_en||"",install_notes_fr:a.install_notes_fr||"",downloader_code:a.downloader_code
   })),downloader_code:current.downloader_code,updated_at:current.updated_at},200,"*");
  }
  if(!ORIGINS.has(origin))return respond({error:"Origin not allowed"},403,ownOrigin);
  const auth=request.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))return respond({error:"Owner sign-in required"},401,ownOrigin);
  const {data:{user},error:authError}=await db.auth.getUser(auth.slice(7));
  if(authError||!user||user.app_metadata?.mykioo_role!=="owner")return respond({error:"Owner access required"},403,ownOrigin);
  const {data:member,error:memberError}=await db.from("mykioo_members").select("role,status").eq("user_id",user.id).maybeSingle();
  if(memberError||member?.role!=="owner"||member?.status!=="approved")return respond({error:"Approved owner access required"},403,ownOrigin);
  const input=await request.json().catch(()=>null);
  if(!input||typeof input!=="object")return respond({error:"Invalid request"},400,ownOrigin);
  const current=await loadCurrent(db);
  if(input.action==="read")return respond({ok:true,...current},200,ownOrigin);
  if(input.action!=="save")return respond({error:"Unknown action"},400,ownOrigin);
  if(input.revision!==current.revision)return respond({error:"Another change was saved. Refresh before editing."},409,ownOrigin);
  if(!Array.isArray(input.apps)||input.apps.length>60)return respond({error:"Maximum of 60 app links"},400,ownOrigin);
  const apps:Entry[]=[];
  const seen=new Set<string>();
  for(const raw of input.apps){
   const cleaned=sanitizeEntry(raw);
   if(!cleaned||seen.has(cleaned.id))return respond({error:"A link is invalid. Use HTTP or HTTPS download links, HTTPS logo URLs, complete both languages, and verify APK redistribution rights."},400,ownOrigin);
   seen.add(cleaned.id);apps.push(cleaned);
  }
  const downloader_code=text(input.downloader_code,12);
  if(!isCode(downloader_code))return respond({error:"Downloader code must be 4–10 digits, or blank."},400,ownOrigin);
  const {error:writeError}=await db.from(TABLE).insert({actor_id:user.id,action:"app_directory_saved",
   entity_type:"app_directory",entity_id:CAMPAIGN,
   details:{apps,downloader_code,version:1}});
  if(writeError){console.error("MYKIOO App Directory save failed",writeError.code);return respond({error:"Could not save app library"},503,ownOrigin)}
  const updated=await loadCurrent(db);
  return respond({ok:true,...updated},200,ownOrigin);
 }catch(e){console.error("MYKIOO App Directory request failed",e instanceof Error?e.name:"unknown");
  return respond({error:"App library is temporarily unavailable"},503,ORIGINS.has(origin)?origin:"*")}
});