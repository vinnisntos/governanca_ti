"use server";

import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/utils/require-role";
import { updateUserSchema } from "@/lib/validations/users";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

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
