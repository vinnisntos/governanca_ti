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
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Mensagem genérica: nunca expor se foi o e-mail ou a senha que falhou
    // (evita enumeração de contas) nem detalhes internos do Supabase Auth.
    console.error("[auth] login failed", { message: error.message });
    return { error: "E-mail ou senha inválidos." };
  }

  redirect("/dashboard");
}
