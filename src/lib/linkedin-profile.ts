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
