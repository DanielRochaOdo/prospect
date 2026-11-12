import {api,json} from '@/lib/api';
import {discoverPeople} from '@/services/people';
import {z} from 'zod';
export const runtime='nodejs';
const schema=z.object({companyName:z.string().trim().min(3).max(150),domain:z.string().trim().max(253).optional(),includeHunter:z.boolean().default(true)});
/** Acionado por empresa. Evita gastar créditos Hunter em todos os resultados automaticamente. */
export const POST=api(async(req,user)=>{
 const input=schema.parse(await req.json());
 return json(await discoverPeople(input,user));
},{write:true});
