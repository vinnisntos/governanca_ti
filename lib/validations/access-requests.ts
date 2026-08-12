import { z } from "zod";

// Arquitetura alinhada com as diretrizes do ADR Master.
// .strict() rejeita qualquer campo além dos declarados (ex.: um client
// tentando injetar "status: 'aprovado'" ou "reviewed_by" na criação).

// "outro" é o valor sentinela usado pelo <select> quando o colaborador pede
// acesso a um sistema que ainda não está no catálogo — nesse caso
// requested_system_name é obrigatório e vira o texto livre da solicitação.
export const OTHER_SYSTEM_VALUE = "outro";

export const createAccessRequestSchema = z
  .object({
    system_id: z.string().min(1, "Selecione um sistema"),
    requested_system_name: z.string().trim().min(2).max(120).optional(),
    justification: z
      .string()
      .trim()
      .min(10, "Descreva a justificativa com mais detalhes")
      .max(2000),
  })
  .strict()
  .refine(
    (data) => data.system_id === OTHER_SYSTEM_VALUE || z.string().uuid().safeParse(data.system_id).success,
    { message: "Sistema inválido", path: ["system_id"] }
  )
  .refine((data) => data.system_id !== OTHER_SYSTEM_VALUE || Boolean(data.requested_system_name), {
    message: "Informe o nome do sistema desejado (mín. 2 caracteres)",
    path: ["requested_system_name"],
  });

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
