"use server";

import { randomUUID } from "node:crypto";
import { assertTrustedOrigin } from "@/lib/utils/assert-trusted-origin";
import { requireRole } from "@/lib/utils/require-role";
import {
  upsertHardwareAssetSchema,
  updateHardwareAssetStatusSchema,
  uploadHardwareContractSchema,
  contractPdfConstraints,
} from "@/lib/validations/hardware";
import { redirectWithError, redirectWithSuccess } from "@/lib/utils/action-redirect";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Autorização real é a policy hardware_assets_write_admin / hardware_contracts_write_admin
// (RLS); requireRole() é defesa em profundidade para dar uma mensagem clara
// em vez de depender só do efeito colateral silencioso do RLS.

const PATH = "/dashboard/admin/hardware";

function emptyToNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.length === 0) return null;
  return value;
}

export async function createHardwareAssetAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, supabase } = await requireRole(["admin_ti"]);
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

  const { error } = await supabase.from("hardware_assets").insert(parsed.data);

  if (error) {
    console.error("[hardware-assets] create failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível cadastrar o ativo (patrimônio/N.º de série já existe?).");
  }

  redirectWithSuccess(PATH, "Ativo cadastrado.");
}

export async function updateHardwareAssetStatusAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, supabase } = await requireRole(["admin_ti"]);
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

  const { data: updated, error } = await supabase
    .from("hardware_assets")
    .update({ status: parsed.data.status, assigned_to: parsed.data.assigned_to })
    .eq("id", parsed.data.asset_id)
    .select("id");

  if (error) {
    console.error("[hardware-assets] update failed", { message: error.message });
    redirectWithError(PATH, "Não foi possível atualizar o ativo.");
  }

  if (!updated || updated.length === 0) {
    redirectWithError(PATH, "Ativo não encontrado ou você não tem permissão para alterá-lo.");
  }

  redirectWithSuccess(PATH, "Ativo atualizado.");
}

export async function uploadHardwareContractAction(formData: FormData) {
  await assertTrustedOrigin();

  const { authorized, supabase } = await requireRole(["admin_ti"]);
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
  // para impedir path traversal e colisão entre usuários (ver
  // ARQUITETURA_TECNICA.md seção 4).
  const storagePath = `${parsed.data.profile_id}/${randomUUID()}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("hardware-contracts")
    .upload(storagePath, file, { contentType: "application/pdf", upsert: false });

  if (uploadError) {
    console.error("[hardware-contracts] upload failed", { message: uploadError.message });
    redirectWithError(PATH, "Não foi possível enviar o arquivo.");
  }

  const { error: insertError } = await supabase.from("hardware_contracts").insert({
    asset_id: parsed.data.asset_id,
    profile_id: parsed.data.profile_id,
    storage_path: storagePath,
    signed_at: new Date().toISOString(),
  });

  if (insertError) {
    console.error("[hardware-contracts] insert failed", { message: insertError.message });
    // Remove o PDF já enviado (linha 136-138) para não deixar arquivo órfão
    // no Storage sem nenhum hardware_contracts que o referencie.
    await supabase.storage.from("hardware-contracts").remove([storagePath]);
    redirectWithError(PATH, "Não foi possível registrar o contrato.");
  }

  redirectWithSuccess(PATH, "Contrato anexado.");
}
