import {api,json,AppError} from '@/lib/api';import {db} from '@/lib/db';import {leadPatchSchema} from '@/lib/validation';import {audit} from '@/lib/auth';
const uid=(req:Request)=>{const p=new URL(req.url).pathname.split('/').at(-1)||'';if(!/^[0-9a-f-]{36}$/.test(p))throw new AppError(400,'ID inválido');return p;};
export const GET=api(async(req,user)=>{
 const id=uid(req);
 const rows=await db()`SELECT l.*,e.cnpj,e.trade_name,e.city,e.state,e.district,e.address,e.phone,e.email,e.cnae,e.segment,e.is_headquarters,
 c.legal_name,c.cnpj_root,u.name AS owner_name FROM leads l JOIN establishments e ON e.id=l.establishment_id JOIN companies c ON c.id=e.company_id JOIN users u ON u.id=l.owner_id
 WHERE l.id=${id} AND (${user.role==='admin'} OR l.owner_id=${user.id})`;
 if(!rows.length)throw new AppError(404,'Lead não encontrado.');
 const interactions=await db()`SELECT i.id,i.channel,i.description,i.happened_at,u.name AS user_name FROM lead_interactions i JOIN users u ON u.id=i.user_id WHERE i.lead_id=${id} ORDER BY i.happened_at DESC LIMIT 100`;
 return json({lead:rows[0],interactions});
});
export const PATCH=api(async(req,user)=>{
 const id=uid(req),input=leadPatchSchema.parse(await req.json());
 const existing=await db()`SELECT id FROM leads WHERE id=${id} AND (${user.role==='admin'} OR owner_id=${user.id})`;
 if(!existing.length)throw new AppError(404,'Lead não encontrado.');
 const result=await db()`UPDATE leads SET status=COALESCE(${input.status??null},status),notes=COALESCE(${input.notes??null},notes),
 next_contact_at=CASE WHEN ${input.nextContactAt!==undefined} THEN ${input.nextContactAt??null}::timestamptz ELSE next_contact_at END,updated_at=now()
 WHERE id=${id} RETURNING id,status,notes,next_contact_at`;
 await audit(user.id,'update','lead',id,{changed:Object.keys(input)});
 return json({lead:result[0]});
},{write:true});
export const DELETE=api(async(req,user)=>{
 const id=uid(req);
 const result=await db()`DELETE FROM leads WHERE id=${id} AND (${user.role==='admin'} OR owner_id=${user.id}) RETURNING id`;
 if(!result.length)throw new AppError(404,'Lead não encontrado.');
 await audit(user.id,'delete','lead',id);
 return json({ok:true});
},{write:true});
