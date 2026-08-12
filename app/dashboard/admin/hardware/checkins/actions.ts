"use server";

import { z } from "zod";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/utils/require-role";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Autorização real é a policy hardware_checkins_update_admin (RLS);
// requireRole() é defesa em profundidade para dar uma mensagem clara em vez
// de depender só do efeito colateral silencioso do RLS.

const PATH = "/dashboard/admin/hardware/checkins";

export async function resolveMaintenanceAction(formData: FormData) {
  await assertTrustedOrigin();

  const checkinId = formData.get("checkin_id");
  const adminNotes = formData.get("admin_notes");

  if (!z.string().uuid().safeParse(checkinId).success) {
    redirectWithError(PATH, "Check-in inválido.");
  }

  const { authorized, supabase } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const { data: updated, error } = await supabase
    .from("hardware_checkins")
    .update({
      maintenance_resolved: true,
      admin_notes: typeof adminNotes === "string" && adminNotes.length > 0 ? adminNotes : null,
    })
    .eq("id", checkinId as string)
    .select("id");

  if (error) {
    console.error("[hardware-checkins] resolve failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível marcar como resolvido.");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(PATH, "Check-in não encontrado ou você não tem permissão para alterá-lo.");
  }

  redirectWithSuccess(PATH, "Manutenção marcada como resolvida.");
}
