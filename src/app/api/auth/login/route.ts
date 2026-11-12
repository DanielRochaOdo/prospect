import {loginSchema} from '@/lib/validation';
import {db} from '@/lib/db';
import {createSession,verifyPassword,checkOrigin,audit} from '@/lib/auth';
import {errorResponse,AppError} from '@/lib/errors';
import {json} from '@/lib/api';
export const runtime='nodejs';
export async function POST(req:Request){try{
 checkOrigin(req);
 const {email,password}=loginSchema.parse(await req.json());
 const failed=await db()`SELECT count(*)::int AS n FROM login_attempts WHERE email=${email} AND created_at>now()-interval '15 minutes' AND success=false`;
 if(failed[0].n>=8)throw new AppError(429,'Muitas tentativas. Aguarde 15 minutos.');
 const rows=await db()`SELECT id,name,email,role,password_hash,active FROM users WHERE email=${email} LIMIT 1`;
 const valid=!!rows[0]?.active&&await verifyPassword(password,String(rows[0].password_hash));
 await db()`INSERT INTO login_attempts(email,success) VALUES (${email},${valid})`;
 if(!valid)throw new AppError(401,'E-mail ou senha inválidos.');
 await createSession(rows[0].id as string);
 await audit(rows[0].id as string,'login','session');
 return json({user:{id:rows[0].id,name:rows[0].name,email:rows[0].email,role:rows[0].role}});
}catch(err){return errorResponse(err);}}
