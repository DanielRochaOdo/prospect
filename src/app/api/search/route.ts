import {api,json} from '@/lib/api';
import {searchSchema} from '@/lib/validation';
import {db} from '@/lib/db';
import {discover} from '@/services/discovery';
export const runtime='nodejs';
export const POST=api(async(req,user)=>{
 const query=searchSchema.parse(await req.json());
 const result=await discover(query,user);
 try{
  for(const item of result.items){
   const code=item.cnae?.replace(/\D/g,'');
   if(code&&/^\d{7}$/.test(code))await db()`INSERT INTO cnae_catalog(code,description) VALUES(${code},${item.segment??''}) ON CONFLICT(code) DO UPDATE SET description=CASE WHEN EXCLUDED.description<>'' THEN EXCLUDED.description ELSE cnae_catalog.description END,updated_at=now()`;
   if(item.segment)await db()`INSERT INTO business_activities(name,search_term) VALUES(${item.segment},${item.segment}) ON CONFLICT(name) DO UPDATE SET search_term=EXCLUDED.search_term,updated_at=now()`;
   if(item.state&&item.city&&item.district)await db()`INSERT INTO business_locations(state,city,district) VALUES(${item.state.toUpperCase()},${item.city},${item.district}) ON CONFLICT(state,city,district) DO UPDATE SET updated_at=now()`;
  }
 }catch(error){if(!(typeof error==='object'&&error!==null&&'code' in error&&(error as {code?:string}).code==='42P01'))throw error;}
 // Persistimos exclusivamente os filtros e contagens cadastrais; Google Maps não integra o CRM.
 const filters={...query,cursor:undefined};
 await db()`INSERT INTO search_history(user_id,provider,filters,results_count) VALUES (${user.id},'pesquisa',${db().json(filters)},${result.items.length})`;
 return json(result);
},{write:true});
