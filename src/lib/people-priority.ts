/** Regras locais de prioridade. Não dependem de dados pessoais extras nem de LinkedIn. */
export const managerKeywords=[
 'gerente de recursos humanos','gerente de rh','gerente de dp',
 'coordenador de recursos humanos','coordenadora de recursos humanos',
 'coordenador de rh','coordenadora de rh',
 'coordenador de departamento pessoal','coordenadora de departamento pessoal',
 'analista de recursos humanos','analista de rh','analista de departamento pessoal',
 'responsável por departamento pessoal','responsável por benefícios',
 'especialista em benefícios','especialista de recursos humanos',
 'diretor de recursos humanos','diretora de recursos humanos',
 'diretor administrativo','diretora administrativa',
 'people and culture','human resources','hr manager','hr business partner',
 'benefits manager','payroll manager','head of people'
];
const normalized=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function isHrOrDpRole(role:string):boolean{
 const r=normalized(role);
 return /\brh\b|\bdp\b|recursos humanos|departamento pessoal|folha de pagamento|beneficios|benefits|human resources|people and culture|people operations|payroll|gestao de pessoas|business partner|gestao de talentos/.test(r);
}
/** Até dois RH/DP completos são suficientes para evitar consultas pagas extras. */
export function needsDecisionMakerFallback(people:{name:string;role:string;partialName:boolean}[]):boolean{
 const seen=new Set<string>();
 for(const p of people){
  if(!p.partialName&&p.name.trim().split(/\s+/).length>=2&&isHrOrDpRole(p.role)){
   seen.add(normalized(p.name.trim()));
  }
 }
 return seen.size<2;
}
export function buildExaPeopleQuery(companyName:string,tradeName?:string|null):string{
 const aliases=[companyName.trim(),tradeName?.trim()].filter((v):v is string=>!!v);
 const name=aliases.length>1&&normalized(aliases[0])!==normalized(aliases[1])?
  aliases.slice(0,2).map(x=>'"'+x+'"').join(' ou '):'"'+aliases[0]+'"';
 return 'Profissionais que trabalham atualmente na empresa '+name+
 ' no Brasil: gerentes, coordenadores e analistas de recursos humanos (RH), departamento pessoal (DP), '+
 'folha de pagamento, benefícios corporativos, people and culture, diretores administrativos. '+
 'Buscar nome completo, cargo e empresa empregadora atual.';
}
