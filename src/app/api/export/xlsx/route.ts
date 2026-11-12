import {api,AppError} from '@/lib/api';
import {buildXlsx} from '@/lib/xlsx';
import {normalizeExport} from '@/lib/export-data';
export const runtime='nodejs';
export const POST=api(async(request)=>{
 const bytes=await request.text();
 if(bytes.length>2_000_000)throw new AppError(413,'A exportação excedeu 2 MB. Reduza a quantidade de registros.');
 let input:unknown;
 try{input=JSON.parse(bytes);}catch{throw new AppError(400,'Dados de exportação inválidos. Refaça a pesquisa.');}
 const {companies,people}=normalizeExport(input);
 if(!companies.length)throw new AppError(400,'Nenhuma empresa cadastral válida para exportar. Verifique os CNPJs retornados.');
 const byCnpj=new Map(companies.map(c=>[c.cnpj,c]));
 const count=new Map<string,number>();
 for(const p of people)count.set(p.cnpj,(count.get(p.cnpj)||0)+1);
 const buffer=buildXlsx([
  {name:'Empresas',headers:['CNPJ','Razão social','Nome fantasia','Matriz/filial','CNAE','Setor','Cidade','UF','Endereço','Telefone da empresa','E-mail corporativo','Origem cadastral','Gestores localizados'],
   rows:companies.map(c=>[c.cnpj,c.legalName||'Razão social não informada',c.tradeName,
    c.isHeadquarters===true?'Matriz':c.isHeadquarters===false?'Filial':'Não identificado',c.cnae,c.segment,c.city,c.state,c.address,c.phone,c.email,c.source,count.get(c.cnpj)||0])},
  {name:'Gestores',headers:['CNPJ','Empresa','Nome','Cargo','Nome parcial?','Empresa no provedor','Origem do contato','Telefone da empresa'],
   rows:people.map(p=>{const c=byCnpj.get(p.cnpj)!;return [p.cnpj,c.tradeName||c.legalName,p.name,p.role,p.partialName?'Sim':'Não',p.organization,p.source,c.phone];})}
 ]);
 return new Response(new Uint8Array(buffer),{headers:{
  'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'Content-Disposition':'attachment; filename="prospect-resultados-'+new Date().toISOString().slice(0,10)+'.xlsx"',
  'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'
 }});
},{write:true});
