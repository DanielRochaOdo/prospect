// CNPJ numérico ou alfanumérico. Verificadores continuam numéricos.
export const normalizeCnpj=(raw:string)=>raw.toUpperCase().replace(/[^0-9A-Z]/g,'');
export function validCnpj(full:string):boolean{
 if(!/^[0-9A-Z]{12}[0-9]{2}$/.test(full))return false;
 const first=full.slice(0,12).split('').map(c=>c.charCodeAt(0)-48);
 const check=(arr:number[],weights:number[])=>{const mod=arr.reduce((acc,n,i)=>acc+n*weights[i],0)%11;return mod<2?0:11-mod;};
 const d1=check(first,[5,4,3,2,9,8,7,6,5,4,3,2]);
 const d2=check([...first,d1],[6,5,4,3,2,9,8,7,6,5,4,3,2]);
 return full.slice(-2)===`${d1}${d2}`;
}
export function cnpjKind(raw:string){
 const n=normalizeCnpj(raw);
 if(n.length<8||n.length>14)return 'invalid';
 if(n.length===14)return validCnpj(n)?'exact':'invalid';
 return n.length===8?'root':'prefix';
}
