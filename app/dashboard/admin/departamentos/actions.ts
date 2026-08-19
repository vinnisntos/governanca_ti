"use server";

import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/utils/require-role";
import { upsertDepartmentSchema } from "@/lib/validations/departments";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Autorização real é a policy departments_write_admin (RLS); requireRole()
// é defesa em profundidade para dar uma mensagem clara em vez de depender só
// do efeito colateral silencioso do RLS.

const PATH = "/dashboard/admin/departamentos";

export async function createDepartmentAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, supabase } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = upsertDepartmentSchema.safeParse({ name: formData.get("name") });

  if (!parsed.success) {
    redirectWithError(PATH, "Informe o nome do departamento (mín. 2 caracteres).");
  }

  const { error } = await supabase.from("departments").insert({ name: parsed.data.name });

  if (error) {
    console.error("[departments] create failed", { message: error.message });
    const message =
      error.code === "23505"
        ? "Já existe um departamento com esse nome."
        : "Não foi possível criar o departamento.";
    redirectWithError(PATH, message);
  }

  redirectWithSuccess(PATH, "Departamento criado.");
}

export async function updateDepartmentAction(formData: FormData) {
  await assertTrustedOrigin();

  const id = formData.get("id");

  if (!z.string().uuid().safeParse(id).success) {
    redirectWithError(PATH, "Departamento inválido.");
  }

  const { authorized, supabase } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = upsertDepartmentSchema.safeParse({ name: formData.get("name") });

  if (!parsed.success) {
    redirectWithError(PATH, "Informe o nome do departamento (mín. 2 caracteres).");
  }

  const { data: updated, error } = await supabase
    .from("departments")
    .update({ name: parsed.data.name })
    .eq("id", id as string)
    .select("id");

  if (error) {
    console.error("[departments] update failed", { message: error.message });
    const message =
      error.code === "23505"
        ? "Já existe um departamento com esse nome."
        : "Não foi possível salvar as alterações.";
    redirectWithError(PATH, message);
  }

  if (!updated || updated.length === 0) {
    redirectWithError(PATH, "Departamento não encontrado ou você não tem permissão para alterá-lo.");
  }

  redirectWithSuccess(PATH, "Departamento atualizado.");
}

export async function deleteDepartmentAction(formData: FormData) {
  await assertTrustedOrigin();

  const id = formData.get("id");

  if (!z.string().uuid().safeParse(id).success) {
    redirectWithError(PATH, "Departamento inválido.");
  }

  const { authorized, supabase } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const { data: deleted, error } = await supabase
    .from("departments")
    .delete()
    .eq("id", id as string)
    .select("id");

  if (error) {
    // 23503 = violação de FK: existem usuários, sistemas do catálogo ou
    // linhas móveis vinculados a este departamento — a exclusão é bloqueada
    // pelo banco. Nesse caso é preciso realocar quem/o que está vinculado
    // antes de excluir.
    const message =
      error.code === "23503"
        ? "Este departamento tem usuários ou registros vinculados e não pode ser excluído."
        : "Não foi possível excluir o departamento.";
    console.error("[departments] delete failed", { message: error.message, code: error.code });
    redirectWithError(PATH, message);
  }

  if (!deleted || deleted.length === 0) {
    redirectWithError(PATH, "Departamento não encontrado ou você não tem permissão para excluí-lo.");
  }

  redirectWithSuccess(PATH, "Departamento excluído.");
}
