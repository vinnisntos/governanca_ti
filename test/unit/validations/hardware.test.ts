import { describe, expect, it } from "vitest";
import {
  createHardwareCheckinSchema,
  upsertHardwareAssetSchema,
  checkinPhotoConstraints,
  contractPdfConstraints,
} from "@/lib/validations/hardware";

const validUuid = "123e4567-e89b-12d3-a456-426614174000";

describe("upsertHardwareAssetSchema", () => {
  it("aceita payload completo válido", () => {
    const result = upsertHardwareAssetSchema.safeParse({
      asset_tag: "NB-0001",
      category: "notebook",
      model: "Dell Latitude 5440",
      serial_number: "SN123456",
      status: "em_uso",
      assigned_to: validUuid,
      purchase_date: "2024-01-15",
      warranty_until: null,
      notes: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita categoria fora do enum", () => {
    const result = upsertHardwareAssetSchema.safeParse({
      asset_tag: "NB-0001",
      category: "servidor",
      model: "Dell",
      serial_number: "SN123456",
      status: "em_uso",
      assigned_to: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita tentativa de alterar campos imutáveis via schema de status", async () => {
    const { updateHardwareAssetStatusSchema } = await import(
      "@/lib/validations/hardware"
    );
    const result = updateHardwareAssetStatusSchema.safeParse({
      asset_id: validUuid,
      status: "em_uso",
      assigned_to: validUuid,
      asset_tag: "NB-0002", // campo imutável não deveria ser aceito aqui
    });
    expect(result.success).toBe(false);
  });
});

describe("createHardwareCheckinSchema", () => {
  it("exige maintenance_details quando maintenance_requested é true", () => {
    const result = createHardwareCheckinSchema.safeParse({
      asset_id: validUuid,
      physical_condition: "bom",
      maintenance_requested: true,
    });
    expect(result.success).toBe(false);
  });

  it("aceita quando maintenance_requested é false, sem detalhes", () => {
    const result = createHardwareCheckinSchema.safeParse({
      asset_id: validUuid,
      physical_condition: "otimo",
      maintenance_requested: false,
    });
    expect(result.success).toBe(true);
  });
});

describe("constraints de upload", () => {
  it("limite de foto de check-in é 8MB e aceita apenas imagens comuns", () => {
    expect(checkinPhotoConstraints.maxSizeBytes).toBe(8 * 1024 * 1024);
    expect(checkinPhotoConstraints.allowedMimeTypes).not.toContain(
      "application/pdf"
    );
  });

  it("limite de contrato é 10MB e aceita apenas PDF", () => {
    expect(contractPdfConstraints.maxSizeBytes).toBe(10 * 1024 * 1024);
    expect(contractPdfConstraints.allowedMimeTypes).toEqual(["application/pdf"]);
  });
});
