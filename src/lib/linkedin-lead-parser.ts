type Row=Record<string,unknown>;
const obj=(input:unknown):Row=>input&&typeof input==='object'&&!Array.isArray(input)?input as Row:{};
const str=(input:unknown):string=>typeof input==='string'?input:'';
export type LinkedInAdAccount={id:string;name:string;status:string;reference:string;test:boolean};
export type LinkedInLeadForm={id:string;name:string;state:string;version:number|null;created:number|null};
export function readAccounts(raw:unknown):{accounts:LinkedInAdAccount[];hasMore:boolean}{
 const data=obj(raw);
 const elements=Array.isArray(data.elements)?data.elements:[];
 const accounts=elements.slice(0,100).flatMap(item=>{
  const row=obj(item);
  const id=String(row.id??'');
  if(!/^\d{1,20}$/.test(id))return [];
  return [{
   id,name:str(row.name).slice(0,200)||'Conta '+id,
   status:str(row.status).slice(0,40)||'Não informado',
   reference:str(row.reference).slice(0,150),test:row.test===true
  }];
 });
 const nextPage=obj(data.metadata).nextPageToken;
 return {accounts,hasMore:typeof nextPage==='string'&&nextPage.length>0};
}
export function readForms(raw:unknown):{forms:LinkedInLeadForm[];hasMore:boolean}{
 const data=obj(raw);
 const elements=Array.isArray(data.elements)?data.elements:[];
 const forms=elements.slice(0,50).flatMap(item=>{
  const row=obj(item);
  const id=String(row.id??'');
  if(!/^\d{1,24}$/.test(id))return [];
  const created=typeof row.created==='number'&&Number.isFinite(row.created)?row.created:null;
  const version=typeof row.versionId==='number'&&Number.isFinite(row.versionId)?row.versionId:null;
  return [{id,name:str(row.name).slice(0,200)||'Formulário '+id,state:str(row.state).slice(0,40),version,created}];
 });
 const paging=obj(data.paging);
 const count=typeof paging.count==='number'?paging.count:50;
 return {forms,hasMore:elements.length>=count};
}
