import {api,json,AppError} from '@/lib/api';import {db} from '@/lib/db';import {audit,hashPassword} from '@/lib/auth';import {z} from 'zod';import {passwordSchema} from '@/lib/validation';
const patch=z.object({name:z.string().trim().min(2).max(100).optional(),active:z.boolean().optional(),role:z.enum(['admin','operator']).optional(),password:passwordSchema.optional()});
export const PATCH=api(async(req,user)=>{
 const id=new URL(req.url).pathname.split('/').at(-1)||'';if(!/^[a-f0-9-]{36}$/.test(id))throw new AppError(400,'ID inválido');
 const payload=patch.parse(await req.json());
 const old=await db()`SELECT id,role,active FROM users WHERE id=${id}`;if(!old.length)throw new AppError(404,'Usuário não encontrado');
 if(user.id===id && (payload.active===false||payload.role==='operator'))throw new AppError(400,'Não é permitido retirar o seu próprio acesso de administrador.');
 const name=payload.name??null,role=payload.role??null,active=payload.active??null,password=payload.password?await hashPassword(payload.password):null;
 const result=await db()`UPDATE users SET name=COALESCE(${name},name),role=COALESCE(${role},role),active=COALESCE(${active},active),password_hash=COALESCE(${password},password_hash),updated_at=now() WHERE id=${id} RETURNING id,name,email,role,active`;
 if(payload.password||payload.active===false)await db()`DELETE FROM sessions WHERE user_id=${id}`;
 await audit(user.id,'update','user',id,{changed:Object.keys(payload)});
 return json({user:result[0]});
},{admin:true,write:true});
