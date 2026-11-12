import {currentUser} from '@/lib/auth';import {redirect} from 'next/navigation';import Navigation from '@/components/Navigation';import ThemeToggle from '@/components/ThemeToggle';
export const runtime='nodejs';
export default async function PrivateLayout({children}:{children:React.ReactNode}){
 const user=await currentUser();if(!user)redirect('/login');
 return <div className="app-shell"><Navigation user={user}/><div className="workspace"><header className="topbar"><div className="topbar-title">Inteligência comercial <span className="dot">•</span> Odontoart</div><div className="topbar-right"><ThemeToggle/><span className="avatar">{user.name.slice(0,1).toUpperCase()}</span><div><strong>{user.name}</strong><small>{user.role==='admin'?'Administrador':'Operador'}</small></div></div></header><main className="main-content">{children}</main></div></div>;
}
