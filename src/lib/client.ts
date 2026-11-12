export async function apiRequest<T=any>(url:string,init:RequestInit={}){
 const r=await fetch(url,{...init,headers:{'Content-Type':'application/json',...(init.headers??{})},cache:'no-store'});
 const data=await r.json().catch(()=>({error:'Resposta inválida do servidor.'}));
 if(!r.ok)throw new Error(data.error||`Erro HTTP ${r.status}`);
 return data as T;
}
export const post=(url:string,body:unknown)=>apiRequest(url,{method:'POST',body:JSON.stringify(body)});
export const patch=(url:string,body:unknown)=>apiRequest(url,{method:'PATCH',body:JSON.stringify(body)});
export function formatDate(date:string|null|undefined){return date?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short'}).format(new Date(date)):'—';}
export function formatCnpj(c:string){const n=c.replace(/[^A-Z0-9]/gi,'');return n.length===14?`${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12)}`:c;}
export const statusLabel:Record<string,string>={novo:'Novo',prospeccao:'Em prospecção',contatado:'Contatado',negociacao:'Em negociação',convertido:'Convertido',descartado:'Descartado'};
export const sourceLabel:Record<string,string>={cnpjai:'CNPJ.ai',localiza:'LocalizaCNPJ',google:'Google Places',exa:'Exa',opencnpj:'OpenCNPJ',pesquisa:'Pesquisa de empresas'};
