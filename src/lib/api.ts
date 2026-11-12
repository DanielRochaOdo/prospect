import { ZodError } from 'zod';
import { AppError,errorResponse } from './errors';
import { checkOrigin, requireUser, type User } from './auth';
export function api(handler:(request:Request,user:User)=>Promise<Response>,opts:{admin?:boolean;write?:boolean}={}){
 return async(request:Request)=>{try{
  if(opts.write)checkOrigin(request);
  const user=await requireUser(opts.admin??false);
  return await handler(request,user);
 }catch(err){
  if(err instanceof ZodError)return Response.json({error:err.issues.map(i=>i.message).join('; ')},{status:400});
  return errorResponse(err);
 }};
}
export function json(data:unknown,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store'}});}
export {AppError};
