import { z } from "zod";

// Arquitetura alinhada com as diretrizes do ADR Master.

export const hardwareCategorySchema = z.enum([
  "notebook",
  "desktop",
  "monitor",
  "periferico",
  "celular",
  "outro",
]);

export const hardwareStatusSchema = z.enum([
  "em_estoque",
  "em_uso",
  "em_manutencao",
  "baixado",
  "extraviado",
]);

export const physicalConditionSchema = z.enum([
  "otimo",
  "bom",
  "regular",
  "com_defeito",
]);

// Cadastro/edição de ativo — restrito a admin_ti no backend e no RLS.
export const upsertHardwareAssetSchema = z
  .object({
    asset_tag: z.string().trim().min(1).max(64),
    category: hardwareCategorySchema,
    model: z.string().trim().min(1).max(120),
    serial_number: z.string().trim().min(1).max(120),
    status: hardwareStatusSchema,
    assigned_to: z.string().uuid().nullable(),
    purchase_date: z.string().date().nullable().optional(),
    warranty_until: z.string().date().nullable().optional(),
    notes: z.string().trim().max(2000).nullable().optional(),
  })
  .strict();

export type UpsertHardwareAssetInput = z.infer<typeof upsertHardwareAssetSchema>;

// Atualização pós-cadastro — só o que muda no dia a dia (reatribuição e
// status). asset_tag/model/serial_number ficam imutáveis para preservar a
// identidade do ativo no histórico (contratos e check-ins referenciam o
// mesmo asset_id desde a criação).
export const updateHardwareAssetStatusSchema = z
  .object({
    asset_id: z.string().uuid(),
    status: hardwareStatusSchema,
    assigned_to: z.string().uuid().nullable(),
  })
  .strict();

export type UpdateHardwareAssetStatusInput = z.infer<
  typeof updateHardwareAssetStatusSchema
>;

// Upload de contrato assinado — feito por admin_ti; o storage_path final é
// gerado no servidor (nunca aceito do client) para impedir path traversal.
export const uploadHardwareContractSchema = z
  .object({
    asset_id: z.string().uuid(),
    profile_id: z.string().uuid(),
    signed_at: z.string().datetime().optional(),
  })
  .strict();

export type UploadHardwareContractInput = z.infer<
  typeof uploadHardwareContractSchema
>;

// Check-in mensal — o colaborador só informa isto; asset_id é validado no
// servidor contra o vínculo real do usuário (e reforçado pelo RLS).
export const createHardwareCheckinSchema = z
  .object({
    asset_id: z.string().uuid(),
    physical_condition: physicalConditionSchema,
    condition_notes: z.string().trim().max(2000).optional(),
    maintenance_requested: z.boolean(),
    maintenance_details: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine(
    (data) =>
      !data.maintenance_requested ||
      (data.maintenance_details && data.maintenance_details.length > 0),
    {
      message: "Descreva o problema para abrir a solicitação de manutenção",
      path: ["maintenance_details"],
    }
  );

export type CreateHardwareCheckinInput = z.infer<
  typeof createHardwareCheckinSchema
>;

// Validação de upload de imagem (aplicada no Route Handler antes de repassar
// ao Storage) — apenas tipos de imagem comuns, limite de 8MB.
export const checkinPhotoConstraints = {
  maxSizeBytes: 8 * 1024 * 1024,
  allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
} as const;

// Validação de upload de contrato assinado — apenas PDF, limite de 10MB.
export const contractPdfConstraints = {
  maxSizeBytes: 10 * 1024 * 1024,
  allowedMimeTypes: ["application/pdf"],
} as const;
