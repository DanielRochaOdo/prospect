import {api,json,AppError} from '@/lib/api';import {db} from '@/lib/db';import {audit} from '@/lib/auth';import {z} from 'zod';import {periods} from '@/services/usage';
export const GET=api(async()=>{
 const period=periods().month;
 const rows=await db()`SELECT l.provider,l.operation,l.monthly_limit,l.minute_limit,l.enabled,l.updated_at,coalesce(u.used,0)::int AS used FROM api_limits l LEFT JOIN (SELECT provider,operation,count(*)::int AS used FROM api_usage WHERE period_month=${period} GROUP BY provider,operation) u ON u.provider=l.provider AND u.operation=l.operation ORDER BY l.provider,l.operation`;
 return json({limits:rows,month:period});
});
const schema=z.object({provider:z.enum(['cnpjai','localiza','google']),operation:z.enum(['basic','branches','search','text_pro','text_enterprise']),monthlyLimit:z.number().int().min(0).max(1000000).nullable(),minuteLimit:z.number().int().min(0).max(10000),enabled:z.boolean()});
export const PATCH=api(async(req,user)=>{
 const item=schema.parse(await req.json());
 const existing=await db()`SELECT provider FROM api_limits WHERE provider=${item.provider} AND operation=${item.operation}`;
 if(!existing.length)throw new AppError(404,'Limite não encontrado');
 await db()`UPDATE api_limits SET monthly_limit=${item.monthlyLimit},minute_limit=${item.minuteLimit},enabled=${item.enabled},updated_at=now() WHERE provider=${item.provider} AND operation=${item.operation}`;
 await audit(user.id,'update','api_limits',`${item.provider}:${item.operation}`,item);
 return json({ok:true});
},{admin:true,write:true});
