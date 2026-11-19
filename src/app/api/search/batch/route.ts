import ExcelJS from 'exceljs';
import {Readable} from 'node:stream';
import {api,AppError} from '@/lib/api';
import {buildXlsx} from '@/lib/xlsx';
import {normalizeCnpj,cnpjKind} from '@/lib/cnpj';
import {discover} from '@/services/discovery';
import type {CompanyResult} from '@/services/providers';

export const runtime='nodejs';
const MAX_FILE_BYTES=5_000_000;
const MAX_ROWS=1000;
type InputRow={line:number;cnpj:string};
type OutputRow={line:number;cnpj:string;company?:CompanyResult;status:string};

export const POST=api(async(request,user)=>{
 const form=await request.formData();
 const file=form.get('file');
 if(!(file instanceof File))throw new AppError(400,'Anexe uma planilha Excel (.xlsx) ou CSV.');
 if(file.size>MAX_FILE_BYTES)throw new AppError(413,'O arquivo deve ter no máximo 5 MB.');
 if(!/\.(xlsx|csv)$/i.test(file.name))throw new AppError(400,'Formato não suportado. Envie um arquivo .xlsx ou .csv.');
 const workbook=new ExcelJS.Workbook();
 const bytes=Buffer.from(await file.arrayBuffer());
 try{
  if(/\.csv$/i.test(file.name))await workbook.csv.read(Readable.from([bytes]));
  else await workbook.xlsx.load(bytes as never);
 }
 catch{throw new AppError(400,'Não foi possível ler a planilha. Confira o arquivo e tente novamente.');}
 const sheet=workbook.worksheets[0];
 if(!sheet)throw new AppError(400,'A planilha está vazia.');
 const header=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
 const headerRow=sheet.getRow(1);
 const headers=Array.from({length:headerRow.cellCount},(_,index)=>header(headerRow.getCell(index+1).text));
 const column=headers.findIndex(value=>value==='cnpj'||value.includes('cnpj'));
 if(column<0)throw new AppError(400,'Inclua uma coluna chamada CNPJ na primeira linha da planilha.');
 const rows:InputRow[]=[];
 for(let index=2;index<=sheet.rowCount;index++){
  const value=sheet.getRow(index).getCell(column+1).text;
  if(!value.trim())continue;
  rows.push({line:index,cnpj:value.trim()});
 }
 if(!rows.length)throw new AppError(400,'Não encontrei CNPJs abaixo do cabeçalho.');
 if(rows.length>MAX_ROWS)throw new AppError(400,`A planilha pode conter no máximo ${MAX_ROWS} CNPJs por pesquisa.`);

 const output:OutputRow[]=new Array(rows.length);
 let next=0;
 async function worker(){
  while(true){
   const index=next++;
   if(index>=rows.length)return;
   const row=rows[index];
   const cnpj=normalizeCnpj(row.cnpj);
   if(cnpjKind(cnpj)!=='exact'){
    output[index]={line:row.line,cnpj:row.cnpj,status:'CNPJ inválido ou incompleto'};
    continue;
   }
   try{
    const result=await discover({cnpj,state:[],activeOnly:false,branches:'all',pageSize:1},user,{includePlaces:false});
    const company=result.items.find(item=>item.cnpj===cnpj)||result.items[0];
    const failure=result.sourceStatus.find(item=>item.state==='error');
    output[index]={line:row.line,cnpj:row.cnpj,company,status:company?'Encontrado':failure?`Consulta indisponível: ${failure.message||'fonte indisponível'}`:'Não encontrado'};
   }catch(error){
    output[index]={line:row.line,cnpj:row.cnpj,status:error instanceof Error?error.message.slice(0,200):'Falha na consulta'};
   }
  }
 }
 await Promise.all(Array.from({length:Math.min(3,rows.length)},()=>worker()));
 const found=output.filter(row=>row.company).length;
 const buffer=buildXlsx([{name:'Resultados',headers:['Linha original','CNPJ informado','Status','Razão social','Nome fantasia','Matriz/filial','Situação','CNAE','Atividade','Cidade','UF','Endereço','Telefone','E-mail','Origem cadastral'],rows:output.map(row=>[
  row.line,row.cnpj,row.status,row.company?.legalName,row.company?.tradeName,
  row.company?.isHeadquarters===true?'Matriz':row.company?.isHeadquarters===false?'Filial':'',row.company?.status,
  row.company?.cnae,row.company?.segment,row.company?.city,row.company?.state,row.company?.address,
  row.company?.phone,row.company?.email,row.company?.source
 ])}]);
 return new Response(new Uint8Array(buffer),{headers:{
  'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'Content-Disposition':'attachment; filename="prospect-pesquisa-em-lote.xlsx"',
  'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff',
  'X-Batch-Total':String(output.length),'X-Batch-Found':String(found)
 }});
},{write:true});
