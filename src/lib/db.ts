import postgres from 'postgres';
import 'server-only';
let client: ReturnType<typeof postgres> | undefined;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurada.');
  if (!client) client = postgres(process.env.DATABASE_URL, {ssl:'require',max:5,prepare:false,idle_timeout:20,connect_timeout:10});
  return client;
}
