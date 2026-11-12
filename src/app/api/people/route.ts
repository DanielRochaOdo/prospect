import {api,json} from '@/lib/api';
import {discoverPeople} from '@/services/people';
import {z} from 'zod';
export const runtime='nodejs';
const schema=z.object({
 companyName:z.string().trim().min(3).max(150),
 cnpj:z.string().trim().min(14).max(18),
 tradeName:z.string().trim().max(200).nullable().optional()
});
export const POST=api(async(req,user)=>{
 const input=schema.parse(await req.json());
 return json(await discoverPeople(input,user));
},{write:true});
