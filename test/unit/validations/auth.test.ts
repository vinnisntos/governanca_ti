import { describe, expect, it } from "vitest";
import { loginSchema } from "@/lib/validations/auth";

describe("loginSchema", () => {
  it("aceita credenciais válidas e normaliza o e-mail", () => {
    const result = loginSchema.safeParse({
      email: "  Usuario@Empresa.com  ",
      password: "senhaforte123",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("usuario@empresa.com");
    }
  });

  it("rejeita e-mail inválido", () => {
    const result = loginSchema.safeParse({
      email: "nao-e-email",
      password: "senhaforte123",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita senha menor que 8 caracteres", () => {
    const result = loginSchema.safeParse({
      email: "usuario@empresa.com",
      password: "curta",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita campos extras não declarados (.strict())", () => {
    const result = loginSchema.safeParse({
      email: "usuario@empresa.com",
      password: "senhaforte123",
      role: "admin_ti",
    });
    expect(result.success).toBe(false);
  });
});
