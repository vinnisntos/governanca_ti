import { describe, expect, it } from "vitest";
import { upsertAccessCatalogSchema } from "@/lib/validations/access-catalog";

describe("upsertAccessCatalogSchema", () => {
  it("aceita monthly_cost nulo (sistema gratuito)", () => {
    const result = upsertAccessCatalogSchema.safeParse({
      name: "Slack",
      monthly_cost: null,
    });
    expect(result.success).toBe(true);
  });

  it("rejeita monthly_cost negativo", () => {
    const result = upsertAccessCatalogSchema.safeParse({
      name: "Slack",
      monthly_cost: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejeita nome vazio", () => {
    const result = upsertAccessCatalogSchema.safeParse({ name: "" });
    expect(result.success).toBe(false);
  });
});
