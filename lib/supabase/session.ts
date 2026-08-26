import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "./server";

// Arquitetura alinhada com as diretrizes do ADR Master.
//
// cache() do React memoiza o resultado por request (render pass): o layout
// do dashboard e a página filha rodam na mesma requisição, então antes desta
// memoização cada uma chamava auth.getUser()/consultava profiles de novo,
// dobrando (ou triplicando, em páginas que também checam o papel) o número
// de idas e vindas de rede ao Supabase por navegação — a causa raiz da
// lentidão percebida nas telas. A memoização é por requisição, não entre
// requisições: cada navegação revalida a sessão normalmente.
export const getAuthUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

export type CurrentProfile = {
  full_name: string;
  email: string;
  role: string;
};

// Mesmo raciocínio do getAuthUser: evita repetir a consulta a profiles
// quando mais de um componente da mesma requisição precisa do papel/perfil
// do usuário atual. Traz full_name/email/role — o superset do que as
// páginas hoje consultam para o próprio usuário.
export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createSupabaseServerClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, role")
    .eq("id", user.id)
    .single();

  return profile;
});
