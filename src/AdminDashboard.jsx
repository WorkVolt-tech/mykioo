import React,{useEffect,useState} from 'react';
import {Users,MailPlus,ShieldCheck,CalendarDays,Receipt,Headphones,LogOut,RefreshCw,Clock3,LockKeyhole,AlertCircle,CheckCircle2} from 'lucide-react';
import {supabase} from './supabase';
const tabs=[{id:'overview',name:'Overview',icon:ShieldCheck},{id:'members',name:'Members',icon:Users},{id:'invitations',name:'Invitations',icon:MailPlus},{id:'subscriptions',name:'Subscriptions',icon:CalendarDays},{id:'orders',name:'Orders',icon:Receipt},{id:'support',name:'Support',icon:Headphones}];
export default function AdminDashboard({user,logout,logo,language='en',onLanguageChange}) {
 const fr=language==='fr';
 const tr=(english,french)=>fr?french:english;
 const [tab,setTab]=useState('overview'),[rows,setRows]=useState({}),[loading,setLoading]=useState(true),[error,setError]=useState('');const [email,setEmail]=useState(''),[saving,setSaving]=useState(false),[notice,setNotice]=useState('');
 async function refresh(){setLoading(true);setError('');try{
 const collections={members:'mykioo_members',invitations:'mykioo_invitations',subscriptions:'mykioo_subscriptions',orders:'mykioo_orders',support:'mykioo_support_tickets'};
 const all=await Promise.all(Object.entries(collections).map(async ([key,table])=>{const {data,error}=await supabase.from(table).select('*').order('created_at',{ascending:false}).limit(100);if(error)throw Error(table+': '+error.message);return [key,data||[]]}));setRows(Object.fromEntries(all));
 }catch(err){setError('Could not load administration data: '+err.message)}finally{setLoading(false)}}
 async function runAction(payload) {
   setSaving(true);setError('');setNotice('');
   try {
     const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
     if(sessionError || !sessionData.session) throw new Error('Sign in again to continue.');
     const response=await fetch('https://porpqvphytecuidomcgy.supabase.co/functions/v1/mykioo-admin',{
       method:'POST',
       headers:{
         'Content-Type':'application/json',
         'Authorization':'Bearer '+sessionData.session.access_token,
         'apikey':import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
       },
       body:JSON.stringify(payload)
     });
     const result=await response.json().catch(()=>({}));
     if(!response.ok || !result.ok) throw new Error(result.error||'Action failed.');
     setNotice(result.message||'Updated successfully.');
     if(payload.action==='invite')setEmail('');
     await refresh();
   }catch(e){setError(e.message||'Request failed.')}finally{setSaving(false)}
 }
 async function invite(e) { e.preventDefault(); if(!email.trim())return; await runAction({action:'invite',email:email.trim(),language});}
 async function changeStatus(member,status) {
   if(member.role!=='member')return;
   if(!window.confirm(tr('Change ','Changer le statut de ')+member.email+tr(' from ',' de ')+member.status+tr(' to ',' à ')+status+'?'))return;
   await runAction({action:'set_status',member_id:member.user_id,status});
 }
 useEffect(()=>{refresh()},[]);
 const cards=[[tr('Total members','Total des membres'),rows.members?.length||0,Users],[tr('Pending approval','En attente d’approbation'),rows.members?.filter(m=>m.status==='pending').length||0,Clock3],[tr('Active subscriptions','Abonnements actifs'),rows.subscriptions?.filter(s=>s.status==='active').length||0,CalendarDays],[tr('Open support tickets','Demandes d’assistance ouvertes'),rows.support?.filter(t=>t.status==='open').length||0,Headphones]];
 const columns={members:['display_name','email','status','role','created_at'],invitations:['email','status','expires_at','created_at'],subscriptions:['member_id','status','starts_at','expires_at'],orders:['member_id','status','total_amount','created_at'],support:['subject','status','member_id','created_at']};
 const list=rows[tab]||[];
 return <div className="admin-layout">
 <aside className="admin-side"><img className="admin-logo" src={logo} alt="MYKIOO"/><div className="admin-side-label">{tr("OWNER CONTROL CENTER","CENTRE DE GESTION")}</div><nav>{tabs.map(({id,name,icon:Icon})=><button key={id} className={'admin-nav '+(tab===id?'active':'')} onClick={()=>setTab(id)}><Icon size={18}/>{tr(name,({Overview:"Vue d’ensemble",Members:"Membres",Invitations:"Invitations",Subscriptions:"Abonnements",Orders:"Commandes",Support:"Assistance"})[name])}</button>)}</nav><div className="admin-bottom"><div className="admin-owner"><ShieldCheck size={16}/> {tr("Owner account","Compte propriétaire")}</div><button className="admin-nav" onClick={logout}><LogOut size={18}/> {tr("Sign out","Déconnexion")}</button></div></aside>
 <main className="admin-main"><header className="admin-bar"><div><span className="admin-tag">{tr("PRIVATE ADMINISTRATION","ADMINISTRATION PRIVÉE")}</span><h1>{tr(tabs.find(t=>t.id===tab)?.name,({overview:'Vue d’ensemble',members:'Membres',invitations:'Invitations',subscriptions:'Abonnements',orders:'Commandes',support:'Assistance'})[tab])}</h1></div><div className="admin-account"><span>{user.email}</span><div className="mykioo-language-switch" role="group" aria-label="Website language"><button type="button" className={fr?'':'selected'} aria-pressed={!fr} onClick={()=>onLanguageChange('en')}>EN</button><button type="button" className={fr?'selected':''} aria-pressed={fr} onClick={()=>onLanguageChange('fr')}>FR</button></div><button onClick={refresh} title="Refresh data" aria-label="Refresh data"><RefreshCw size={19}/></button></div></header>
 {error&&<div className="admin-error" role="alert"><AlertCircle size={18}/>{error}</div>}{notice&&<div className="admin-success" role="status"><CheckCircle2 size={18}/>{notice}</div>}
 {tab==='overview'&&<><p className="admin-description">{tr("Welcome to your MYKIOO management space. All information comes from your private Supabase project.","Bienvenue dans votre espace de gestion MYKIOO. Toutes les informations proviennent de votre projet Supabase privé.")}</p><div className="admin-stats">{cards.map(([label,n,Icon])=><div className="admin-stat" key={label}><Icon size={22}/><small>{label}</small><strong>{loading?'…':n}</strong></div>)}</div><div className="admin-info"><CheckCircle2 size={22}/><div><strong>{tr("Owner access is active","Accès propriétaire activé")}</strong><p>{tr("Your account is approved. You can now invite members and manage approval requests from the Members and Invitations sections.","Votre compte est approuvé. Vous pouvez inviter des membres et gérer les demandes d’approbation dans les sections Membres et Invitations.")}</p></div></div></>}
 {tab==='invitations'&&<form className="admin-invite" onSubmit={invite}><div><strong>{tr("Invite a new member","Inviter un nouveau membre")}</strong><p>{tr("An invitation email will be sent in the website language. The member remains pending until you approve them.","Une invitation sera envoyée dans la langue du site. Le membre restera en attente jusqu’à votre approbation.")}</p></div><div className="admin-invite-row"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="customer@example.com" required maxLength={254} aria-label={tr("Invitee email","Courriel du destinataire")}/><button className="admin-action primary" type="submit" disabled={saving}>{saving?tr('Sending…','Envoi…'):tr('Send invitation','Envoyer l’invitation')}</button></div><small>{tr("Email language follows the EN/FR selection above. Supabase controls invitation expiry.","La langue du courriel suit le choix EN/FR ci-dessus. Supabase gère l’expiration de l’invitation.")}</small></form>}
 {tab!=='overview'&&<><p className="admin-description">{tab==='invitations'?tr('View invitations sent through MYKIOO.','Consultez les invitations envoyées depuis MYKIOO.'):tab==='members'?tr('Approve, reject or suspend customer memberships. Owner accounts are protected.','Approuvez, refusez ou suspendez les membres. Les comptes propriétaires sont protégés.'):tr('View your current MYKIOO records.','Consultez les données MYKIOO.')}</p>{loading?<div className="admin-empty">{tr("Loading records…","Chargement…")}</div>:list.length===0?<div className="admin-empty"><LockKeyhole size={28}/><strong>{tr("No records yet","Aucune donnée")}</strong><span>{tr("Information will appear here when available.","Les informations apparaîtront ici dès qu’elles seront disponibles.")}</span></div>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns[tab].map(c=><th key={c}>{c.replaceAll('_',' ')}</th>)}{tab==='members'&&<th>{tr("Actions","Actions")}</th>}</tr></thead><tbody>{list.map(row=><tr key={row.id||row.user_id}>{columns[tab].map(c=><td key={c}>{row[c]===null||row[c]===undefined?'—':c.includes('_at')&&row[c]?new Date(row[c]).toLocaleDateString():String(row[c])}</td>)}{tab==='members'&&<td><div className="admin-controls">{row.role==='member'?<>{row.status!=='approved'&&<button disabled={saving} className="admin-mini positive" onClick={()=>changeStatus(row,'approved')}>{tr("Approve","Approuver")}</button>}{row.status!=='rejected'&&<button disabled={saving} className="admin-mini" onClick={()=>changeStatus(row,'rejected')}>{tr("Reject","Refuser")}</button>}{row.status==='approved'&&<button disabled={saving} className="admin-mini" onClick={()=>changeStatus(row,'suspended')}>{tr("Suspend","Suspendre")}</button>}</>:<span>{tr("Owner","Propriétaire")}</span>}</div></td>}</tr>)}</tbody></table></div>}</>}
 </main></div>
}
