import React,{useState} from 'react';
import {KeyRound,Eye,EyeOff,ShieldCheck} from 'lucide-react';
import {supabase} from './supabase';
import './PasswordSettings.css';

export default function PasswordSettings({language='en',mode='change',onComplete}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const recovery=mode==='recovery';
 const [currentPassword,setCurrentPassword]=useState('');
 const [nextPassword,setNextPassword]=useState('');
 const [confirmation,setConfirmation]=useState('');
 const [visible,setVisible]=useState(false);
 const [saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 async function submit(event){
  event.preventDefault();if(saving)return;
  setError('');setNotice('');
  if(!recovery&&!currentPassword){
   setError(tr('Enter your current password.','Saisissez votre mot de passe actuel.'));return;
  }
  if(nextPassword.length<8||nextPassword.length>128){
   setError(tr('Choose a password between 8 and 128 characters.','Choisissez un mot de passe de 8 à 128 caractères.'));return;
  }
  if(nextPassword!==confirmation){
   setError(tr('The two new passwords do not match.','Les deux nouveaux mots de passe ne correspondent pas.'));return;
  }
  if(!recovery&&currentPassword===nextPassword){
   setError(tr('Choose a different password from your current one.','Choisissez un mot de passe différent de l’actuel.'));return;
  }
  setSaving(true);
  try{
   const {data,error:authError}=await supabase.auth.getUser();
   if(authError||!data?.user)throw Error(tr('Your secure session has expired. Request a new reset link or sign in again.','Votre session sécurisée a expiré. Demandez un nouveau lien ou reconnectez-vous.'));
   const payload=recovery?{password:nextPassword}:{password:nextPassword,current_password:currentPassword};
   const {error:updateError}=await supabase.auth.updateUser(payload);
   if(updateError)throw updateError;
   setCurrentPassword('');setNextPassword('');setConfirmation('');
   setNotice(tr('Password updated successfully.','Mot de passe modifié avec succès.'));
   if(onComplete)await onComplete();
  }catch(err){
   const message=String(err?.message||'');
   setError(/reauth|nonce|recent.login|reauthentication/i.test(message)?
    tr('For security, Supabase requires an email verification step. Sign out and use Forgot password to finish changing your password.','Pour votre sécurité, Supabase demande une vérification par courriel. Déconnectez-vous et utilisez Mot de passe oublié pour le modifier.'):
    /current.password|invalid.credentials/i.test(message)?
    tr('The current password was not accepted. Check it and try again, or use Forgot password.','Le mot de passe actuel est incorrect. Vérifiez-le ou utilisez Mot de passe oublié.'):
    message||tr('Could not update your password.','Impossible de modifier votre mot de passe.'));
  }finally{setSaving(false)}
 }
 return <section className={'mykioo-password-settings '+(recovery?'is-recovery':'')}>
  <div className="mykioo-password-settings-header">
   <KeyRound size={22}/>
   <div><h2>{recovery?tr('Create a new password','Créer un nouveau mot de passe'):tr('Change password','Modifier le mot de passe')}</h2>
    <p>{recovery?
     tr('Your email recovery link was verified. Choose a new password to secure your MYKIOO account.','Votre lien de récupération a été vérifié. Choisissez un nouveau mot de passe pour sécuriser votre compte MYKIOO.'):
     tr('Update the password used to sign in to MYKIOO.','Modifiez le mot de passe utilisé pour vous connecter à MYKIOO.')}</p>
   </div>
  </div>
  <form onSubmit={submit} autoComplete="on">
   {!recovery&&<label htmlFor="mykioo-current-password">{tr('Current password','Mot de passe actuel')}
    <input id="mykioo-current-password" type={visible?'text':'password'} autoComplete="current-password" required
     value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)} disabled={saving}/>
   </label>}
   <label htmlFor="mykioo-new-password">{tr('New password','Nouveau mot de passe')}
    <input id="mykioo-new-password" type={visible?'text':'password'} autoComplete="new-password" minLength={8} maxLength={128} required
     value={nextPassword} onChange={e=>setNextPassword(e.target.value)} disabled={saving}/>
   </label>
   <label htmlFor="mykioo-confirm-password">{tr('Confirm new password','Confirmer le nouveau mot de passe')}
    <input id="mykioo-confirm-password" type={visible?'text':'password'} autoComplete="new-password" minLength={8} maxLength={128} required
     value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={saving}/>
   </label>
   <button className="mykioo-password-visibility" type="button" onClick={()=>setVisible(v=>!v)}>
    {visible?<EyeOff size={16}/>:<Eye size={16}/>}
    {visible?tr('Hide passwords','Masquer les mots de passe'):tr('Show passwords','Afficher les mots de passe')}
   </button>
   <p className="mykioo-password-guidance"><ShieldCheck size={16}/>{tr('Choose your own password (at least 8 characters). A unique password is safest.','Choisissez votre mot de passe (8 caractères minimum). Un mot de passe unique est plus sûr.')}</p>
   {error&&<p role="alert" className="mykioo-password-error">{error}</p>}
   {notice&&<p role="status" className="mykioo-password-success">{notice}</p>}
   <button className="mykioo-password-submit" type="submit" disabled={saving}>
    {saving?tr('Updating…','Modification…'):recovery?tr('Save new password','Enregistrer le nouveau mot de passe'):tr('Update password','Modifier le mot de passe')}
   </button>
  </form>
 </section>;
}
