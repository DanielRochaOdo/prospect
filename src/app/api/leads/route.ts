import {api,json,AppError} from '@/lib/api';
import {db} from '@/lib/db';
import {audit} from '@/lib/auth';
import {leadSchema} from '@/lib/validation';
import {normalizeCnpj,validCnpj} from '@/lib/cnpj';
export const GET=api(async(req,user)=>{
 const params=new URL(req.url).searchParams;
 const status=params.get('status')||'';
 const q=params.get('q')?.trim().slice(0,100)||'';
 const page=Math.max(1,Math.min(1000,Number(params.get('page')||1)));
 const offset=(page-1)*20;
 const rows=await db()`SELECT l.id,l.status,l.notes,l.next_contact_at,l.created_at,l.updated_at,l.owner_id,
 e.cnpj,e.trade_name,e.city,e.state,e.phone,e.email,e.address,e.cnae,e.segment,
 c.legal_name,c.cnpj_root,u.name AS owner_name
 FROM leads l JOIN establishments e ON e.id=l.establishment_id JOIN companies c ON c.id=e.company_id JOIN users u ON u.id=l.owner_id
 WHERE (${user.role==='admin'} OR l.owner_id=${user.id}) AND (${status}='' OR l.status=${status})
 AND (${q}='' OR c.legal_name ILIKE ${'%'+q+'%'} OR e.cnpj ILIKE ${'%'+q+'%'})
 ORDER BY l.updated_at DESC LIMIT 20 OFFSET ${offset}`;
 return json({leads:rows,page,hasMore:rows.length===20});
});
export const POST=api(async(req,user)=>{
 const input=leadSchema.parse(await req.json());const c=input.company;
 const doc=normalizeCnpj(c.cnpj);
 if(!validCnpj(doc)||doc.slice(0,8)!==c.cnpjRoot)throw new AppError(400,'CNPJ inválido.');
 const result=await db().begin(async tx=>{
  const company=await tx`INSERT INTO companies(cnpj_root,legal_name,source) VALUES (${c.cnpjRoot},${c.legalName},${c.source})
    ON CONFLICT(cnpj_root) DO UPDATE SET legal_name=EXCLUDED.legal_name,synced_at=now() RETURNING id`;
  const companyId=company[0].id as string;
  const est=await tx`INSERT INTO establishments(company_id,cnpj,trade_name,is_headquarters,status,cnae,segment,city,state,district,address,postal_code,phone,email,source)
   VALUES (${companyId},${doc},${c.tradeName??null},${c.isHeadquarters??null},${c.status??null},${c.cnae??null},${c.segment??null},${c.city??null},${c.state??null},${c.district??null},${c.address??null},${c.postalCode??null},${c.phone??null},${c.email??null},${c.source})
   ON CONFLICT(cnpj) DO UPDATE SET company_id=EXCLUDED.company_id,trade_name=EXCLUDED.trade_name,status=EXCLUDED.status,
    cnae=EXCLUDED.cnae,segment=EXCLUDED.segment,city=EXCLUDED.city,state=EXCLUDED.state,district=EXCLUDED.district,
    address=EXCLUDED.address,postal_code=EXCLUDED.postal_code,phone=EXCLUDED.phone,email=EXCLUDED.email,synced_at=now()
   RETURNING id`;
  const existing=await tx`SELECT id FROM leads WHERE establishment_id=${est[0].id} AND owner_id=${user.id}`;
  if(existing.length)throw new AppError(409,'Este estabelecimento já está na sua lista de leads.');
  const lead=await tx`INSERT INTO leads(establishment_id,owner_id,notes) VALUES (${est[0].id},${user.id},${input.notes}) RETURNING id`;
  return lead[0].id as string;
 });
 await audit(user.id,'create','lead',result,{cnpj:doc});
 return json({id:result},201);
},{write:true});
