import {api,json} from '@/lib/api';
import {searchSchema} from '@/lib/validation';
import {db} from '@/lib/db';
import {searchCnpj,searchLocaliza,searchGoogle} from '@/services/providers';
export const runtime='nodejs';
export const POST=api(async(req,user)=>{
 const query=searchSchema.parse(await req.json());
 const result=query.source==='cnpjai'?await searchCnpj(query,user):query.source==='localiza'?await searchLocaliza(query,user):await searchGoogle(query,user);
 // No Google Maps Content é persistido; apenas filtros e quantidades agregadas.
 const filters={...query,cursor:undefined};
 await db()`INSERT INTO search_history(user_id,provider,filters,results_count) VALUES (${user.id},${query.source},${db().json(filters)},${result.items.length})`;
 return json({...result,source:query.source});
},{write:true});
