import type {User} from '@/lib/auth';
import {AppError} from '@/lib/errors';
import {normalizeCnpj,cnpjKind} from '@/lib/cnpj';
import {providerFetch} from './usage';
import type {z} from 'zod';
import type {searchSchema} from '@/lib/validation';

type Search=z.infer<typeof searchSchema>;
export type CompanyResult={
 cnpj:string; cnpjRoot:string; legalName:string;tradeName:string|null;
 isHeadquarters:boolean|null;status:string|null;cnae:string|null;segment:string|null;
 city:string|null;state:string|null;district:string|null;address:string|null;postalCode:string|null;
 phone:string|null;email:string|null;source:'cnpjai'|'localiza'|'fichario';
};
export type PlaceResult={id:string;name:string;address:string;mapsUrl:string;phone:string|null};
const str=(value:unknown):string|null=>typeof value==='string'&&value.trim()?value.trim():null;
const address=(r:Record<string,unknown>)=>[str(r.tipo_logradouro),str(r.logradouro),str(r.numero),str(r.complemento)].filter(Boolean).join(' ')||null;
const phone=(r:Record<string,unknown>)=>{
 const raw=str(r.telefone1)??str(r.telefone_1)??str(r.numero_telefone_1)??str(r.telefone2)??str(r.telefone);
 if(!raw)return null;
 const area=str(r.ddd1)??str(r.ddd_telefone_1)??str(r.ddd2);
 return [area,raw].filter(Boolean).join(' ');
};
const object=(input:unknown):Record<string,unknown>=>input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{};
export function mapCompany(input:unknown,source:'cnpjai'|'localiza',companyInput?:unknown):CompanyResult|null{
 const r=object(input), c=object(companyInput??r.empresa);
 const full=str(r.cnpj)??str(r.cnpj_completo)??`${str(r.cnpj_basico)??''}${str(r.cnpj_ordem)??''}${str(r.cnpj_dv)??''}`;
 const cnpj=normalizeCnpj(full);
 if(cnpj.length!==14)return null;
 const root=cnpj.slice(0,8);
 const descriptions=object(r.descricoes);
 const legalName=str(c.razao_social)??str(r.razao_social)??'Razão social não informada';
 const status=str(descriptions.situacao_cadastral)??(String(r.situacao_cadastral??r.situacao)==='02'?'Ativa':str(r.situacao_cadastral??r.situacao));
 const matrix=str(r.identificador_matriz_filial);
 return {cnpj,cnpjRoot:root,legalName,tradeName:str(r.nome_fantasia),isHeadquarters:matrix==='1'?true:matrix==='2'?false:null,
 status,cnae:str(r.cnae_fiscal_principal??r.cnae_principal),segment:str(descriptions.cnae_fiscal_principal??r.cnae_descricao),
 city:str(descriptions.municipio??r.municipio),state:str(r.uf),district:str(r.bairro),address:address(r),postalCode:str(r.cep),phone:phone(r),email:str(r.correio_eletronico),source};
}
function apiKey(name:string):string{const key=process.env[name];if(!key)throw new AppError(503,`Configure ${name} na Vercel para habilitar esta pesquisa.`);return key;}
const auth=(key:string)=>({Authorization:`Bearer ${key}`});
export async function searchCnpj(query:Search,user:User){
 const cnpj=normalizeCnpj(query.cnpj||'');const kind=cnpjKind(cnpj);
 if(kind==='invalid')throw new AppError(400,'Informe a raiz (8 caracteres) ou um CNPJ válido (14 caracteres).');
 const key=apiKey('CNPJ_AI_API_KEY');
 if(kind==='exact'){
  const result=object(await providerFetch('cnpjai','basic',user,`https://api.cnpj.ai/v2/estabelecimentos/${cnpj}/basic`,{headers:auth(key)}));
  const dados=object(result.dados);
  const row=mapCompany(dados.estabelecimento,'cnpjai',dados.empresa);
  return {items:row?[row]:[],nextCursor:null,partial:false};
 }
 // Com prefixos de 9 a 13 posições, a coleta avança até encontrar 20 coincidências ou esgotar a base.
 const root=cnpj.slice(0,8);const prefix=cnpj;let cursor=query.cursor||'';
 const items:CompanyResult[]=[];let totalScanned=0;let loops=0;let next:string|null=null;
 do{
  const url=new URL(`https://api.cnpj.ai/v2/empresas/${root}/estabelecimentos`);
  url.searchParams.set('limite',String(Math.min(query.pageSize,100)));
  if(cursor)url.searchParams.set('cursor',cursor);
  const result=object(await providerFetch('cnpjai','branches',user,url.toString(),{headers:auth(key)}));
  const dados=object(result.dados);
  const collection=Array.isArray(dados.itens)?dados:object(dados.estabelecimentos);
  const raw=Array.isArray(collection.itens)?collection.itens:[];
  totalScanned+=raw.length;
  for(const value of raw){const row=mapCompany(value,'cnpjai',dados.empresa);
    if(!row||!row.cnpj.startsWith(prefix))continue;
    if(query.activeOnly&&row.status?.toLowerCase()!=='ativa'&&row.status!=='02')continue;
    if(query.branches==='headquarters'&&row.isHeadquarters===false)continue;
    if(query.branches==='branches'&&row.isHeadquarters===true)continue;
    items.push(row);
  }
  next=str(collection.proximo_cursor);
  cursor=next??'';loops++;
 }while(kind==='prefix'&&next&&items.length<query.pageSize&&loops<12);
 return {items:items.slice(0,query.pageSize),nextCursor:next,partial:kind==='prefix'&&!!next,scanned:totalScanned};
}
export async function searchLocaliza(query:Search,user:User){
 const list=(value:string|string[]|undefined)=>value===undefined?[]:Array.isArray(value)?value:[value];
 const key=apiKey('LOCALIZACNPJ_API_KEY');
 const url=new URL('https://api.localizacnpj.com.br/busca/filtros');
 if(query.cnpj){const c=normalizeCnpj(query.cnpj);if(cnpjKind(c)==='invalid')throw new AppError(400,'CNPJ inválido');url.searchParams.set('cnpj',c.length===14?c:c.slice(0,8));}
 if(query.name)url.searchParams.set('razao_social',query.name);
 const cnaes=list(query.cnae),activities=[...list(query.sector),...list(query.segment)];
 if(cnaes.length)url.searchParams.set('cnae',cnaes.join(','));
 else if(activities.length)url.searchParams.set('atividade',activities.join(','));
 const cities=list(query.city),states=list(query.state),districts=list(query.district);
 if(cities.length)url.searchParams.set('cidade',cities.join(','));
 if(states.length)url.searchParams.set('uf',states.join(','));
 if(districts.length)url.searchParams.set('bairro',districts.join(','));
 if(query.activeOnly)url.searchParams.set('situacao','02');
 if(query.cursor)url.searchParams.set('cursor',query.cursor);
 url.searchParams.set('limit',String(query.pageSize));
 if([...url.searchParams.keys()].every(k=>k==='limit'||k==='cursor'))throw new AppError(400,'Informe ao menos um filtro de pesquisa.');
 const result=object(await providerFetch('localiza','search',user,url.toString(),{headers:auth(key)}));
 let items=(Array.isArray(result.resultados)?result.resultados:[]).map(r=>mapCompany(r,'localiza')).filter((r):r is CompanyResult=>!!r);
 const norm=normalizeCnpj(query.cnpj||'');
 if(norm.length>8&&norm.length<14)items=items.filter(i=>i.cnpj.startsWith(norm));
 if(query.branches==='branches')items=items.filter(i=>i.isHeadquarters===false);
 if(query.branches==='headquarters')items=items.filter(i=>i.isHeadquarters===true);
 return {items,nextCursor:str(result.next_cursor),partial:!!result.has_more,snapshot:str(result.snapshot)};
}
const allStates=['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];
type FicharioCursor={pair:number;page:number};
const firstValue=(row:Record<string,unknown>,...keys:string[])=>{
 for(const key of keys){const value=row[key];if(typeof value==='string'&&value.trim())return value.trim();if(typeof value==='number'||typeof value==='boolean')return String(value);}
 return null;
};
function ficharioRows(input:Record<string,unknown>):Record<string,unknown>[]{
 for(const key of ['resultados','results','empresas','items','data']){
  const value=input[key];
  if(Array.isArray(value))return value.map(object);
  if(value&&typeof value==='object'){
   const nested=ficharioRows(object(value));
   if(nested.length)return nested;
  }
 }
 return [];
}
function mapFichario(input:Record<string,unknown>):CompanyResult|null{
 const full=normalizeCnpj(firstValue(input,'cnpj','cnpj_completo','cnpjCompleto','documento')??'');
 if(full.length!==14)return null;
 const matrix=firstValue(input,'identificador_matriz_filial','matriz_filial','tipo_estabelecimento','isHeadquarters','matriz');
 const isHeadquarters=matrix==='1'||matrix?.toLowerCase()==='matriz'||matrix==='true'?true:
  matrix==='2'||matrix?.toLowerCase()==='filial'||matrix==='false'?false:null;
 return {cnpj:full,cnpjRoot:full.slice(0,8),
  legalName:firstValue(input,'razao_social','nome_empresarial','legalName')??'Razão social não informada',
  tradeName:firstValue(input,'nome_fantasia','fantasia','tradeName'),isHeadquarters,
  status:firstValue(input,'situacao_cadastral','situacao','status'),
  cnae:firstValue(input,'cnae_fiscal_principal','cnae_principal','cnaePrincipal','cnae'),
  segment:firstValue(input,'cnae_descricao','descricao_cnae','cnaeDescription','atividade'),
  city:firstValue(input,'municipio','cidade','city'),state:firstValue(input,'uf','estado','state'),
  district:firstValue(input,'bairro'),
  address:[firstValue(input,'tipo_logradouro'),firstValue(input,'logradouro'),firstValue(input,'numero'),firstValue(input,'complemento')].filter(Boolean).join(' ')||firstValue(input,'endereco'),
  postalCode:firstValue(input,'cep','zipCode'),
  phone:firstValue(input,'telefone','telefone1','telefone_1','numero_telefone','phone'),
  email:firstValue(input,'email','correio_eletronico'),source:'fichario'};
}
function ficharioHasMore(response:Record<string,unknown>,rows:Record<string,unknown>[],page:number,pageSize:number){
 const explicit=response.has_more??response.hasMore;
 if(typeof explicit==='boolean')return explicit&&page<50;
 const pages=Number(response.total_paginas??response.totalPages??response.total_pages);
 if(Number.isFinite(pages)&&pages>0)return page<Math.min(50,pages);
 return rows.length>=pageSize&&page<50;
}
export async function searchFichario(query:Search,user:User,cursor?:FicharioCursor){
 const list=(value:string|string[]|undefined)=>value===undefined?[]:Array.isArray(value)?value:[value];
 const cnaes=list(query.cnae).map(value=>value.replace(/\D/g,'')).filter(value=>/^\d{7}$/.test(value));
 const states=list(query.state).map(value=>value.toUpperCase()).filter(value=>allStates.includes(value));
 if(!states.length)throw new AppError(400,'Selecione ao menos uma UF para pesquisar no Fichário.');
 const cities=list(query.city);
 const regions=states;
 const cityFilters=cities.length?cities:[''];
 const pairs=cnaes.flatMap(cnae=>regions.flatMap(state=>cityFilters.map(city=>({cnae,state,city}))));
 let pairIndex=Math.max(0,cursor?.pair??0),page=Math.max(1,cursor?.page??1);
 let calls=0;const items:CompanyResult[]=[];let failure:unknown;
 while(pairIndex<pairs.length&&items.length<query.pageSize&&calls<27){
  const pair=pairs[pairIndex];
  const pageSize=Math.min(20,query.pageSize-items.length);
  const url=new URL('https://fichario.app/api/v1/busca-avancada');
  url.searchParams.set('cnae',pair.cnae);url.searchParams.set('uf',pair.state);
  if(pair.city)url.searchParams.set('cidade',pair.city);
  url.searchParams.set('situacao','ativa');
  url.searchParams.set('por_pagina',String(pageSize));url.searchParams.set('pagina',String(page));
  try{
   const response=object(await providerFetch('fichario','search',user,url.toString()));
   const rows=ficharioRows(response);
   for(const raw of rows.slice(0,pageSize)){const item=mapFichario(raw);if(item)items.push(item);}
   calls++;
   if(ficharioHasMore(response,rows,page,pageSize))page++;
   else{pairIndex++;page=1;}
  }catch(error){failure=error;break;}
 }
 const next=pairIndex<pairs.length?{pair:pairIndex,page}:null;
 return {items:items.slice(0,query.pageSize),nextCursor:next,partial:!!next,calls,
  error:failure instanceof Error?failure.message:failure?String(failure):undefined};
}
export async function searchGoogle(query:Search,user:User){
 const key=apiKey('GOOGLE_PLACES_API_KEY');
 const list=(value:string|string[]|undefined)=>value===undefined?[]:Array.isArray(value)?value:[value];
 const segments=[...list(query.sector),...list(query.segment)],districts=list(query.district),cities=list(query.city),states=list(query.state);
 if(!segments.length&&!query.name)throw new AppError(400,'Informe segmento ou nome do local.');
 const text=[query.name,...segments,...districts,...cities,...states,'Brasil'].filter(Boolean).join(', ');
 const result=object(await providerFetch('google','text_enterprise',user,'https://places.googleapis.com/v1/places:searchText',{
  method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.nationalPhoneNumber,places.internationalPhoneNumber,nextPageToken'},
  body:JSON.stringify({textQuery:text,pageSize:Math.min(20,query.pageSize),languageCode:'pt-BR',regionCode:'BR',...(query.cursor?{pageToken:query.cursor}:{})})
 }));
 const items=(Array.isArray(result.places)?result.places:[]).map((v)=>{
  const r=object(v), n=object(r.displayName);return {id:String(r.id||''),name:String(n.text||'Sem nome'),address:String(r.formattedAddress||''),mapsUrl:String(r.googleMapsUri||''),phone:str(r.nationalPhoneNumber)??str(r.internationalPhoneNumber)};
 });
 return {items,nextCursor:str(result.nextPageToken),partial:!!result.nextPageToken};
}
