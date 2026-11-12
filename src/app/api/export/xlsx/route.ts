import {api,AppError} from '@/lib/api';
import {companyRow} from '@/lib/validation';
import {buildXlsx} from '@/lib/xlsx';
import {normalizeCnpj,validCnpj} from '@/lib/cnpj';
import {z} from 'zod';
export const runtime='nodejs';
const manager=z.object({cnpj:z.string().max(18),name:z.string().trim().min(1).max(150),role:z.string().trim().min(1).max(150),organization:z.string().max(200),source:z.enum(['apollo','hunter']),partialName:z.boolean()});
const schema=z.object({companies:z.array(companyRow).max(300),people:z.array(manager).max(1500)});
export const POST=api(async(request)=>{
 const bytes=await request.text();
 if(bytes.length>2_000_000)throw new AppError(413,'O arquivo excede o tamanho permitido. Exporte menos empresas.');
 const input=schema.parse(JSON.parse(bytes));
 const validCompanies=input.companies.filter(c=>['cnpjai','localiza','manual'].includes(c.source) && validCnpj(normalizeCnpj(c.cnpj)));
 if(!validCompanies.length)throw new AppError(400,'Não há dados cadastrais válidos para exportar.');
 const byCnpj=new Set(validCompanies.map(c=>normalizeCnpj(c.cnpj)));
 const people=input.people.filter(p=>byCnpj.has(normalizeCnpj(p.cnpj)));
 const count=new Map<string,number>();for(const p of people)count.set(normalizeCnpj(p.cnpj),(count.get(normalizeCnpj(p.cnpj))||0)+1);
 const buffer=buildXlsx([
  {name:'Empresas',headers:['CNPJ','Razão social','Nome fantasia','Matriz/filial','CNAE','Setor','Cidade','UF','Endereço','Telefone da empresa','E-mail corporativo','Origem cadastral','Gestores localizados'],
   rows:validCompanies.map(c=>[c.cnpj,c.legalName,c.tradeName,
    c.isHeadquarters===true?'Matriz':c.isHeadquarters===false?'Filial':'Não identificado',c.cnae,c.segment,c.city,c.state,c.address,c.phone,c.email,c.source,count.get(normalizeCnpj(c.cnpj))||0])},
  {name:'Gestores',headers:['CNPJ','Empresa','Nome','Cargo','Nome parcial?','Empresa no provedor','Origem do contato','Telefone da empresa'],
   rows:people.map(p=>{const c=validCompanies.find(c=>normalizeCnpj(c.cnpj)===normalizeCnpj(p.cnpj))!;
    return [p.cnpj,c.tradeName||c.legalName,p.name,p.role,p.partialName?'Sim':'Não',p.organization,p.source,c.phone];})}
 ]);
 return new Response(new Uint8Array(buffer),{headers:{'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','Content-Disposition':`attachment; filename="prospect-resultados-${new Date().toISOString().slice(0,10)}.xlsx"`,'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff'}});
},{write:true});
