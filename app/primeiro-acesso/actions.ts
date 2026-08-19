"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient, createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { setPasswordSchema } from "@/lib/validations/auth";

// Arquitetura alinhada com as diretrizes do ADR Master.

export type SetPasswordActionState = { error: string | null };

export async function setInitialPasswordAction(
  _prevState: SetPasswordActionState,
  formData: FormData
): Promise<SetPasswordActionState> {
  try {
    await assertTrustedOrigin();
  } catch {
    return { error: "Não foi possível processar a solicitação." };
  }

  const parsed = setPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm_password: formData.get("confirm_password"),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { error: authError } = await supabase.auth.updateUser({ password: parsed.data.password });

  if (authError) {
    console.error("[primeiro-acesso] update password failed", { message: authError.message });
    return { error: "Não foi possível definir a nova senha. Tente novamente." };
  }

  // must_change_password é campo protegido por fn_protect_profile_fields
  // (supabase/migrations/0002_must_change_password.sql) — só admin_ti ou
  // service_role podem limpá-lo. Usamos a service role aqui, restrita ao
  // próprio usuário autenticado, e só depois de confirmar que a troca de
  // senha no Supabase Auth teve sucesso (nunca antes).
  const serviceRole = createSupabaseServiceRoleClient();
  const { error: flagError } = await serviceRole
    .from("profiles")
    .update({ must_change_password: false })
    .eq("id", user.id);

  if (flagError) {
    console.error("[primeiro-acesso] clear must_change_password failed", { message: flagError.message });
    return { error: "Senha alterada, mas houve um problema ao liberar seu acesso. Contate o TI." };
  }

  redirect("/dashboard");
}
