import {db} from '@/lib/db';
import {hashPassword,checkOrigin,audit} from '@/lib/auth';
import {newUserSchema} from '@/lib/validation';
import {errorResponse,AppError} from '@/lib/errors';
export const runtime='nodejs';
export async function GET(){try{const count=await db()`SELECT count(*)::int AS n FROM users`;return Response.json({available:count[0].n===0});}catch(err){return errorResponse(err);}}
export async function POST(req:Request){try{
 checkOrigin(req);
 const secret=process.env.SETUP_TOKEN;
 if(!secret||secret.length<32)throw new AppError(503,'SETUP_TOKEN não configurado com pelo menos 32 caracteres.');
 const payload=await req.json();
 const input=newUserSchema.parse({...payload,role:'admin'});
 const {timingSafeEqual}=await import('node:crypto');
 const received=Buffer.from(String(payload.setupToken||''));const expected=Buffer.from(secret);
 if(received.length!==expected.length||!timingSafeEqual(received,expected))throw new AppError(403,'Token de configuração inválido.');
 const hash=await hashPassword(input.password);
 const result=await db().begin(async tx=>{
   await tx`SELECT pg_advisory_xact_lock(81828817)`;
   const count=await tx`SELECT count(*)::int AS n FROM users`;
   if(count[0].n>0)throw new AppError(409,'Administrador inicial já configurado.');
   const rows=await tx`INSERT INTO users(name,email,password_hash,role) VALUES(${input.name},${input.email},${hash},'admin') RETURNING id`;
   return rows[0].id as string;
 });
 await audit(result,'initial_admin_created','user',result);
 return Response.json({ok:true},{status:201});
}catch(err){return errorResponse(err);}}
