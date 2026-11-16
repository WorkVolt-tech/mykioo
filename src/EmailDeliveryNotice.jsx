import React from 'react';
import {MailCheck,ArrowRight} from 'lucide-react';
import './EmailDeliveryNotice.css';

// Friendly bilingual reminder: transactional mail is restored, but inbox placement can vary.
// Keep visible independently of the email provider and notification queue.
export default function EmailDeliveryNotice({language='en',audience='member',onViewOrders}){
 const fr=language==='fr';
 const tr=(en,french)=>fr?french:en;
 const isGuest=audience==='guest';
 const isOwner=audience==='owner';
 return <section className={'mykioo-email-delivery-notice '+(isGuest?'is-guest':'')} role="status" aria-label={tr('Email notification reminder','Rappel concernant les courriels')}>
  <MailCheck size={22} aria-hidden="true" className="mykioo-email-delivery-icon"/>
  <div className="mykioo-email-delivery-copy">
   <strong>{tr('Email notifications are working again','Les notifications par courriel fonctionnent de nouveau')}</strong>
   <p>{isGuest
    ?tr('MYKIOO emails are being sent again. If you are expecting an invitation or password-reset message, please check your Inbox and Spam/Junk folder. You can also mark MYKIOO emails as Not spam to help future messages arrive in your inbox.','Les courriels MYKIOO sont de nouveau envoyés. Si vous attendez une invitation ou un message de réinitialisation du mot de passe, vérifiez votre boîte de réception et votre dossier Courrier indésirable / Spam. Vous pouvez aussi marquer les courriels MYKIOO comme non indésirables pour faciliter leur réception.')
    :isOwner
    ?tr('Email notifications have resumed. Some messages may still arrive in Spam/Junk. Remind members to check there for invitations, confirmations and account details, and to mark legitimate MYKIOO emails as Not spam.','Les notifications par courriel ont repris. Certains messages peuvent encore arriver dans le dossier Courrier indésirable / Spam. Rappelez aux membres de le vérifier pour les invitations, confirmations et identifiants, et de marquer les courriels MYKIOO légitimes comme non indésirables.')
    :tr('MYKIOO email notifications are working again! Please check your Inbox and Spam/Junk folder for invitations, order confirmations and account details. If a MYKIOO email appears in spam, mark it as Not spam. You can still follow your order in My subscriptions.','Les notifications par courriel MYKIOO fonctionnent de nouveau ! Vérifiez votre boîte de réception et votre dossier Courrier indésirable / Spam pour les invitations, confirmations de commande et identifiants. Si un courriel MYKIOO arrive dans les indésirables, marquez-le comme non indésirable. Vous pouvez toujours suivre votre commande dans Mes abonnements.')}</p>
  </div>
  {!isGuest&&!isOwner&&typeof onViewOrders==='function'&&<button type="button" onClick={onViewOrders} className="mykioo-email-delivery-action">{tr('Check my orders','Voir mes commandes')}<ArrowRight size={16}/></button>}
 </section>;
}
