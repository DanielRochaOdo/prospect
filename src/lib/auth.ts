import { cookies } from 'next/headers';
import { createHash, randomBytes } from 'node:crypto';
import { compare, hash } from 'bcryptjs';
import { db } from './db';
import { AppError } from './errors';
import 'server-only';
export type User = { id:string;name:string;email:string;role:'admin'|'operator' };
const cookieName='po_session';
export const hashPassword=(password:string)=>hash(password,12);
export const verifyPassword=(password:string,hashed:string)=>compare(password,hashed);
const tokenHash=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function currentUser():Promise<User|null>{
 const token=(await cookies()).get(cookieName)?.value;
 if(!token||!/^[a-f0-9]{64}$/.test(token))return null;
 const rows=await db()`SELECT u.id,u.name,u.email,u.role FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=${tokenHash(token)} AND s.expires_at>now() AND u.active=true LIMIT 1`;
 return (rows[0] as User|undefined)??null;
}
export async function requireUser(admin=false){
 const user=await currentUser();
 if(!user)throw new AppError(401,'Sessão expirada. Faça login novamente.');
 if(admin && user.role!=='admin')throw new AppError(403,'Acesso permitido apenas para administradores.');
 return user;
}
export async function createSession(userId:string){
 const token=randomBytes(32).toString('hex');
 await db()`INSERT INTO sessions(user_id,token_hash,expires_at) VALUES (${userId},${tokenHash(token)},now()+interval '7 days')`;
 (await cookies()).set(cookieName,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:7*86400});
}
export async function destroySession(){
 const store=await cookies();const token=store.get(cookieName)?.value;
 if(token&&/^[a-f0-9]{64}$/.test(token)) await db()`DELETE FROM sessions WHERE token_hash=${tokenHash(token)}`;
 store.delete(cookieName);
}
export function checkOrigin(request:Request){
 const origin=request.headers.get('origin');
 if(!origin)throw new AppError(403,'Origem ausente.');
 const requestUrl=new URL(request.url);
 const accepted=new Set([requestUrl.host,request.headers.get('x-forwarded-host')].filter(Boolean));
 if(!accepted.has(new URL(origin).host)) throw new AppError(403,'Origem não autorizada.');
}
export async function audit(userId:string|null,action:string,type:string,id?:string,details:Record<string,unknown>={}){
 await db()`INSERT INTO audit_logs(user_id,action,subject_type,subject_id,details) VALUES (${userId},${action},${type},${id??null},${db().json(details)})`;
}
