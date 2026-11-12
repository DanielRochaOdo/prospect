import {currentUser} from '@/lib/auth';import {redirect} from 'next/navigation';
export default async function AdminOnly({children}:{children:React.ReactNode}){const user=await currentUser();if(!user||user.role!=='admin')redirect('/dashboard');return children;}
