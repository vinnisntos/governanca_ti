import { describe, expect, it } from "vitest";
import {
  addTicketMessageSchema,
  closeOwnTicketSchema,
  createSupportTicketSchema,
  updateTicketStatusSchema,
} from "@/lib/validations/support-tickets";

const validUuid = "123e4567-e89b-12d3-a456-426614174000";

describe("createSupportTicketSchema", () => {
  it("aceita payload válido", () => {
    const result = createSupportTicketSchema.safeParse({
      category: "acesso",
      subject: "Não consigo entrar no VPN",
      message: "Tento conectar desde ontem e recebo erro de autenticação.",
    });
    expect(result.success).toBe(true);
  });

  it("rejeita assunto curto demais", () => {
    const result = createSupportTicketSchema.safeParse({
      category: "outro",
      subject: "Oi",
      message: "Tento conectar desde ontem e recebo erro de autenticação.",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita mensagem curta demais", () => {
    const result = createSupportTicketSchema.safeParse({
      category: "outro",
      subject: "Problema no acesso",
      message: "ajuda",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita categoria fora do enum permitido", () => {
    const result = createSupportTicketSchema.safeParse({
      category: "financeiro",
      subject: "Problema no acesso",
      message: "Tento conectar desde ontem e recebo erro de autenticação.",
    });
    expect(result.success).toBe(false);
  });

  it("rejeita tentativa de injetar campos de controle (ex.: status)", () => {
    const result = createSupportTicketSchema.safeParse({
      category: "outro",
      subject: "Problema no acesso",
      message: "Tento conectar desde ontem e recebo erro de autenticação.",
      status: "resolvido",
      requester_id: validUuid,
    });
    expect(result.success).toBe(false);
  });
});

describe("addTicketMessageSchema", () => {
  it("rejeita mensagem vazia", () => {
    const result = addTicketMessageSchema.safeParse({ ticket_id: validUuid, message: "   " });
    expect(result.success).toBe(false);
  });

  it("aceita mensagem válida", () => {
    const result = addTicketMessageSchema.safeParse({ ticket_id: validUuid, message: "Já verificamos, pode tentar de novo." });
    expect(result.success).toBe(true);
  });
});

describe("updateTicketStatusSchema", () => {
  it("rejeita status fora do enum permitido", () => {
    const result = updateTicketStatusSchema.safeParse({ ticket_id: validUuid, status: "pendente" });
    expect(result.success).toBe(false);
  });

  it("aceita status válido", () => {
    const result = updateTicketStatusSchema.safeParse({ ticket_id: validUuid, status: "resolvido" });
    expect(result.success).toBe(true);
  });
});

describe("closeOwnTicketSchema", () => {
  it("rejeita ticket_id que não é uuid", () => {
    const result = closeOwnTicketSchema.safeParse({ ticket_id: "1" });
    expect(result.success).toBe(false);
  });
});
