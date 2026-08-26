"use server";

import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/auth/require-role";
import { withRequestContext } from "@/lib/db/context";
import { getClientIp } from "@/lib/utils/client-ip";
import { upsertMobileLineSchema, updateMobileLineSchema } from "@/lib/validations/mobile-lines";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Sem RLS no banco: requireRole(["admin_ti"]) é a autoridade real de escrita
// nesta tabela agora.

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

  const { authorized, session } = await requireRole(["admin_ti"]);
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

  const clientIp = await getClientIp();

  try {
    await withRequestContext({ userId: session!.id, clientIp }, (client) =>
      client.query(
        `insert into mobile_lines
           (phone_number, carrier, plan_name, monthly_cost, line_type, status, assigned_to, department_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          parsed.data.phone_number,
          parsed.data.carrier,
          parsed.data.plan_name,
          parsed.data.monthly_cost,
          parsed.data.line_type,
          parsed.data.status,
          parsed.data.assigned_to,
          parsed.data.department_id,
        ]
      )
    );
  } catch (error) {
    console.error("[mobile-lines] create failed", { message: (error as Error).message });
    redirectWithError(PATH, "Não foi possível cadastrar a linha (número já existe?).");
  }

  redirectWithSuccess(PATH, "Linha cadastrada.");
}

export async function updateMobileLineAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, session } = await requireRole(["admin_ti"]);
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

  const clientIp = await getClientIp();
  const { rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
    client.query(
      `update mobile_lines
       set carrier = $2, plan_name = $3, monthly_cost = $4, line_type = $5,
           status = $6, assigned_to = $7, department_id = $8
       where id = $1
       returning id`,
      [
        parsed.data.id,
        parsed.data.carrier,
        parsed.data.plan_name,
        parsed.data.monthly_cost,
        parsed.data.line_type,
        parsed.data.status,
        parsed.data.assigned_to,
        parsed.data.department_id,
      ]
    )
  ).catch((error: unknown) => {
    console.error("[mobile-lines] update failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(PATH, "Linha não encontrada ou não foi possível atualizá-la.");
  }

  redirectWithSuccess(PATH, "Linha atualizada.");
}
