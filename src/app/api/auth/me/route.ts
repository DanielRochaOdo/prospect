import {api,json} from '@/lib/api';
export const GET=api(async(_req,user)=>json({user}));
