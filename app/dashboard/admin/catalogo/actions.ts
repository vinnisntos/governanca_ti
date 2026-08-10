"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { upsertAccessCatalogSchema } from "@/lib/validations/access-catalog";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Autorização real é a policy access_catalog_write_admin (RLS); a página só
// exibe este formulário para quem já é admin_ti como atalho de UX.

const PATH = "/dashboard/admin/catalogo";

export async function createCatalogItemAction(formData: FormData) {
  await assertTrustedOrigin();

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

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("access_catalog").insert({
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    owner_department_id: parsed.data.owner_department_id ?? null,
    monthly_cost: parsed.data.monthly_cost ?? null,
  });

  if (error) {
    console.error("[access-catalog] create failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível criar o item (nome já existe?).");
  }

  redirectWithSuccess(PATH, "Sistema adicionado ao catálogo.");
}

export async function toggleCatalogItemActiveAction(formData: FormData) {
  await assertTrustedOrigin();

  const id = formData.get("id");
  const nextActive = formData.get("next_active") === "true";

  if (typeof id !== "string" || id.length === 0) {
    redirectWithError(PATH, "Item inválido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("access_catalog")
    .update({ is_active: nextActive })
    .eq("id", id as string);

  if (error) {
    console.error("[access-catalog] toggle failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível atualizar o status do item.");
  }

  redirectWithSuccess(PATH, nextActive ? "Sistema ativado." : "Sistema desativado.");
}
