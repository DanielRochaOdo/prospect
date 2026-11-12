import type {User} from '@/lib/auth';
import {providerFetch} from '@/services/usage';
import {mapApolloPeople,mapHunterPeople,mergeDecisionMakers,organizationMatches,validDomain} from '@/lib/people';
import {AppError} from '@/lib/errors';

export type LookupInput = {companyName:string;domain?:string;includeHunter:boolean};
type State='ok'|'skipped'|'error';
type SourceStatus={provider:'apollo'|'hunter';state:State;message:string};
const obj=(input:unknown):Record<string,unknown>=>input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{};
const str=(input:unknown):string=>typeof input==='string'?input.trim():'';

/** Nunca pesquisamos pessoas usando resultados ou nomes do Google Maps. */
export async function discoverPeople(input:LookupInput,user:User){
 const statuses:SourceStatus[]=[];
 const apolloKey=process.env.APOLLO_API_KEY;
 const hunterKey=process.env.HUNTER_API_KEY;
 if(input.domain && !validDomain(input.domain))throw new AppError(400,'Informe um domínio corporativo válido.');
 let domain=input.domain?validDomain(input.domain):null;
 const trustedDomain=!!domain;
 // O Domain Finder é gratuito; exigimos correspondência alta antes de atribuir pessoas à empresa.
 if(!domain && hunterKey){
  try{
   const url=new URL('https://api.hunter.io/v2/domain-finder');
   url.searchParams.set('company',input.companyName);url.searchParams.set('limit','2');url.searchParams.set('perfect_match','true');
   const response=obj(await providerFetch('hunter','domain_finder',user,url.toString(),{headers:{'X-API-KEY':hunterKey}}));
   const matches=Array.isArray(response.data)?response.data:[];
   const exact=matches.map(obj).find(m=>organizationMatches(input.companyName,str(m.company_name)));
   if(exact)domain=validDomain(str(exact.domain));
  }catch{
   // Falha do resolvedor não impede consulta por nome à Hunter.
  }
 }
 const jobs:Promise<{provider:'apollo'|'hunter';people:ReturnType<typeof mapApolloPeople>}>[]=[];
 if(apolloKey && domain){
  jobs.push((async()=>{
   const body={q_organization_domains_list:[domain],
     person_titles:['gerente de recursos humanos','recursos humanos','human resources','gerente administrativo',
       'departamento pessoal','benefícios','benefits','people and culture','diretor administrativo',
       'hr manager','human resources manager','coordenador de recursos humanos'],
     person_seniorities:['manager','director','head','c_suite','owner'],
     page:1,per_page:20};
   const response=await providerFetch('apollo','people_search',user,
    'https://api.apollo.io/api/v1/mixed_people/api_search',
    {method:'POST',headers:{'Content-Type':'application/json','x-api-key':apolloKey},body:JSON.stringify(body)});
   return {provider:'apollo' as const,people:mapApolloPeople(response,input.companyName)};
  })());
 }else statuses.push({provider:'apollo',state:'skipped',message:!apolloKey?'API não configurada':'Informe o domínio corporativo para pesquisa segura.'});
 if(hunterKey && input.includeHunter){
  jobs.push((async()=>{
   const url=new URL('https://api.hunter.io/v2/domain-search');
   url.searchParams.set(domain?'domain':'company',domain||input.companyName);
   url.searchParams.set('limit','10');url.searchParams.set('type','personal');
   url.searchParams.set('department','hr,management,administrative,executive');
   url.searchParams.set('required_field','full_name,position');
   const response=await providerFetch('hunter','domain_search',user,url.toString(),{headers:{'X-API-KEY':hunterKey}});
   return {provider:'hunter' as const,people:mapHunterPeople(response,input.companyName,trustedDomain)};
  })());
 }else statuses.push({provider:'hunter',state:'skipped',message:!hunterKey?'API não configurada':'Consulta por créditos desativada.'});
 const resolved=await Promise.allSettled(jobs);
 const people:ReturnType<typeof mapApolloPeople>=[];
 for(let i=0;i<resolved.length;i++){
  const outcome=resolved[i];const provider=jobs.length === 2 ? (i===0?'apollo':'hunter') : (
    apolloKey&&domain?'apollo':'hunter');
  if(outcome.status==='fulfilled'){
    people.push(...outcome.value.people);
    statuses.push({provider:outcome.value.provider,state:'ok',message:outcome.value.people.length?`${outcome.value.people.length} nomes e cargos encontrados`:'Nenhum gestor correspondente identificado'});
  }else{
    statuses.push({provider,state:'error',message:outcome.reason instanceof Error?outcome.reason.message:'Consulta indisponível'});
  }
 }
 return {people:mergeDecisionMakers(people),domain:domain||null,statuses};
}
