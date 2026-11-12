'use client';
import {useEffect,useRef,useState} from 'react';
import {post} from '@/lib/client';
import type {CompanyResult} from '@/services/providers';
import type {DecisionMaker} from '@/lib/people';

type PeopleResult={people:DecisionMaker[];statuses:{provider:'opencnpj'|'exa'|'apollo'|'hunter';state:'ok'|'error'|'skipped';message:string}[]};
export type PeopleLookup={state:'loading'|'ready'|'error';result?:PeopleResult;error?:string};
type Job={root:string;cnpj:string;companyName:string;tradeName:string|null};
const WAIT_BETWEEN_LOOKUPS_MS=13000;
/** Buscar no máximo uma vez por raiz, e apenas para empresas da página em uso.
 * Mantém a fila sequencial para proteger a API gratuita e os créditos da Exa. */
export function useAutomaticPeople(items:CompanyResult[]|undefined,version:number){
 const [byRoot,setByRoot]=useState<Record<string,PeopleLookup>>({});
 const queue=useRef<Job[]>([]);
 const seen=useRef(new Set<string>());
 const generation=useRef(0);
 const workers=useRef(new Set<number>());
 useEffect(()=>{
  generation.current++;
  queue.current=[];
  seen.current.clear();
  setByRoot({});
 },[version]);
 useEffect(()=>{
  if(!items?.length)return;
  const newJobs:Job[]=[];
  for(const item of items){
   const root=item.cnpjRoot,companyName=item.legalName?.trim(),cnpj=item.cnpj;
   if(root.length!==8||cnpj.length!==14||!companyName||companyName.length<3||seen.current.has(root))continue;
   seen.current.add(root);
   newJobs.push({root,cnpj,companyName,tradeName:item.tradeName??null});
  }
  if(!newJobs.length)return;
  queue.current.push(...newJobs);
  setByRoot(prev=>{
   const next={...prev};
   for(const job of newJobs)next[job.root]={state:'loading'};
   return next;
  });
  const generationId=generation.current;
  if(workers.current.has(generationId))return;
  workers.current.add(generationId);
  void (async()=>{
   try{
    while(generationId===generation.current&&queue.current.length){
     const job=queue.current.shift()!;
     try{
      const data=await post('/api/people',{cnpj:job.cnpj,companyName:job.companyName,tradeName:job.tradeName}) as PeopleResult;
      if(generationId===generation.current)setByRoot(prev=>({...prev,[job.root]:{state:'ready',result:data}}));
     }catch(e){
      if(generationId===generation.current)setByRoot(prev=>({...prev,[job.root]:{state:'error',error:e instanceof Error?e.message:'Falha na consulta de gestores'}}));
     }
     if(generationId===generation.current&&queue.current.length)
      await new Promise<void>(resolve=>setTimeout(resolve,WAIT_BETWEEN_LOOKUPS_MS));
    }
   }finally{workers.current.delete(generationId);}
  })();
 },[items,version]);
 useEffect(()=>()=>{generation.current++;queue.current=[];},[]);
 const queuedCount=Object.values(byRoot).filter(v=>v.state==='loading').length;
 return {byRoot,queuedCount};
}
