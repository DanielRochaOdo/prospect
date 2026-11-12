import {api,json,AppError} from '@/lib/api';
import {db} from '@/lib/db';
import {hashPassword,audit} from '@/lib/auth';
import {newUserSchema} from '@/lib/validation';
export const GET=api(async()=>json({users:await db()`SELECT id,name,email,role,active,created_at FROM users ORDER BY created_at DESC`}),{admin:true});
export const POST=api(async(req,user)=>{
 const payload=newUserSchema.parse(await req.json());const hashed=await hashPassword(payload.password);
 const existing=await db()`SELECT id FROM users WHERE email=${payload.email}`;
 if(existing.length)throw new AppError(409,'Já existe usuário com este e-mail.');
 const result=await db()`INSERT INTO users(name,email,password_hash,role) VALUES (${payload.name},${payload.email},${hashed},${payload.role}) RETURNING id,name,email,role,active`;
 await audit(user.id,'create','user',result[0].id);
 return json({user:result[0]},201);
},{admin:true,write:true});
