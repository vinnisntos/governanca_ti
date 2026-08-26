import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

// Runner de migration mínimo, sem dependência nova: aplica os .sql de
// db/migrations em ordem alfabética, cada um dentro de uma transação, e
// registra o que já rodou em schema_migrations pra nunca reaplicar.
async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada");
  }
  const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined;
  const pool = new Pool({ connectionString, ssl });

  try {
    await pool.query(
      `create table if not exists public.schema_migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`
    );

    const migrationsDir = path.resolve(__dirname, "../db/migrations");
    const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();

    const { rows: applied } = await pool.query<{ name: string }>(
      "select name from public.schema_migrations"
    );
    const appliedNames = new Set(applied.map((r) => r.name));

    for (const file of files) {
      if (appliedNames.has(file)) {
        console.log(`[migrate] ${file} já aplicada, pulando`);
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, file), "utf-8");
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(sql);
        await client.query("insert into public.schema_migrations (name) values ($1)", [file]);
        await client.query("commit");
        console.log(`[migrate] ${file} aplicada`);
      } catch (error) {
        await client.query("rollback");
        throw new Error(`Falha aplicando ${file}: ${(error as Error).message}`, { cause: error });
      } finally {
        client.release();
      }
    }
  } finally {
    await pool.end();
  }
}

main()
  .then(() => {
    console.log("[migrate] concluído");
    process.exit(0);
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
