"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { upsertMobileLineSchema, updateMobileLineSchema } from "@/lib/validations/mobile-lines";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Autorização real é a policy mobile_lines_write_admin (RLS); a página só
// exibe estes formulários para quem já é admin_ti como atalho de UX.

const PATH = "/dashboard/admin/telefonia";

function emptyToNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

export async function createMobileLineAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = upsertMobileLineSchema.safeParse({
    phone_number: formData.get("phone_number"),
    carrier: formData.get("carrier"),
    plan_name: formData.get("plan_name"),
    monthly_cost: Number(formData.get("monthly_cost")),
    line_type: formData.get("line_type"),
    status: formData.get("status"),
    assigned_to: emptyToNull(formData.get("assigned_to")),
    department_id: emptyToNull(formData.get("department_id")),
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Preencha número, operadora, plano, custo e tipo corretamente.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("mobile_lines").insert(parsed.data);

  if (error) {
    console.error("[mobile-lines] create failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível cadastrar a linha (número já existe?).");
  }

  redirectWithSuccess(PATH, "Linha cadastrada.");
}

export async function updateMobileLineAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = updateMobileLineSchema.safeParse({
    id: formData.get("id"),
    carrier: formData.get("carrier"),
    plan_name: formData.get("plan_name"),
    monthly_cost: Number(formData.get("monthly_cost")),
    line_type: formData.get("line_type"),
    status: formData.get("status"),
    assigned_to: emptyToNull(formData.get("assigned_to")),
    department_id: emptyToNull(formData.get("department_id")),
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Dados inválidos para atualizar a linha.");
  }

  const { id, ...updateFields } = parsed.data;
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("mobile_lines").update(updateFields).eq("id", id);

  if (error) {
    console.error("[mobile-lines] update failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível atualizar a linha.");
  }

  redirectWithSuccess(PATH, "Linha atualizada.");
}
