import {NextResponse} from 'next/server';
export const runtime='nodejs';
// Não troca códigos OAuth nem atualiza tokens enquanto o serviço estiver desativado.
export async function GET(req:Request){return NextResponse.redirect(new URL('/configuracoes',req.url),303);}
