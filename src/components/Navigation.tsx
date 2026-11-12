'use client';
import Link from 'next/link';import {usePathname,useRouter} from 'next/navigation';import {useState} from 'react';
import {LayoutDashboard,Search,ContactRound,History,ChartNoAxesCombined,Settings2,Users,LogOut,ChevronLeft,Menu,Building2,ShieldCheck,ArrowUpRight} from 'lucide-react';
import type {User} from '@/lib/auth';
const links=[
 {href:'/dashboard',label:'Dashboard',icon:LayoutDashboard},
 {href:'/pesquisa',label:'Pesquisar empresas',icon:Search},
 {href:'/leads',label:'Meus leads',icon:ContactRound},
 {href:'/historico',label:'Histórico',icon:History},
 {href:'/consumo',label:'Consumo de APIs',icon:ChartNoAxesCombined},
];
export default function Navigation({user}:{user:User}){
 const pathname=usePathname(),router=useRouter(),[open,setOpen]=useState(false);
 const options=user.role==='admin'?[...links,{href:'/usuarios',label:'Usuários',icon:Users},{href:'/configuracoes',label:'Configurações',icon:Settings2}]:links;
 async function logout(){await fetch('/api/auth/logout',{method:'POST'});router.replace('/login');router.refresh();}
 return <><button className="mobile-menu" aria-label="Abrir menu" onClick={()=>setOpen(!open)}><Menu size={22}/></button>{open&&<div className="nav-backdrop" onClick={()=>setOpen(false)}/>}
 <aside className={`sidebar ${open?'open':''}`}>
 <div className="brand"><div className="brand-mark"><Building2 size={24}/></div><div><b>PROSPECT</b><span>ODONTOART</span></div></div>
 <div className="side-label">MENU PRINCIPAL</div><nav>{options.map(link=>{const Icon=link.icon;const active=pathname===link.href||pathname.startsWith(link.href+'/');return <Link onClick={()=>setOpen(false)} className={`nav-link ${active?'active':''}`} href={link.href} key={link.href}><Icon size={18}/><span>{link.label}</span>{active&&<ChevronLeft size={13} className="active-chevron"/>}</Link>;})}</nav>
 <div className="sidebar-bottom"><div className="side-info"><ShieldCheck size={17}/><span>Acesso seguro e monitorado</span></div><button className="logout" onClick={logout}><LogOut size={17}/>Sair da plataforma<ArrowUpRight size={14}/></button></div>
 </aside></>;
}
