import {api,json,AppError} from '@/lib/api';
import {linkedinLeadForms} from '@/services/linkedin-read';
export const runtime='nodejs';
export const GET=api(async(req)=>{
 const id=new URL(req.url).searchParams.get('accountId')||'';
 if(!/^\d{1,20}$/.test(id))throw new AppError(400,'Selecione uma conta de anúncios válida.');
 return json(await linkedinLeadForms(id));
},{admin:true});
