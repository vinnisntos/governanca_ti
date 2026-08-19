"use server";

import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/utils/require-role";
import { createUserSchema, updateUserSchema } from "@/lib/validations/users";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/server";
import { generateTempPassword } from "@/lib/utils/generate-temp-password";
import { setTempPasswordFlash } from "@/lib/utils/temp-password-flash";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Autorização real é a policy profiles_update + trigger fn_protect_profile_fields
// (RLS); requireRole() é defesa em profundidade para dar uma mensagem clara em
// vez de depender só do efeito colateral silencioso do RLS.

const PATH = "/dashboard/admin/usuarios";

export async function updateUserAction(formData: FormData) {
  await assertTrustedOrigin();

  const id = formData.get("id");

  if (!z.string().uuid().safeParse(id).success) {
    redirectWithError(PATH, "Usuário inválido.");
  }

  const { authorized, supabase, user } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  // Impede que o admin altere o próprio papel/situação por esta tela e cause
  // um auto-rebaixamento/desativação acidental (a policy de RLS já permite
  // um admin editar o próprio registro, então esta é uma defesa de UX, não
  // de segurança).
  if (user!.id === id) {
    redirectWithError(PATH, "Você não pode editar o próprio usuário por aqui.");
  }

  const departmentRaw = formData.get("department_id");
  const managerRaw = formData.get("manager_id");

  const parsed = updateUserSchema.safeParse({
    role: formData.get("role"),
    department_id: departmentRaw ? departmentRaw : null,
    manager_id: managerRaw ? managerRaw : null,
    is_active: formData.get("is_active") === "true",
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Dados inválidos.");
  }

  if (parsed.data.manager_id && parsed.data.manager_id === id) {
    redirectWithError(PATH, "Um usuário não pode ser gestor de si mesmo.");
  }

  const { data: updated, error } = await supabase
    .from("profiles")
    .update({
      role: parsed.data.role,
      department_id: parsed.data.department_id ?? null,
      manager_id: parsed.data.manager_id ?? null,
      is_active: parsed.data.is_active,
    })
    .eq("id", id as string)
    .select("id");

  if (error) {
    console.error("[users] update failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível salvar as alterações.");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(PATH, "Usuário não encontrado ou você não tem permissão para alterá-lo.");
  }

  redirectWithSuccess(PATH, "Usuário atualizado.");
}

// auth.admin.createUser/updateUserById exigem a service role key (bypassa
// RLS) — não existe outra forma de provisionar login no Supabase Auth a
// partir do backend. requireRole(["admin_ti"]) acontece ANTES de qualquer
// chamada à service role, então só admin_ti chega a essa parte da função.
export async function createUserAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const departmentRaw = formData.get("department_id");
  const managerRaw = formData.get("manager_id");

  const parsed = createUserSchema.safeParse({
    full_name: formData.get("full_name"),
    email: formData.get("email"),
    role: formData.get("role"),
    department_id: departmentRaw ? departmentRaw : null,
    manager_id: managerRaw ? managerRaw : null,
  });

  if (!parsed.success) {
    redirectWithError(PATH, parsed.error.issues[0]?.message ?? "Dados inválidos.");
  }

  const serviceRole = createSupabaseServiceRoleClient();
  const tempPassword = generateTempPassword();

  const { data: created, error: createError } = await serviceRole.auth.admin.createUser({
    email: parsed.data.email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.full_name },
  });

  if (createError || !created.user) {
    console.error("[users] create auth user failed", { message: createError?.message });
    const message = createError?.message.includes("already been registered")
      ? "Já existe um usuário com este e-mail."
      : "Não foi possível criar o usuário.";
    redirectWithError(PATH, message);
  }

  // handle_new_user() (0001_init.sql) já criou o profile com
  // role='colaborador' assim que auth.admin.createUser inseriu em
  // auth.users — aqui sobrescrevemos com o que o admin escolheu no
  // formulário e marcamos a senha como descartável.
  const { error: updateError } = await serviceRole
    .from("profiles")
    .update({
      role: parsed.data.role,
      department_id: parsed.data.department_id ?? null,
      manager_id: parsed.data.manager_id ?? null,
      must_change_password: true,
    })
    .eq("id", created.user.id);

  if (updateError) {
    console.error("[users] set role after create failed", { message: updateError.message });
    redirectWithError(
      PATH,
      "Usuário criado, mas não foi possível definir papel/gestor. Edite manualmente."
    );
  }

  await setTempPasswordFlash({ email: parsed.data.email, password: tempPassword });
  redirectWithSuccess(PATH, `Usuário ${parsed.data.full_name} criado.`);
}

export async function resetUserPasswordAction(formData: FormData) {
  await assertTrustedOrigin();

  const id = formData.get("id");

  if (!z.string().uuid().safeParse(id).success) {
    redirectWithError(PATH, "Usuário inválido.");
  }

  const { authorized, supabase, user } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  if (user!.id === id) {
    redirectWithError(PATH, "Você não pode redefinir a própria senha por aqui.");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", id as string)
    .single();

  if (!profile) {
    redirectWithError(PATH, "Usuário não encontrado.");
  }

  const serviceRole = createSupabaseServiceRoleClient();
  const tempPassword = generateTempPassword();

  const { error: authError } = await serviceRole.auth.admin.updateUserById(id as string, {
    password: tempPassword,
  });

  if (authError) {
    console.error("[users] reset password failed", { message: authError.message });
    redirectWithError(PATH, "Não foi possível redefinir a senha.");
  }

  const { error: flagError } = await serviceRole
    .from("profiles")
    .update({ must_change_password: true })
    .eq("id", id as string);

  if (flagError) {
    console.error("[users] set must_change_password after reset failed", { message: flagError.message });
  }

  await setTempPasswordFlash({ email: profile.email, password: tempPassword });
  redirectWithSuccess(PATH, "Senha redefinida.");
}
