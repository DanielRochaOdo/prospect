/** Combina somente registros cadastrais cuja licença autoriza uso no CRM. Nunca receba dados Google Maps aqui. */
export type RegistryCompany = {
  cnpj:string; cnpjRoot:string; legalName:string; tradeName:string|null;
  isHeadquarters:boolean|null; status:string|null; cnae:string|null;segment:string|null;
  city:string|null;state:string|null;district:string|null;address:string|null;postalCode:string|null;
  phone:string|null;email:string|null;source:'cnpjai'|'localiza';
};
export function mergeRegistryCompanies<T extends RegistryCompany>(records:T[]):T[]{
  const byCnpj=new Map<string,T>();
  for(const item of records){
    const previous=byCnpj.get(item.cnpj);
    if(!previous){byCnpj.set(item.cnpj,{...item});continue;}
    // Campo a campo, prioriza conteúdo real. A origem do registro que forneceu o telefone
    // acompanha o dado salvo; não atribui telefone do Google à base de prospecção.
    const preferred=(!previous.phone&&item.phone)?item:previous;
    const other=preferred===item?previous:item;
    const merged={...preferred} as T;
    const fields:(keyof RegistryCompany)[]=['tradeName','status','cnae','segment','city','state','district','address','postalCode','phone','email','isHeadquarters'];
    for(const field of fields){if(merged[field]===null||merged[field]==='') (merged as unknown as Record<string,unknown>)[field]=other[field];}
    if(preferred.legalName==='Razão social não informada'&&other.legalName!=='Razão social não informada')merged.legalName=other.legalName;
    byCnpj.set(item.cnpj,merged);
  }
  return [...byCnpj.values()].sort((a,b)=>Number(!!b.phone)-Number(!!a.phone)||a.legalName.localeCompare(b.legalName,'pt-BR'));
}
