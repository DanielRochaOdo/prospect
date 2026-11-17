import {api,AppError} from '@/lib/api';
export const runtime='nodejs';
// O histórico de autenticação e o token criptografado são preservados.
export const POST=api(async()=>{throw new AppError(410,'Integração LinkedIn Lead Sync desativada para a prospecção. Nenhum dado ou token foi excluído.');},{admin:true,write:true});
