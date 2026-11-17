/**
 * Adaptador dos endpoints públicos do Fichário.
 * /busca pesquisa início de nomes; /busca-avancada exige UF + CNAE ou cidade;
 * /cnpj aceita somente CNPJ completo. Nenhuma consulta por nome é tratada
 * como busca de atividade econômica.
 */
type QueryShape={
 cnpj?:string;name?:string;state?:string[];city?:string|string[];
 cnae?:string|string[];sector?:string|string[];segment?:string|string[];activeOnly?:boolean;
};
export type FicharioCursor={pair:number;page:number};
export type FicharioMode='exact'|'name'|'advanced';
export const values=(item:string|string[]|undefined):string[]=>item===undefined?[]:Array.isArray(item)?item:[item];
const digits=(item:string)=>item.replace(/\D/g,'');
const validCnaes=(query:QueryShape)=>values(query.cnae).map(digits).filter(code=>/^\d{7}$/.test(code));
const validStates=(query:QueryShape)=>(query.state??[]).map(state=>state.toUpperCase()).filter(state=>/^[A-Z]{2}$/.test(state));
export function ficharioMode(query:QueryShape):FicharioMode|null{
 const cnpj=digits(query.cnpj??'');
 if(cnpj)return cnpj.length===14?'exact':null;
 if(!validStates(query).length)return null;
 if(query.name?.trim())return 'name';
 if(validCnaes(query).length)return 'advanced';
 // Pesquisa por setor/atividade sem código CNAE não pode ser interpretada como
 // busca genérica por cidade. Isso geraria empresas fora do filtro solicitado.
 if(values(query.sector).some(Boolean)||values(query.segment).some(Boolean))return null;
 if(values(query.city).some(city=>city.trim()))return 'advanced';
 return null;
}
export function shouldFallbackFichario(query:QueryShape,eligibleResults:number,localizaFailed:boolean,activeCursor=false,done=false):boolean{
 if(done)return false;
 const mode=ficharioMode(query);
 if(!mode)return false;
 if(activeCursor)return true;
 if(mode==='exact')return eligibleResults===0;
 if(!query.activeOnly)return false;
 return eligibleResults===0||localizaFailed;
}
export function ficharioPairs(query:QueryShape,mode:FicharioMode):{state:string;city:string;cnae:string}[]{
 if(mode==='exact')return [{state:'',city:'',cnae:''}];
 const cnaes=mode==='advanced'?validCnaes(query):[];
 const cities=values(query.city).filter(Boolean);
 const cityValues=cities.length?cities:[''];
 const codeValues=cnaes.length?cnaes:[''];
 return validStates(query).flatMap(state=>cityValues.flatMap(city=>codeValues.map(cnae=>({state,city,cnae}))));
}
export const entry=(input:unknown):Record<string,unknown>=>input&&typeof input==='object'&&!Array.isArray(input)?input as Record<string,unknown>:{};
export const firstValue=(row:Record<string,unknown>,...keys:string[]):string|null=>{
 for(const key of keys){const value=row[key];if(typeof value==='string'&&value.trim())return value.trim();if(typeof value==='number'||typeof value==='boolean')return String(value);}
 return null;
};
export function ficharioRows(input:unknown):Record<string,unknown>[]{
 if(Array.isArray(input))return input.map(entry);
 const data=entry(input);
 for(const key of ['resultados','results','empresas','items','data']){
  const value=data[key];
  if(Array.isArray(value))return value.map(entry);
  if(value&&typeof value==='object'){
   const nested=ficharioRows(value);
   if(nested.length)return nested;
  }
 }
 return [];
}
export function mapFichario(input:unknown){
 const r=entry(input),endereco=entry(r.endereco),atividade=entry(r.atividade_principal);
 const cnpj=digits(firstValue(r,'cnpj','cnpj_completo','cnpjCompleto','documento')??'');
 if(cnpj.length!==14)return null;
 const matrix=firstValue(r,'identificador_matriz_filial','matriz_filial','tipo_estabelecimento','isHeadquarters','matriz');
 const isHeadquarters=matrix==='1'||matrix?.toLowerCase()==='matriz'||matrix==='true'?true:
  matrix==='2'||matrix?.toLowerCase()==='filial'||matrix==='false'?false:null;
 const flatAddress=[firstValue(r,'tipo_logradouro'),firstValue(r,'logradouro'),firstValue(r,'numero'),firstValue(r,'complemento')].filter(Boolean).join(' ');
 const nestedAddress=[firstValue(endereco,'tipo_logradouro'),firstValue(endereco,'logradouro'),firstValue(endereco,'numero'),firstValue(endereco,'complemento')].filter(Boolean).join(' ');
 return {
  cnpj,cnpjRoot:cnpj.slice(0,8),
  legalName:firstValue(r,'razao_social','nome_empresarial','legalName')??'Razão social não informada',
  tradeName:firstValue(r,'nome_fantasia','fantasia','tradeName'),isHeadquarters,
  status:firstValue(r,'situacao_cadastral','situacao','status'),
  cnae:firstValue(r,'cnae_fiscal_principal','cnae_principal','cnaePrincipal','cnae')??firstValue(atividade,'codigo'),
  segment:firstValue(r,'cnae_descricao','descricao_cnae','cnaeDescription','atividade')??firstValue(atividade,'descricao'),
  city:firstValue(r,'municipio','cidade','city')??firstValue(endereco,'municipio','cidade'),
  state:firstValue(r,'uf','estado','state')??firstValue(endereco,'uf','estado'),
  district:firstValue(r,'bairro')??firstValue(endereco,'bairro'),
  address:firstValue(r,'endereco')??(flatAddress||nestedAddress||null),
  postalCode:firstValue(r,'cep','zipCode')??firstValue(endereco,'cep'),
  phone:firstValue(r,'telefone','telefone1','telefone_1','numero_telefone','phone'),
  email:firstValue(r,'email','correio_eletronico'),source:'fichario' as const
 };
}
export function ficharioHasMore(input:unknown,rows:unknown[],page:number,pageSize:number):boolean{
 if(page>=50)return false;
 const response=entry(input);
 const explicit=response.has_more??response.hasMore;
 if(typeof explicit==='boolean')return explicit;
 const pages=Number(response.total_paginas??response.totalPages??response.total_pages);
 if(Number.isFinite(pages)&&pages>0)return page<pages;
 const total=Number(response.total);
 if(Number.isFinite(total)&&total>=0)return page*pageSize<total;
 return rows.length>=pageSize;
}
