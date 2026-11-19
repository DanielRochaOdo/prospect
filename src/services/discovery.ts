import type {User} from '@/lib/auth';
import {AppError} from '@/lib/errors';
import {normalizeCnpj,cnpjKind} from '@/lib/cnpj';
import {mergeRegistryCompanies} from '@/lib/company-merge';
import {shouldFallbackFichario,ficharioMode} from '@/lib/fichario';
import type {FicharioCursor} from '@/lib/fichario';
import {searchCnpj,searchFichario,searchGoogle,searchLocaliza} from '@/services/providers';
import type {CompanyResult,PlaceResult} from '@/services/providers';
import type {searchSchema} from '@/lib/validation';
import type {z} from 'zod';

type Query=z.infer<typeof searchSchema>;
type CursorState={v:1;localiza?:string;cnpj?:string;localizaDone:boolean;cnpjDone:boolean;fichario?:FicharioCursor;ficharioActive?:boolean;ficharioDone?:boolean};
export type SourceStatus={service:'localiza'|'fichario'|'cnpjai'|'google';state:'ok'|'error'|'skipped';message?:string};
function decodeCursor(input?:string):CursorState|null{
  if(!input)return null;
  try{
    const value=JSON.parse(Buffer.from(input,'base64url').toString('utf8')) as CursorState;
    if(value.v!==1||typeof value.localizaDone!=='boolean'||typeof value.cnpjDone!=='boolean'||(value.localiza&&typeof value.localiza!=='string')||(value.cnpj&&typeof value.cnpj!=='string')||(value.fichario&&(!Number.isInteger(value.fichario.pair)||value.fichario.pair<0||!Number.isInteger(value.fichario.page)||value.fichario.page<1))||(value.ficharioActive!==undefined&&typeof value.ficharioActive!=='boolean')||(value.ficharioDone!==undefined&&typeof value.ficharioDone!=='boolean'))throw Error();
    return value;
  }catch{throw new AppError(400,'Paginação inválida. Reinicie a pesquisa.');}
}
const encodeCursor=(s:CursorState)=>Buffer.from(JSON.stringify(s)).toString('base64url');
function matchesFilters(item:CompanyResult,query:Query){
  const values=(value:string|string[]|undefined)=>value===undefined?[]:Array.isArray(value)?value:[value];
  const states=values(query.state),cities=values(query.city),districts=values(query.district),cnaes=values(query.cnae),segments=values(query.segment);
  const norm=normalizeCnpj(query.cnpj??'');
  if(norm&&!item.cnpj.startsWith(norm))return false;
  if(query.name&&!`${item.legalName} ${item.tradeName??''}`.toLocaleLowerCase('pt-BR').includes(query.name.toLocaleLowerCase('pt-BR')))return false;
  if(query.activeOnly&&item.status&&item.status!=='02'&&item.status.toLowerCase()!=='ativa')return false;
  if(query.branches==='headquarters'&&item.isHeadquarters===false)return false;
  if(query.branches==='branches'&&item.isHeadquarters===true)return false;
  if(states.length&&(!item.state||!states.includes(item.state.toUpperCase())))return false;
  if(cities.length&&(!item.city||!cities.some(x=>item.city!.toLocaleUpperCase('pt-BR').startsWith(x.toLocaleUpperCase('pt-BR')))))return false;
  if(districts.length&&(!item.district||!districts.some(x=>item.district!.toLocaleUpperCase('pt-BR').startsWith(x.toLocaleUpperCase('pt-BR')))))return false;
  if(cnaes.length&&(!item.cnae||!cnaes.some(x=>item.cnae!.replace(/\D/g,'').startsWith(x.replace(/\D/g,'')))))return false;
  if(segments.length&&(!item.segment||!segments.some(x=>item.segment!.toLocaleLowerCase('pt-BR').includes(x.toLocaleLowerCase('pt-BR')))))return false;
  return true;
}
const errorMessage=(e:unknown)=>e instanceof Error?e.message:'Falha ao consultar o fornecedor';

/** Uma pesquisa de usuário. Fontes cadastrais geram leads; Google Maps nunca é incorporado aos registros exportáveis. */
export async function discover(query:Query,user:User,options:{includePlaces?:boolean}={}){
  const doc=normalizeCnpj(query.cnpj||'');
  if(doc&&cnpjKind(doc)==='invalid')throw new AppError(400,'Informe uma raiz de 8 caracteres, prefixo ou CNPJ completo válido.');
  const has=(value:unknown)=>Array.isArray(value)?value.length>0:!!value;
  if(!doc&&!query.name&&!has(query.sector)&&!has(query.segment)&&!has(query.cnae)&&!has(query.city)&&!has(query.state)&&!has(query.district))throw new AppError(400,'Informe nome, segmento, CNAE, localização ou CNPJ para pesquisar.');
  const page=decodeCursor(query.cursor);
  const statuses:SourceStatus[]=[];
  const records:CompanyResult[]=[];
  let localCursor:string|null=null;
  let cnpjCursor:string|null=null;
  let localDone=page?.localizaDone??false;
  let cnpjDone=page?.cnpjDone??false;
  let ficharioCursor=page?.fichario;
  let ficharioActive=page?.ficharioActive??false;
  let ficharioDone=page?.ficharioDone??false;
  const firstPage=!page;
  const selectedSegments=Array.isArray(query.segment)?query.segment:query.segment?[query.segment]:[];
  const selectedSectors=Array.isArray(query.sector)?query.sector:query.sector?[query.sector]:[];
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

  // O fallback precisa funcionar também com nome e cidade, não apenas com CNAE.
  // Só é acionado se não houver resultados cadastrais compatíveis com os filtros
  // ou se a LocalizaCNPJ falhar. Não repete páginas já esgotadas.
  const eligible=records.filter(row=>matchesFilters(row,query)).length;
  const shouldFallback=shouldFallbackFichario(
    query,eligible,localResult.status==='rejected',ficharioActive,ficharioDone
  );
  if(shouldFallback){
    ficharioActive=true;
    try{
      const result=await searchFichario({...query,cursor:undefined},user,page?.fichario);
      records.push(...result.items);
      ficharioCursor=result.nextCursor??undefined;
      ficharioDone=!ficharioCursor;
      const mode=ficharioMode(query);
      const note=mode==='name'?'O Fichário busca pelo início do nome empresarial ou fantasia.':
       mode==='advanced'?'Fallback Fichário: CNAE principal ou localização.':'Consulta cadastral Fichário por CNPJ.';
      statuses.push({service:'fichario',state:result.error?'error':'ok',message:result.error??note});
    }catch(e){
      ficharioDone=true;
      statuses.push({service:'fichario',state:'error',message:errorMessage(e)});
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
  if(firstPage&&options.includePlaces!==false){
    const googleQuery={...query,name:query.name||(doc?items[0]?.tradeName||items[0]?.legalName||'':''),
      segment:doc?[]:selectedSegments,sector:selectedSectors,cursor:undefined,pageSize:Math.min(8,query.pageSize)};
    if(googleQuery.name||googleQuery.segment.length||googleQuery.sector.length){
      try{const result=await searchGoogle(googleQuery,user);places=result.items;statuses.push({service:'google',state:'ok'});}
      catch(e){statuses.push({service:'google',state:'error',message:errorMessage(e)});}
    }else statuses.push({service:'google',state:'skipped',message:'Não foi possível identificar um nome para consulta de localização.'});
  }

  const anyOk=statuses.some(s=>s.state==='ok');
  const nextCursor=(anyOk||!!ficharioCursor)&&(!localDone||(!cnpjDone&&!!doc)||!!ficharioCursor)?encodeCursor({v:1,localiza:localCursor??undefined,cnpj:cnpjCursor??undefined,localizaDone:localDone,cnpjDone:cnpjDone,fichario:ficharioCursor,ficharioActive,ficharioDone}):null;
  return {items,places,sourceStatus:statuses,nextCursor,partial:!!nextCursor,
    phoneCount:items.filter(x=>!!x.phone).length};
}
