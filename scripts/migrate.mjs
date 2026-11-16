import postgres from 'postgres';
import { readFileSync } from 'node:fs';
if(!process.env.DATABASE_URL) { console.error('DATABASE_URL não configurada'); process.exit(1); }
const sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 1, prepare: false });
try {
 const statements = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
   .split(/-- statement\s*\n/g).map(x=>x.trim()).filter(x=>x && !x.startsWith('-- Prospect'));
 // Primeira seção inclui comentários e deve ser descartada.
 const full=readFileSync(new URL('../db/schema.sql', import.meta.url),'utf8').split(/-- statement\s*\n/g).slice(1);
 await sql.begin(async tx => { for(const stmt of full){ if(stmt.trim()) await tx.unsafe(stmt); }});
 console.log(`Migração aplicada: ${full.length} instruções`);
 try {
  const response=await fetch('https://servicodados.ibge.gov.br/api/v2/cnae/subclasses',{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw new Error(`IBGE respondeu HTTP ${response.status}`);
  const subclasses=await response.json();
  const cnaes=[];const activities=new Map();
  for(const item of subclasses){
   const code=String(item.id??'');
   const description=String(item.descricao??'').trim();
   if(!/^\d{7}$/.test(code)||!description)continue;
   cnaes.push({code,description});
   const sector=String(item.classe?.grupo?.divisao?.secao?.descricao??'').trim();
   activities.set(description,{name:description,search_term:description,sector});
  }
  await sql.begin(async tx=>{
   await tx`INSERT INTO cnae_catalog(code,description)
    SELECT code,description FROM jsonb_to_recordset(${tx.json(cnaes)}::jsonb) AS item(code text,description text)
    ON CONFLICT(code) DO UPDATE SET description=EXCLUDED.description,updated_at=now()`;
   await tx`INSERT INTO business_activities(name,search_term,sector)
    SELECT name,search_term,sector FROM jsonb_to_recordset(${tx.json([...activities.values()])}::jsonb) AS item(name text,search_term text,sector text)
    ON CONFLICT(name) DO UPDATE SET search_term=EXCLUDED.search_term,sector=EXCLUDED.sector,updated_at=now()`;
  });
  console.log(`Catálogo IBGE sincronizado: ${cnaes.length} CNAEs e ${activities.size} atividades.`);
 } catch(error) {
  console.warn(`Não foi possível sincronizar o catálogo CNAE do IBGE: ${error instanceof Error?error.message:'erro desconhecido'}. Execute novamente a migração quando o IBGE estiver disponível.`);
 }
} finally { await sql.end(); }
