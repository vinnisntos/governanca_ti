"use server";

import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/auth/require-role";
import { withRequestContext } from "@/lib/db/context";
import { getClientIp } from "@/lib/utils/client-ip";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Sem RLS no banco: requireRole(["admin_ti"]) + app/dashboard/admin/layout.tsx
// são a autoridade real de acesso a esta ação.

const PATH = "/dashboard/admin/hardware/checkins";

export async function resolveMaintenanceAction(formData: FormData) {
  await assertTrustedOrigin();

  const checkinId = formData.get("checkin_id");
  const adminNotes = formData.get("admin_notes");

  if (!z.string().uuid().safeParse(checkinId).success) {
    redirectWithError(PATH, "Check-in inválido.");
  }

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const clientIp = await getClientIp();
  // "and maintenance_requested = true": sem isso, era possível "resolver
  // manutenção" de um check-in que nunca solicitou manutenção nenhuma.
  const { rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
    client.query(
      `update hardware_checkins set maintenance_resolved = true, admin_notes = $2
       where id = $1 and maintenance_requested = true
       returning id`,
      [checkinId, typeof adminNotes === "string" && adminNotes.length > 0 ? adminNotes : null]
    )
  ).catch((error: unknown) => {
    console.error("[hardware-checkins] resolve failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(PATH, "Check-in não encontrado, não solicitou manutenção, ou não foi possível atualizá-lo.");
  }

  redirectWithSuccess(PATH, "Manutenção marcada como resolvida.");
}
