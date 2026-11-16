import React,{useState} from 'react';
import {Wrench,ArrowRight,ArrowLeft,CheckCircle2,LifeBuoy,BookOpen,RotateCcw,ShieldAlert} from 'lucide-react';
import './TroubleshootingAssistant.css';

const issues=[
 {id:'login',en:'Cannot sign in',fr:'Impossible de se connecter',category:'login',symptoms:[
  {id:'invalid',en:'Username or password rejected',fr:'Identifiant ou mot de passe refusé',steps:[
   ['Make sure you are using your service credentials, not your MYKIOO website email and password.','Utilisez les identifiants du service, et non ceux de votre compte sur le site MYKIOO.'],
   ['Check spaces, capitalization and characters carefully; try entering the credentials manually.','Vérifiez les espaces, les majuscules et les caractères ; saisissez les identifiants manuellement.'],
   ['If your service is pending activation or has expired, check My subscriptions before trying again.','Si votre service attend son activation ou a expiré, consultez Mes abonnements avant de réessayer.']]},
  {id:'app_login',en:'App is stuck on the login screen',fr:'L’application reste bloquée à la connexion',steps:[
   ['Close the app completely and reopen it.','Fermez complètement l’application, puis rouvrez-la.'],
   ['Check that your device is connected to the internet.','Vérifiez la connexion Internet de votre appareil.'],
   ['Restart the device and try again.','Redémarrez l’appareil et réessayez.']]}
 ]},
 {id:'streaming',en:'Buffering or playback',fr:'Mise en mémoire tampon ou lecture',category:'streaming',symptoms:[
  {id:'buffer',en:'Video freezes or buffers',fr:'La vidéo gèle ou charge sans arrêt',steps:[
   ['Try another channel or program to see whether the issue affects only one stream.','Essayez une autre chaîne ou émission pour voir si le problème concerne un seul flux.'],
   ['Restart your streaming app and your device.','Redémarrez votre application et votre appareil.'],
   ['Check your internet connection. If possible, try Ethernet or move closer to your router.','Vérifiez Internet. Si possible, utilisez une connexion Ethernet ou rapprochez-vous du routeur.'],
   ['If the issue persists, note the channel, approximate time and whether other channels work.','Si le problème persiste, notez la chaîne, l’heure approximative et si les autres chaînes fonctionnent.']]},
  {id:'black_screen',en:'Black screen or no sound',fr:'Écran noir ou aucun son',steps:[
   ['Try another channel or program to check whether the problem is isolated.','Essayez une autre chaîne ou émission pour savoir si le problème est isolé.'],
   ['Close and reopen the app, then restart the device if needed.','Fermez et rouvrez l’application, puis redémarrez l’appareil si nécessaire.'],
   ['Check your TV volume, mute setting and audio output before reporting a sound problem.','Vérifiez le volume, le mode muet et la sortie audio du téléviseur avant de signaler un problème de son.']]}
 ]},
 {id:'channels',en:'Missing or unavailable channels',fr:'Chaînes manquantes ou indisponibles',category:'channels',symptoms:[
  {id:'missing',en:'A channel is missing from the list',fr:'Une chaîne manque dans la liste',steps:[
   ['Confirm you are looking in the correct country or category in the app.','Vérifiez le pays ou la catégorie dans l’application.'],
   ['Refresh the channel list or reload the app if that option is available.','Actualisez la liste des chaînes ou rechargez l’application si cette option existe.'],
   ['Check which countries or packs are included with your service, then note the missing channel name.','Vérifiez les pays ou bouquets compris dans votre service et notez le nom de la chaîne manquante.']]},
  {id:'offline',en:'A channel does not play',fr:'Une chaîne ne fonctionne pas',steps:[
   ['Try two or three other channels to check if the issue is limited to one channel.','Essayez deux ou trois autres chaînes pour voir si le problème est isolé.'],
   ['Restart the app and try again.','Redémarrez l’application et réessayez.'],
   ['Record the exact channel name and the approximate time. MYKIOO will review reported service issues; this assistant cannot verify a live outage.','Notez le nom exact de la chaîne et l’heure approximative. MYKIOO examinera les problèmes signalés ; cet assistant ne peut pas vérifier une panne en direct.']]}
 ]},
 {id:'setup',en:'App installation or setup',fr:'Installation ou configuration',category:'setup',symptoms:[
  {id:'install',en:'Cannot install the app',fr:'Impossible d’installer l’application',steps:[
   ['Open Setup guides and choose the instructions matching your specific device.','Ouvrez les guides d’installation et choisissez ceux de votre appareil.'],
   ['Check that your device is supported by the selected app. Some TV systems use different apps or cannot install Android APK files.','Vérifiez que l’application prend en charge votre appareil. Certains téléviseurs utilisent d’autres applications ou ne peuvent pas installer de fichiers APK Android.'],
   ['Check available storage and restart the device before attempting installation again.','Vérifiez l’espace de stockage et redémarrez l’appareil avant de réessayer.']]},
  {id:'configure',en:'Need help entering service details',fr:'Besoin d’aide pour configurer le service',steps:[
   ['Follow the setup guide for your device and selected app.','Suivez le guide d’installation de votre appareil et de votre application.'],
   ['Use the service credentials and setup details from your activation message or My subscriptions, not your website login.','Utilisez les identifiants et renseignements de votre message d’activation ou de Mes abonnements, et non votre connexion au site.'],
   ['Do not share your password in a support ticket or screenshot.','Ne partagez pas votre mot de passe dans une demande d’assistance ou une capture d’écran.']]}
 ]},
 {id:'billing',en:'Subscription or payment',fr:'Abonnement ou paiement',category:'billing',symptoms:[
  {id:'pending',en:'Service activation is pending',fr:'Activation du service en attente',steps:[
   ['Check your request status under My subscriptions.','Consultez l’état de votre demande dans Mes abonnements.'],
   ['Check Payments for any remaining payment instructions or verification status.','Consultez Paiements pour les instructions restantes ou l’état de vérification.'],
   ['A reported payment is not yet verified. Activation depends on owner confirmation.','Un paiement déclaré n’est pas encore vérifié. L’activation dépend de la confirmation du propriétaire.']]},
  {id:'renew',en:'Renewal or expiration question',fr:'Question sur le renouvellement ou l’expiration',steps:[
   ['Check your service expiration date under My subscriptions.','Consultez la date d’expiration du service dans Mes abonnements.'],
   ['Use Subscribe / Renew to request a renewal and select the appropriate service.','Utilisez S’abonner / Renouveler pour demander le renouvellement du bon service.'],
   ['If a renewal was already requested, check its status before submitting it again.','Si vous avez déjà demandé un renouvellement, vérifiez son statut avant d’en soumettre un autre.']]}
 ]},
 {id:'other',en:'Something else',fr:'Autre problème',category:'other',symptoms:[
  {id:'other',en:'I still need help',fr:'J’ai encore besoin d’aide',steps:[
   ['Describe what you expected to happen and what happened instead.','Décrivez ce qui devait se passer et ce qui s’est passé.'],
   ['Note the device, app name and any error message.','Notez l’appareil, le nom de l’application et tout message d’erreur.'],
   ['Continue to the support request if you still need assistance.','Continuez avec une demande d’assistance si vous avez encore besoin d’aide.']]}
 ]}
];
const devices=[['','Not specified','Non précisé'],['fire_tv','Fire TV / Fire Stick','Fire TV / Fire Stick'],['android_tv','Android TV / Google TV','Android TV / Google TV'],['apple_tv','Apple TV','Apple TV'],['smart_tv','Smart TV','Téléviseur intelligent'],['ios','iPhone / iPad','iPhone / iPad'],['android','Android phone / tablet','Téléphone / tablette Android'],['web','Web browser','Navigateur Web'],['other','Other','Autre']];
export default function TroubleshootingAssistant({language='en',onOpenGuides,onPrepareTicket}){
 const fr=language==='fr',tr=(en,frText)=>fr?frText:en;
 const [issue,setIssue]=useState(''),[symptom,setSymptom]=useState(''),[device,setDevice]=useState(''),[app,setApp]=useState(''),[errorText,setErrorText]=useState(''),[checked,setChecked]=useState([]),[result,setResult]=useState('');
 const selected=issues.find(x=>x.id===issue),problem=selected?.symptoms.find(x=>x.id===symptom);
 const reset=()=>{setIssue('');setSymptom('');setDevice('');setApp('');setErrorText('');setChecked([]);setResult('')};
 function prepare(){
  if(!selected||!problem)return;
  const subject=(fr?problem.fr:problem.en).slice(0,120);
  const list=checked.map(i=>problem.steps[i]?.[fr?1:0]).filter(Boolean);
  const message=[
   tr('Troubleshooting assistant summary:','Résumé de l’assistant de dépannage :'),
   tr('Issue: ','Problème : ')+(fr?selected.fr:selected.en),
   tr('Symptom: ','Symptôme : ')+(fr?problem.fr:problem.en),
   tr('Steps attempted:','Étapes essayées :'),
   ...(list.length?list.map((s,i)=>(i+1)+'. '+s):[tr('No steps confirmed yet.','Aucune étape confirmée pour le moment.')]),
   tr('The issue is still happening. Please help.','Le problème persiste. Merci de votre aide.')
  ].join('\n').slice(0,3900);
  onPrepareTicket?.({category:selected.category,device,app:app.trim().slice(0,100),error:errorText.trim().slice(0,300),subject,message});
 }
 return <section className="mykioo-troubleshooter" aria-label={tr('Interactive troubleshooting assistant','Assistant de dépannage interactif')}>
  <div className="mykioo-troubleshooter-head"><div className="mykioo-troubleshooter-eyebrow"><Wrench size={16}/>{tr('SELF-SERVICE SUPPORT','ASSISTANCE GUIDÉE')}</div><h2>{tr('Troubleshoot a problem','Résoudre un problème')}</h2><p>{tr('Answer a few questions, follow the suggested checks, and contact support with the details already filled in if needed.','Répondez à quelques questions, suivez les vérifications proposées et contactez l’assistance avec les détails déjà remplis au besoin.')}</p></div>
  <div className="mykioo-troubleshooter-progress"><span className={issue?'done':''}>1 · {tr('Problem','Problème')}</span><span className={symptom?'done':''}>2 · {tr('Details','Détails')}</span><span className={symptom?'done':''}>3 · {tr('Checks','Vérifications')}</span></div>
  {!issue?<div className="mykioo-troubleshooter-choices"><h3>{tr('What are you having trouble with?','Quel problème rencontrez-vous ?')}</h3><div className="mykioo-troubleshooter-options">{issues.map(x=><button key={x.id} type="button" onClick={()=>setIssue(x.id)}>{fr?x.fr:x.en}<ArrowRight size={17}/></button>)}</div></div>:
  !symptom?<div className="mykioo-troubleshooter-choices"><h3>{tr('Which situation best describes it?','Quelle situation décrit le mieux le problème ?')}</h3><div className="mykioo-troubleshooter-options">{selected.symptoms.map(x=><button type="button" key={x.id} onClick={()=>{setSymptom(x.id);setChecked([]);setResult('')}}>{fr?x.fr:x.en}<ArrowRight size={17}/></button>)}</div><button className="mykioo-troubleshooter-back" type="button" onClick={()=>setIssue('')}><ArrowLeft size={15}/>{tr('Back','Retour')}</button></div>:
  <div className="mykioo-troubleshooter-steps"><h3>{fr?problem.fr:problem.en}</h3><p>{tr('Try these checks and tick each one you completed.','Essayez ces vérifications et cochez celles que vous avez effectuées.')}</p>
    <div className="mykioo-troubleshooter-checklist">{problem.steps.map((step,i)=><label key={i}><input type="checkbox" checked={checked.includes(i)} onChange={e=>setChecked(old=>e.target.checked?[...old,i]:old.filter(n=>n!==i))}/><span>{step[fr?1:0]}</span></label>)}</div>
    {(issue==='setup'||issue==='login'||issue==='billing')&&<button type="button" className="mykioo-troubleshooter-guide" onClick={onOpenGuides}><BookOpen size={17}/>{tr('Open setup and account guides','Ouvrir les guides d’installation et de compte')}</button>}
    <div className="mykioo-troubleshooter-question"><strong>{tr('Did that solve your problem?','Votre problème est-il résolu ?')}</strong><div><button type="button" onClick={()=>setResult('yes')}><CheckCircle2 size={17}/>{tr('Yes, it works','Oui, ça fonctionne')}</button><button type="button" onClick={()=>setResult('no')}><LifeBuoy size={17}/>{tr('No, I need help','Non, j’ai besoin d’aide')}</button></div></div>
    {result==='yes'&&<div className="mykioo-troubleshooter-solved" role="status"><CheckCircle2 size={20}/><div><strong>{tr('Glad it is working!','Heureux que cela fonctionne !')}</strong><p>{tr('You do not need to submit a ticket. You can start a new check anytime.','Vous n’avez pas besoin d’envoyer une demande. Vous pouvez recommencer à tout moment.')}</p></div></div>}
    {result==='no'&&<div className="mykioo-troubleshooter-escalate">
      <strong><ShieldAlert size={17}/>{tr('Prepare a support request','Préparer une demande d’assistance')}</strong>
      <p>{tr('These optional details help the support team understand the problem. Never enter your password or payment information.','Ces détails facultatifs aident l’équipe à comprendre le problème. N’indiquez jamais votre mot de passe ni vos renseignements de paiement.')}</p>
      <label>{tr('Device','Appareil')}<select value={device} onChange={e=>setDevice(e.target.value)}>{devices.map(([id,en,frText])=><option key={id} value={id}>{tr(en,frText)}</option>)}</select></label>
      <label>{tr('App name (optional)','Nom de l’application (facultatif)')}<input value={app} maxLength={100} onChange={e=>setApp(e.target.value)} placeholder={tr('App you are using','Application utilisée')}/></label>
      <label>{tr('Error message (optional)','Message d’erreur (facultatif)')}<textarea rows={2} value={errorText} maxLength={300} onChange={e=>setErrorText(e.target.value)} placeholder={tr('Error message without any passwords','Message d’erreur sans mots de passe')}/></label>
      <button type="button" className="mykioo-troubleshooter-prepare" onClick={prepare}>{tr('Continue to support form','Continuer vers le formulaire d’assistance')} <ArrowRight size={16}/></button>
      <small>{tr('You will review and send the request yourself. Nothing is submitted automatically.','Vous pourrez vérifier et envoyer vous-même la demande. Rien n’est envoyé automatiquement.')}</small>
     </div>}
    <div className="mykioo-troubleshooter-bottom"><button type="button" onClick={()=>{setSymptom('');setResult('')}}><ArrowLeft size={15}/>{tr('Change symptoms','Changer de symptôme')}</button><button type="button" onClick={reset}><RotateCcw size={15}/>{tr('Start over','Recommencer')}</button></div>
   </div>}
 </section>;
}
