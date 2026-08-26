"use server";

import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/auth/require-role";
import { withRequestContext } from "@/lib/db/context";
import { getClientIp } from "@/lib/utils/client-ip";
import { saveFile, deleteFile } from "@/lib/storage/local";
import {
  upsertHardwareAssetSchema,
  updateHardwareAssetStatusSchema,
  uploadHardwareContractSchema,
  contractPdfConstraints,
} from "@/lib/validations/hardware";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Sem RLS no banco: requireRole(["admin_ti"]) + app/dashboard/admin/layout.tsx
// são a autoridade real de acesso a estas ações.

const PATH = "/dashboard/admin/hardware";

function emptyToNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

export async function createHardwareAssetAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = upsertHardwareAssetSchema.safeParse({
    asset_tag: formData.get("asset_tag"),
    category: formData.get("category"),
    model: formData.get("model"),
    serial_number: formData.get("serial_number"),
    status: formData.get("status"),
    assigned_to: emptyToNull(formData.get("assigned_to")),
    purchase_date: emptyToNull(formData.get("purchase_date")),
    warranty_until: emptyToNull(formData.get("warranty_until")),
    notes: emptyToNull(formData.get("notes")) ?? undefined,
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Preencha patrimônio, categoria, modelo e número de série.");
  }

  const clientIp = await getClientIp();

  try {
    await withRequestContext({ userId: session!.id, clientIp }, (client) =>
      client.query(
        `insert into hardware_assets
           (asset_tag, category, model, serial_number, status, assigned_to, purchase_date, warranty_until, notes)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          parsed.data.asset_tag,
          parsed.data.category,
          parsed.data.model,
          parsed.data.serial_number,
          parsed.data.status,
          parsed.data.assigned_to ?? null,
          parsed.data.purchase_date ?? null,
          parsed.data.warranty_until ?? null,
          parsed.data.notes ?? null,
        ]
      )
    );
  } catch (error) {
    console.error("[hardware-assets] create failed", { message: (error as Error).message });
    redirectWithError(PATH, "Não foi possível cadastrar o ativo (patrimônio/N.º de série já existe?).");
  }

  redirectWithSuccess(PATH, "Ativo cadastrado.");
}

export async function updateHardwareAssetStatusAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = updateHardwareAssetStatusSchema.safeParse({
    asset_id: formData.get("asset_id"),
    status: formData.get("status"),
    assigned_to: emptyToNull(formData.get("assigned_to")),
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Dados inválidos para atualizar o ativo.");
  }

  const clientIp = await getClientIp();
  const { rowCount } = await withRequestContext({ userId: session!.id, clientIp }, (client) =>
    client.query(
      "update hardware_assets set status = $2, assigned_to = $3 where id = $1 returning id",
      [parsed.data.asset_id, parsed.data.status, parsed.data.assigned_to]
    )
  ).catch((error: unknown) => {
    console.error("[hardware-assets] update failed", { message: (error as Error).message });
    return { rowCount: 0 };
  });

  if (!rowCount) {
    redirectWithError(PATH, "Ativo não encontrado ou não foi possível atualizá-lo.");
  }

  redirectWithSuccess(PATH, "Ativo atualizado.");
}

export async function uploadHardwareContractAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, session } = await requireRole(["admin_ti"]);
  if (!authorized) {
    redirectWithError(PATH, "Você não tem permissão para esta ação.");
  }

  const parsed = uploadHardwareContractSchema.safeParse({
    asset_id: formData.get("asset_id"),
    profile_id: formData.get("profile_id"),
  });

  if (!parsed.success) {
    redirectWithError(PATH, "Selecione o ativo e o responsável antes de anexar o contrato.");
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    redirectWithError(PATH, "Selecione um arquivo PDF para anexar.");
  }

  if (
    !contractPdfConstraints.allowedMimeTypes.includes(
      file.type as (typeof contractPdfConstraints.allowedMimeTypes)[number]
    )
  ) {
    redirectWithError(PATH, "O contrato deve ser um arquivo PDF.");
  }

  if (file.size > contractPdfConstraints.maxSizeBytes) {
    redirectWithError(PATH, "Arquivo muito grande (máximo 10MB).");
  }

  // Caminho SEMPRE montado no servidor a partir do profile_id do responsável
  // e de um nome aleatório — nunca a partir de um valor vindo do client —
  // para impedir path traversal e colisão entre usuários.
  const buffer = Buffer.from(await file.arrayBuffer());
  const storagePath = await saveFile("hardware-contracts", parsed.data.profile_id, buffer, "pdf");

  const clientIp = await getClientIp();

  try {
    await withRequestContext({ userId: session!.id, clientIp }, (client) =>
      client.query(
        `insert into hardware_contracts (asset_id, profile_id, storage_path, signed_at)
         values ($1, $2, $3, now())`,
        [parsed.data.asset_id, parsed.data.profile_id, storagePath]
      )
    );
  } catch (error) {
    console.error("[hardware-contracts] insert failed", { message: (error as Error).message });
    // Remove o PDF já salvo em disco para não deixar arquivo órfão sem
    // nenhum hardware_contracts que o referencie.
    await deleteFile(storagePath);
    redirectWithError(PATH, "Não foi possível registrar o contrato.");
  }

  redirectWithSuccess(PATH, "Contrato anexado.");
}
