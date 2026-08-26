import "server-only";
import type { PoolClient } from "pg";
import { pool } from "./client";

export type RequestContext = {
  userId: string | null;
  clientIp: string | null;
};

// Toda escrita (INSERT/UPDATE/DELETE) passa por aqui. Abre uma transação e
// seta app.current_user_id/app.client_ip como GUCs locais à transação
// (set_config com is_local=true == SET LOCAL, mas parametrizável) — é o que
// os triggers de auditoria/proteção de campo leem no lugar do antigo
// auth.uid()/request.headers do PostgREST (ver db/migrations/0001_init.sql).
// Leituras (SELECT) não precisam disso: usam o pool direto e filtram por
// WHERE explícito com os dados já carregados por getSession().
export async function withRequestContext<T>(
  ctx: RequestContext,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (ctx.userId) {
      await client.query("select set_config('app.current_user_id', $1, true)", [ctx.userId]);
    }
    if (ctx.clientIp) {
      await client.query("select set_config('app.client_ip', $1, true)", [ctx.clientIp]);
    }
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
