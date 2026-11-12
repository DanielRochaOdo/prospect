/** Escritor OOXML mínimo: XLSX real, sem dependências e sem execução de fórmulas em células. */
import {deflateRawSync} from 'node:zlib';

export type WorkbookSheet = {name:string;headers:string[];rows:(string|null|undefined|number)[][]};
const esc = (v:unknown) => String(v ?? '').slice(0,32767)
  .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g,'')
  .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const column = (index:number):string => {
  let c=''; for(let i=index+1;i;i=Math.floor((i-1)/26))c=String.fromCharCode(65+(i-1)%26)+c;return c;
};
const crcTable = Array.from({length:256},(_,n)=>{
  let c=n;for(let i=0;i<8;i++)c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);return c>>>0;
});
const crc32=(data:Buffer) => {let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
function zip(files:{name:string;content:string}[]):Buffer {
  const local:Buffer[]=[];const central:Buffer[]=[];let offset=0;
  for(const f of files){
    const filename=Buffer.from(f.name,'utf8');const data=Buffer.from(f.content,'utf8');
    const compressed=deflateRawSync(data);const crc=crc32(data);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);
    header.writeUInt16LE(0,6);header.writeUInt16LE(8,8);header.writeUInt32LE(crc,14);
    header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(data.length,22);
    header.writeUInt16LE(filename.length,26);local.push(header,filename,compressed);
    const dir=Buffer.alloc(46);dir.writeUInt32LE(0x02014b50,0);dir.writeUInt16LE(20,4);
    dir.writeUInt16LE(20,6);dir.writeUInt16LE(8,10);dir.writeUInt32LE(crc,16);
    dir.writeUInt32LE(compressed.length,20);dir.writeUInt32LE(data.length,24);
    dir.writeUInt16LE(filename.length,28);dir.writeUInt32LE(offset,42);
    central.push(dir,filename);offset+=header.length+filename.length+compressed.length;
  }
  const centralSize=central.reduce((s,p)=>s+p.length,0);
  const end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);
  end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);
  end.writeUInt32LE(centralSize,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,...central,end]);
}
const xmlHeader='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
function sheetXml(s:WorkbookSheet):string {
  const columns=s.headers.map((h,i)=>`<col min="${i+1}" max="${i+1}" width="${Math.max(14,Math.min(38,h.length+8))}" customWidth="1"/>`).join('');
  const rows=[s.headers,...s.rows];
  const rowXml=rows.map((row,i)=>`<row r="${i+1}">${row.map((value,j)=>`<c r="${column(j)}${i+1}" s="${i===0?1:0}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`).join('')}</row>`).join('');
  return `${xmlHeader}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="17"/><cols>${columns}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="A1:${column(Math.max(0,s.headers.length-1))}${Math.max(1,rows.length)}"/></worksheet>`;
}
export function buildXlsx(sheets:WorkbookSheet[]):Buffer {
  if (!sheets.length || sheets.length>4)throw new Error('Número inválido de abas');
  for(const s of sheets)if(!s.headers.length||s.headers.length>30||s.rows.length>1000)throw new Error('Exportação excede o tamanho permitido');
  const workbook=`${xmlHeader}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${esc(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets></workbook>`;
  const rels=`${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const types=`${xmlHeader}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const styles=`${xmlHeader}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Aptos"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF17345B"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs></styleSheet>`;
  return zip([
    {name:'[Content_Types].xml',content:types},
    {name:'_rels/.rels',content:`${xmlHeader}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`},
    {name:'xl/workbook.xml',content:workbook},
    {name:'xl/_rels/workbook.xml.rels',content:rels},
    {name:'xl/styles.xml',content:styles},
    ...sheets.map((s,i)=>({name:`xl/worksheets/sheet${i+1}.xml`,content:sheetXml(s)}))
  ]);
}
