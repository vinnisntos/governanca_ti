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
// access_requests_update_approver.
//
// IMPORTANTE: sem .select() após o UPDATE, o @supabase/supabase-js usa
// "Prefer: return=minimal" — se a policy de RLS filtrar a linha (usuário sem
// permissão sobre esta solicitação específica), o Postgres/PostgREST afeta 0
// linhas e devolve { error: null }, NÃO um erro. Por isso encadeamos
// .select("id") e checamos explicitamente se algo foi de fato afetado, em
// vez de assumir sucesso apenas porque não houve erro.

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
  const { data: updated, error } = await supabase
    .from("access_requests")
    .update({
      status: parsed.data.decision,
      review_notes: parsed.data.review_notes ?? null,
    })
    .eq("id", parsed.data.request_id)
    .select("id");

  if (error) {
    console.error("[approvals] decide failed", { message: error.message });
    redirectWithError(
      PATH,
      "Não foi possível registrar a decisão. Verifique se você tem permissão para decidir esta solicitação."
    );
  }

  if (!updated || updated.length === 0) {
    redirectWithError(
      PATH,
      "Solicitação não encontrada ou você não tem permissão para decidir sobre ela."
    );
  }

  redirectWithSuccess(
    PATH,
    parsed.data.decision === "aprovado" ? "Acesso aprovado." : "Acesso negado."
  );
}
