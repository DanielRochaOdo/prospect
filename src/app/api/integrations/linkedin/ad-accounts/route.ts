import {api,json} from '@/lib/api';
import {linkedinAdAccounts} from '@/services/linkedin-read';
export const runtime='nodejs';
export const GET=api(async()=>json(await linkedinAdAccounts()),{admin:true});
