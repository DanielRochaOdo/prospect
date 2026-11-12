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
} finally { await sql.end(); }
