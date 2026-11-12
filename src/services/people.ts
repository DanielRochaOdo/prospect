import type {User} from '@/lib/auth';
import {providerFetch} from '@/services/usage';
import {mapOpenCnpjPeople,mapExaPeople,mapApolloPeople,mapHunterPeople,mergeDecisionMakers,organizationMatches,validCorporateDomain} from '@/lib/people';
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

 // Os serviços independentes são consultados em paralelo. A ausência de chave
 // ou falha de um fornecedor não impede resultados de outro.
 const openJob=providerFetch('opencnpj','qsa',user,
  'https://kitana.opencnpj.com/cnpj/'+encodeURIComponent(cnpj),{headers:{Accept:'application/json'}});
 const exaJob=exaKey?providerFetch('exa','people_search',user,'https://api.exa.ai/search',{
  method:'POST',headers:{'Content-Type':'application/json','x-api-key':exaKey},
  body:JSON.stringify({
   query:'Pessoas atualmente empregadas na empresa '+companyName+
    (input.tradeName&&input.tradeName!==companyName?' também conhecida como '+input.tradeName:'')+
    ' Brasil, Gerente de Recursos Humanos, RH, Benefícios, Departamento Pessoal, Diretor Administrativo, Diretoria',
   type:'auto',numResults:8,includeDomains:['exa.ai/library/person'],contents:{text:true}
  })
 }):Promise.resolve(null);
 const domainJob=hunterKey?(async()=>{
  const url=new URL('https://api.hunter.io/v2/domain-finder');
  url.searchParams.set('company',companyName);
  url.searchParams.set('limit','3');
  url.searchParams.set('perfect_match','true');
  const data=record(await providerFetch('hunter','domain_finder',user,url.toString(),{
   headers:{'X-API-KEY':hunterKey}
  }));
  const results=Array.isArray(data.data)?data.data:[];
  const aliases=[companyName,...(input.tradeName?[input.tradeName]:[])];
  const match=results.map(record).find(row=>aliases.some(alias=>organizationMatches(alias,str(row.company_name))));
  return match?validCorporateDomain(str(match.domain)):null;
 })():Promise.resolve(null);

 const [open,exa,domainResult]=await Promise.allSettled([openJob,exaJob,domainJob]);

 if(open.status==='fulfilled'){
  const found=mapOpenCnpjPeople(open.value,cnpj,companyName);
  people.push(...found);
  statuses.push({provider:'opencnpj',state:'ok',message:found.length?'Sócios e administradores identificados':'Quadro societário não informado'});
 }else statuses.push({provider:'opencnpj',state:'error',message:errorMessage(open.reason)});

 if(!exaKey)statuses.push({provider:'exa',state:'skipped',message:'Configure EXA_API_KEY'});
 else if(exa.status==='fulfilled'){
  const found=mapExaPeople(exa.value,companyName,input.tradeName);
  people.push(...found);
  statuses.push({provider:'exa',state:'ok',message:found.length?'Gestores encontrados':'Nenhum perfil com vínculo confirmado'});
 }else statuses.push({provider:'exa',state:'error',message:errorMessage(exa.reason)});

 const domain=domainResult.status==='fulfilled'?domainResult.value:null;
 if(hunterKey&&domainResult.status==='rejected')
  statuses.push({provider:'hunter',state:'error',message:'Não foi possível confirmar o domínio; busca pelo nome será tentada.'});

 // O Apollo People API Search exige domínio/organização para evitar
 // que uma busca vaga retorne gestores de empresas homônimas.
 const apolloJob=apolloKey&&domain?providerFetch('apollo','people_search',user,
  'https://api.apollo.io/api/v1/mixed_people/api_search',{
   method:'POST',headers:{'Content-Type':'application/json','x-api-key':apolloKey},
   body:JSON.stringify({
    q_organization_domains_list:[domain],
    person_titles:['recursos humanos','gerente de recursos humanos','benefícios','benefits','human resources',
     'departamento pessoal','gerente administrativo','diretor administrativo','people and culture','hr manager'],
    person_seniorities:['manager','director','head','c_suite','owner','vp'],
    page:1,per_page:20
   })
  }):Promise.resolve(null);
 const apollo=await Promise.allSettled([apolloJob]);
 if(!apolloKey)statuses.push({provider:'apollo',state:'skipped',message:'Configure APOLLO_API_KEY'});
 else if(!domain)statuses.push({provider:'apollo',state:'skipped',message:'Domínio empresarial não confirmado; consulta omitida para evitar homônimos'});
 else if(apollo[0].status==='fulfilled'){
  const found=mapApolloPeople(apollo[0].value,companyName,input.tradeName);
  people.push(...found);
  statuses.push({provider:'apollo',state:'ok',message:found.length?'Gestores encontrados':'Nenhum gestor correspondente'});
 }else statuses.push({provider:'apollo',state:'error',message:errorMessage(apollo[0].reason)});

 // Hunter Domain Search pode gastar créditos. Quando as fontes gratuitas
 // já identificaram um responsável de RH, evita consumo desnecessário.
 const enoughHR=people.some(p=>/recursos humanos|\brh\b|human resources|benef[ií]cios|benefits|departamento pessoal|people and culture/i.test(p.role)&&!p.partialName);
 if(!hunterKey){
  statuses.push({provider:'hunter',state:'skipped',message:'Configure HUNTER_API_KEY'});
 }else if(enoughHR){
  statuses.push({provider:'hunter',state:'skipped',message:'Gestor de RH já identificado; créditos Hunter preservados'});
 }else{
  try{
   const url=new URL('https://api.hunter.io/v2/domain-search');
   url.searchParams.set(domain?'domain':'company',domain||companyName);
   url.searchParams.set('limit','10');
   url.searchParams.set('type','personal');
   url.searchParams.set('department','hr,management,administrative,executive');
   url.searchParams.set('required_field','full_name,position');
   const result=await providerFetch('hunter','domain_search',user,url.toString(),{
    headers:{'X-API-KEY':hunterKey}
   });
   const found=mapHunterPeople(result,companyName,!!domain,input.tradeName);
   people.push(...found);
   statuses.push({provider:'hunter',state:'ok',message:found.length?'Gestores encontrados':'Nenhum gestor correspondente'});
  }catch(err){statuses.push({provider:'hunter',state:'error',message:errorMessage(err)});}
 }
 // Evite expor falhas do Domain Finder como uma segunda linha de erro caso
 // Domain Search tenha funcionado; preserve o status de cada operação útil.
 return {people:mergeDecisionMakers(people),statuses};
}
