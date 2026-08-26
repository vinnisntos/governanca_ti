"use server";

import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/auth/require-role";
import { withRequestContext } from "@/lib/db/context";
import { getClientIp } from "@/lib/utils/client-ip";
import { upsertDepartmentSchema } from "@/lib/validations/departments";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Autorização real: requireRole(["admin_ti"]), no lugar da antiga policy
// departments_write_admin.

const PATH = "/dashboard/admin/departamentos";

export async function createDepartmentAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = upsertDepartmentSchema.safeParse({ name: formData.get("name") });

  if (!parsed.success) {
    redirectWithError(PATH, "Informe o nome do departamento (mín. 2 caracteres).");
  }

  const clientIp = await getClientIp();

  try {
    await withRequestContext({ userId: session!.id, clientIp }, (client) =>
      client.query("insert into departments (name) values ($1)", [parsed.data.name])
    );
  } catch (error) {
    const pgError = error as { code?: string; message?: string };
    console.error("[departments] create failed", { message: pgError.message });
    const message =
      pgError.code === "23505" ? "Já existe um departamento com esse nome." : "Não foi possível criar o departamento.";
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

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = upsertDepartmentSchema.safeParse({ name: formData.get("name") });

  if (!parsed.success) {
    redirectWithError(PATH, "Informe o nome do departamento (mín. 2 caracteres).");
  }

  const clientIp = await getClientIp();

  let rowCount: number | null = 0;
  try {
    ({ rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
      client.query("update departments set name = $2 where id = $1", [id, parsed.data.name])
    ));
  } catch (error) {
    const pgError = error as { code?: string; message?: string };
    console.error("[departments] update failed", { message: pgError.message });
    const message =
      pgError.code === "23505" ? "Já existe um departamento com esse nome." : "Não foi possível salvar as alterações.";
    redirectWithError(PATH, message);
  }

  if (!rowCount) {
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

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const clientIp = await getClientIp();

  let rowCount: number | null = 0;
  try {
    ({ rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
      client.query("delete from departments where id = $1", [id])
    ));
  } catch (error) {
    // 23503 = violação de FK: existem usuários, sistemas do catálogo ou
    // linhas móveis vinculados a este departamento — a exclusão é bloqueada
    // pelo banco. Nesse caso é preciso realocar quem/o que está vinculado
    // antes de excluir.
    const pgError = error as { code?: string; message?: string };
    const message =
      pgError.code === "23503"
        ? "Este departamento tem usuários ou registros vinculados e não pode ser excluído."
        : "Não foi possível excluir o departamento.";
    console.error("[departments] delete failed", { message: pgError.message, code: pgError.code });
    redirectWithError(PATH, message);
  }

  if (!rowCount) {
    redirectWithError(PATH, "Departamento não encontrado ou você não tem permissão para excluí-lo.");
  }

  redirectWithSuccess(PATH, "Departamento excluído.");
}
