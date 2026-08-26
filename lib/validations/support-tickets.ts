import { z } from "zod";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Espelha os enums public.support_ticket_status/support_ticket_category
// (db/migrations/0001_init.sql, bloco 9).

export const supportTicketCategorySchema = z.enum([
  "acesso",
  "hardware",
  "telefonia",
  "conta",
  "outro",
]);

export const supportTicketStatusSchema = z.enum([
  "aberto",
  "em_andamento",
  "resolvido",
  "fechado",
  "cancelado",
]);

// Abrir um chamado e mandar a primeira mensagem são a mesma operação: cria a
// linha em support_tickets e a primeira linha em support_ticket_messages.
export const createSupportTicketSchema = z
  .object({
    category: supportTicketCategorySchema,
    subject: z.string().trim().min(4, "Descreva o assunto em poucas palavras (mín. 4 caracteres)").max(150),
    message: z.string().trim().min(10, "Descreva o problema com mais detalhes (mín. 10 caracteres)").max(4000),
  })
  .strict();

export type CreateSupportTicketInput = z.infer<typeof createSupportTicketSchema>;

export const addTicketMessageSchema = z
  .object({
    ticket_id: z.string().uuid(),
    message: z.string().trim().min(1, "Escreva uma mensagem antes de enviar").max(4000),
  })
  .strict();

export type AddTicketMessageInput = z.infer<typeof addTicketMessageSchema>;

// Só admin_ti usa (reforçado por requireRole + RLS support_tickets_update_admin).
// note é opcional: quando informada, vira uma mensagem no chamado registrando
// o motivo da mudança de status (ver addStatusChangeNote em actions.ts).
export const updateTicketStatusSchema = z
  .object({
    ticket_id: z.string().uuid(),
    status: supportTicketStatusSchema,
    note: z.string().trim().max(2000).optional(),
  })
  .strict();

export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

export const closeOwnTicketSchema = z
  .object({
    ticket_id: z.string().uuid(),
  })
  .strict();

export type CloseOwnTicketInput = z.infer<typeof closeOwnTicketSchema>;

// Reabertura exige motivo (por que o problema persiste) — vira a próxima
// mensagem do chamado, reaberto por support_tickets_reopen_requester (RLS).
export const reopenTicketSchema = z
  .object({
    ticket_id: z.string().uuid(),
    reason: z
      .string()
      .trim()
      .min(10, "Descreva por que o problema persiste (mín. 10 caracteres)")
      .max(2000),
  })
  .strict();

export type ReopenTicketInput = z.infer<typeof reopenTicketSchema>;

// Cancelamento só é permitido pelo solicitante enquanto o chamado ainda está
// 'aberto' (support_tickets_cancel_requester, RLS); motivo é opcional.
export const cancelOwnTicketSchema = z
  .object({
    ticket_id: z.string().uuid(),
    reason: z.string().trim().max(2000).optional(),
  })
  .strict();

export type CancelOwnTicketInput = z.infer<typeof cancelOwnTicketSchema>;

// Mesclagem — só admin_ti (reforçado por requireRole + trigger
// fn_protect_support_ticket_fields). O admin digita o número do chamado de
// destino (ticket_number), não o UUID.
export const mergeTicketsSchema = z
  .object({
    ticket_id: z.string().uuid(),
    target_ticket_number: z.coerce.number().int().positive(),
  })
  .strict();

export type MergeTicketsInput = z.infer<typeof mergeTicketsSchema>;
