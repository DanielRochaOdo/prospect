import type {User} from '@/lib/auth';
import {AppError} from '@/lib/errors';
import {normalizeCnpj,cnpjKind} from '@/lib/cnpj';
import {mergeRegistryCompanies} from '@/lib/company-merge';
import {searchCnpj,searchGoogle,searchLocaliza} from '@/services/providers';
import type {CompanyResult,PlaceResult} from '@/services/providers';
import type {searchSchema} from '@/lib/validation';
import type {z} from 'zod';

type Query=z.infer<typeof searchSchema>;
type CursorState={v:1;localiza?:string;cnpj?:string;localizaDone:boolean;cnpjDone:boolean};
export type SourceStatus={service:'localiza'|'cnpjai'|'google';state:'ok'|'error'|'skipped';message?:string};
function decodeCursor(input?:string):CursorState|null{
  if(!input)return null;
  try{
    const value=JSON.parse(Buffer.from(input,'base64url').toString('utf8')) as CursorState;
    if(value.v!==1||typeof value.localizaDone!=='boolean'||typeof value.cnpjDone!=='boolean'||(value.localiza&&typeof value.localiza!=='string')||(value.cnpj&&typeof value.cnpj!=='string'))throw Error();
    return value;
  }catch{throw new AppError(400,'Paginação inválida. Reinicie a pesquisa.');}
}
const encodeCursor=(s:CursorState)=>Buffer.from(JSON.stringify(s)).toString('base64url');
function matchesFilters(item:CompanyResult,query:Query){
  const norm=normalizeCnpj(query.cnpj??'');
  if(norm&&!item.cnpj.startsWith(norm))return false;
  if(query.activeOnly&&item.status&&item.status!=='02'&&item.status.toLowerCase()!=='ativa')return false;
  if(query.branches==='headquarters'&&item.isHeadquarters===false)return false;
  if(query.branches==='branches'&&item.isHeadquarters===true)return false;
  if(query.state&&item.state&&item.state.toUpperCase()!==query.state)return false;
  if(query.city&&item.city&&!item.city.toLocaleUpperCase('pt-BR').startsWith(query.city.toLocaleUpperCase('pt-BR')))return false;
  if(query.cnae&&item.cnae&&!item.cnae.replace(/\D/g,'').startsWith(query.cnae.replace(/\D/g,'')))return false;
  return true;
}
const errorMessage=(e:unknown)=>e instanceof Error?e.message:'Falha ao consultar o fornecedor';

/** Uma pesquisa de usuário. Fontes cadastrais geram leads; Google Maps nunca é incorporado aos registros exportáveis. */
export async function discover(query:Query,user:User){
  const doc=normalizeCnpj(query.cnpj||'');
  if(doc&&cnpjKind(doc)==='invalid')throw new AppError(400,'Informe uma raiz de 8 caracteres, prefixo ou CNPJ completo válido.');
  if(!doc&&!query.name&&!query.segment&&!query.cnae&&!query.city&&!query.state&&!query.district)throw new AppError(400,'Informe nome, segmento, CNAE, localização ou CNPJ para pesquisar.');
  const page=decodeCursor(query.cursor);
  const statuses:SourceStatus[]=[];
  const records:CompanyResult[]=[];
  let localCursor:string|null=null;
  let cnpjCursor:string|null=null;
  let localDone=page?.localizaDone??false;
  let cnpjDone=page?.cnpjDone??false;
  const firstPage=!page;
  const canUseLocaliza=!localDone;
  const canUseCnpj=!!doc&&!cnpjDone;

  // Descoberta cadastral e busca de matriz/filiais são independentes: uma falha não derruba as demais.
  const [localResult,rootResult]=await Promise.allSettled([
    canUseLocaliza?searchLocaliza({...query,cursor:page?.localiza},user):Promise.resolve(null),
    canUseCnpj?searchCnpj({...query,cursor:page?.cnpj},user):Promise.resolve(null)
  ]);
  if(canUseLocaliza){
    if(localResult.status==='fulfilled'&&localResult.value){
      records.push(...localResult.value.items);
      localCursor=localResult.value.nextCursor;
      localDone=!localCursor;
      statuses.push({service:'localiza',state:'ok'});
    }else if(localResult.status==='rejected'){
      statuses.push({service:'localiza',state:'error',message:errorMessage(localResult.reason)});
      localDone=true;
    }
  }
  if(canUseCnpj){
    if(rootResult.status==='fulfilled'&&rootResult.value){
      records.push(...rootResult.value.items);
      cnpjCursor=rootResult.value.nextCursor;
      cnpjDone=!cnpjCursor;
      statuses.push({service:'cnpjai',state:'ok'});
    }else if(rootResult.status==='rejected'){
      statuses.push({service:'cnpjai',state:'error',message:errorMessage(rootResult.reason)});
      cnpjDone=true;
    }
  }

  // Na pesquisa por segmento, enriquece no máximo cinco CNPJs distintos por página.
  // O teto evita consumo descontrolado e excesso de chamadas simultâneas.
  if(!doc&&records.length){
    const toEnrich=mergeRegistryCompanies(records).filter(x=>!x.phone||!x.email).slice(0,5);
    const lookups=await Promise.allSettled(toEnrich.map(company=>searchCnpj({
      ...query,cnpj:company.cnpj,cursor:undefined,pageSize:1
    },user)));
    let success=0;let errors=0;
    for(const result of lookups){if(result.status==='fulfilled'){records.push(...result.value.items);success++;}else errors++;}
    statuses.push({service:'cnpjai',state:success?'ok':errors?'error':'skipped',message:errors?`${errors} consulta(s) cadastral(is) não concluída(s).`:undefined});
  }else if(!doc&&!records.length){
    statuses.push({service:'cnpjai',state:'skipped',message:'Não houve CNPJ para complementar os contatos.'});
  }

  const items=mergeRegistryCompanies(records.filter(row=>matchesFilters(row,query)));
  let places:PlaceResult[]=[];
  // Google é somente consulta contextual instantânea, e nunca é usado na composição do CRM.
  if(firstPage){
    const googleQuery={...query,name:query.name||(doc?items[0]?.tradeName||items[0]?.legalName||'':''),
      segment:doc?'':query.segment,cursor:undefined,pageSize:Math.min(8,query.pageSize)};
    if(googleQuery.name||googleQuery.segment){
      try{const result=await searchGoogle(googleQuery,user);places=result.items;statuses.push({service:'google',state:'ok'});}
      catch(e){statuses.push({service:'google',state:'error',message:errorMessage(e)});}
    }else statuses.push({service:'google',state:'skipped',message:'Não foi possível identificar um nome para consulta de localização.'});
  }

  const anyOk=statuses.some(s=>s.state==='ok');
  if(!anyOk&&!page){const message=statuses.filter(s=>s.state==='error').map(s=>s.message).filter(Boolean).join(' | ');throw new AppError(503,message||'Nenhuma fonte disponível para esta pesquisa.');}
  const nextCursor=(!localDone||(!cnpjDone&&!!doc))?encodeCursor({v:1,localiza:localCursor??undefined,cnpj:cnpjCursor??undefined,localizaDone:localDone,cnpjDone:cnpjDone}):null;
  return {items,places,sourceStatus:statuses,nextCursor,partial:!!nextCursor,
    phoneCount:items.filter(x=>!!x.phone).length};
}
