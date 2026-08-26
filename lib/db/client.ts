import "server-only";
import { Pool } from "pg";

// Ponto único de conexão com o Postgres. Substitui lib/supabase/{client,server}.ts.
// DATABASE_URL aponta para o Postgres puro no Dokploy (sem PostgREST/RLS).
declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada");
  }

  // DATABASE_SSL=true liga TLS (ex.: banco gerenciado fora da rede interna
  // do Dokploy); por padrão desligado, já que o Postgres do Dokploy tende a
  // ser alcançado só pela rede interna do próprio Dokploy.
  const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined;

  return new Pool({ connectionString, ssl });
}

function getPool(): Pool {
  // Reaproveita o pool entre hot-reloads do Next.js em dev (evita esgotar
  // conexões a cada recompilação); em produção é apenas um singleton normal.
  if (!globalThis.__pgPool) {
    globalThis.__pgPool = createPool();
  }
  return globalThis.__pgPool;
}

// Proxy em vez de `const pool = createPool()`: a Pool real só é criada (e só
// aí DATABASE_URL passa a ser exigida) no primeiro uso de fato — `next build`
// importa todas as rotas para coletar metadados, mesmo sem DATABASE_URL
// disponível em tempo de build, e isso não pode quebrar o build.
export const pool: Pool = new Proxy({} as Pool, {
  get(_target, prop, _receiver) {
    const realPool = getPool();
    const value = Reflect.get(realPool, prop, realPool);
    return typeof value === "function" ? value.bind(realPool) : value;
  },
});
