export async function hashInvitationToken(token:string){
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
 return Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
}
export async function newInvitationLink(origin:string){
 const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');
 return {actionLink:origin+'/?invite_token='+token+'&invite_type=managed',
  token_hash:await hashInvitationToken(token),managed_link:true,
  sent_at:new Date().toISOString(),expires_at:new Date(Date.now()+48*60*60*1000).toISOString(),
  exchange_started_at:null,renewal_requested_at:null};
}
