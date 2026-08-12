import { describe, expect, it } from "vitest";
import { upsertMobileLineSchema } from "@/lib/validations/mobile-lines";

const base = {
  carrier: "Vivo",
  plan_name: "Corporativo 20GB",
  monthly_cost: 89.9,
  line_type: "esim" as const,
  status: "ativa" as const,
  assigned_to: null,
  department_id: null,
};

describe("upsertMobileLineSchema", () => {
  it("aceita número de telefone em formato E.164", () => {
    const result = upsertMobileLineSchema.safeParse({
      ...base,
      phone_number: "+5511987654321",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita número de telefone com caracteres inválidos", () => {
    const result = upsertMobileLineSchema.safeParse({
      ...base,
      phone_number: "(11) 98765-4321",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita custo mensal negativo", () => {
    const result = upsertMobileLineSchema.safeParse({
      ...base,
      phone_number: "5511987654321",
      monthly_cost: -10,
    });
    expect(result.success).toBe(false);
  });
});
