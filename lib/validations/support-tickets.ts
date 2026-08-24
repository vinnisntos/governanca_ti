import { z } from "zod";

// Arquitetura alinhada com as diretrizes do ADR Master.
// Espelha os enums public.support_ticket_status/support_ticket_category
// (supabase/migrations/0006_support_tickets.sql).

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
export const updateTicketStatusSchema = z
  .object({
    ticket_id: z.string().uuid(),
    status: supportTicketStatusSchema,
  })
  .strict();

export type UpdateTicketStatusInput = z.infer<typeof updateTicketStatusSchema>;

export const closeOwnTicketSchema = z
  .object({
    ticket_id: z.string().uuid(),
  })
  .strict();

export type CloseOwnTicketInput = z.infer<typeof closeOwnTicketSchema>;
