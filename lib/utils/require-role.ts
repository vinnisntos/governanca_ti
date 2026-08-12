import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Espelha o enum public.user_role definido em supabase/migrations/0001_init.sql.
type Role = "colaborador" | "gestor" | "rh" | "admin_ti";

// Arquitetura alinhada com as diretrizes do ADR Master.
//
// Defesa em profundidade: o RLS já é a autoridade real sobre quem pode
// escrever em cada tabela (ver supabase/migrations/0001_init.sql, bloco 9).
// Sem esta checagem, uma Server Action que dependesse só do RLS devolveria,
// para um usuário sem o papel exigido, o mesmo comportamento de "nada
// aconteceu" descrito no achado de UPDATE sem .select() — este helper existe
// para que a action possa recusar a operação com uma mensagem clara ANTES
// de gastar uma chamada ao banco, e não apenas confiar no efeito colateral
// (correto, mas silencioso) do RLS.
export async function requireRole(allowed: Role[]) {
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { authorized: false as const, supabase, user: null };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return {
    authorized: !!profile && allowed.includes(profile.role),
    supabase,
    user,
  };
}
