"use server";

import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/utils/require-role";
import { revokeAccessSchema } from "@/lib/validations/access-requests";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Autorização real é a policy access_requests_revoke_admin + trigger
// fn_validate_access_request_transition (RLS/banco — ver
// supabase/migrations/0005_revoke_access.sql); requireRole() é defesa em
// profundidade para dar uma mensagem clara em vez de depender só do efeito
// colateral silencioso do RLS.

const PATH = "/dashboard/admin/acessos-concedidos";

export async function revokeAccessAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, supabase } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = revokeAccessSchema.safeParse({
    request_id: formData.get("request_id"),
    revoke_reason: formData.get("revoke_reason") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Solicitação inválida.");
  }

  const { data: updated, error } = await supabase
    .from("access_requests")
    .update({
      status: "revogado",
      revoke_reason: parsed.data.revoke_reason ?? null,
    })
    .eq("id", parsed.data.request_id)
    .select("id");

  if (error) {
    console.error("[acessos-concedidos] revoke failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível revogar o acesso.");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(
      PATH,
      "Acesso não encontrado ou já não está mais aprovado (pode já ter sido revogado)."
    );
  }

  redirectWithSuccess(PATH, "Acesso revogado.");
}
