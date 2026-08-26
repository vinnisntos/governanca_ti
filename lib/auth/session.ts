import "server-only";
import { cache } from "react";
import { randomBytes, createHash } from "node:crypto";
import { pool } from "@/lib/db/client";
import { getSessionTokenFromCookies, setSessionCookie, clearSessionCookie } from "./cookies";

// Substitui lib/supabase/session.ts. Sessão própria: token opaco de 32
// bytes no cookie, guardado no banco só como hash SHA-256 (a tabela
// `sessions` nunca tem o token cru — mesmo padrão de token de reset de
// senha). Permite derrubar sessões na hora (desativação de conta,
// redefinição de senha) só apagando a linha.
const TTL_HOURS = Number(process.env.SESSION_TTL_HOURS ?? 12);
const TTL_MS = TTL_HOURS * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type UserRole = "colaborador" | "gestor" | "rh" | "admin_ti";

export type SessionUser = {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  department_id: string | null;
  manager_id: string | null;
};

export async function createSession(
  userId: string,
  meta: { ip: string | null; userAgent: string | null }
): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + TTL_MS);

  await pool.query(
    `insert into sessions (user_id, token_hash, user_agent, ip, expires_at)
     values ($1, $2, $3, $4, $5)`,
    [userId, hashToken(token), meta.userAgent, meta.ip, expiresAt]
  );

  await setSessionCookie(token, expiresAt);
}

type SessionRow = {
  session_id: string;
  expires_at: string;
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  must_change_password: boolean;
  department_id: string | null;
  manager_id: string | null;
};

// Memoizado por requisição (mesmo raciocínio de getAuthUser/getCurrentProfile
// de antes): evita repetir o join sessions+profiles quando mais de um
// Server Component da mesma renderização precisa da sessão atual.
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = await getSessionTokenFromCookies();
  if (!token) return null;

  const { rows } = await pool.query<SessionRow>(
    `select s.id as session_id, s.expires_at,
            p.id, p.email, p.full_name, p.role, p.is_active, p.must_change_password,
            p.department_id, p.manager_id
     from sessions s
     join profiles p on p.id = s.user_id
     where s.token_hash = $1`,
    [hashToken(token)]
  );

  const row = rows[0];
  if (!row) return null;

  const expiresAtMs = new Date(row.expires_at).getTime();
  if (expiresAtMs <= Date.now()) return null;

  // TTL deslizante: passado metade do prazo, estende sem esperar expirar.
  if (expiresAtMs - Date.now() < TTL_MS / 2) {
    await pool.query("update sessions set last_seen_at = now(), expires_at = $2 where id = $1", [
      row.session_id,
      new Date(Date.now() + TTL_MS),
    ]);
  }

  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    role: row.role,
    is_active: row.is_active,
    must_change_password: row.must_change_password,
    department_id: row.department_id,
    manager_id: row.manager_id,
  };
});

export async function destroySession(): Promise<void> {
  const token = await getSessionTokenFromCookies();
  if (token) {
    await pool.query("delete from sessions where token_hash = $1", [hashToken(token)]);
  }
  await clearSessionCookie();
}

// Usado ao desativar um usuário ou redefinir sua senha — derruba qualquer
// sessão ativa dele, equivalente ao efeito implícito de trocar senha no
// Supabase Auth de antes.
export async function destroyAllSessionsForUser(userId: string): Promise<void> {
  await pool.query("delete from sessions where user_id = $1", [userId]);
}

// --- Compat: mesmo formato de lib/supabase/session.ts, para os arquivos que
// só precisam de id/email ou full_name/email/role (não a sessão inteira).

export async function getAuthUser(): Promise<{ id: string; email: string } | null> {
  const session = await getSession();
  return session ? { id: session.id, email: session.email } : null;
}

export type CurrentProfile = { full_name: string; email: string; role: UserRole };

export async function getCurrentProfile(): Promise<CurrentProfile | null> {
  const session = await getSession();
  return session ? { full_name: session.full_name, email: session.email, role: session.role } : null;
}
