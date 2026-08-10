"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Autorização real é a policy hardware_checkins_update_admin (RLS).

const PATH = "/dashboard/admin/hardware/checkins";

export async function resolveMaintenanceAction(formData: FormData) {
  await assertTrustedOrigin();

  const checkinId = formData.get("checkin_id");
  const adminNotes = formData.get("admin_notes");

  if (typeof checkinId !== "string" || checkinId.length === 0) {
    redirectWithError(PATH, "Check-in inválido.");
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("hardware_checkins")
    .update({
      maintenance_resolved: true,
      admin_notes: typeof adminNotes === "string" && adminNotes.length > 0 ? adminNotes : null,
    })
    .eq("id", checkinId as string);

  if (error) {
    console.error("[hardware-checkins] resolve failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível marcar como resolvido.");
  }

  redirectWithSuccess(PATH, "Manutenção marcada como resolvida.");
}
