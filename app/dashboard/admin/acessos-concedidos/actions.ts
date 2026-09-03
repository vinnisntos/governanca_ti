"use server";

import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/auth/require-role";
import { withRequestContext } from "@/lib/db/context";
import { getClientIp } from "@/lib/utils/client-ip";
import {
  revokeAccessSchema,
  grantAccessSchema,
  OTHER_SYSTEM_VALUE,
} from "@/lib/validations/access-requests";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Autorização real: requireRole(["admin_ti"]) + o WHERE abaixo (só a partir
// de 'aprovado'), no lugar da antiga policy access_requests_revoke_admin. A
// trigger fn_validate_access_request_transition (db/migrations/0001_init.sql)
// segue validando a transição aprovado -> revogado.

const PATH = "/dashboard/admin/acessos-concedidos";

export async function revokeAccessAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = revokeAccessSchema.safeParse({
    request_id: formData.get("request_id"),
    revoke_reason: formData.get("revoke_reason") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(PATH, parsed.error.issues[0]?.message ?? "Solicitação inválida.");
  }

  const clientIp = await getClientIp();

  const { rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
    client.query(
      `update access_requests
       set status = 'revogado', revoke_reason = $2
       where id = $1 and status = 'aprovado'`,
      [parsed.data.request_id, parsed.data.revoke_reason ?? null]
    )
  ).catch((error: unknown) => {
    console.error("[acessos-concedidos] revoke failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(
      PATH,
      "Acesso não encontrado ou já não está mais aprovado (pode já ter sido revogado)."
    );
  }

  redirectWithSuccess(PATH, "Acesso revogado.");
}

// Concessão manual: mesmo caminho de INSERT do fluxo de autoatendimento
// (app/dashboard/access-requests/actions.ts) — status nunca é forjado no
// INSERT, o default 'pendente' da coluna se aplica — seguido de um UPDATE
// para 'aprovado' na mesma transação. A trigger
// fn_validate_access_request_transition (db/migrations/0001_init.sql)
// carimba reviewed_by/decision_at a partir de current_user_id() (o admin
// logado), então o rastro fica idêntico ao de uma aprovação normal.
export async function grantAccessAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = grantAccessSchema.safeParse({
    profile_id: formData.get("profile_id"),
    system_id: formData.get("system_id"),
    requested_system_name: formData.get("requested_system_name") || undefined,
    justification: formData.get("justification"),
  });

  if (!parsed.success) {
    redirectWithError(PATH, parsed.error.issues[0]?.message ?? "Dados inválidos para a concessão.");
  }

  const isOtherSystem = parsed.data.system_id === OTHER_SYSTEM_VALUE;
  const clientIp = await getClientIp();

  try {
    await withRequestContext({ userId: session!.id, clientIp }, async (client) => {
      // Evita duas linhas 'aprovado' para o mesmo colaborador+sistema — os
      // índices únicos parciais de 0002_fix_inconsistencias.sql só cobrem
      // pendente/em_analise, não aprovado.
      const { rowCount: alreadyGranted } = await client.query(
        `select 1 from access_requests
         where requester_id = $1
           and status = 'aprovado'
           and (
             ($2::uuid is not null and system_id = $2::uuid)
             or ($2::uuid is null and lower(trim(requested_system_name)) = lower(trim($3)))
           )
         limit 1`,
        [
          parsed.data.profile_id,
          isOtherSystem ? null : parsed.data.system_id,
          isOtherSystem ? parsed.data.requested_system_name : null,
        ]
      );
      if (alreadyGranted) {
        throw Object.assign(new Error("Este colaborador já tem acesso a este sistema."), {
          code: "ALREADY_GRANTED",
        });
      }

      const {
        rows: [inserted],
      } = await client.query<{ id: string }>(
        `insert into access_requests (requester_id, system_id, requested_system_name, justification)
         values ($1, $2, $3, $4)
         returning id`,
        [
          parsed.data.profile_id,
          isOtherSystem ? null : parsed.data.system_id,
          isOtherSystem ? parsed.data.requested_system_name : null,
          parsed.data.justification,
        ]
      );

      await client.query(`update access_requests set status = 'aprovado' where id = $1`, [inserted!.id]);
    });
  } catch (error) {
    const pgError = error as { code?: string; message?: string };
    console.error("[acessos-concedidos] grant failed", { message: pgError.message });
    const message =
      pgError.code === "ALREADY_GRANTED"
        ? pgError.message!
        : "Não foi possível conceder o acesso. Verifique se o colaborador selecionado ainda está ativo.";
    redirectWithError(PATH, message);
  }

  redirectWithSuccess(PATH, "Acesso concedido.");
}
