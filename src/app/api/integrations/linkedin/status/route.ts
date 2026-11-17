import {api,json} from '@/lib/api';
import {db} from '@/lib/db';
export const runtime='nodejs';
export const GET=api(async()=>{
 const rows=await db()`SELECT token_expires_at,scopes,updated_at FROM linkedin_oauth_connections WHERE id='primary' LIMIT 1`;
 const row=rows[0];
 return json({
  configured:!!process.env.LINKEDIN_CLIENT_ID&&!!process.env.LINKEDIN_CLIENT_SECRET&&
   !!process.env.LINKEDIN_REDIRECT_URI&&!!process.env.LINKEDIN_TOKEN_ENCRYPTION_KEY,
  connected:!!row,
  active:!!row&&new Date(String(row.token_expires_at)).getTime()>Date.now(),
  expiresAt:row?String(row.token_expires_at):null,
  scopes:row?String(row.scopes):null
 });
},{admin:true});
