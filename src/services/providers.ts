import type {User} from '@/lib/auth';
import {AppError} from '@/lib/errors';
import {normalizeCnpj,cnpjKind} from '@/lib/cnpj';
import {ficharioMode,ficharioPairs,ficharioRows,mapFichario,ficharioHasMore} from '@/lib/fichario';
import type {FicharioCursor} from '@/lib/fichario';
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
/**
 * Fichário é alternativa cadastral sem chave. Usa o endpoint específico para o filtro:
 * /busca (prefixo de nome), /busca-avancada (CNAE/UF ou UF/cidade), /cnpj (14 dígitos).
 * Limita a quatro páginas por pesquisa e não faz varredura em massa.
 */
export async function searchFichario(query:Search,user:User,cursor?:FicharioCursor){
 const mode=ficharioMode(query);
 if(!mode)throw new AppError(400,'O fallback Fichário exige CNPJ completo, nome, CNAE ou cidade com UF.');
 const pairs=ficharioPairs(query,mode);
 let pairIndex=Math.max(0,cursor?.pair??0),page=Math.max(1,cursor?.page??1);
 let calls=0;const items:CompanyResult[]=[];let failure:unknown;
 while(pairIndex<pairs.length&&items.length<query.pageSize&&calls<2){
  const pair=pairs[pairIndex];
  let url:URL;
  if(mode==='exact')url=new URL('https://fichario.app/api/v1/cnpj/'+normalizeCnpj(query.cnpj||''));
  else if(mode==='name'){
   url=new URL('https://fichario.app/api/v1/busca');
   url.searchParams.set('q',query.name?.trim()||'');
   url.searchParams.set('uf',pair.state);
   if(pair.city)url.searchParams.set('cidade',pair.city);
  }else{
   url=new URL('https://fichario.app/api/v1/busca-avancada');
   if(pair.cnae)url.searchParams.set('cnae',pair.cnae);
   url.searchParams.set('uf',pair.state);
   if(pair.city)url.searchParams.set('cidade',pair.city);
   url.searchParams.set('situacao','ativa');
   url.searchParams.set('por_pagina','20');
   url.searchParams.set('pagina',String(page));
  }
  try{
   const response=await providerFetch('fichario','search',user,url.toString());
   const rows=mode==='exact'?[response]:ficharioRows(response);
   for(const raw of rows){
    const item=mapFichario(raw);
    if(item)items.push(item);
   }
   calls++;
   if(mode==='advanced'&&ficharioHasMore(response,rows,page,20))page++;
   else{pairIndex++;page=1;}
  }catch(error){failure=error;break;}
 }
 // A busca por nome retorna somente dados resumidos. Completar um pequeno
 // conjunto com o endpoint cadastral do próprio Fichário melhora telefone e CNAE.
 // Falha individual de enriquecimento nunca elimina os resultados encontrados.
 if(mode==='name'&&items.length&&!failure){
  const targets=items.filter(item=>!item.phone).slice(0,3);
  const details=await Promise.allSettled(targets.map(item=>
   providerFetch('fichario','search',user,'https://fichario.app/api/v1/cnpj/'+item.cnpj)
  ));
  for(const detail of details){
   if(detail.status!=='fulfilled')continue;
   const full=mapFichario(detail.value);
   if(full)items.push(full);
  }
 }
 const next=!failure&&pairIndex<pairs.length?{pair:pairIndex,page}:null;
 return {items,nextCursor:next,partial:!!next,calls,
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
