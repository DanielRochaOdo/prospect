import {api,json} from '@/lib/api';
import {searchSchema} from '@/lib/validation';
import {db} from '@/lib/db';
import {discover} from '@/services/discovery';
export const runtime='nodejs';
export const POST=api(async(req,user)=>{
 const query=searchSchema.parse(await req.json());
 const result=await discover(query,user);
 // Persistimos exclusivamente os filtros e contagens cadastrais; Google Maps não integra o CRM.
 const filters={...query,cursor:undefined};
 await db()`INSERT INTO search_history(user_id,provider,filters,results_count) VALUES (${user.id},'pesquisa',${db().json(filters)},${result.items.length})`;
 return json(result);
},{write:true});
