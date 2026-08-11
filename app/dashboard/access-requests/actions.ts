"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import {
  createAccessRequestSchema,
  cancelAccessRequestSchema,
  OTHER_SYSTEM_VALUE,
} from "@/lib/validations/access-requests";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.
//
// status nunca é enviado no INSERT: o valor default 'pendente' da coluna é
// aplicado pelo Postgres antes da avaliação da policy de RLS
// (access_requests_insert), então o client não tem como forjar outro status
// na criação mesmo se este Server Action tivesse um bug.

const PATH = "/dashboard/access-requests";

export async function createAccessRequestAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = createAccessRequestSchema.safeParse({
    system_id: formData.get("system_id"),
    requested_system_name: formData.get("requested_system_name") || undefined,
    justification: formData.get("justification"),
  });

  if (!parsed.success) {
    redirectWithError(
      PATH,
      "Selecione um sistema (ou informe o nome) e descreva a justificativa (mín. 10 caracteres)."
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isOtherSystem = parsed.data.system_id === OTHER_SYSTEM_VALUE;

  const { error } = await supabase.from("access_requests").insert({
    requester_id: user.id,
    system_id: isOtherSystem ? null : parsed.data.system_id,
    requested_system_name: isOtherSystem ? parsed.data.requested_system_name : null,
    justification: parsed.data.justification,
  });

  if (error) {
    console.error("[access-requests] create failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível registrar a solicitação.");
  }

  redirectWithSuccess(PATH, "Solicitação enviada.");
}

export async function cancelAccessRequestAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = cancelAccessRequestSchema.safeParse({
    request_id: formData.get("request_id"),
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Solicitação inválida.");
  }

  const supabase = await createSupabaseServerClient();

  // A policy access_requests_update_requester só permite esta operação
  // enquanto status = 'pendente' e o solicitante é o próprio usuário — não
  // há necessidade de checar isso aqui de novo, o RLS garante.
  const { error } = await supabase
    .from("access_requests")
    .update({ status: "cancelado" })
    .eq("id", parsed.data.request_id);

  if (error) {
    console.error("[access-requests] cancel failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível cancelar a solicitação.");
  }

  redirectWithSuccess(PATH, "Solicitação cancelada.");
}
