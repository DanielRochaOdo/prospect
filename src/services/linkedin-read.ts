import {db} from '@/lib/db';
import {decryptLinkedInToken} from '@/lib/linkedin-crypto';
import {AppError} from '@/lib/errors';
import {readAccounts,readForms} from '@/lib/linkedin-lead-parser';

const version='202610'; // versão documentada e suportada em novembro de 2026

async function accessToken():Promise<string>{
 const rows=await db()`SELECT access_token_encrypted,token_expires_at
  FROM linkedin_oauth_connections WHERE id='primary' LIMIT 1`;
 const current=rows[0];
 if(!current)throw new AppError(409,'LinkedIn não está conectado. Autorize em Configurações.');
 if(new Date(String(current.token_expires_at)).getTime()<=Date.now())
  throw new AppError(409,'Token LinkedIn expirado. Reconecte a conta.');
 const key=process.env.LINKEDIN_TOKEN_ENCRYPTION_KEY;
 if(!key)throw new AppError(503,'Chave de criptografia LinkedIn não configurada.');
 try{return decryptLinkedInToken(String(current.access_token_encrypted),key);}
 catch{throw new AppError(503,'Token LinkedIn indisponível. Reconecte sua conta nas Configurações.');}
}
async function linkedInGet(url:string):Promise<unknown>{
 const token=await accessToken();
 let response:Response;
 try{
  response=await fetch(url,{
   method:'GET',headers:{
    Authorization:'Bearer '+token,
    'Linkedin-Version':version,
    'X-Restli-Protocol-Version':'2.0.0',
    Accept:'application/json'
   },
   cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)
  });
 }catch{throw new AppError(502,'Não foi possível conectar ao LinkedIn. Tente novamente.');}
 if(!response.ok){
  if(response.status===401)throw new AppError(401,'LinkedIn não aceitou o token. Reconecte a conta.');
  if(response.status===403)throw new AppError(403,'LinkedIn negou acesso: confira sua função na conta de anúncios e na página da empresa.');
  if(response.status===429)throw new AppError(429,'Limite de consultas do LinkedIn atingido. Tente mais tarde.');
  throw new AppError(502,'A consulta ao LinkedIn falhou (HTTP '+response.status+'). Verifique as permissões e a conta de anúncios.');
 }
 try{return await response.json();}
 catch{throw new AppError(502,'O LinkedIn retornou uma resposta inesperada.');}
}
export async function linkedinAdAccounts(){
 const data=await linkedInGet('https://api.linkedin.com/rest/adAccounts?q=search&pageSize=100');
 return readAccounts(data);
}
export async function linkedinLeadForms(accountId:string){
 if(!/^\d{1,20}$/.test(accountId))throw new AppError(400,'Identificador da conta de anúncios inválido.');
 const owner='urn:li:sponsoredAccount:'+accountId;
 const url='https://api.linkedin.com/rest/leadForms?owner=(sponsoredAccount:'+
  encodeURIComponent(owner)+')&q=owner&count=50&start=0';
 const data=await linkedInGet(url);
 return readForms(data);
}
