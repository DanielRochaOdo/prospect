import {api} from '@/lib/api';import {db} from '@/lib/db';
export const runtime='nodejs';
export const GET=api(async(_req,user)=>{
 const rows=await db()`SELECT e.cnpj,c.legal_name,e.trade_name,e.city,e.state,e.address,e.phone,e.email,e.cnae,l.status,l.notes,l.created_at,u.name AS owner
 FROM leads l JOIN establishments e ON e.id=l.establishment_id JOIN companies c ON c.id=e.company_id JOIN users u ON u.id=l.owner_id
 WHERE (${user.role==='admin'} OR l.owner_id=${user.id}) ORDER BY l.created_at DESC LIMIT 10000`;
 const headers=['CNPJ','Razão social','Nome fantasia','Cidade','UF','Endereço','Telefone','Email','CNAE','Status','Observações','Data de cadastro','Responsável'];
 const safe=(input:unknown)=>{let text=String(input??'').replace(/\r\n?/g,'\n');if(/^[\s]*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
 const output=['sep=;\r\n',headers.map(safe).join(';'),...rows.map(r=>[r.cnpj,r.legal_name,r.trade_name,r.city,r.state,r.address,r.phone,r.email,r.cnae,r.status,r.notes,r.created_at,r.owner].map(safe).join(';'))].join('\r\n');
 return new Response('\ufeff'+output,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="prospect-leads.csv"','Cache-Control':'no-store'}});
});
