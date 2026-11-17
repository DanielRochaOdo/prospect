import {api,json} from '@/lib/api';
export const runtime='nodejs';
export const GET=api(async()=>json({enabled:false,message:'Integração LinkedIn Lead Sync desativada para a prospecção. Nenhum dado ou token foi excluído.'}),{admin:true});
