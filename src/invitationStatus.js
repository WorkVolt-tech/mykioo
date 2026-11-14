export function invitationStatus(invitation,now=Date.now()){
 if(invitation.status==='revoked')return 'revoked';
 if(invitation.renewal_requested_at)return 'requested';
 if(invitation.accepted_at)return 'accepted';
 if(invitation.status==='expired'||Date.parse(invitation.expires_at)<=now)return 'expired';
 return 'pending';
}
