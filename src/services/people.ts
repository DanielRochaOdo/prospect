import type {User} from '@/lib/auth';
import {providerFetch} from '@/services/usage';
import {mapOpenCnpjPeople,mapExaPeople,mapApolloPeople,mapHunterPeople,mergeDecisionMakers,organizationMatches,validCorporateDomain} from '@/lib/people';
import {buildExaPeopleQuery,managerKeywords,needsDecisionMakerFallback} from '@/lib/people-priority';
import type {DecisionMaker} from '@/lib/people';
import {AppError} from '@/lib/errors';
import {validCnpj,normalizeCnpj} from '@/lib/cnpj';

export type LookupInput={companyName:string;cnpj:string;tradeName?:string|null};
type Source='opencnpj'|'exa'|'apollo'|'hunter';
type SourceStatus={provider:Source;state:'ok'|'skipped'|'error';message:string};
const record=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const errorMessage=(err:unknown)=>err instanceof Error?err.message:'Consulta indisponível';

export async function discoverPeople(input:LookupInput,user:User){
 const companyName=input.companyName.trim();
 const cnpj=normalizeCnpj(input.cnpj);
 if(companyName.length<3||!validCnpj(cnpj))throw new AppError(400,'Empresa ou CNPJ inválido para localizar gestores.');

 const people:DecisionMaker[]=[];
 const statuses:SourceStatus[]=[];
 const exaKey=process.env.EXA_API_KEY?.trim();
 const apolloKey=process.env.APOLLO_API_KEY?.trim();
 const hunterKey=process.env.HUNTER_API_KEY?.trim();
 const aliases=[companyName,...(input.tradeName?[input.tradeName.trim()]:[])].filter(Boolean);

 // 1. EXA: fonte primária, pois identifica profissionais sem exigir e-mail
 // ou telefone. Uma consulta por CNPJ, sem varredura massiva.
 if(!exaKey)statuses.push({provider:'exa',state:'skipped',message:'Exa não configurada; fallback automático habilitado.'});
 else{
  try{
   const data=await providerFetch('exa','people_search',user,'https://api.exa.ai/search',{
    method:'POST',headers:{'Content-Type':'application/json','x-api-key':exaKey},
    body:JSON.stringify({
     query:buildExaPeopleQuery(companyName,input.tradeName),
     type:'auto',numResults:10,includeDomains:['exa.ai/library/person'],
     contents:{text:true}
    })
   });
   const found=mapExaPeople(data,companyName,input.tradeName);
   people.push(...found);
   statuses.push({provider:'exa',state:'ok',
    message:found.length?found.length+' profissional(is) com vínculo e cargo identificados.':'Nenhum perfil de gestor com vínculo atual confirmado.'});
  }catch(err){statuses.push({provider:'exa',state:'error',message:errorMessage(err)});}
 }

 // Só avançar às fontes complementares se a pesquisa principal não encontrou
 // dois nomes completos de RH/DP/benefícios. Evita desperdiçar créditos.
 if(!needsDecisionMakerFallback(people)){
  statuses.push({provider:'apollo',state:'skipped',message:'Exa já identificou profissionais de RH/DP; consulta complementar dispensada.'});
  statuses.push({provider:'hunter',state:'skipped',message:'Consultas Hunter preservadas.'});
  statuses.push({provider:'opencnpj',state:'skipped',message:'Fallback societário dispensado.'});
  return {people:mergeDecisionMakers(people),statuses};
 }

 // O domínio é usado somente se o Hunter o associar de forma consistente à
 // empresa solicitada. Não atribuir profissionais de empresas homônimas.
 let domain:string|null=null;
 let domainFailure:string|null=null;
 if(hunterKey&&(apolloKey||needsDecisionMakerFallback(people))){
  try{
   const url=new URL('https://api.hunter.io/v2/domain-finder');
   url.searchParams.set('company',input.tradeName?.trim()||companyName);
   url.searchParams.set('limit','3');
   url.searchParams.set('perfect_match','true');
   const data=record(await providerFetch('hunter','domain_finder',user,url.toString(),{
    headers:{'X-API-KEY':hunterKey}
   }));
   const rows=Array.isArray(data.data)?data.data:[];
   const match=rows.map(record).find(row=>aliases.some(alias=>organizationMatches(alias,str(row.company_name))));
   domain=match?validCorporateDomain(str(match.domain)):null;
  }catch(err){domainFailure=errorMessage(err);}
 }

 // 2. APOLLO: nomes e cargos mesmo sem contatos. Pessoas com empregador
 // atual incompatível são descartadas; campos ofuscados são marcados.
 if(!apolloKey)statuses.push({provider:'apollo',state:'skipped',message:'Apollo não configurado.'});
 else if(!domain)statuses.push({provider:'apollo',state:'skipped',message:'Domínio empresarial não confirmado. Evitando associação de homônimos.'});
 else{
  try{
   const url=new URL('https://api.apollo.io/api/v1/mixed_people/api_search');
   url.searchParams.append('q_organization_domains_list[]',domain);
   for(const title of managerKeywords.slice(0,19))url.searchParams.append('person_titles[]',title);
   url.searchParams.set('page','1');url.searchParams.set('per_page','20');
   const response=await providerFetch('apollo','people_search',user,url.toString(),{
    method:'POST',headers:{'Content-Type':'application/json','x-api-key':apolloKey,'Accept':'application/json'}
   });
   const found=mapApolloPeople(response,companyName,input.tradeName);
   people.push(...found);
   statuses.push({provider:'apollo',state:'ok',message:found.length?found.length+' profissional(is) complementares identificados.':'Nenhum gestor compatível.'});
  }catch(err){statuses.push({provider:'apollo',state:'error',message:errorMessage(err)});}
 }

 // 3. HUNTER: somente quando ainda faltam profissionais de RH/DP.
 // Domain Search pode consumir créditos. Nenhum e-mail é enviado ao navegador.
 if(!hunterKey)statuses.push({provider:'hunter',state:'skipped',message:'Hunter não configurado.'});
 else if(!needsDecisionMakerFallback(people))
  statuses.push({provider:'hunter',state:'skipped',message:'Gestores encontrados; pesquisa paga não necessária.'});
 else{
  try{
   const url=new URL('https://api.hunter.io/v2/domain-search');
   url.searchParams.set(domain?'domain':'company',domain||input.tradeName?.trim()||companyName);
   url.searchParams.set('limit','10');
   url.searchParams.set('type','personal');
   url.searchParams.set('department','hr,management,administrative,executive');
   url.searchParams.set('required_field','full_name,position');
   const result=await providerFetch('hunter','domain_search',user,url.toString(),{
    headers:{'X-API-KEY':hunterKey}
   });
   const found=mapHunterPeople(result,companyName,!!domain,input.tradeName);
   people.push(...found);
   statuses.push({provider:'hunter',state:'ok',message:found.length?found.length+' profissional(is) complementares identificados.':'Nenhum gestor correspondente.'});
  }catch(err){statuses.push({provider:'hunter',state:'error',message:errorMessage(err)});}
 }
 if(domainFailure&&statuses.some(s=>s.provider==='hunter'&&s.state!=='ok'))
  statuses.push({provider:'hunter',state:'error',message:'Identificação de domínio indisponível: '+domainFailure});

 // 4. OPENCNPJ: fallback societário gratuito, somente se a procura
 // profissional não identificou RH/DP suficientes. Não confundir sócio com RH.
 if(needsDecisionMakerFallback(people)){
  try{
   const response=await providerFetch('opencnpj','qsa',user,
    'https://kitana.opencnpj.com/cnpj/'+encodeURIComponent(cnpj),{
     headers:{Accept:'application/json'}
    });
   const found=mapOpenCnpjPeople(response,cnpj,companyName);
   people.push(...found);
   statuses.push({provider:'opencnpj',state:'ok',message:found.length?found.length+' responsável(is) societário(s) identificados.':'Quadro societário não informado.'});
  }catch(err){statuses.push({provider:'opencnpj',state:'error',message:errorMessage(err)});}
 }else statuses.push({provider:'opencnpj',state:'skipped',message:'Gestores de RH/DP encontrados nas fontes profissionais.'});

 return {people:mergeDecisionMakers(people),statuses};
}
