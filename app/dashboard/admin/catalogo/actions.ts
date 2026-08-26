"use server";

import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/auth/require-role";
import { withRequestContext } from "@/lib/db/context";
import { getClientIp } from "@/lib/utils/client-ip";
import { upsertAccessCatalogSchema } from "@/lib/validations/access-catalog";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Autorização real: requireRole(["admin_ti"]), no lugar da antiga policy
// access_catalog_write_admin.

const PATH = "/dashboard/admin/catalogo";

export async function createCatalogItemAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const ownerDepartmentRaw = formData.get("owner_department_id");
  const monthlyCostRaw = formData.get("monthly_cost");

  const parsed = upsertAccessCatalogSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    owner_department_id: ownerDepartmentRaw ? ownerDepartmentRaw : null,
    monthly_cost:
      typeof monthlyCostRaw === "string" && monthlyCostRaw.length > 0
        ? Number(monthlyCostRaw)
        : null,
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Informe ao menos o nome do sistema (mín. 2 caracteres).");
  }

  const clientIp = await getClientIp();

  try {
    await withRequestContext({ userId: session!.id, clientIp }, (client) =>
      client.query(
        `insert into access_catalog (name, description, owner_department_id, monthly_cost)
         values ($1, $2, $3, $4)`,
        [
          parsed.data.name,
          parsed.data.description ?? null,
          parsed.data.owner_department_id ?? null,
          parsed.data.monthly_cost ?? null,
        ]
      )
    );
  } catch (error) {
    console.error("[access-catalog] create failed", { message: (error as Error).message });
    redirectWithError(PATH, "Não foi possível criar o item (nome já existe?).");
  }

  redirectWithSuccess(PATH, "Sistema adicionado ao catálogo.");
}

export async function updateCatalogItemAction(formData: FormData) {
  await assertTrustedOrigin();

  const id = formData.get("id");

  if (!z.string().uuid().safeParse(id).success) {
    redirectWithError(PATH, "Item inválido.");
  }

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const ownerDepartmentRaw = formData.get("owner_department_id");
  const monthlyCostRaw = formData.get("monthly_cost");

  const parsed = upsertAccessCatalogSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    owner_department_id: ownerDepartmentRaw ? ownerDepartmentRaw : null,
    monthly_cost:
      typeof monthlyCostRaw === "string" && monthlyCostRaw.length > 0
        ? Number(monthlyCostRaw)
        : null,
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Informe ao menos o nome do sistema (mín. 2 caracteres).");
  }

  const clientIp = await getClientIp();

  const { rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
    client.query(
      `update access_catalog
       set name = $2, description = $3, owner_department_id = $4, monthly_cost = $5
       where id = $1`,
      [
        id,
        parsed.data.name,
        parsed.data.description ?? null,
        parsed.data.owner_department_id ?? null,
        parsed.data.monthly_cost ?? null,
      ]
    )
  ).catch((error: unknown) => {
    console.error("[access-catalog] update failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(PATH, "Item não encontrado ou não foi possível salvar as alterações (nome já existe?).");
  }

  redirectWithSuccess(PATH, "Sistema atualizado.");
}

export async function deleteCatalogItemAction(formData: FormData) {
  await assertTrustedOrigin();

  const id = formData.get("id");

  if (!z.string().uuid().safeParse(id).success) {
    redirectWithError(PATH, "Item inválido.");
  }

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const clientIp = await getClientIp();

  let rowCount: number | null = 0;
  try {
    ({ rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
      client.query("delete from access_catalog where id = $1", [id])
    ));
  } catch (error) {
    // 23503 = violação de FK: existem access_requests apontando para este
    // sistema, então a exclusão é bloqueada pelo banco. Nesse caso o admin
    // deve desativar o item em vez de excluí-lo.
    const pgError = error as { code?: string; message?: string };
    const message =
      pgError.code === "23503"
        ? "Este sistema tem solicitações de acesso vinculadas e não pode ser excluído. Desative-o em vez disso."
        : "Não foi possível excluir o item.";
    console.error("[access-catalog] delete failed", { message: pgError.message, code: pgError.code });
    redirectWithError(PATH, message);
  }

  if (!rowCount) {
    redirectWithError(PATH, "Item não encontrado ou você não tem permissão para excluí-lo.");
  }

  redirectWithSuccess(PATH, "Sistema excluído.");
}

export async function toggleCatalogItemActiveAction(formData: FormData) {
  await assertTrustedOrigin();

  const id = formData.get("id");
  const nextActive = formData.get("next_active") === "true";

  if (!z.string().uuid().safeParse(id).success) {
    redirectWithError(PATH, "Item inválido.");
  }

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const clientIp = await getClientIp();

  const { rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
    client.query("update access_catalog set is_active = $2 where id = $1", [id, nextActive])
  ).catch((error: unknown) => {
    console.error("[access-catalog] toggle failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(PATH, "Item não encontrado ou você não tem permissão para alterá-lo.");
  }

  redirectWithSuccess(PATH, nextActive ? "Sistema ativado." : "Sistema desativado.");
}
