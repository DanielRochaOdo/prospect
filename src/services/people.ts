import type {User} from '@/lib/auth';
import {providerFetch} from '@/services/usage';
import {mapOpenCnpjPeople,mapExaPeople,mergeDecisionMakers} from '@/lib/people';
import type {DecisionMaker} from '@/lib/people';
import {AppError} from '@/lib/errors';
import {validCnpj,normalizeCnpj} from '@/lib/cnpj';

export type LookupInput={companyName:string;cnpj:string;tradeName?:string|null};
type State='ok'|'skipped'|'error';
type SourceStatus={provider:'opencnpj'|'exa';state:State;message:string};

/** Cadastro de CNPJ + pesquisa de perfis, sem depender de site, Apollo ou Hunter. */
export async function discoverPeople(input:LookupInput,user:User){
 const companyName=input.companyName.trim();
 const cnpj=normalizeCnpj(input.cnpj);
 if(companyName.length<3||!validCnpj(cnpj))throw new AppError(400,'Empresa ou CNPJ inválido para localizar gestores.');
 const statuses:SourceStatus[]=[];
 const people:DecisionMaker[]=[];
 const exaKey=process.env.EXA_API_KEY;

 // OpenCNPJ por CNPJ exato, sem credencial. Exa por nome legal e fantasia.
 const jobs=[
  providerFetch('opencnpj','qsa',user,'https://kitana.opencnpj.com/cnpj/'+encodeURIComponent(cnpj),
   {headers:{Accept:'application/json'}}),
  exaKey?providerFetch('exa','people_search',user,'https://api.exa.ai/search',{
   method:'POST',headers:{'Content-Type':'application/json','x-api-key':exaKey},
   body:JSON.stringify({
    query:'Pessoas atualmente empregadas na empresa '+companyName+
      (input.tradeName&&input.tradeName!==companyName?' também conhecida como '+input.tradeName:'')+
      ' Brasil, Gerente de Recursos Humanos, RH, Benefícios, Departamento Pessoal, Diretor Administrativo, Diretoria',
    type:'auto',numResults:8,
    includeDomains:['exa.ai/library/person'],
    contents:{text:true}
   })
  }):Promise.resolve(null)
 ];
 const [openResult,exaResult]=await Promise.allSettled(jobs);
 if(openResult.status==='fulfilled'){
  const found=mapOpenCnpjPeople(openResult.value,cnpj,companyName);
  people.push(...found);
  statuses.push({provider:'opencnpj',state:'ok',message:found.length?'Sócios e administradores identificados':'Quadro societário não informado para este CNPJ'});
 }else{
  statuses.push({provider:'opencnpj',state:'error',message:openResult.reason instanceof Error?openResult.reason.message:'Consulta não disponível'});
 }
 if(!exaKey){
  statuses.push({provider:'exa',state:'skipped',message:'Configure EXA_API_KEY para pesquisar gestores profissionais'});
 }else if(exaResult.status==='fulfilled'){
  const found=mapExaPeople(exaResult.value,companyName,input.tradeName);
  people.push(...found);
  statuses.push({provider:'exa',state:'ok',message:found.length?'Gestores profissionais identificados':'Nenhum perfil com vínculo empresarial confirmado'});
 }else{
  statuses.push({provider:'exa',state:'error',message:exaResult.reason instanceof Error?exaResult.reason.message:'Pesquisa profissional não disponível'});
 }
 return {people:mergeDecisionMakers(people),statuses};
}
