'use client';
import {useEffect,useRef,useState} from 'react';
import {post} from '@/lib/client';
import type {CompanyResult} from '@/services/providers';
import type {DecisionMaker} from '@/lib/people';

type PeopleResult={
 people:DecisionMaker[];
 statuses:{provider:'apollo'|'hunter';state:'ok'|'error'|'skipped';message:string}[];
};
export type PeopleLookup={
 state:'loading'|'ready'|'error';
 result?:PeopleResult;
 error?:string;
};
type Job={root:string;companyName:string};
const WAIT_BETWEEN_LOOKUPS_MS=13000;

/**
 * Automático e progressivo: pesquisa todos os CNPJs raiz carregados,
 * uma empresa por vez para reduzir riscos de estouro da cota por minuto.
 * O estado é efêmero (não persiste dados pessoais no servidor ou no CRM).
 */
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
   const root=item.cnpjRoot;
   const name=item.legalName?.trim();
   if(root.length!==8||!name||name.length<3||seen.current.has(root))continue;
   seen.current.add(root);
   newJobs.push({root,companyName:name});
  }
  if(!newJobs.length)return;
  queue.current.push(...newJobs);
  setByRoot(prev=>{
   const next={...prev};
   for(const job of newJobs)next[job.root]={state:'loading'};
   return next;
  });
  const thisGeneration=generation.current;
  if(workers.current.has(thisGeneration))return;
  workers.current.add(thisGeneration);
  void (async()=>{
   try{
    while(thisGeneration===generation.current && queue.current.length){
     const job=queue.current.shift()!;
     try{
      const data=await post('/api/people',{companyName:job.companyName,includeHunter:true}) as PeopleResult;
      if(thisGeneration===generation.current)setByRoot(prev=>({...prev,[job.root]:{state:'ready',result:data}}));
     }catch(e){
      if(thisGeneration===generation.current)setByRoot(prev=>({...prev,[job.root]:{state:'error',error:e instanceof Error?e.message:'Falha na consulta de gestores'}}));
     }
     if(thisGeneration===generation.current&&queue.current.length){
      await new Promise<void>(resolve=>setTimeout(resolve,WAIT_BETWEEN_LOOKUPS_MS));
     }
    }
   }finally{workers.current.delete(thisGeneration);}
  })();
 },[items,version]);

 useEffect(()=>()=>{generation.current++;queue.current=[];},[]);
 const queuedCount=Object.values(byRoot).filter(v=>v.state==='loading').length;
 return {byRoot,queuedCount};
}
