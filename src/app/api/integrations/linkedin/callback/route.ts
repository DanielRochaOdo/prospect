import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {timingSafeEqual} from 'node:crypto';
import {requireUser} from '@/lib/auth';
import {linkedinCookie,exchangeAndStoreLinkedInToken} from '@/lib/linkedin-oauth';
export const runtime='nodejs';
export async function GET(req:Request){
 const url=new URL(req.url);
 const base=process.env.LINKEDIN_REDIRECT_URI||url.origin;
 let outcome='error';
 try{
  const user=await requireUser(true);
  const state=url.searchParams.get('state')||'';
  const code=url.searchParams.get('code')||'';
  const expected=(await cookies()).get(linkedinCookie)?.value||'';
  const a=Buffer.from(state,'utf8'),b=Buffer.from(expected,'utf8');
  if(!state||!expected||a.length!==b.length||!timingSafeEqual(a,b))throw new Error('Estado OAuth inválido.');
  if(url.searchParams.get('error')){outcome='denied';}
  else{
   if(!code||code.length>2000)throw new Error('Código OAuth ausente.');
   await exchangeAndStoreLinkedInToken(code,user.id);
   outcome='connected';
  }
 }catch{if(outcome!=='denied')outcome='error';}
 const response=NextResponse.redirect(new URL('/configuracoes?linkedin='+outcome,base),303);
 response.cookies.set(linkedinCookie,'',{
  httpOnly:true,secure:process.env.NODE_ENV==='production',
  sameSite:'lax',path:'/api/integrations/linkedin',maxAge:0
 });
 response.headers.set('Cache-Control','no-store');
 return response;
}
