import { ZodError } from 'zod';
export class AppError extends Error { constructor(public status:number, message:string){super(message);} }
export const httpError=(status:number,message:string)=>new AppError(status,message);
export function errorResponse(error:unknown){
  const status=error instanceof AppError ? error.status : error instanceof ZodError ? 400 : 500;
  if(status===500) console.error('[API]',error);
  return Response.json({error: error instanceof AppError ? error.message : error instanceof ZodError ? error.issues.map(i=>i.message).join('; ') : 'Erro interno no servidor.'},{status,headers:{'Cache-Control':'no-store'}});
}
