import React,{useEffect,useState} from 'react';
import {supabase} from './supabase';

const blank={id:'',member_id:'',service_name:'',device_label:'',service_username:'',supplier_reference:'',status:'active',starts_at:'',expires_at:'',service_password:''};
const dateOnly=value=>value?new Date(value).toISOString().slice(0,10):'';

export default function SubscriptionManager({members=[],subscriptions=[],language='en',onSaved}){
 const fr=language==='fr',tr=(en,frText)=>fr?frText:en;
 const [form,setForm]=useState(blank),[saving,setSaving]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const clients=members.filter(m=>m.role==='member');
 function update(field,value){setForm(current=>({...current,[field]:value}));setNotice('');setError('')}
 function edit(row){setForm({id:row.id,member_id:row.member_id,service_name:row.service_name||'',device_label:row.device_label||'',service_username:row.service_username||'',supplier_reference:row.supplier_reference||'',status:row.status,starts_at:dateOnly(row.starts_at),expires_at:dateOnly(row.expires_at),service_password:''});setError('');setNotice('')}
 async function save(e){
  e.preventDefault();if(saving)return;
  setSaving(true);setError('');setNotice('');
  try{
   const {data:{session},error:authError}=await supabase.auth.getSession();
   if(authError||!session)throw Error(tr('Please sign in again.','Veuillez vous reconnecter.'));
   const payload={action:'save',...form,starts_at:form.starts_at||null,expires_at:form.expires_at||null};
   const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-subscriptions',{
    method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
    'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY},body:JSON.stringify(payload)});
   const result=await response.json().catch(()=>({}));
   if(!response.ok||!result.ok)throw Error(result.error||tr('Unable to save subscription.','Impossible d’enregistrer l’abonnement.'));
   setForm(blank);setNotice(tr('Subscription saved.','Abonnement enregistré.'));onSaved?.();
  }catch(err){setError(err.message||tr('Unable to save subscription.','Impossible d’enregistrer l’abonnement.'))}
  finally{setSaving(false)}
 }
 return <div className="mykioo-sub-manager">
  <section className="admin-invite">
   <strong>{form.id?tr('Edit subscription','Modifier l’abonnement'):tr('Add a member subscription','Ajouter un abonnement membre')}</strong>
   <p>{tr('Each device or service login can have its own subscription, dates and status.','Chaque appareil ou identifiant de service peut avoir son propre abonnement, ses dates et son statut.')}</p>
   <form className="mykioo-sub-form" onSubmit={save}>
    <label>{tr('Member','Membre')}<select required value={form.member_id} onChange={e=>update('member_id',e.target.value)}>
     <option value="">{tr('Choose a member','Choisir un membre')}</option>
     {clients.map(m=><option key={m.user_id} value={m.user_id}>{m.display_name||m.email} ({m.email})</option>)}
    </select></label>
    <label>{tr('Service / package name','Service / nom du forfait')}<input required maxLength={80} value={form.service_name} onChange={e=>update('service_name',e.target.value)} placeholder={tr('e.g. Living room service','ex. Service du salon')}/></label>
    <label>{tr('Device or location','Appareil ou emplacement')}<input maxLength={80} value={form.device_label} onChange={e=>update('device_label',e.target.value)} placeholder={tr('e.g. Bedroom TV, phone','ex. Télé du salon, téléphone')}/></label>
    <label>{tr('Service login username','Identifiant du service')}<input maxLength={160} autoComplete="off" value={form.service_username} onChange={e=>update('service_username',e.target.value)} placeholder={tr('Username / login ID','Nom d’utilisateur / identifiant')}/></label>
    <label>{form.id?tr('Replace service password (leave blank to keep)','Remplacer le mot de passe du service (laisser vide pour conserver)'):tr('Service password','Mot de passe du service')}
      <input type="password" autoComplete="new-password" maxLength={256} value={form.service_password} onChange={e=>update('service_password',e.target.value)}
       placeholder={tr('Encrypted when saved','Chiffré lors de l’enregistrement')}/></label>
    <label>{tr('Provider reference (optional)','Référence du fournisseur (facultatif)')}<input maxLength={160} value={form.supplier_reference} onChange={e=>update('supplier_reference',e.target.value)}/></label>
    <label>{tr('Status','Statut')}<select value={form.status} onChange={e=>update('status',e.target.value)}>
     {['pending','active','expired','suspended','cancelled'].map(status=><option key={status} value={status}>{tr(({pending:'Pending',active:'Active',expired:'Expired',suspended:'Suspended',cancelled:'Cancelled'})[status],({pending:'En attente',active:'Actif',expired:'Expiré',suspended:'Suspendu',cancelled:'Annulé'})[status])}</option>)}
    </select></label>
    <label>{tr('Start date','Date de début')}<input type="date" value={form.starts_at} onChange={e=>update('starts_at',e.target.value)}/></label>
    <label>{tr('Expiry date','Date d’expiration')}<input type="date" value={form.expires_at} onChange={e=>update('expires_at',e.target.value)}/></label>
    <p className="mykioo-sub-note">{tr('Passwords are encrypted on the server. Members must verify their email before viewing them. Encryption must first be configured in Supabase.','Les mots de passe sont chiffrés sur le serveur. Les membres doivent vérifier leur adresse courriel avant de les afficher. Le chiffrement doit d’abord être configuré dans Supabase.')}</p>
    {error&&<p role="alert" className="mykioo-profile-error">{error}</p>}
    {notice&&<p role="status" className="mykioo-profile-success">{notice}</p>}
    <div className="mykioo-sub-actions"><button type="submit" disabled={saving||!clients.length} className="admin-action primary">{saving?tr('Saving…','Enregistrement…'):tr('Save subscription','Enregistrer l’abonnement')}</button>
     {form.id&&<button className="admin-action" type="button" onClick={()=>{setForm(blank);setError('')}}>{tr('Cancel editing','Annuler')}</button>}
    </div>
   </form>
  </section>
  <section className="mykioo-sub-list">
   <h2>{tr('Member subscriptions','Abonnements des membres')}</h2>
   {subscriptions.length===0?<p>{tr('No subscriptions yet.','Aucun abonnement pour le moment.')}</p>:
    subscriptions.map(sub=>{
      const member=clients.find(m=>m.user_id===sub.member_id);
      return <article className="mykioo-sub-item" key={sub.id}>
       <div><strong>{sub.service_name||tr('Unnamed service','Service sans nom')}</strong><span>{member?.display_name||member?.email||sub.member_id}</span>
       <small>{[sub.device_label,sub.service_username,sub.expires_at&&dateOnly(sub.expires_at)].filter(Boolean).join(' · ')}</small></div>
       <span className="mykioo-ticket-status">{sub.status}</span>{sub.has_password&&<span className="mykioo-credentials-chip">{tr('Password saved','Mot de passe enregistré')}</span>}
       <button className="admin-mini" onClick={()=>edit(sub)}>{tr('Edit','Modifier')}</button>
      </article>
    })}
  </section>
 </div>;
}
