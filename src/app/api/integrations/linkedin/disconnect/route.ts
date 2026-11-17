import {api,json} from '@/lib/api';
import {db} from '@/lib/db';
import {audit} from '@/lib/auth';
export const runtime='nodejs';
export const POST=api(async(_req,user)=>{
 await db()`DELETE FROM linkedin_oauth_connections WHERE id='primary'`;
 await audit(user.id,'disconnect','linkedin_oauth','primary');
 return json({ok:true});
},{admin:true,write:true});
