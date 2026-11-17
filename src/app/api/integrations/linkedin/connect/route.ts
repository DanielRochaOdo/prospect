import {NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {requireUser} from '@/lib/auth';
import {linkedinConfig,linkedinCookie,linkedinScopes} from '@/lib/linkedin-oauth';
import {AppError} from '@/lib/errors';
export const runtime='nodejs';
export async function GET(req:Request){
 try{
  await requireUser(true);
  const cfg=linkedinConfig();
  const state=randomBytes(32).toString('base64url');
  const target=new URL('https://www.linkedin.com/oauth/v2/authorization');
  for(const [name,value] of Object.entries({
   response_type:'code',client_id:cfg.clientId,redirect_uri:cfg.redirectUri,
   scope:linkedinScopes,state
  }))target.searchParams.set(name,value);
  const response=NextResponse.redirect(target,303);
  response.cookies.set(linkedinCookie,state,{
   httpOnly:true,secure:process.env.NODE_ENV==='production',
   sameSite:'lax',path:'/api/integrations/linkedin',maxAge:600
  });
  response.headers.set('Cache-Control','no-store');
  return response;
 }catch(err){
  const reason=err instanceof AppError&&err.status===503?'configuration':'auth';
  return NextResponse.redirect(new URL('/configuracoes?linkedin='+reason,req.url),303);
 }
}
