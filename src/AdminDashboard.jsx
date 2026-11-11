import React,{useEffect,useState} from 'react';
import {Users,MailPlus,ShieldCheck,CalendarDays,Receipt,Headphones,LogOut,RefreshCw,Clock3,LockKeyhole,AlertCircle,CheckCircle2} from 'lucide-react';
import {supabase} from './supabase';
const tabs=[{id:'overview',name:'Overview',icon:ShieldCheck},{id:'members',name:'Members',icon:Users},{id:'invitations',name:'Invitations',icon:MailPlus},{id:'subscriptions',name:'Subscriptions',icon:CalendarDays},{id:'orders',name:'Orders',icon:Receipt},{id:'support',name:'Support',icon:Headphones}];
export default function AdminDashboard({user,logout,logo}) {
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
 async function invite(e) { e.preventDefault(); if(!email.trim())return; await runAction({action:'invite',email:email.trim()});}
 async function changeStatus(member,status) {
   if(member.role!=='member')return;
   if(!window.confirm('Change '+member.email+' from '+member.status+' to '+status+'?'))return;
   await runAction({action:'set_status',member_id:member.user_id,status});
 }
 useEffect(()=>{refresh()},[]);
 const cards=[['Total members',rows.members?.length||0,Users],['Pending approval',rows.members?.filter(m=>m.status==='pending').length||0,Clock3],['Active subscriptions',rows.subscriptions?.filter(s=>s.status==='active').length||0,CalendarDays],['Open support tickets',rows.support?.filter(t=>t.status==='open').length||0,Headphones]];
 const columns={members:['display_name','email','status','role','created_at'],invitations:['email','status','expires_at','created_at'],subscriptions:['member_id','status','starts_at','expires_at'],orders:['member_id','status','total_amount','created_at'],support:['subject','status','member_id','created_at']};
 const list=rows[tab]||[];
 return <div className="admin-layout">
 <aside className="admin-side"><img className="admin-logo" src={logo} alt="MYKIOO"/><div className="admin-side-label">OWNER CONTROL CENTER</div><nav>{tabs.map(({id,name,icon:Icon})=><button key={id} className={'admin-nav '+(tab===id?'active':'')} onClick={()=>setTab(id)}><Icon size={18}/>{name}</button>)}</nav><div className="admin-bottom"><div className="admin-owner"><ShieldCheck size={16}/> Owner account</div><button className="admin-nav" onClick={logout}><LogOut size={18}/> Sign out</button></div></aside>
 <main className="admin-main"><header className="admin-bar"><div><span className="admin-tag">PRIVATE ADMINISTRATION</span><h1>{tabs.find(t=>t.id===tab)?.name}</h1></div><div className="admin-account"><span>{user.email}</span><button onClick={refresh} title="Refresh data" aria-label="Refresh data"><RefreshCw size={19}/></button></div></header>
 {error&&<div className="admin-error" role="alert"><AlertCircle size={18}/>{error}</div>}{notice&&<div className="admin-success" role="status"><CheckCircle2 size={18}/>{notice}</div>}
 {tab==='overview'&&<><p className="admin-description">Welcome to your MYKIOO management space. All information comes from your private Supabase project.</p><div className="admin-stats">{cards.map(([label,n,Icon])=><div className="admin-stat" key={label}><Icon size={22}/><small>{label}</small><strong>{loading?'…':n}</strong></div>)}</div><div className="admin-info"><CheckCircle2 size={22}/><div><strong>Owner access is active</strong><p>Your account is approved. You can now invite members and manage approval requests from the Members and Invitations sections.</p></div></div></>}
 {tab==='invitations'&&<form className="admin-invite" onSubmit={invite}><div><strong>Invite a new member</strong><p>An invitation email will be sent. The member remains pending until you approve them.</p></div><div className="admin-invite-row"><input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="customer@example.com" required maxLength={254} aria-label="Invitee email"/><button className="admin-action primary" type="submit" disabled={saving}>{saving?'Sending…':'Send invitation'}</button></div><small>Supabase email delivery and permitted redirect URLs must be configured. Invitation expiry is controlled by Supabase Auth.</small></form>}
 {tab!=='overview'&&<><p className="admin-description">{tab==='invitations'?'View invitations that have been requested through MYKIOO.':tab==='members'?'Approve, reject or suspend customer memberships. Owner accounts are protected.':'View your current MYKIOO records.'}</p>{loading?<div className="admin-empty">Loading records…</div>:list.length===0?<div className="admin-empty"><LockKeyhole size={28}/><strong>No records yet</strong><span>Information will appear here when available.</span></div>:<div className="admin-table-wrap"><table className="admin-table"><thead><tr>{columns[tab].map(c=><th key={c}>{c.replaceAll('_',' ')}</th>)}{tab==='members'&&<th>Actions</th>}</tr></thead><tbody>{list.map(row=><tr key={row.id||row.user_id}>{columns[tab].map(c=><td key={c}>{row[c]===null||row[c]===undefined?'—':c.includes('_at')&&row[c]?new Date(row[c]).toLocaleDateString():String(row[c])}</td>)}{tab==='members'&&<td><div className="admin-controls">{row.role==='member'?<>{row.status!=='approved'&&<button disabled={saving} className="admin-mini positive" onClick={()=>changeStatus(row,'approved')}>Approve</button>}{row.status!=='rejected'&&<button disabled={saving} className="admin-mini" onClick={()=>changeStatus(row,'rejected')}>Reject</button>}{row.status==='approved'&&<button disabled={saving} className="admin-mini" onClick={()=>changeStatus(row,'suspended')}>Suspend</button>}</>:<span>Owner</span>}</div></td>}</tr>)}</tbody></table></div>}</>}
 </main></div>
}
