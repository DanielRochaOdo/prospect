import {db} from '@/lib/db';
import {AppError} from '@/lib/errors';
import type {User} from '@/lib/auth';

export type Provider='cnpjai'|'localiza'|'google';
export type Operation='basic'|'branches'|'search'|'text_pro'|'text_enterprise';
export function periods(date=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(date);
 const v=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 return {month:`${v.year}-${v.month}`, minute:`${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`};
}
export async function reserve(provider:Provider,operation:Operation,user:User){
 const p=periods();const sql=db();
 return sql.begin(async tx=>{
  // Uma trava por provedor protege contra chamadas simultâneas entre funções serverless.
  await tx`SELECT pg_advisory_xact_lock(hashtext(${provider}))`;
  const config=await tx`SELECT monthly_limit, minute_limit, enabled FROM api_limits WHERE provider=${provider} AND operation=${operation}`;
  if(!config[0]?.enabled)throw new AppError(503,`Integração ${provider} desativada ou não configurada.`);
  const monthly=await tx`SELECT count(*)::int AS n FROM api_usage WHERE provider=${provider} AND operation=${operation} AND period_month=${p.month}`;
  if(config[0].monthly_limit!==null && monthly[0].n>=config[0].monthly_limit)throw new AppError(429,`Limite mensal de ${provider}/${operation} atingido.`);
  const minute=await tx`SELECT count(*)::int AS n FROM api_usage WHERE provider=${provider} AND period_minute=${p.minute}`;
  // A taxa por minuto é compartilhada por provedor. Usa-se o menor limite ativo do provedor.
  const rates=await tx`SELECT min(minute_limit)::int AS max FROM api_limits WHERE provider=${provider} AND enabled=true`;
  if(minute[0].n>=rates[0].max)throw new AppError(429,`Muitas consultas à API ${provider}. Aguarde um minuto.`);
  const inserted=await tx`INSERT INTO api_usage(user_id,provider,operation,period_month,period_minute) VALUES (${user.id},${provider},${operation},${p.month},${p.minute}) RETURNING id`;
  return inserted[0].id as string;
 });
}
export async function finish(id:string,status:number,duration:number){
 const state=status===404?'not_found':status===429?'rate_limited':status>=200&&status<300?'success':'error';
 await db()`UPDATE api_usage SET state=${state},http_status=${status},duration_ms=${duration},completed_at=now() WHERE id=${id}`;
}
export async function providerFetch(provider:Provider,operation:Operation,user:User,url:string,init:RequestInit={}){
 const id=await reserve(provider,operation,user);const start=Date.now();let status=0;
 try{
  const response=await fetch(url,{...init,cache:'no-store',signal:AbortSignal.timeout(20000)});
  status=response.status;
  if(!response.ok){
   if(status===404)throw new AppError(404,'Empresa ou estabelecimento não encontrado.');
   if(status===429)throw new AppError(429,'Limite do fornecedor atingido. Tente novamente mais tarde.');
   if(status===401||status===403)throw new AppError(503,`Credenciais de ${provider} inválidas ou sem permissão.`);
   if(status===409)throw new AppError(409,'A base da API foi atualizada. Reinicie a paginação.');
   throw new AppError(502,`Fornecedor ${provider} indisponível (HTTP ${status}).`);
  }
  return await response.json() as unknown;
 }catch(err){if(!status)status=503; if(err instanceof AppError)throw err;throw new AppError(502,`Falha de conexão com ${provider}.`);}
 finally{await finish(id,status,Date.now()-start);}
}
