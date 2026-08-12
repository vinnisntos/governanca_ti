"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import {
  createHardwareCheckinSchema,
  checkinPhotoConstraints,
} from "@/lib/validations/hardware";
import { currentReferenceMonth } from "@/lib/utils/reference-month";
import { sniffImageMimeType } from "@/lib/utils/sniff-image-type";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.

const PATH = "/dashboard/hardware";

export async function submitCheckinAction(formData: FormData) {
  await assertTrustedOrigin();

  const parsed = createHardwareCheckinSchema.safeParse({
    asset_id: formData.get("asset_id"),
    physical_condition: formData.get("physical_condition"),
    condition_notes: formData.get("condition_notes") || undefined,
    maintenance_requested: formData.get("maintenance_requested") === "on",
    maintenance_details: formData.get("maintenance_details") || undefined,
  });

  if (!parsed.success) {
    redirectWithError(PATH, parsed.error.issues[0]?.message ?? "Dados inválidos para o check-in.");
  }

  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) {
    redirectWithError(PATH, "Envie uma foto atual do equipamento.");
  }

  if (file.size > checkinPhotoConstraints.maxSizeBytes) {
    redirectWithError(PATH, "Foto muito grande (máximo 8MB).");
  }

  // Não confiamos em file.type (metadata informada pelo client, facilmente
  // falsificável) — inspecionamos os bytes reais do arquivo para confirmar
  // que é de fato uma imagem de um dos formatos aceitos.
  const sniffedType = await sniffImageMimeType(file);
  if (!sniffedType || !checkinPhotoConstraints.allowedMimeTypes.includes(sniffedType)) {
    redirectWithError(PATH, "A foto deve ser JPEG, PNG ou WebP.");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Confere que o ativo é mesmo do usuário ANTES de gastar uma chamada de
  // upload no Storage — a policy hardware_checkins_insert faria essa mesma
  // checagem no INSERT, isto é só para falhar cedo com uma mensagem melhor.
  const { data: asset } = await supabase
    .from("hardware_assets")
    .select("id")
    .eq("id", parsed.data.asset_id)
    .eq("assigned_to", user.id)
    .maybeSingle();

  if (!asset) {
    redirectWithError(PATH, "Este equipamento não está vinculado a você.");
  }

  const extension =
    sniffedType === "image/png" ? "png" : sniffedType === "image/webp" ? "webp" : "jpg";
  // Caminho SEMPRE montado no servidor a partir do id do usuário logado e de
  // um nome aleatório — nunca a partir de um valor vindo do client — para
  // impedir path traversal e colisão entre usuários.
  const storagePath = `${user.id}/${randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("hardware-checkin-photos")
    .upload(storagePath, file, { contentType: sniffedType, upsert: false });

  if (uploadError) {
    console.error("[hardware-checkins] upload failed", { message: uploadError.message });
    redirectWithError(PATH, "Não foi possível enviar a foto.");
  }

  const { error: insertError } = await supabase.from("hardware_checkins").insert({
    asset_id: parsed.data.asset_id,
    profile_id: user.id,
    reference_month: currentReferenceMonth(),
    photo_storage_path: storagePath,
    physical_condition: parsed.data.physical_condition,
    condition_notes: parsed.data.condition_notes ?? null,
    maintenance_requested: parsed.data.maintenance_requested,
    maintenance_details: parsed.data.maintenance_requested
      ? parsed.data.maintenance_details ?? null
      : null,
  });

  if (insertError) {
    console.error("[hardware-checkins] insert failed", { message: insertError.message });
    // A foto já subiu ao Storage antes deste insert (linha 81-83) — sem isso,
    // cada tentativa que falha (ex.: check-in duplicado do mês) deixa um
    // arquivo órfão, sem nenhum hardware_checkins que o referencie.
    await supabase.storage.from("hardware-checkin-photos").remove([storagePath]);
    const alreadyDone = insertError.message.includes("uq_checkin_asset_month");
    redirectWithError(
      PATH,
      alreadyDone
        ? "Você já enviou o check-in deste mês para este equipamento."
        : "Não foi possível registrar o check-in."
    );
  }

  redirectWithSuccess(PATH, "Check-in enviado.");
}
