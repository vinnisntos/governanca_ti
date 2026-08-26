"use server";

import { getSession } from "@/lib/auth/session";
import { withRequestContext } from "@/lib/db/context";
import { getClientIp } from "@/lib/utils/client-ip";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { decideAccessRequestSchema } from "@/lib/validations/access-requests";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// reviewed_by/decision_at NUNCA são enviados pelo client: são preenchidos
// automaticamente pela trigger fn_validate_access_request_transition no
// banco (db/migrations/0001_init.sql), a partir de public.current_user_id()
// — impossível de forjar via payload. A permissão para decidir (admin_ti ou
// gestor direto do solicitante) é imposta pelo WHERE abaixo, no lugar da
// antiga policy access_requests_update_approver.

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

  const session = await getSession();
  if (!session) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const isAdmin = session!.role === "admin_ti";
  const clientIp = await getClientIp();

  // rowCount === 0 cobre tanto "solicitação inexistente" quanto "não está
  // mais decidível" e "você não é admin_ti nem o gestor direto do
  // solicitante" — não distinguimos os casos pro cliente por segurança.
  const { rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
    client.query(
      `update access_requests
       set status = $2, review_notes = $3
       where id = $1
         and requester_id <> $4
         and status in ('pendente', 'em_analise')
         and ($5 or requester_id in (select id from profiles where manager_id = $4))`,
      [
        parsed.data.request_id,
        parsed.data.decision,
        parsed.data.review_notes ?? null,
        session!.id,
        isAdmin,
      ]
    )
  ).catch((error: unknown) => {
    console.error("[approvals] decide failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
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
