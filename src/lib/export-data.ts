import {z} from 'zod';
const value=z.string().max(5000).nullable().optional();
const company=z.object({
 cnpj:z.string().max(36), source:z.enum(['cnpjai','localiza','manual']),
 legalName:value,tradeName:value,isHeadquarters:z.boolean().nullable().optional(),
 cnae:value,segment:value,city:value,state:value,address:value,phone:value,email:value
});
const person=z.object({
 cnpj:z.string().max(36),name:z.string().trim().min(1).max(500),
 role:z.string().trim().min(1).max(500),organization:z.string().max(500).optional(),
 source:z.enum(['exa','opencnpj']),partialName:z.boolean().default(false)
});
const payload=z.object({companies:z.array(z.unknown()).max(300),people:z.array(z.unknown()).max(1500).default([])});
const doc=(s:string)=>s.toUpperCase().replace(/[^0-9A-Z]/g,'');
export function normalizeExport(input:unknown){
 const parsed=payload.parse(input);
 const unique=new Map<string,z.infer<typeof company>>();
 for(const raw of parsed.companies){
  const row=company.safeParse(raw);
  if(!row.success)continue;
  const cnpj=doc(row.data.cnpj);
  if(!/^[A-Z0-9]{12}[0-9]{2}$/.test(cnpj))continue;
  if(!unique.has(cnpj))unique.set(cnpj,{...row.data,cnpj});
 }
 const companies=[...unique.values()];
 const allowed=new Set(companies.map(c=>c.cnpj));
 const people:z.infer<typeof person>[]=[];const seen=new Set<string>();
 for(const raw of parsed.people){
  const row=person.safeParse(raw);
  if(!row.success)continue;
  const cnpj=doc(row.data.cnpj);
  if(!allowed.has(cnpj))continue;
  const key=[cnpj,row.data.name.toLowerCase(),row.data.role.toLowerCase()].join(':');
  if(seen.has(key))continue;seen.add(key);
  people.push({...row.data,cnpj});
 }
 return {companies,people};
}
