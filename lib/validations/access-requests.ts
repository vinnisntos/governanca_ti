import { z } from "zod";

// Arquitetura alinhada com as diretrizes do ADR Master.
// .strict() rejeita qualquer campo além dos declarados (ex.: um client
// tentando injetar "status: 'aprovado'" ou "reviewed_by" na criação).

export const createAccessRequestSchema = z
  .object({
    system_id: z.string().uuid("Sistema inválido"),
    justification: z
      .string()
      .trim()
      .min(10, "Descreva a justificativa com mais detalhes")
      .max(2000),
  })
  .strict();

export type CreateAccessRequestInput = z.infer<typeof createAccessRequestSchema>;

export const cancelAccessRequestSchema = z
  .object({
    request_id: z.string().uuid(),
  })
  .strict();

export type CancelAccessRequestInput = z.infer<typeof cancelAccessRequestSchema>;

// Usado pelo aprovador (gestor direto do solicitante ou admin_ti).
// review_notes é obrigatório para 'negado' — reforçado também no banco
// (ver bloco 3 de supabase/migrations/0001_init.sql) para não depender só do client.
export const decideAccessRequestSchema = z
  .object({
    request_id: z.string().uuid(),
    decision: z.enum(["aprovado", "negado"]),
    review_notes: z.string().trim().max(2000).optional(),
  })
  .strict()
  .refine(
    (data) =>
      data.decision !== "negado" ||
      (data.review_notes && data.review_notes.length > 0),
    { message: "Motivo de recusa é obrigatório", path: ["review_notes"] }
  );

export type DecideAccessRequestInput = z.infer<typeof decideAccessRequestSchema>;
