import { describe, expect, it } from "vitest";
import {
  cancelAccessRequestSchema,
  createAccessRequestSchema,
  decideAccessRequestSchema,
} from "@/lib/validations/access-requests";

const validUuid = "123e4567-e89b-12d3-a456-426614174000";

describe("createAccessRequestSchema", () => {
  it("aceita payload válido", () => {
    const result = createAccessRequestSchema.safeParse({
      system_id: validUuid,
      justification: "Preciso de acesso para dar suporte ao time financeiro.",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita justificativa curta demais", () => {
    const result = createAccessRequestSchema.safeParse({
      system_id: validUuid,
      justification: "curta",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita tentativa de injetar campos de controle (ex.: status)", () => {
    const result = createAccessRequestSchema.safeParse({
      system_id: validUuid,
      justification: "Preciso de acesso para dar suporte ao time financeiro.",
      status: "aprovado",
      requester_id: validUuid,
    });
    expect(result.success).toBe(false);
  });
});

describe("cancelAccessRequestSchema", () => {
  it("rejeita request_id que não é uuid", () => {
    const result = cancelAccessRequestSchema.safeParse({ request_id: "1" });
    expect(result.success).toBe(false);
  });
});

describe("decideAccessRequestSchema", () => {
  it("exige review_notes quando a decisão é 'negado'", () => {
    const result = decideAccessRequestSchema.safeParse({
      request_id: validUuid,
      decision: "negado",
    });
    expect(result.success).toBe(false);
  });

  it("aceita 'negado' com review_notes preenchido", () => {
    const result = decideAccessRequestSchema.safeParse({
      request_id: validUuid,
      decision: "negado",
      review_notes: "Fora da política de acesso do cargo.",
    });
    expect(result.success).toBe(true);
  });

  it("aceita 'aprovado' sem review_notes", () => {
    const result = decideAccessRequestSchema.safeParse({
      request_id: validUuid,
      decision: "aprovado",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita decisão fora do enum permitido", () => {
    const result = decideAccessRequestSchema.safeParse({
      request_id: validUuid,
      decision: "em_analise",
    });
    expect(result.success).toBe(false);
  });
});
