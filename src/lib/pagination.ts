/** Mantém a ordem dos cursores e evita repetir empresas nas páginas. */
export function mergeLoaded<T extends {cnpj:string}>(previous:T[],incoming:T[]):T[]{
 const found=new Map(previous.map(item=>[item.cnpj,item]));
 for(const item of incoming){
  const old=found.get(item.cnpj);
  if(!old){found.set(item.cnpj,item);continue;}
  const updated={...old} as Record<string,unknown>;
  for(const [field,value] of Object.entries(item))
   if((updated[field]===null||updated[field]===undefined||updated[field]==='')&&value!==null&&value!==undefined&&value!=='')updated[field]=value;
  found.set(item.cnpj,updated as T);
 }
 return [...found.values()];
}
export const RESULTS_PER_PAGE=10;
export const pageSlice=<T>(items:T[],page:number,size=RESULTS_PER_PAGE)=>items.slice((page-1)*size,page*size);
export const canAdvance=(loaded:number,page:number,hasNextCursor:boolean,size=RESULTS_PER_PAGE)=>loaded>page*size||hasNextCursor;
