import {api,AppError} from '@/lib/api';
export const runtime='nodejs';
export const GET=api(async()=>{throw new AppError(410,'Integração LinkedIn Lead Sync desativada para a prospecção. Nenhum dado ou token foi excluído.');},{admin:true});
