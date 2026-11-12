/** Gestores profissionais e responsáveis societários identificados por fontes diferentes. */
export type PeopleProvider='exa'|'opencnpj'|'apollo'|'hunter';
export type DecisionMaker={
 name:string;role:string;organization:string;source:PeopleProvider;partialName:boolean;
};

const record=(v:unknown):Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const text=(v:unknown):string=>typeof v==='string'?v.trim():'';
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const stop=new Set(['ltda','sa','s','a','eireli','mei','epp','me','limitada','sociedade','companhia','cia','empresa','empresas','comercio','servicos','industria','de','do','da','dos','das','e']);
const tokens=(s:string)=>normalize(s).split(' ').filter(w=>w.length>=3&&!stop.has(w));

/** Não confundir nomes genéricos: correspondência de dois tokens ou marca distintiva. */
export function organizationMatches(requested:string,returned:string):boolean{
 const a=tokens(requested),b=tokens(returned);if(!a.length||!b.length)return false;
 const same=a.filter(w=>b.includes(w));
 return a.length===1?a[0].length>=4&&same.length===1:same.length>=2&&same.length/a.length>=0.66;
}
const cnpjDigits=(value:string)=>value.toUpperCase().replace(/[^A-Z0-9]/g,'');

export function mapOpenCnpjPeople(payload:unknown,cnpj:string,companyName:string):DecisionMaker[]{
 const response=record(payload),data=record(response.data);
 if(response.success===false||cnpjDigits(text(data.cnpj))!==cnpjDigits(cnpj))return [];
 if(!Array.isArray(data.socios))return [];
 return data.socios.flatMap(value=>{
  const r=record(value);
  const name=text(r.nomeSocio||r.nome_socio);
  const role=text(r.descricao||r.qualificacaoSocio||r.qualificacao_socio);
  if(!name||name.length<5||!role)return [];
  return [{name,role,organization:text(data.razaoSocial)||companyName,source:'opencnpj' as const,partialName:false}];
 });
}
const roles=/\b(?:gerente|diretor(?:a)?|coordenador(?:a)?|presidente|vice[- ]presidente|s[oó]cio[- ]administrador|administrador(?:a)?|head of|hr manager|human resources manager|benefits manager|chief (?:people|human resources|executive|operating) officer|people and culture manager)\b/iu;
const forbiddenName=/\b(?:gerente|diretor|coordenador|empresa|recursos|executive|manager|administrador|linkedin|profile)\b/i;
const isName=(s:string)=>s.length<=100&&/^[\p{L}][\p{L}'-]+(?:\s+[\p{L}][\p{L}'-]+){1,5}$/u.test(s)&&!forbiddenName.test(normalize(s));
const extractRole=(s:string)=>{
 const lines=s.split(/[\n|•]/).map(v=>v.trim()).filter(Boolean);
 for(const line of lines){
  const m=line.match(roles);
  if(m){
   const after=line.slice(m.index??0).split(/\s+(?:at|em|na|no|da|do)\s+[A-Z]/)[0].split(/[.;()]/)[0].trim();
   return after.slice(0,100);
  }
 }
 return '';
};
function companyIsInCurrentRole(profile:string,companyNames:string[]):boolean{
 const lines=profile.split(/\n|[•]/).map(x=>x.slice(0,400));
 const relevant=lines.slice(0,8);
 const aliases=companyNames.map(tokens).filter(t=>t.length);
 for(const line of relevant){
  const words=normalize(line).split(' ');
  const verified=aliases.some(t=>t.length===1?t[0].length>=4&&words.includes(t[0]):t.filter(x=>words.includes(x)).length>=2);
  if(!verified||!roles.test(line))continue;
  // Aceita apenas linha que apresenta cargo associado à empresa; histórico
  // explicitamente antigo não é tratado como emprego atual.
  if(/\b(?:former|previously|ex[- ]|antigo|anterior|until 20\d\d)\b/i.test(line))continue;
  return true;
 }
 return false;
}
/** Resultado Exa: o nome e o cargo precisam aparecer no perfil e o empregador
 * precisa estar ligado à função atual. Não fabricamos nomes/cargos ausentes. */
export function mapExaPeople(payload:unknown,companyName:string,tradeName?:string|null):DecisionMaker[]{
 const rows=record(payload).results;if(!Array.isArray(rows))return [];
 const aliases=[companyName,...(tradeName?[tradeName]:[])];
 return rows.flatMap(value=>{
  const r=record(value);
  const title=text(r.title),content=text(r.text);
  const highlights=Array.isArray(r.highlights)?r.highlights.map(text).join('\n'):'';
  const name=title.split(/\s+[|–—-]\s+/)[0].trim();
  if(!isName(name))return [];
  const roleEvidence=[title,content.slice(0,2500),highlights.slice(0,1500)].join('\n');
  if(!companyIsInCurrentRole(roleEvidence,aliases))return [];
  const role=extractRole(roleEvidence);
  if(!role)return [];
  return [{name,role,organization:companyName,source:'exa' as const,partialName:false}];
 });
}
const weight=(role:string)=>{
 const r=normalize(role);
 if(/\brh\b|recursos humanos|human resources|beneficios|benefits|departamento pessoal|people operations|people and culture/.test(r))return 50;
 if(/diretor|director|gerente|manager|coordenad|coordinator|head|ceo|presidente|president|socio|owner|administra|chro|cfo/.test(r))return 25;
 return 0;
};
export function mergeDecisionMakers(people:DecisionMaker[],limit=8):DecisionMaker[]{
 const list=people.filter(p=>!!p.name&&!!p.role&&weight(p.role)>0)
  .sort((a,b)=>weight(b.role)-weight(a.role)||Number(a.source==='opencnpj')-Number(b.source==='opencnpj'));
 const seen=new Set<string>();const out:DecisionMaker[]=[];
 for(const item of list){
  const key=normalize(item.name);
  if(seen.has(key))continue;
  seen.add(key);out.push({...item});
  if(out.length>=limit)break;
 }
 return out;
}

/** Apollo retorna nome parcial na busca gratuita; não adivinhar sobrenomes. */
export function mapApolloPeople(payload:unknown,companyName:string,tradeName?:string|null):DecisionMaker[]{
 const list=record(payload).people;
 if(!Array.isArray(list))return [];
 const aliases=[companyName,...(tradeName?[tradeName]:[])];
 return list.flatMap(value=>{
  const r=record(value),org=text(record(r.organization).name);
  if(!org||!aliases.some(alias=>organizationMatches(alias,org)))return [];
  const first=text(r.first_name),last=text(r.last_name),masked=text(r.last_name_obfuscated);
  const name=text(r.name)||[first,last||masked].filter(Boolean).join(' ');
  const role=text(r.title);
  if(!name||!role)return [];
  return [{name,role,organization:org,source:'apollo' as const,partialName:!last&&!text(r.name)}];
 });
}
/** Hunter oferece nomes e cargos, mas associamos pessoas apenas a domínio
 * confirmado ou nome empresarial devolvido compatível com a razão social. */
export function mapHunterPeople(payload:unknown,companyName:string,trustedDomain:boolean,tradeName?:string|null):DecisionMaker[]{
 const data=record(record(payload).data);
 const org=text(data.organization);
 const aliases=[companyName,...(tradeName?[tradeName]:[])];
 if(!trustedDomain&&!aliases.some(alias=>organizationMatches(alias,org)))return [];
 if(!Array.isArray(data.emails))return [];
 return data.emails.flatMap(value=>{
  const r=record(value);
  if(r.type==='generic')return [];
  const first=text(r.first_name),last=text(r.last_name),role=text(r.position);
  const name=[first,last].filter(Boolean).join(' ');
  if(!name||!role)return [];
  return [{name,role,organization:org||companyName,source:'hunter' as const,partialName:!last}];
 });
}
/** Um domínio de provedor genérico não deve vincular pessoas à empresa. */
export function validCorporateDomain(input:string):string|null{
 let domain=input.trim().toLowerCase().replace(/^https?:\/\/(?:www\.)?/,'').split('/')[0].replace(/^www\./,'');
 if(!/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/.test(domain))return null;
 if(/^(?:gmail|hotmail|outlook|yahoo|icloud|live|uol|bol)\./.test(domain))return null;
 return domain;
}
