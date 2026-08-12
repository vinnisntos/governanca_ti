"use server";

import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/utils/require-role";
import { upsertMobileLineSchema, updateMobileLineSchema } from "@/lib/validations/mobile-lines";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Autorização real é a policy mobile_lines_write_admin (RLS); requireRole()
// é defesa em profundidade para dar uma mensagem clara em vez de depender só
// do efeito colateral silencioso do RLS.

const PATH = "/dashboard/admin/telefonia";

function emptyToNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

// Number(null) e Number("") retornam 0 (não NaN) — um monthly_cost ausente
// passaria a validação .nonnegative() como custo zero válido em vez de ser
// rejeitado. Mesmo padrão já usado em admin/catalogo/actions.ts.
function toNumberOrNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length === 0) return null;
  return Number(value);
}

export async function createMobileLineAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, supabase } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = upsertMobileLineSchema.safeParse({
    phone_number: formData.get("phone_number"),
    carrier: formData.get("carrier"),
    plan_name: formData.get("plan_name"),
    monthly_cost: toNumberOrNull(formData.get("monthly_cost")),
    line_type: formData.get("line_type"),
    status: formData.get("status"),
    assigned_to: emptyToNull(formData.get("assigned_to")),
    department_id: emptyToNull(formData.get("department_id")),
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Preencha número, operadora, plano, custo e tipo corretamente.");
  }

  const { error } = await supabase.from("mobile_lines").insert(parsed.data);

  if (error) {
    console.error("[mobile-lines] create failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível cadastrar a linha (número já existe?).");
  }

  redirectWithSuccess(PATH, "Linha cadastrada.");
}

export async function updateMobileLineAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, supabase } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = updateMobileLineSchema.safeParse({
    id: formData.get("id"),
    carrier: formData.get("carrier"),
    plan_name: formData.get("plan_name"),
    monthly_cost: toNumberOrNull(formData.get("monthly_cost")),
    line_type: formData.get("line_type"),
    status: formData.get("status"),
    assigned_to: emptyToNull(formData.get("assigned_to")),
    department_id: emptyToNull(formData.get("department_id")),
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Dados inválidos para atualizar a linha.");
  }

  const { id, ...updateFields } = parsed.data;
  const { data: updated, error } = await supabase
    .from("mobile_lines")
    .update(updateFields)
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[mobile-lines] update failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível atualizar a linha.");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(PATH, "Linha não encontrada ou você não tem permissão para alterá-la.");
  }

  redirectWithSuccess(PATH, "Linha atualizada.");
}
