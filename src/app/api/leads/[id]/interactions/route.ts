import {api,json,AppError} from '@/lib/api';import {db} from '@/lib/db';import {audit} from '@/lib/auth';import {interactionSchema} from '@/lib/validation';
export const POST=api(async(req,user)=>{
 const id=new URL(req.url).pathname.split('/').at(-2)||'';
 if(!/^[0-9a-f-]{36}$/.test(id))throw new AppError(400,'ID inválido');
 const input=interactionSchema.parse(await req.json());
 const own=await db()`SELECT id FROM leads WHERE id=${id} AND (${user.role==='admin'} OR owner_id=${user.id})`;
 if(!own.length)throw new AppError(404,'Lead não encontrado.');
 const rows=await db()`INSERT INTO lead_interactions(lead_id,user_id,channel,description) VALUES (${id},${user.id},${input.channel},${input.description}) RETURNING id`;
 await audit(user.id,'create','lead_interaction',rows[0].id,{lead:id});
 return json({id:rows[0].id},201);
},{write:true});
