"use server";

import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { pool } from "@/lib/db/client";
import { withRequestContext } from "@/lib/db/context";
import { getClientIp } from "@/lib/utils/client-ip";
import { saveFile, deleteFile } from "@/lib/storage/local";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import {
  createHardwareCheckinSchema,
  checkinPhotoConstraints,
} from "@/lib/validations/hardware";
import { sniffImageMimeType } from "@/lib/utils/sniff-image-type";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

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

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  // Confere que o ativo é mesmo do usuário ANTES de gastar uma gravação em
  // disco — o INSERT abaixo faz essa mesma checagem de forma atômica
  // (INSERT ... SELECT ... WHERE EXISTS), isto é só para falhar cedo com
  // uma mensagem melhor.
  const { rows: ownedAsset } = await pool.query<{ id: string }>(
    "select id from hardware_assets where id = $1 and assigned_to = $2",
    [parsed.data.asset_id, session.id]
  );

  if (ownedAsset.length === 0) {
    redirectWithError(PATH, "Este equipamento não está vinculado a você.");
  }

  const extension =
    sniffedType === "image/png" ? "png" : sniffedType === "image/webp" ? "webp" : "jpg";
  const buffer = Buffer.from(await file.arrayBuffer());
  // Caminho SEMPRE montado no servidor a partir do id do usuário logado e de
  // um nome aleatório — nunca a partir de um valor vindo do client — para
  // impedir path traversal e colisão entre usuários.
  const storagePath = await saveFile("hardware-checkin-photos", session.id, buffer, extension);

  const clientIp = await getClientIp();

  try {
    const { rowCount } = await withRequestContext({ userId: session.id, clientIp }, (client) =>
      client.query(
        `insert into hardware_checkins
           (asset_id, profile_id, photo_storage_path, physical_condition, condition_notes,
            maintenance_requested, maintenance_details)
         select $1, $2, $3, $4, $5, $6, $7
         where exists (
           select 1 from hardware_assets where id = $1 and assigned_to = $2
         )
         returning id`,
        [
          parsed.data.asset_id,
          session.id,
          storagePath,
          parsed.data.physical_condition,
          parsed.data.condition_notes ?? null,
          parsed.data.maintenance_requested,
          parsed.data.maintenance_requested ? parsed.data.maintenance_details ?? null : null,
        ]
      )
    );

    if (rowCount === 0) {
      // A foto já foi salva em disco antes deste INSERT — sem apagar aqui,
      // uma corrida (ativo reatribuído entre a checagem acima e o INSERT)
      // deixaria um arquivo órfão, sem nenhum hardware_checkins que o
      // referencie.
      await deleteFile(storagePath);
      redirectWithError(PATH, "Este equipamento não está vinculado a você.");
    }
  } catch (error) {
    await deleteFile(storagePath);
    const pgError = error as { code?: string; message?: string };
    console.error("[hardware-checkins] insert failed", { message: pgError.message });
    const alreadyDone = pgError.code === "23505";
    redirectWithError(
      PATH,
      alreadyDone
        ? "Você já enviou o check-in deste mês para este equipamento."
        : "Não foi possível registrar o check-in."
    );
  }

  redirectWithSuccess(PATH, "Check-in enviado.");
}
