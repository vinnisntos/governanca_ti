"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validations/auth";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";

// Arquitetura alinhada com as diretrizes do ADR Master.

export type LoginActionState = {
  error: string | null;
};

// Rate limiting de força bruta é aplicado na borda (Nginx limit_req +
// fail2ban, ver ARQUITETURA_TECNICA.md seção 6.2/6.3) e pelo próprio GoTrue
// (Supabase Auth) — este Server Action nunca deve ser a única linha de
// defesa contra tentativas repetidas.
export async function loginAction(
  _prevState: LoginActionState,
  formData: FormData
): Promise<LoginActionState> {
  try {
    await assertTrustedOrigin();
  } catch {
    return { error: "Não foi possível processar a solicitação." };
  }

  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "E-mail ou senha inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const { data: signInData, error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Mensagem genérica: nunca expor se foi o e-mail ou a senha que falhou
    // (evita enumeração de contas) nem detalhes internos do Supabase Auth.
    console.error("[auth] login failed", { message: error.message });
    return { error: "E-mail ou senha inválidos." };
  }

  // Redireciona direto para /primeiro-acesso quando aplicável, em vez de
  // depender só do middleware pegar isso na requisição seguinte: um
  // redirect() de Server Action que o middleware intercepta e redireciona de
  // novo confunde o roteador client-side do Next.js (a barra de endereço fica
  // com o destino original da action — /dashboard — mesmo o conteúdo servido
  // sendo o da segunda página). O middleware continua sendo a autoridade real
  // (bloqueia navegação direta/back-forward para outras rotas), isto aqui é
  // só para o primeiro redirect pós-login já sair certo.
  const { data: profile } = await supabase
    .from("profiles")
    .select("must_change_password")
    .eq("id", signInData.user.id)
    .single();

  redirect(profile?.must_change_password ? "/primeiro-acesso" : "/dashboard");
}
