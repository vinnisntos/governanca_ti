import "server-only";
import { getSession, type SessionUser, type UserRole } from "./session";

// Substitui lib/utils/require-role.ts. Defesa em profundidade: sem RLS no
// banco, a autorização por papel É a autoridade real agora — mas manter
// esta checagem explícita no início de cada Server Action continua valendo
// pela mesma razão de antes: recusar com uma mensagem clara antes de gastar
// uma chamada ao banco, em vez de deixar o WHERE explícito da query
// simplesmente não encontrar nenhuma linha.
export async function requireRole(
  allowed: UserRole[]
): Promise<{ authorized: boolean; session: SessionUser | null }> {
  const session = await getSession();

  if (!session) {
    return { authorized: false, session: null };
  }

  return {
    authorized: session.is_active && allowed.includes(session.role),
    session,
  };
}
