import { randomBytes } from "node:crypto";
import { Pool } from "pg";
import { hashPassword } from "../lib/auth/password";

// Cria o único usuário inicial do banco novo (admin_ti), pra depois
// cadastrar todo mundo pela própria UI (app/dashboard/admin/usuarios).
// Uso:
//   SEED_ADMIN_NAME="Nome" SEED_ADMIN_EMAIL="admin@empresa.com" \
//   [SEED_ADMIN_PASSWORD="..."] npx tsx scripts/seed-admin.ts
// Sem SEED_ADMIN_PASSWORD, gera uma senha temporária e imprime uma única
// vez (must_change_password fica true, então ela é trocada no primeiro
// login, como qualquer usuário criado pelo admin_ti).
function generateTempPassword(): string {
  const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const LOWER = "abcdefghjkmnpqrstuvwxyz";
  const DIGITS = "23456789";
  const SYMBOLS = "!@#$%";
  const ALL = UPPER + LOWER + DIGITS + SYMBOLS;
  const pick = (charset: string) => charset[randomBytes(1)[0]! % charset.length];
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS), pick(SYMBOLS)];
  const rest = Array.from({ length: 8 }, () => pick(ALL));
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomBytes(1)[0]! % (i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada");
  }
  const name = process.env.SEED_ADMIN_NAME;
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!name || !email) {
    throw new Error("SEED_ADMIN_NAME e SEED_ADMIN_EMAIL são obrigatórios");
  }

  const ssl = process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined;
  const pool = new Pool({ connectionString, ssl });

  try {
    const { rows: existingAdmins } = await pool.query(
      "select id from public.profiles where role = 'admin_ti' limit 1"
    );
    if (existingAdmins.length > 0) {
      console.log("[seed-admin] já existe um admin_ti cadastrado — nada a fazer.");
      return;
    }

    const password = process.env.SEED_ADMIN_PASSWORD || generateTempPassword();
    const passwordHash = await hashPassword(password);

    await pool.query(
      `insert into public.profiles (full_name, email, password_hash, role, is_active, must_change_password)
       values ($1, $2, $3, 'admin_ti', true, true)`,
      [name, email, passwordHash]
    );

    console.log(`[seed-admin] admin_ti criado: ${email}`);
    if (!process.env.SEED_ADMIN_PASSWORD) {
      console.log(`[seed-admin] senha temporária (só exibida agora): ${password}`);
    }
  } finally {
    await pool.end();
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
