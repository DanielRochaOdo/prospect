export class AppError extends Error { constructor(public status:number, message:string){super(message);} }
export const httpError=(status:number,message:string)=>new AppError(status,message);
export function errorResponse(error:unknown){
  const status=error instanceof AppError ? error.status : 500;
  if(status===500) console.error('[API]',error);
  return Response.json({error: error instanceof AppError ? error.message : 'Erro interno no servidor.'},{status,headers:{'Cache-Control':'no-store'}});
}
