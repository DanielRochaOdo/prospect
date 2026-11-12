import type {User} from '@/lib/auth';
import {providerFetch} from '@/services/usage';
import {mapApolloPeople,mapHunterPeople,mergeDecisionMakers,organizationMatches,validDomain} from '@/lib/people';
import {AppError} from '@/lib/errors';
import type {DecisionMaker} from '@/lib/people';

export type LookupInput = {companyName:string;includeHunter?:boolean};
type State='ok'|'skipped'|'error';
type SourceStatus={provider:'apollo'|'hunter';state:State;message:string};
const obj=(input:unknown):Record<string,unknown>=>input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{};
const str=(input:unknown):string=>typeof input==='string'?input.trim():'';

/**
 * Descobre gestores apenas pela razão social recebida da fonte cadastral.
 * Não recebe domínio do usuário nem utiliza nomes oriundos do Google Places.
 */
export async function discoverPeople(input:LookupInput,user:User){
 const statuses:SourceStatus[]=[];
 const people:DecisionMaker[]=[];
 const apolloKey=process.env.APOLLO_API_KEY;
 const hunterKey=process.env.HUNTER_API_KEY;
 const companyName=input.companyName.trim();
 if(companyName.length<3)throw new AppError(400,'Nome empresarial insuficiente para identificar gestores.');

 // Hunter Domain Finder é gratuito e só aceita nomes empresariais; validamos a
 // identidade devolvida antes de usar o domínio em qualquer busca de pessoas.
 let domain:string|null=null;
 if(hunterKey){
  try{
   const url=new URL('https://api.hunter.io/v2/domain-finder');
   url.searchParams.set('api_key',hunterKey);
   url.searchParams.set('company',companyName);
   url.searchParams.set('limit','3');
   url.searchParams.set('perfect_match','true');
   const response=obj(await providerFetch('hunter','domain_finder',user,url.toString()));
   const matches=Array.isArray(response.data)?response.data:[];
   const match=matches.map(obj).find(m=>organizationMatches(companyName,str(m.company_name)));
   if(match)domain=validDomain(str(match.domain));
  }catch{
   // Fallback por nome empresarial no Hunter Domain Search (sem atribuição por domínio incerto).
  }
 }

 if(apolloKey&&domain){
  try{
   const response=await providerFetch('apollo','people_search',user,'https://api.apollo.io/api/v1/mixed_people/api_search',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':apolloKey},
    body:JSON.stringify({
     q_organization_domains_list:[domain],
     person_titles:['recursos humanos','gerente de recursos humanos','benefícios','benefits',
      'human resources','departamento pessoal','gerente administrativo','diretor administrativo',
      'people and culture','hr manager','coordenador de recursos humanos'],
     person_seniorities:['manager','director','head','c_suite','owner','vp'],
     page:1,per_page:20
    })
   });
   const found=mapApolloPeople(response,companyName);
   people.push(...found);
   statuses.push({provider:'apollo',state:'ok',message:found.length?'Gestores identificados':'Nenhum gestor correspondente encontrado'});
  }catch(e){
   statuses.push({provider:'apollo',state:'error',message:e instanceof Error?e.message:'Consulta indisponível'});
  }
 }else{
  statuses.push({provider:'apollo',state:'skipped',message:!apolloKey?'API não configurada':'Não foi possível confirmar o domínio da empresa'});
 }

 // Hunter complementa a busca automaticamente quando Apollo não retorna nomes
 // completos suficientes. Evita consumir créditos em todas as empresas quando
 // o resultado sem créditos do Apollo já é adequado.
 const needsHunter=people.length===0||people.every(person=>person.partialName);
 if(hunterKey&&input.includeHunter!==false&&needsHunter){
  try{
   const url=new URL('https://api.hunter.io/v2/domain-search');
   url.searchParams.set('api_key',hunterKey);
   url.searchParams.set(domain?'domain':'company',domain||companyName);
   url.searchParams.set('limit','10');
   url.searchParams.set('type','personal');
   url.searchParams.set('department','hr,management,administrative,executive');
   url.searchParams.set('required_field','full_name,position');
   const response=await providerFetch('hunter','domain_search',user,url.toString());
   const found=mapHunterPeople(response,companyName,!!domain);
   people.push(...found);
   statuses.push({provider:'hunter',state:'ok',message:found.length?'Gestores identificados':'Nenhum gestor correspondente encontrado'});
  }catch(e){
   statuses.push({provider:'hunter',state:'error',message:e instanceof Error?e.message:'Consulta indisponível'});
  }
 }else{
  statuses.push({provider:'hunter',state:'skipped',message:!hunterKey?'API não configurada':input.includeHunter===false?'Busca desativada':'Contatos já identificados sem consumir créditos'});
 }
 return {people:mergeDecisionMakers(people),statuses};
}
