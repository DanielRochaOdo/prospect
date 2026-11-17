/** Links externos para verificação manual de perfis profissionais no LinkedIn.
 * Não consulta, extrai nem automatiza dados do LinkedIn. */
export function verifiedLinkedInProfileUrl(value:unknown):string|null{
 if(typeof value!=='string'||value.length>500)return null;
 try{
  const url=new URL(value);
  if(url.protocol!=='https:'||
   (url.hostname!=='www.linkedin.com'&&url.hostname!=='linkedin.com')||
   url.username||url.password||url.port)return null;
  if(!/^\/(?:in|pub)\/[a-zA-Z0-9%_-]+(?:\/[a-zA-Z0-9%_-]+)*\/?$/.test(url.pathname))return null;
  return url.origin+url.pathname;
 }catch{return null;}
}
/**
 * Pesquisa executada pelo próprio usuário no site do LinkedIn.
 * Pode retornar homônimos ou empresas diferentes: confirmar antes de utilizar.
 */
export function linkedinPeopleSearchUrl(companyName:string,tradeName?:string|null,personName?:string):string{
 const org=(tradeName?.trim()||companyName.trim()).slice(0,100);
 const term=personName?.trim()?
  '"'+personName.trim().slice(0,100)+'" "'+org+'"':
  '"'+org+'" (RH OR "recursos humanos" OR "benefícios" OR "people" OR gerente OR diretor OR diretora)';
 const url=new URL('https://www.linkedin.com/search/results/people/');
 url.searchParams.set('keywords',term);
 return url.toString();
}
