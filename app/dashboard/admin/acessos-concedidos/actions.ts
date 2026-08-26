"use server";

import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/auth/require-role";
import { withRequestContext } from "@/lib/db/context";
import { getClientIp } from "@/lib/utils/client-ip";
import { revokeAccessSchema } from "@/lib/validations/access-requests";
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
    redirectWithError(PATH, "Solicitação inválida.");
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
