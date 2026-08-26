"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { pool } from "@/lib/db/client";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { loginSchema } from "@/lib/validations/auth";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { getClientIp } from "@/lib/utils/client-ip";

export type LoginActionState = {
  error: string | null;
};

type LoginProfileRow = {
  id: string;
  password_hash: string;
  is_active: boolean;
  must_change_password: boolean;
};

// Rate limiting de força bruta é aplicado na borda (Nginx limit_req +
// fail2ban) — este Server Action nunca deve ser a única linha de defesa
// contra tentativas repetidas.
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

  const { rows } = await pool.query<LoginProfileRow>(
    "select id, password_hash, is_active, must_change_password from profiles where email = $1",
    [parsed.data.email]
  );
  const profile = rows[0];

  // Mensagem genérica: nunca expor se foi o e-mail ou a senha que falhou
  // (evita enumeração de contas).
  if (!profile || !(await verifyPassword(parsed.data.password, profile.password_hash))) {
    console.error("[auth] login failed", { email: parsed.data.email });
    return { error: "E-mail ou senha inválidos." };
  }

  if (!profile.is_active) {
    return { error: "Sua conta foi desativada. Fale com o TI." };
  }

  const [clientIp, headerList] = await Promise.all([getClientIp(), headers()]);
  const userAgent = headerList.get("user-agent");

  await createSession(profile.id, { ip: clientIp, userAgent });

  // Redireciona direto para /primeiro-acesso quando aplicável, em vez de
  // depender só do middleware pegar isso na requisição seguinte: um
  // redirect() de Server Action que o middleware intercepta e redireciona de
  // novo confunde o roteador client-side do Next.js (a barra de endereço fica
  // com o destino original da action — /dashboard — mesmo o conteúdo servido
  // sendo o da segunda página).
  if (profile.must_change_password) {
    redirect("/primeiro-acesso");
  }

  // "next" só é aceito se apontar para dentro do dashboard — evita redirect
  // aberto caso alguém manipule o campo escondido do formulário.
  const next = formData.get("next");
  const safeNext = typeof next === "string" && /^\/dashboard(\/|$)/.test(next) ? next : "/dashboard";
  redirect(safeNext);
}
