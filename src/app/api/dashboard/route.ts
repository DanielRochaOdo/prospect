import {api,json} from '@/lib/api';import {db} from '@/lib/db';import {periods} from '@/services/usage';
export const GET=api(async(_req,user)=>{
 const admin=user.role==='admin';const own=admin?db()`SELECT count(*)::int AS total FROM leads`:db()`SELECT count(*)::int AS total FROM leads WHERE owner_id=${user.id}`;
 const stats=await Promise.all([
  own,
  admin?db()`SELECT status,count(*)::int AS count FROM leads GROUP BY status`:db()`SELECT status,count(*)::int AS count FROM leads WHERE owner_id=${user.id} GROUP BY status`,
  admin?db()`SELECT count(*)::int AS n FROM search_history`:db()`SELECT count(*)::int AS n FROM search_history WHERE user_id=${user.id}`,
  db()`SELECT provider,operation,count(*)::int AS used FROM api_usage WHERE period_month=${periods().month} GROUP BY provider,operation`,
  admin?db()`SELECT count(*)::int AS n FROM lead_interactions`:db()`SELECT count(*)::int AS n FROM lead_interactions WHERE user_id=${user.id}`,
  admin?db()`SELECT provider,results_count,created_at FROM search_history ORDER BY created_at DESC LIMIT 8`:db()`SELECT provider,results_count,created_at FROM search_history WHERE user_id=${user.id} ORDER BY created_at DESC LIMIT 8`
 ]);
 return json({leads:stats[0][0].total,statuses:stats[1],searches:stats[2][0].n,usage:stats[3],interactions:stats[4][0].n,recent:stats[5]});
});
