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
 phone:string|null;email:string|null;source:'cnpjai'|'localiza';
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
 const key=apiKey('LOCALIZACNPJ_API_KEY');
 const url=new URL('https://api.localizacnpj.com.br/busca/filtros');
 if(query.cnpj){const c=normalizeCnpj(query.cnpj);if(cnpjKind(c)==='invalid')throw new AppError(400,'CNPJ inválido');url.searchParams.set('cnpj',c.length===14?c:c.slice(0,8));}
 if(query.name)url.searchParams.set('razao_social',query.name);
 if(query.cnae)url.searchParams.set('cnae',query.cnae);
 else if(query.segment)url.searchParams.set('atividade',query.segment);
 if(query.city)url.searchParams.set('cidade',query.city);
 if(query.state)url.searchParams.set('uf',query.state);
 if(query.district)url.searchParams.set('bairro',query.district);
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
export async function searchGoogle(query:Search,user:User){
 const key=apiKey('GOOGLE_PLACES_API_KEY');
 if(!query.segment&&!query.name)throw new AppError(400,'Informe segmento ou nome do local.');
 const text=[query.name,query.segment,query.district,query.city,query.state,'Brasil'].filter(Boolean).join(', ');
 const result=object(await providerFetch('google','text_enterprise',user,'https://places.googleapis.com/v1/places:searchText',{
  method:'POST',headers:{'Content-Type':'application/json','X-Goog-Api-Key':key,'X-Goog-FieldMask':'places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.nationalPhoneNumber,places.internationalPhoneNumber,nextPageToken'},
  body:JSON.stringify({textQuery:text,pageSize:Math.min(20,query.pageSize),languageCode:'pt-BR',regionCode:'BR',...(query.cursor?{pageToken:query.cursor}:{})})
 }));
 const items=(Array.isArray(result.places)?result.places:[]).map((v)=>{
  const r=object(v), n=object(r.displayName);return {id:String(r.id||''),name:String(n.text||'Sem nome'),address:String(r.formattedAddress||''),mapsUrl:String(r.googleMapsUri||''),phone:str(r.nationalPhoneNumber)??str(r.internationalPhoneNumber)};
 });
 return {items,nextCursor:str(result.nextPageToken),partial:!!result.nextPageToken};
}
