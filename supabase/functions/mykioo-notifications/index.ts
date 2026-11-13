import {createClient} from "npm:@supabase/supabase-js@2.57.0";
const origin="https://mykioo.pages.dev";
const cors={"Access-Control-Allow-Origin":origin,"Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS","Vary":"Origin"};
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}});
const uuid=(value:unknown)=>typeof value==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
Deno.serve(async request=>{
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
 if(request.method!=="POST")return reply({error:"Method not allowed"},405);
 if(request.headers.get("Origin")!==origin)return reply({error:"Origin not allowed"},403);
 const authorization=request.headers.get("Authorization")||"";
 if(!authorization.startsWith("Bearer "))return reply({error:"Sign in required"},401);
 const url=Deno.env.get("SUPABASE_URL"),secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(!url||!secret)return reply({error:"Server unavailable"},503);
 const db=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
 try{
  const {data:{user},error:identityError}=await db.auth.getUser(authorization.slice(7));
  if(identityError||!user)return reply({error:"Session expired"},401);
  const {data:member,error:memberError}=await db.from("mykioo_members")
   .select("status,role").eq("user_id",user.id).maybeSingle();
  if(memberError||member?.status!=="approved")return reply({error:"Approved membership required"},403);
  const input=await request.json().catch(()=>null);
  if(!input||!["mark_read","delete","clear_all"].includes(input.action))return reply({error:"Invalid action"},400);
  if(input.action==="mark_read"){
   if(!uuid(input.id)&&input.id!=="all")return reply({error:"Invalid notification"},400);
   let query=db.from("mykioo_notifications").update({read_at:new Date().toISOString()})
    .eq("user_id",user.id).is("read_at",null);
   if(input.id!=="all")query=query.eq("id",input.id);
   const {error}=await query;
   if(error)return reply({error:"Could not mark notification as read"},500);
   return reply({ok:true});
  }
  if(input.action==="delete"&&!uuid(input.id))return reply({error:"Invalid notification"},400);
  // Never delete someone else's notification or the underlying subscription/support/payment record.
  let removal=db.from("mykioo_notifications").delete().eq("user_id",user.id);
  if(input.action==="delete")removal=removal.eq("id",input.id);
  const {error:deleteError}=await removal;
  if(deleteError)return reply({error:"Could not clear notifications"},500);
  return reply({ok:true,action:input.action});
 }catch(error){console.error("MYKIOO notification error",error instanceof Error?error.message:"unknown");return reply({error:"Notification service temporarily unavailable"},500)}
});
