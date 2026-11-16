import React,{useState} from 'react';
import {Copy,CheckCircle2,ExternalLink,MailWarning,X} from 'lucide-react';
import './ManualInvitePanel.css';

/** Owner-only, one-time view. Never stores bearer invitation links in local storage. */
export default function ManualInvitePanel({delivery,language='en',onDismiss}){
 const [copied,setCopied]=useState('');
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 if(!delivery?.link)return null;
 const emailText=(delivery.subject||'MYKIOO invitation')+'\n\n'+(delivery.body||'');
 async function copy(text,which){
  try{
   if(!navigator.clipboard?.writeText)throw new Error('Clipboard unavailable');
   await navigator.clipboard.writeText(text);setCopied(which);
  }catch{setCopied('error')}
 }
 return <section className="mykioo-manual-invite" aria-labelledby="mykioo-manual-invite-title">
  <div className="mykioo-manual-invite-heading">
   <MailWarning size={21}/>
   <div><h3 id="mykioo-manual-invite-title">{tr('Private invitation ready — send it manually','Invitation privée prête — envoi manuel')}</h3>
    <p>{tr('Automatic invitation emails are unavailable. The link is valid for 48 hours. Copy the prepared message and send it from your Gmail or Outlook account. Nothing has been emailed automatically.','Les invitations automatiques sont indisponibles. Le lien est valable 48 heures. Copiez le message préparé et envoyez-le depuis Gmail ou Outlook. Aucun courriel n’a été envoyé automatiquement.')}</p>
   </div>
   <button type="button" className="mykioo-manual-invite-close" aria-label={tr('Close invitation','Fermer l’invitation')} onClick={onDismiss}><X size={19}/></button>
  </div>
  <div className="mykioo-manual-invite-recipient"><strong>{tr('Recipient','Destinataire')}:</strong> <span>{delivery.to}</span></div>
  <div className="mykioo-manual-invite-actions">
   <button type="button" onClick={()=>copy(emailText,'email')}><Copy size={16}/>{tr('Copy full invitation email','Copier tout le courriel d’invitation')}</button>
   <button type="button" onClick={()=>copy(delivery.link,'link')}><Copy size={16}/>{tr('Copy invitation link','Copier le lien d’invitation')}</button>
   <a href="https://mail.google.com/mail/u/0/#inbox?compose=new" target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{tr('Open Gmail','Ouvrir Gmail')}</a>
  </div>
  {copied==='error'&&<p role="alert" className="mykioo-manual-invite-error">{tr('Copy failed. Please use a supported browser or select and copy the link below.','Copie impossible. Utilisez un navigateur compatible ou sélectionnez le lien ci-dessous.')}</p>}
  {(copied==='email'||copied==='link')&&<p role="status" className="mykioo-manual-invite-success"><CheckCircle2 size={15}/>{tr('Copied. Paste it into your email to the recipient.','Copié. Collez-le dans le courriel destiné à cette personne.')}</p>}
  <label className="mykioo-manual-invite-link">{tr('Private invitation link (do not share publicly)','Lien d’invitation privé (ne pas publier)')}
   <input readOnly value={delivery.link} onFocus={e=>e.target.select()} aria-label={tr('Invitation link','Lien d’invitation')}/>
  </label>
  <p className="mykioo-manual-invite-foot">{tr('Save or send the message now: this private link is shown only until you close or reload this page. If needed, use Generate new link on the invitation record.','Enregistrez ou envoyez le message maintenant : ce lien privé n’est affiché que jusqu’à la fermeture ou au rechargement de la page. Vous pourrez utiliser Générer un nouveau lien au besoin.')}</p>
 </section>;
}
