import React from 'react';
import {MailWarning,ArrowRight} from 'lucide-react';
import './EmailDeliveryNotice.css';

// Temporary site notice while outbound email delivery is being restored.
// Keep visible independently of the email provider and notification queue.
export default function EmailDeliveryNotice({language='en',audience='member',onViewOrders}){
 const fr=language==='fr';
 const tr=(en,french)=>fr?french:en;
 const isGuest=audience==='guest';
 const isOwner=audience==='owner';
 return <section className={'mykioo-email-delivery-notice '+(isGuest?'is-guest':'')} role="status" aria-label={tr('Email delivery notice','Avis sur les courriels')}>
  <MailWarning size={22} aria-hidden="true" className="mykioo-email-delivery-icon"/>
  <div className="mykioo-email-delivery-copy">
   <strong>{tr('Email notifications temporarily unavailable','Notifications par courriel temporairement indisponibles')}</strong>
   <p>{isGuest
    ?tr('MYKIOO is currently having trouble sending emails. Invitation and password-reset messages may not arrive. Existing members should sign in and check their account on this website for updates.','MYKIOO rencontre actuellement des difficultés d’envoi de courriels. Les invitations et les messages de réinitialisation du mot de passe pourraient ne pas être reçus. Les membres existants sont invités à se connecter et à consulter leur compte sur ce site pour les mises à jour.')
    :isOwner
    ?tr('Outgoing emails are currently disrupted. Members have been asked to check their order status on MYKIOO. Continue processing requests as quickly as possible and verify email delivery before lifting this notice.','L’envoi de courriels est actuellement perturbé. Les membres sont invités à vérifier l’état de leurs commandes sur MYKIOO. Continuez à traiter les demandes aussi rapidement que possible et vérifiez l’envoi des courriels avant de retirer cet avis.')
    :tr('We are experiencing an email delivery issue. Please check MYKIOO regularly under My subscriptions to see updates and confirm when your order has been completed. We will process requests as quickly as possible and post an update here when email notifications are working again.','Nous rencontrons un problème d’envoi de courriels. Veuillez consulter régulièrement MYKIOO, dans Mes abonnements, pour suivre votre commande et savoir lorsqu’elle est terminée. Nous traiterons les demandes aussi rapidement que possible et publierons une mise à jour ici lorsque les notifications par courriel fonctionneront de nouveau.')}</p>
  </div>
  {!isGuest&&!isOwner&&typeof onViewOrders==='function'&&<button type="button" onClick={onViewOrders} className="mykioo-email-delivery-action">{tr('Check my orders','Voir mes commandes')}<ArrowRight size={16}/></button>}
 </section>;
}
