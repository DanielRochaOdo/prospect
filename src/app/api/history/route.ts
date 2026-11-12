import {api,json} from '@/lib/api';import {db} from '@/lib/db';
export const GET=api(async(req,user)=>{
 const page=Math.min(50,Math.max(1,Number(new URL(req.url).searchParams.get('page')||1)));
 const offset=(page-1)*20;
 const rows=user.role==='admin'
 ?await db()`SELECT h.id,h.provider,h.filters,h.results_count,h.created_at,u.name AS user_name FROM search_history h JOIN users u ON u.id=h.user_id ORDER BY h.created_at DESC LIMIT 20 OFFSET ${offset}`
 :await db()`SELECT h.id,h.provider,h.filters,h.results_count,h.created_at,u.name AS user_name FROM search_history h JOIN users u ON u.id=h.user_id WHERE h.user_id=${user.id} ORDER BY h.created_at DESC LIMIT 20 OFFSET ${offset}`;
 return json({history:rows,page,hasMore:rows.length===20});
});
