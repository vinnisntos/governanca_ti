"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { decideAccessRequestSchema } from "@/lib/validations/access-requests";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.
//
// reviewed_by/decision_at NUNCA são enviados pelo client: são preenchidos
// automaticamente pela trigger fn_validate_access_request_transition no
// banco (supabase/migrations/0001_init.sql, bloco 3), a partir de auth.uid()
// — impossível de forjar via payload. A própria permissão para decidir
// (admin_ti ou gestor direto do solicitante) é reforçada pela policy
// access_requests_update_approver; se este Server Action tiver algum bug de
// autorização, o UPDATE simplesmente falha no banco.

const PATH = "/dashboard/approvals";

export async function decideAccessRequestAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = decideAccessRequestSchema.safeParse({
    request_id: formData.get("request_id"),
    decision: formData.get("decision"),
    review_notes: formData.get("review_notes") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(
      PATH,
      parsed.error.issues[0]?.message ?? "Dados inválidos para a decisão."
    );
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("access_requests")
    .update({
      status: parsed.data.decision,
      review_notes: parsed.data.review_notes ?? null,
    })
    .eq("id", parsed.data.request_id);

  if (error) {
    console.error("[approvals] decide failed", { message: error.message });
    redirectWithError(
      PATH,
      "Não foi possível registrar a decisão. Verifique se você tem permissão para decidir esta solicitação."
    );
  }

  redirectWithSuccess(
    PATH,
    parsed.data.decision === "aprovado" ? "Acesso aprovado." : "Acesso negado."
  );
}
