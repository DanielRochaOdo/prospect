import {api,json} from '@/lib/api';
import {db} from '@/lib/db';

export const GET=api(async request=>{
 const params=new URL(request.url).searchParams;
 const states=params.getAll('state').filter(x=>/^[A-Z]{2}$/.test(x.toUpperCase())).map(x=>x.toUpperCase());
 const cities=params.getAll('city').filter(Boolean).slice(0,100);
 const sql=db();
 const [ready]=await sql`SELECT to_regclass('public.business_activities') IS NOT NULL AS activities,
    to_regclass('public.cnae_catalog') IS NOT NULL AS cnaes,
    to_regclass('public.business_locations') IS NOT NULL AS locations`;
 if(!ready.activities||!ready.cnaes||!ready.locations){
  const [activities,cnaes,districts]=await Promise.all([
   sql`SELECT DISTINCT search_term AS name FROM segments WHERE active=true AND search_term<>'' ORDER BY name`,
   sql`SELECT DISTINCT code,description FROM (
       SELECT cnae AS code,search_term AS description FROM segments WHERE cnae IS NOT NULL
       UNION ALL SELECT cnae AS code,COALESCE(segment,'') AS description FROM establishments WHERE cnae IS NOT NULL
     ) known WHERE code ~ '^[0-9]{7}$' ORDER BY code LIMIT 5000`,
   cities.length?sql`SELECT DISTINCT district AS name FROM establishments WHERE district IS NOT NULL AND district<>''
       AND city=ANY(${sql.array(cities)}) AND state=ANY(${sql.array(states)}) ORDER BY name LIMIT 5000`:Promise.resolve([])
  ]);
  return json({sectors:[],activities,cnaes,districts});
 }
 const [sectors,activities,cnaes,districts]=await Promise.all([
  sql`SELECT DISTINCT sector AS name,sector AS search_term FROM business_activities WHERE sector<>'' ORDER BY name`,
  sql`SELECT name FROM business_activities WHERE name<>'' ORDER BY name`,
  sql`SELECT DISTINCT ON (code) code,description FROM (
      SELECT code,description FROM cnae_catalog
      UNION ALL SELECT cnae AS code,COALESCE(segment,'') AS description FROM establishments WHERE cnae ~ '^[0-9]{7}$'
    ) catalog ORDER BY code,(description<>'') DESC LIMIT 5000`,
  cities.length?sql`SELECT DISTINCT district AS name FROM business_locations
      WHERE city=ANY(${sql.array(cities)}) AND state=ANY(${sql.array(states)}) ORDER BY name LIMIT 5000`:Promise.resolve([])
 ]);
 return json({sectors,activities,cnaes,districts});
});
