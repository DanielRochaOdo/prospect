import {AppError} from '@/lib/errors';
import {encryptLinkedInToken} from '@/lib/linkedin-crypto';
import {db} from '@/lib/db';
import {audit} from '@/lib/auth';

export const linkedinCookie='po_linkedin_oauth_state';
export const linkedinScopes='r_marketing_leadgen_automation r_ads r_organization_admin';

export function linkedinConfig(){
 const clientId=process.env.LINKEDIN_CLIENT_ID?.trim()||'';
 const clientSecret=process.env.LINKEDIN_CLIENT_SECRET?.trim()||'';
 const redirectUri=process.env.LINKEDIN_REDIRECT_URI?.trim()||'';
 const encryptionKey=process.env.LINKEDIN_TOKEN_ENCRYPTION_KEY?.trim()||'';
 if(!clientId||!clientSecret||!redirectUri||!/^[0-9a-f]{64}$/i.test(encryptionKey))
  throw new AppError(503,'Configure LINKEDIN_CLIENT_ID, LINKEDIN_CLIENT_SECRET, LINKEDIN_REDIRECT_URI e LINKEDIN_TOKEN_ENCRYPTION_KEY na Vercel.');
 let redirect:URL;
 try{redirect=new URL(redirectUri);}catch{throw new AppError(503,'LINKEDIN_REDIRECT_URI inválida.');}
 if(redirect.pathname!=='/api/integrations/linkedin/callback'||redirect.search||redirect.hash||
    (process.env.NODE_ENV==='production'&&redirect.protocol!=='https:'))
  throw new AppError(503,'LINKEDIN_REDIRECT_URI deve terminar em /api/integrations/linkedin/callback e usar HTTPS em produção.');
 return {clientId,clientSecret,redirectUri,encryptionKey};
}
type LinkedInToken={access_token?:unknown;expires_in?:unknown;refresh_token?:unknown;scope?:unknown};
export async function exchangeAndStoreLinkedInToken(code:string,authorizedBy:string){
 const cfg=linkedinConfig();
 const body=new URLSearchParams({
  grant_type:'authorization_code',code,client_id:cfg.clientId,
  client_secret:cfg.clientSecret,redirect_uri:cfg.redirectUri
 });
 const response=await fetch('https://www.linkedin.com/oauth/v2/accessToken',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:body.toString(),cache:'no-store',signal:AbortSignal.timeout(15000)
 });
 if(!response.ok)throw new AppError(502,'Falha na troca do código OAuth. Confirme o Client Secret e a URL cadastrada no LinkedIn.');
 const data=await response.json() as LinkedInToken;
 const token=typeof data.access_token==='string'?data.access_token:'';
 const expiry=Number(data.expires_in);
 if(!token||!Number.isFinite(expiry)||expiry<60||expiry>365*86400)
  throw new AppError(502,'Resposta OAuth do LinkedIn incompleta.');
 const encrypted=encryptLinkedInToken(token,cfg.encryptionKey);
 const refresh=typeof data.refresh_token==='string'&&data.refresh_token?
  encryptLinkedInToken(data.refresh_token,cfg.encryptionKey):null;
 const expiresAt=new Date(Date.now()+expiry*1000);
 const scopes=typeof data.scope==='string'?data.scope:linkedinScopes;
 const sql=db();
 await sql`INSERT INTO linkedin_oauth_connections
  (id,authorized_by,access_token_encrypted,refresh_token_encrypted,token_expires_at,scopes)
  VALUES ('primary',${authorizedBy},${encrypted},${refresh},${expiresAt},${scopes})
  ON CONFLICT(id) DO UPDATE SET
  authorized_by=EXCLUDED.authorized_by,
  access_token_encrypted=EXCLUDED.access_token_encrypted,
  refresh_token_encrypted=EXCLUDED.refresh_token_encrypted,
  token_expires_at=EXCLUDED.token_expires_at,
  scopes=EXCLUDED.scopes,
  updated_at=now()`;
 await audit(authorizedBy,'connect','linkedin_oauth','primary',{scopes,expiresAt:expiresAt.toISOString()});
}
