import React,{useCallback,useEffect,useState} from 'react';
import {supabase} from './supabase';
import {Tag,Plus,RefreshCw,Pencil,CheckCircle2,PauseCircle} from 'lucide-react';

const endpoint='https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-discounts';
const empty=()=>({id:'',code:'',discount_type:'percent',percent_off:'10',amount_cad:'',amount_usd:'',
 starts_at:'',expires_at:'',max_uses:'',per_member_limit:'1'});
const localInput=value=>{
 if(!value)return '';
 const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
 const corrected=new Date(d.getTime()-d.getTimezoneOffset()*60000);
 return corrected.toISOString().slice(0,16);
};
async function discountAction(payload){
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session)throw Error('Please sign in again.');
 const response=await fetch(endpoint,{method:'POST',headers:{
  'Content-Type':'application/json','Authorization':'Bearer '+session.access_token,
  'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
 },body:JSON.stringify(payload)});
 const result=await response.json().catch(()=>({}));
 if(!response.ok||!result.ok)throw Error(result.error||'Unable to update discount codes');
 return result;
}
export default function OwnerDiscountCodes({language='en'}){
 const fr=language==='fr',tr=(en,french)=>fr?french:en;
 const [rows,setRows]=useState([]),[form,setForm]=useState(empty),[saving,setSaving]=useState(false),
  [loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=useCallback(async()=>{
  const result=await discountAction({action:'list'});
  setRows(result.codes||[]);
 },[]);
 useEffect(()=>{let mounted=true;
  reload().catch(e=>{if(mounted)setError(e.message)}).finally(()=>{if(mounted)setLoading(false)});
  return()=>{mounted=false};
 },[reload]);
 const set=(key,value)=>{setForm(v=>({...v,[key]:value}));setError('');setNotice('')};
 const reset=()=>{setForm(empty());setError('');setNotice('')};
 function edit(code){
  setForm({id:code.id,code:code.code,discount_type:code.discount_type,percent_off:String(code.percent_off??''),
   amount_cad:String(code.amount_cad??''),amount_usd:String(code.amount_usd??''),
   starts_at:localInput(code.starts_at),expires_at:localInput(code.expires_at),
   max_uses:String(code.max_uses??''),per_member_limit:String(code.per_member_limit??1)});
  setError('');setNotice('');
 }
 async function save(e){
  e.preventDefault();if(saving)return;setSaving(true);setError('');setNotice('');
  try{
   await discountAction({action:'save',...form,code:form.code.trim().toUpperCase(),
    starts_at:form.starts_at?new Date(form.starts_at).toISOString():null,
    expires_at:form.expires_at?new Date(form.expires_at).toISOString():null,
    max_uses:form.max_uses.trim()?Number(form.max_uses):null,
    per_member_limit:Number(form.per_member_limit),
    percent_off:form.discount_type==='percent'?Number(form.percent_off):null,
    amount_cad:form.discount_type==='fixed'?Number(form.amount_cad):null,
    amount_usd:form.discount_type==='fixed'?Number(form.amount_usd):null});
   await reload();setForm(empty());
   setNotice(tr('Discount saved successfully. The code is ready to use when active.','Réduction enregistrée. Le code est prêt à être utilisé lorsqu’il est actif.'));
  }catch(e){setError(e.message||tr('Unable to save discount','Impossible d’enregistrer la réduction'))}
  finally{setSaving(false)}
 }
 async function toggle(row){
  if(saving)return;setSaving(true);setError('');setNotice('');
  try{
   await discountAction({action:'set_active',id:row.id,active:!row.active});
   await reload();setNotice(!row.active?tr('Code activated.','Code activé.'):tr('Code paused.','Code désactivé.'));
  }catch(e){setError(e.message)}finally{setSaving(false)}
 }
 function state(row){
  if(!row.active)return tr('Paused','Désactivé');
  if(row.starts_at&&Date.parse(row.starts_at)>Date.now())return tr('Scheduled','Planifié');
  if(row.expires_at&&Date.parse(row.expires_at)<=Date.now())return tr('Expired','Expiré');
  if(row.max_uses!==null&&row.used_count>=row.max_uses)return tr('Used up','Épuisé');
  return tr('Active','Actif');
 }
 const dateText=value=>value?new Date(value).toLocaleString(fr?'fr-CA':'en-CA',{year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}):'—';
 return <section className="mykioo-discounts">
  <div className="mykioo-discounts-title"><Tag size={20}/><div>
   <h3>{tr('Discount codes','Codes de réduction')}</h3>
   <p>{tr('Create as many separate codes as you need. Use a percentage, or enter fixed CAD and USD savings. New paid subscriptions and renewals can apply one code at checkout; free trials do not use codes.','Créez autant de codes que nécessaire. Choisissez un pourcentage ou saisissez des réductions fixes en CAD et USD. Les abonnements payants et les renouvellements acceptent un code par commande; les essais gratuits n’utilisent pas de codes.')}</p>
  </div></div>
  {error&&<p role="alert" className="mykioo-billing-error">{error}</p>}
  {notice&&<p role="status" className="mykioo-billing-notice">{notice}</p>}
  <form className="mykioo-discounts-form" onSubmit={save}>
   <h4>{form.id?tr('Edit discount settings','Modifier les paramètres du code'):tr('Create a discount code','Créer un code de réduction')}</h4>
   <div className="mykioo-discounts-grid">
    <label>{tr('Code customers enter','Code saisi par les clients')}
     <input value={form.code} onChange={e=>set('code',e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,''))} minLength={3} maxLength={32} required disabled={!!form.id} placeholder="WELCOME10" autoCapitalize="characters"/></label>
    <label>{tr('Discount type','Type de réduction')}
     <select value={form.discount_type} onChange={e=>set('discount_type',e.target.value)}>
      <option value="percent">{tr('Percentage (%)','Pourcentage (%)')}</option>
      <option value="fixed">{tr('Fixed dollar amount','Montant fixe en dollars')}</option>
     </select></label>
    {form.discount_type==='percent'?
     <label>{tr('Percentage off','Pourcentage de réduction')}
      <input type="number" min="0.01" max="99.99" step="0.01" required value={form.percent_off} onChange={e=>set('percent_off',e.target.value)}/></label>:
     <>
      <label>{tr('CAD discount (Interac / crypto quote)','Réduction CAD (Interac / devis crypto)')}
       <input type="number" min="0.01" max="9999.99" step="0.01" required value={form.amount_cad} onChange={e=>set('amount_cad',e.target.value)} placeholder="10.00"/></label>
      <label>{tr('USD discount (Zelle)','Réduction USD (Zelle)')}
       <input type="number" min="0.01" max="9999.99" step="0.01" required value={form.amount_usd} onChange={e=>set('amount_usd',e.target.value)} placeholder="8.00"/></label>
     </>}
    <label>{tr('Starts (optional)','Début (facultatif)')}
     <input type="datetime-local" value={form.starts_at} onChange={e=>set('starts_at',e.target.value)}/></label>
    <label>{tr('Expires (optional)','Expiration (facultatif)')}
     <input type="datetime-local" min={form.starts_at||undefined} value={form.expires_at} onChange={e=>set('expires_at',e.target.value)}/></label>
    <label>{tr('Maximum total uses (optional)','Utilisations maximales (facultatif)')}
     <input type="number" min="1" max="1000000" step="1" value={form.max_uses} onChange={e=>set('max_uses',e.target.value)} placeholder={tr('Unlimited','Illimité')}/></label>
    <label>{tr('Uses per member','Utilisations par membre')}
     <input type="number" min="1" max="50" step="1" value={form.per_member_limit} onChange={e=>set('per_member_limit',e.target.value)} required/></label>
   </div>
   <p className="mykioo-discounts-hint">{tr('Example: 10% reduces both currencies by 10%. For a fixed discount, enter two amounts (for example, CA$10 and US$8); there is no automatic currency conversion. A code cannot reduce a package to $0.','Exemple : 10 % réduit les deux devises de 10 %. Pour un montant fixe, entrez deux valeurs (par exemple 10 $ CA et 8 $ US); aucune conversion automatique. Une réduction ne peut pas rendre le forfait gratuit.')}</p>
   <div className="mykioo-discounts-actions">
    <button type="submit" disabled={saving}><Plus size={15}/>{saving?tr('Saving…','Enregistrement…'):form.id?tr('Save changes','Enregistrer les modifications'):tr('Create code','Créer le code')}</button>
    {form.id&&<button type="button" onClick={reset} disabled={saving}>{tr('Cancel edit','Annuler')}</button>}
   </div>
  </form>
  <div className="mykioo-discounts-list-head"><strong>{tr('Your discount codes','Vos codes de réduction')} ({rows.length})</strong>
   <button type="button" onClick={()=>reload().catch(e=>setError(e.message))}><RefreshCw size={15}/>{tr('Refresh','Actualiser')}</button></div>
  {loading?<p>{tr('Loading codes…','Chargement…')}</p>:
   rows.length===0?<p>{tr('No codes yet. Create your first discount above.','Aucun code. Créez votre première réduction ci-dessus.')}</p>:
   <div className="mykioo-discounts-rows">{rows.map(row=><article key={row.id} className="mykioo-discounts-row">
    <div className="mykioo-discounts-row-info">
     <strong>{row.code}</strong><span>{row.discount_type==='percent'?Number(row.percent_off)+'%':('CA$'+Number(row.amount_cad).toFixed(2)+' / US$'+Number(row.amount_usd).toFixed(2))}</span>
     <small>{state(row)} · {row.used_count}{row.max_uses!==null?'/'+row.max_uses:''} {tr('uses','utilisations')} · {row.per_member_limit} {tr('per member','par membre')}</small>
     {(row.starts_at||row.expires_at)&&<small>{tr('From','Du')}: {dateText(row.starts_at)} · {tr('To','Au')}: {dateText(row.expires_at)}</small>}
    </div>
    <div className="mykioo-discounts-actions">
     <button type="button" onClick={()=>edit(row)} disabled={saving}><Pencil size={14}/>{tr('Edit','Modifier')}</button>
     <button type="button" onClick={()=>toggle(row)} disabled={saving}>{row.active?<><PauseCircle size={14}/>{tr('Pause','Désactiver')}</>:<><CheckCircle2 size={14}/>{tr('Activate','Activer')}</>}</button>
    </div>
   </article>)}</div>}
 </section>;
}
